import { NextRequest, NextResponse } from 'next/server'
import { getLeads, logSentMessage } from '@/lib/sheets'
import { getOptedOutPhones, insertMessage, normalizePhone, upsertContact, getFailedPhonesForTemplate, claimEvent } from '@/lib/db'
import { releaseEvent, getPhonesSentTemplateSince } from '@/lib/leads-db-extra'
import { sendTemplate } from '@/lib/whatsapp'
import { apiError } from '@/lib/api-error'

const REACTIVATION_TEMPLATES = {
  d0: 'franchise_reactivation_d0',
  d5: 'franchise_reactivation_d5',
  d7: 'franchise_reactivation_d7',
  optin: 'franchise_reengagement_optin',
} as const

type TemplateKey = keyof typeof REACTIVATION_TEMPLATES

// Pre-May 2026 cutoff — leads created strictly before this date are eligible.
const PRE_MAY_CUTOFF = new Date('2026-05-01T00:00:00.000Z').getTime()

// Statuses that exclude a lead from re-engagement.
const EXCLUDED_STATUSES = new Set(['LOST', 'CONVERTED', 'ARCHIVED', 'DELAYED'])

// Live deals: an agent is in the middle of these conversations, so a bulk
// re-engagement blast is never sent, not even when a status allowlist names them.
const NEVER_TARGET_STATUSES = new Set(['HOT', 'FINAL_NEGOTIATION'])

// Pacing between sends (ms). 1.1s = ~54/min, well under WABA tier limits.
const PACE_MS = 1100

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return auth === `Bearer ${secret}`
}

function parseLeadDate(s: string): number | null {
  if (!s) return null
  // Facebook lead created_time is ISO 8601 (e.g. "2026-03-14T10:22:00+0000")
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}

// Campaign day in India time; scopes the send-once claim to one lead per day.
function campaignDayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function firstName(fullName: string): string {
  const trimmed = (fullName || '').trim()
  if (!trimmed) return 'there'
  return trimmed.split(/\s+/)[0]
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { template?: string; dryRun?: boolean; limit?: number; onlyFailed?: boolean; includeLost?: boolean; statuses?: string[]; failedFor?: string; skipIfSentWithinDays?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const templateKey = body.template as TemplateKey
  if (!templateKey || !REACTIVATION_TEMPLATES[templateKey]) {
    return NextResponse.json(
      { error: `template must be one of ${Object.keys(REACTIVATION_TEMPLATES).join(', ')}` },
      { status: 400 },
    )
  }
  const templateName = REACTIVATION_TEMPLATES[templateKey]
  const dryRun = body.dryRun !== false
  const limit = typeof body.limit === 'number' && body.limit > 0 ? body.limit : Infinity
  const onlyFailed = body.onlyFailed === true
  const includeLost = body.includeLost === true

  // When sending opt-in, the failure set we care about is from a marketing
  // template (e.g. d0), not the opt-in template itself. failedFor lets the
  // caller target the failures of a different template than the one being sent.
  const failedForKey = (body.failedFor as TemplateKey) || templateKey
  const failedForTemplate = REACTIVATION_TEMPLATES[failedForKey] || templateName

  // Explicit status allowlist takes priority over excluded-set logic (DELAYED
  // is only targeted when named here), but never over NEVER_TARGET_STATUSES.
  // Use this to target specific cohorts e.g. { statuses: ["LOST","DELAYED"] }.
  const statusAllowlist = Array.isArray(body.statuses) && body.statuses.length
    ? new Set(body.statuses.map(s => String(s).toUpperCase()))
    : null

  // When includeLost is set (and no allowlist), we still exclude CONVERTED +
  // ARCHIVED — those are explicit "do not contact" states — and DELAYED.
  const effectiveExcluded = includeLost
    ? new Set(['CONVERTED', 'ARCHIVED', 'DELAYED'])
    : EXCLUDED_STATUSES

  // Recurring mode: skip anyone who already got this same step recently.
  const skipIfSentWithinDays = typeof body.skipIfSentWithinDays === 'number' && body.skipIfSentWithinDays > 0
    ? body.skipIfSentWithinDays
    : 0

  try {
    const [leads, optedOut, failedPhones, recentlySent] = await Promise.all([
      getLeads(),
      getOptedOutPhones(),
      onlyFailed ? getFailedPhonesForTemplate(failedForTemplate) : Promise.resolve(new Set<string>()),
      skipIfSentWithinDays
        ? getPhonesSentTemplateSince(templateName, new Date(Date.now() - skipIfSentWithinDays * 86400000).toISOString())
        : Promise.resolve(new Set<string>()),
    ])

    const skipped = { no_phone: 0, merged: 0, bad_date: 0, post_may: 0, live_deal: 0, excluded_status: 0, not_in_allowlist: 0, opted_out: 0, duplicate: 0, not_in_failed_set: 0, sent_recently: 0, already_sent_today: 0 }
    const eligible: { phone: string; name: string; row: number; status: string }[] = []
    const seenPhones = new Set<string>()

    for (const lead of leads) {
      const phoneNorm = normalizePhone(lead.phone || '')
      if (!phoneNorm || phoneNorm.length < 12) { skipped.no_phone++; continue }
      // A merged row is a copy of another lead; the surviving row decides.
      if (lead.merged_into) { skipped.merged++; continue }

      const ts = parseLeadDate(lead.created_time)
      if (ts === null) { skipped.bad_date++; continue }
      if (ts >= PRE_MAY_CUTOFF) { skipped.post_may++; continue }

      if (NEVER_TARGET_STATUSES.has(lead.lead_status)) { skipped.live_deal++; continue }
      if (statusAllowlist) {
        if (!statusAllowlist.has(lead.lead_status)) { skipped.not_in_allowlist++; continue }
      } else if (effectiveExcluded.has(lead.lead_status)) {
        skipped.excluded_status++; continue
      }
      if (optedOut.has(phoneNorm)) { skipped.opted_out++; continue }
      if (seenPhones.has(phoneNorm)) { skipped.duplicate++; continue }
      if (onlyFailed && !failedPhones.has(phoneNorm)) { skipped.not_in_failed_set++; continue }
      if (recentlySent.has(phoneNorm)) { skipped.sent_recently++; continue }

      seenPhones.add(phoneNorm)
      eligible.push({
        phone: phoneNorm,
        name: firstName(lead.full_name),
        row: lead.row_number,
        status: lead.lead_status,
      })
    }

    const targets = eligible.slice(0, limit === Infinity ? eligible.length : limit)
    const results: { phone: string; ok: boolean; message_id?: string; error?: string }[] = []
    let sentCount = 0
    let failCount = 0

    if (dryRun) {
      return NextResponse.json({
        success: true,
        mode: 'dry_run',
        template: templateName,
        totals: {
          total_leads: leads.length,
          eligible: eligible.length,
          would_send: targets.length,
        },
        skipped,
        preview: targets.slice(0, 10).map(t => ({
          phone: t.phone,
          name: t.name,
          status: t.status,
          message_preview: `Hi ${t.name}, ...[${templateName}]`,
        })),
      })
    }

    const campaignDay = campaignDayIST()
    for (const t of targets) {
      // One send per lead per template per campaign day, even when the cron
      // (or a person) retries the whole run.
      const claimKey = `reactivation:${templateName}:${campaignDay}:${t.phone}`
      if (!(await claimEvent(claimKey, 'reactivation'))) {
        skipped.already_sent_today++
        continue
      }
      const res = await sendTemplate(t.phone, templateName, [{ type: 'text', text: t.name }])
      if (res.success) {
        sentCount++
        try {
          await upsertContact(t.phone, { name: t.name, is_lead: true })
          await insertMessage({
            phone: t.phone,
            direction: 'sent',
            text: `[Reactivation ${templateKey}] Old-price campaign closes 18th May`,
            timestamp: new Date().toISOString(),
            sent_by: 'System (Reactivation)',
            wa_message_id: res.message_id || '',
            status: 'sent',
            template_used: templateName,
          })
          await logSentMessage({
            phone: t.phone,
            name: t.name,
            message: `[Reactivation ${templateKey}] ${templateName}`,
            sent_by: 'System (Reactivation)',
            wa_message_id: res.message_id || '',
            status: 'sent',
            template_used: templateName,
          })
        } catch (logErr) {
          console.error('[franchise-reactivation] log error (non-critical):', logErr)
        }
        results.push({ phone: t.phone, ok: true, message_id: res.message_id })
      } else {
        // Nothing went out: free the claim so a retry can send it.
        await releaseEvent(claimKey)
        failCount++
        results.push({ phone: t.phone, ok: false, error: res.error })
      }

      if (PACE_MS > 0) {
        await new Promise(r => setTimeout(r, PACE_MS))
      }
    }

    return NextResponse.json({
      success: true,
      mode: 'live',
      template: templateName,
      totals: {
        total_leads: leads.length,
        eligible: eligible.length,
        attempted: targets.length,
        sent: sentCount,
        failed: failCount,
      },
      skipped,
      results,
    })
  } catch (err) {
    console.error('[franchise-reactivation] fatal:', err)
    return NextResponse.json({ success: false, error: apiError(err, 'Reactivation send failed') }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
