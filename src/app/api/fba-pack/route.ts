import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import { insertFbaPack, getFbaPacksForLead, insertNote } from '@/lib/db'
import {
  sendFbaPackEmail,
  FBA_MAX_TOTAL_BYTES,
  type FbaAttachment,
} from '@/lib/email'

// FBA Pack: the fixed-format Location Booking Confirmation. The agent uploads
// the signed FBA + payment proof, confirms the (editable) partner details, and
// ONE send does everything: polished email to Management + partner (CC
// gsquareco@), renamed attachments, SOP launch project + invite link, timeline
// note. Agents CAN use this (unlike the owner-private Agreements generator).

const FBA_DIR = path.join(
  process.env.MEDIA_DIR || path.resolve(process.cwd(), 'data', 'media'),
  'fba'
)

/** "Krish & Rishita Mahajan" → "KrishRishitaMahajan"; "Gurdaspur " → "Gurdaspur". */
function tag(value: string): string {
  return value.replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 40) || 'TBWX'
}

function extOf(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop()! : ''
  if (/^[a-zA-Z0-9]{2,5}$/.test(fromName)) return fromName.toLowerCase()
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type === 'image/png') return 'png'
  return 'jpg'
}

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    requireAuth(session)
    const phone = new URL(req.url).searchParams.get('phone')
    if (!phone) return NextResponse.json({ success: false, error: 'phone required' }, { status: 400 })
    const packs = await getFbaPacksForLead(phone)
    return NextResponse.json({ success: true, data: packs })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const form = await req.formData()
    const str = (k: string) => String(form.get(k) ?? '').trim()

    const leadPhone = str('leadPhone')
    const leadId = str('leadId')
    const partnerName = str('partnerName')
    const partnerEmail = str('partnerEmail').toLowerCase()
    const city = str('city')
    const address = str('address')
    const franchiseFee = str('franchiseFee')
    const bookingAmount = str('bookingAmount')
    const utr = str('utr')
    const waiveMonths = Math.max(0, Math.min(3, Number(str('waiveMonths')) || 0))
    const remarks = str('remarks').slice(0, 1000)
    const agentName = str('agentName')
    const agentPhone = str('agentPhone')

    if (!leadPhone) return NextResponse.json({ success: false, error: 'Missing lead reference.' }, { status: 400 })
    if (partnerName.length < 2) return NextResponse.json({ success: false, error: 'Enter the partner name.' }, { status: 400 })
    if (!partnerEmail.includes('@')) return NextResponse.json({ success: false, error: 'Enter the partner email — their copy goes there.' }, { status: 400 })
    if (!city) return NextResponse.json({ success: false, error: 'Enter the city.' }, { status: 400 })
    if (!address) return NextResponse.json({ success: false, error: 'Enter the shop address.' }, { status: 400 })
    if (!franchiseFee) return NextResponse.json({ success: false, error: 'Enter the franchise fee.' }, { status: 400 })
    if (!bookingAmount) return NextResponse.json({ success: false, error: 'Enter the booking amount received.' }, { status: 400 })
    if (agentName.length < 2) return NextResponse.json({ success: false, error: 'Enter your name for the signature.' }, { status: 400 })

    // Files: signed FBA + payment proof required; draft + extras optional.
    const slots: { slot: string; label: string; required: boolean; multiple?: boolean }[] = [
      { slot: 'fbaSigned', label: 'FBA_Signed', required: true },
      { slot: 'fbaDraft', label: 'FBA_Draft', required: false },
      { slot: 'paymentProof', label: 'Payment_Proof', required: true },
      { slot: 'extra', label: 'Document', required: false, multiple: true },
    ]

    const cityTag = tag(city)
    const nameTag = tag(partnerName)
    const attachments: FbaAttachment[] = []
    const storedFiles: { slot: string; filename: string; path: string }[] = []
    let totalBytes = 0
    let extraIndex = 0

    for (const def of slots) {
      const files = form
        .getAll(def.slot)
        .filter((f): f is File => f instanceof File && f.size > 0)
      if (def.required && files.length === 0) {
        return NextResponse.json(
          { success: false, error: `${def.label.replace(/_/g, ' ')} is required.` },
          { status: 400 }
        )
      }
      for (const file of files.slice(0, def.multiple ? 6 : 1)) {
        if (!ALLOWED_TYPES.has(file.type)) {
          return NextResponse.json(
            { success: false, error: `${file.name}: only PDF or image files.` },
            { status: 415 }
          )
        }
        const buffer = Buffer.from(await file.arrayBuffer())
        totalBytes += buffer.byteLength
        if (totalBytes > FBA_MAX_TOTAL_BYTES) {
          return NextResponse.json(
            { success: false, error: 'Attachments too large — keep the pack under ~18 MB.' },
            { status: 413 }
          )
        }
        const suffix = def.multiple ? `_${++extraIndex}` : ''
        const filename = `${cityTag}_${nameTag}_${def.label}${suffix}.${extOf(file)}`
        attachments.push({
          filename,
          contentType: file.type,
          data: buffer,
        })
        // Keep a copy on disk for the record (served nowhere yet — audit trail).
        fs.mkdirSync(FBA_DIR, { recursive: true })
        const diskPath = path.join(FBA_DIR, `${Date.now()}_${filename}`)
        fs.writeFileSync(diskPath, buffer)
        storedFiles.push({ slot: def.slot, filename, path: diskPath })
      }
    }

    // SOP baton pass FIRST so the email can carry the invite link. Best-effort:
    // an SOP hiccup must not block the confirmation email — the coordinator
    // can still create the project by hand.
    let inviteUrl: string | null = null
    let sopProjectId: string | null = null
    const sopBase = process.env.SOP_BASE_URL || 'https://sop.tbwxpress.com'
    const sopSecret = process.env.SALESHUB_FBA_SECRET
    if (sopSecret) {
      try {
        const res = await fetch(`${sopBase}/api/integrations/saleshub/booking`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-integration-secret': sopSecret,
          },
          body: JSON.stringify({
            partnerName,
            phone: leadPhone,
            city,
            utr,
            // SOP stores these on the launch project so the outlet links back
            // to this Hub lead and shows who sent the pack.
            leadId,
            agentName,
          }),
          signal: AbortSignal.timeout(15000),
        })
        const data = (await res.json()) as { inviteUrl?: string; projectId?: string }
        if (res.ok && data.inviteUrl) {
          inviteUrl = data.inviteUrl
          sopProjectId = data.projectId ?? null
        } else {
          console.error('[fba-pack] SOP handshake failed', res.status, data)
        }
      } catch (err) {
        console.error('[fba-pack] SOP handshake error', err)
      }
    }

    const sent = await sendFbaPackEmail({
      partnerName,
      partnerEmail,
      city,
      address,
      franchiseFee,
      bookingAmount,
      utr,
      waiveMonths,
      remarks,
      agentName,
      agentPhone,
      inviteUrl,
      attachments,
    })
    if (!sent.success) {
      return NextResponse.json(
        { success: false, error: `Email failed: ${sent.error}` },
        { status: 502 }
      )
    }

    // Ship the pack's files to SOP (owner 2026-08-27: "how does the outlet know
    // which FBA pack belongs to it?"). They become evidence on the launch steps
    // and land in the outlet's Drive folder beside the partner's documents.
    // Runs AFTER the email — the confirmation is already out, so a hiccup here
    // costs nothing; the launch page simply keeps the tick without the file.
    if (sopProjectId && sopSecret && attachments.length) {
      try {
        const fd = new FormData()
        fd.set('projectId', sopProjectId)
        for (const a of attachments) {
          const slot = storedFiles.find((s) => s.filename === a.filename)?.slot ?? 'extra'
          fd.append(slot, new Blob([new Uint8Array(a.data)], { type: a.contentType }), a.filename)
        }
        const res = await fetch(`${sopBase}/api/integrations/saleshub/fba-files`, {
          method: 'POST',
          headers: { 'x-integration-secret': sopSecret },
          body: fd,
          signal: AbortSignal.timeout(25_000),
        })
        if (!res.ok) {
          console.error('[fba-pack] SOP file push failed', res.status, await res.text())
        }
      } catch (err) {
        console.error('[fba-pack] SOP file push error', err)
      }
    }

    const packId = randomUUID()
    await insertFbaPack({
      id: packId,
      lead_phone: leadPhone,
      payload: {
        partnerName,
        partnerEmail,
        city,
        address,
        franchiseFee,
        bookingAmount,
        utr,
        waiveMonths,
        remarks,
        agentName,
        agentPhone,
      },
      files: storedFiles,
      message_id: sent.message_id,
      invite_url: inviteUrl ?? undefined,
      sop_project_id: sopProjectId ?? undefined,
      sent_by: user.name ?? user.email ?? 'agent',
    })

    try {
      await insertNote({
        phone: leadPhone,
        note: `📋 FBA Pack sent — Location Booking Confirmation (${city}). ${attachments.length} file(s), CC gsquareco + partner.${inviteUrl ? ` SOP journey: ${inviteUrl}` : ''}`,
        created_by: user.name ?? 'agent',
      })
    } catch {
      // note is nice-to-have; the pack row is the record
    }

    return NextResponse.json({ success: true, inviteUrl, packId })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
