import { NextRequest, NextResponse } from 'next/server'
import { getLeads, createLead, invalidateLeadsCache } from '@/lib/sheets'
import { GOOGLE_ADS } from '@/config/client'
import type { GoogleAdsLead } from '@/lib/types'

// Normalize phone to 91XXXXXXXXXX — strips non-digits, ensures 91 prefix
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return '91' + digits
  if (digits.length === 12 && digits.startsWith('91')) return digits
  if (digits.length === 11 && digits.startsWith('0')) return '91' + digits.slice(1)
  return digits
}

// Process a single Google Ads lead payload into the sheet
async function processLead(payload: GoogleAdsLead): Promise<{
  success: boolean
  duplicate?: boolean
  row_number?: number
  lead_id?: string
  phone?: string
  error?: string
}> {
  // Resolve full name
  const full_name = (
    payload.full_name ||
    [payload.first_name, payload.last_name].filter(Boolean).join(' ')
  ).trim()

  if (!full_name || !payload.phone_number) {
    return { success: false, error: 'Name and phone are required' }
  }

  // Normalize phone
  const phone = normalizePhone(payload.phone_number)
  if (phone.length < 10) {
    return { success: false, error: 'Invalid phone number' }
  }

  // Dedup by last 10 digits
  const existing = await getLeads()
  const cleanPhone = phone.slice(-10)
  const duplicate = existing.find(l => l.phone.replace(/\D/g, '').slice(-10) === cleanPhone)
  if (duplicate) {
    return { success: false, duplicate: true, error: 'Duplicate phone number' }
  }

  const lead_id = `GADS-${Date.now()}`

  const row_number = await createLead({
    full_name,
    phone,
    email: payload.email || '',
    city: payload.city || '',
    state: payload.state || '',
    model_interest: payload.model_interest || payload.investment_budget || '',
    lead_priority: GOOGLE_ADS.defaultPriority,
    source: payload.campaign_name || GOOGLE_ADS.platform,
    notes: [
      payload.experience ? `Experience: ${payload.experience}` : '',
      payload.timeline ? `Timeline: ${payload.timeline}` : '',
      payload.gclid ? `GCLID: ${payload.gclid}` : '',
      payload.form_name ? `Form: ${payload.form_name}` : '',
      payload.campaign_id ? `Campaign ID: ${payload.campaign_id}` : '',
    ].filter(Boolean).join(' | '),
  })

  // Invalidate cache so auto-send cron picks up the new lead immediately
  invalidateLeadsCache()

  return { success: true, row_number, lead_id, phone }
}

export async function POST(req: NextRequest) {
  try {
    // --- Auth: Bearer token ---
    const secret = GOOGLE_ADS.webhookSecret
    if (!secret) {
      console.error('[Google Ads Webhook] GOOGLE_ADS_WEBHOOK_SECRET not set — rejecting all requests')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }

    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (token !== secret) {
      console.warn('[Google Ads Webhook] Invalid or missing Bearer token — rejecting')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    // --- Batch support: accept array or single object ---
    const isBatch = Array.isArray(body)
    const payloads: GoogleAdsLead[] = isBatch ? body : [body]

    if (payloads.length === 0) {
      return NextResponse.json({ success: false, error: 'Empty payload' }, { status: 400 })
    }

    // Single lead — return focused response
    if (!isBatch) {
      const payload = payloads[0]

      if (!payload.phone_number) {
        return NextResponse.json({ success: false, error: 'phone_number is required' }, { status: 400 })
      }

      const result = await processLead(payload)

      if (result.duplicate) {
        return NextResponse.json({ success: false, error: result.error }, { status: 409 })
      }

      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 })
      }

      return NextResponse.json({
        success: true,
        data: {
          lead_id: result.lead_id,
          row_number: result.row_number,
          phone: result.phone,
          platform: GOOGLE_ADS.platform,
        },
      })
    }

    // Batch mode — process all and return summary
    const results = await Promise.allSettled(payloads.map(p => processLead(p)))
    let created = 0
    let duplicates = 0
    let errors = 0

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value.success) created++
        else if (r.value.duplicate) duplicates++
        else errors++
      } else {
        errors++
      }
    }

    return NextResponse.json({
      success: true,
      data: { created, duplicates, errors, total: payloads.length },
    })
  } catch (err) {
    console.error('[Google Ads Webhook] Unexpected error:', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
