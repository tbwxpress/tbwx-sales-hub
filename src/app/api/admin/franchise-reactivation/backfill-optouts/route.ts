import { NextRequest, NextResponse } from 'next/server'
import { getLeads, updateLead } from '@/lib/sheets'
import { getMessagesContainingText, upsertDripState, insertStatusChange, getContact, normalizePhone } from '@/lib/db'
import { apiError } from '@/lib/api-error'

// Patterns that count as an opt-out reply from a lead.
const OPT_OUT_PATTERNS: RegExp[] = [
  /^\s*stop\b/i,
  /^\s*unsubscribe\b/i,
  /not\s+interested/i,
  /^\s*remove\s+me\b/i,
  /^\s*don[' ]?t\s+(message|contact|disturb)/i,
]

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return auth === `Bearer ${secret}`
}

function isOptOut(text: string): boolean {
  const t = (text || '').trim()
  if (!t) return false
  return OPT_OUT_PATTERNS.some(re => re.test(t))
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { dryRun?: boolean }
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const dryRun = body.dryRun !== false

  try {
    // Pull received messages that look like opt-outs.
    // We over-fetch with a broad keyword then filter precisely with regex.
    const candidates = await getMessagesContainingText('received', [
      'stop', 'unsubscribe', 'not interested', 'remove me', 'dont message', "don't message",
    ])

    // Reduce to one record per phone (the earliest opt-out reply).
    const earliestByPhone = new Map<string, { phone: string; text: string; timestamp: string }>()
    for (const m of candidates) {
      const text = String(m.text || '')
      if (!isOptOut(text)) continue
      const phone = normalizePhone(String(m.phone || ''))
      if (!phone) continue
      const ts = String(m.timestamp || '')
      const existing = earliestByPhone.get(phone)
      if (!existing || (existing.timestamp && ts < existing.timestamp)) {
        earliestByPhone.set(phone, { phone, text, timestamp: ts })
      }
    }

    const leads = await getLeads()
    const leadByPhone = new Map<string, typeof leads[number]>()
    for (const lead of leads) {
      const p = normalizePhone(lead.phone || '')
      if (p) leadByPhone.set(p, lead)
    }

    const toFix: { phone: string; lead_row: number; prev_status: string; first_optout_text: string; timestamp: string }[] = []
    const skipped = { no_lead_match: 0, already_lost: 0 }

    for (const [phone, info] of earliestByPhone) {
      const lead = leadByPhone.get(phone)
      if (!lead) { skipped.no_lead_match++; continue }
      if (lead.lead_status === 'LOST') { skipped.already_lost++; continue }
      toFix.push({
        phone,
        lead_row: lead.row_number,
        prev_status: lead.lead_status,
        first_optout_text: info.text.slice(0, 80),
        timestamp: info.timestamp,
      })
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        mode: 'dry_run',
        totals: {
          opt_out_replies_found: earliestByPhone.size,
          would_mark_lost: toFix.length,
        },
        skipped,
        preview: toFix.slice(0, 20),
      })
    }

    let applied = 0
    const errors: { phone: string; error: string }[] = []
    for (const fix of toFix) {
      try {
        await updateLead(fix.lead_row, {
          lead_status: 'LOST',
          notes: `[Backfill] Replied opt-out "${fix.first_optout_text}" on ${fix.timestamp} — marked LOST`,
        })
        await insertStatusChange({
          lead_row: fix.lead_row,
          phone: fix.phone,
          old_status: fix.prev_status,
          new_status: 'LOST',
          changed_by: 'System (Opt-out Backfill)',
          source: 'webhook',
        })
        await upsertDripState(fix.phone, {
          enabled: false,
          paused_at: new Date().toISOString(),
          pause_reason: `Opt-out backfill: "${fix.first_optout_text}"`,
          opted_out: true,
          opted_out_at: fix.timestamp || new Date().toISOString(),
        })
        applied++
      } catch (err) {
        errors.push({ phone: fix.phone, error: err instanceof Error ? err.message : String(err) })
      }
    }

    return NextResponse.json({
      success: true,
      mode: 'live',
      totals: {
        opt_out_replies_found: earliestByPhone.size,
        marked_lost: applied,
        errors: errors.length,
      },
      skipped,
      errors: errors.slice(0, 20),
    })
  } catch (err) {
    console.error('[backfill-optouts] fatal:', err)
    return NextResponse.json({ success: false, error: apiError(err, 'Backfill failed') }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
