import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getLeads } from '@/lib/sheets'
import { getMessages, getSetting, setSetting, getLastDiscussionByPhone, ensureInit } from '@/lib/db'
import { sendTemplate } from '@/lib/whatsapp'
import { notifyQuiet } from '@/lib/notifications'
import { getUsers } from '@/lib/users'

const CRON_SECRET = process.env.CRON_SECRET
const ALERT_PHONE = process.env.DIGEST_WA_PHONE || '917973933630'
const ALERT_TEMPLATE = process.env.REPLY_ALERT_TEMPLATE || 'reply_alert'
const STALE_HOURS = 4
const ALERT_COOLDOWN_HOURS = 8 // Don't re-alert for the same lead within this window

// HOT-tier statuses that trigger the SLA sweep
const HOT_TIER_STATUSES = new Set(['HOT', 'FINAL_NEGOTIATION', 'CALL_DONE_INTERESTED'])

// Parse a timestamp that may be SQLite 'YYYY-MM-DD HH:MM:SS' or ISO-Z string.
// Bare datetimes from SQLite are UTC — pin to 'Z' to avoid local-TZ mis-reads.
function tsToMs(s: string | null | undefined): number {
  if (!s) return 0
  let str = String(s).trim().replace(' ', 'T')
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(str)) str += 'Z'
  const t = new Date(str).getTime()
  return Number.isNaN(t) ? 0 : t
}

/**
 * POST /api/cron/reply-alert
 *
 * Runs hourly. Finds REPLIED leads with no agent response for 4+ hours.
 * Sends WhatsApp alert to Gavish during business hours (9 AM - 7 PM IST).
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = authHeader?.replace('Bearer ', '')

  if (!CRON_SECRET || cronSecret !== CRON_SECRET) {
    const { getSession, requireAuth } = await import('@/lib/auth')
    const session = await getSession()
    try {
      const user = requireAuth(session)
      if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    // Only alert during business hours (9 AM - 7 PM IST = UTC+5:30)
    const nowUTC = new Date()
    const istHour = (nowUTC.getUTCHours() + 5 + (nowUTC.getUTCMinutes() + 30 >= 60 ? 1 : 0)) % 24
    if (istHour < 9 || istHour >= 19) {
      return NextResponse.json({ success: true, message: 'Outside business hours, skipping', istHour })
    }

    const leads = await getLeads()
    const now = Date.now()
    const staleMs = STALE_HOURS * 3600 * 1000

    const repliedLeads = leads.filter(l => l.lead_status === 'REPLIED')
    const alerts: { name: string; city: string; hours: number; assigned: string }[] = []

    for (const lead of repliedLeads) {
      const phone = lead.phone.replace(/\D/g, '')
      if (phone.length < 10) continue

      try {
        const messages = await getMessages(phone, 50)
        if (!messages || messages.length === 0) continue

        // Find the last received message
        const received = messages.filter((m: Record<string, unknown>) => m.direction === 'received')
        if (received.length === 0) continue

        const lastReceived = received[received.length - 1] as Record<string, unknown>
        const receivedTime = new Date(String(lastReceived.timestamp)).getTime()

        // Check if there's any outbound message AFTER the last received
        const sent = messages.filter((m: Record<string, unknown>) =>
          m.direction === 'sent' &&
          new Date(String(m.timestamp)).getTime() > receivedTime &&
          String(m.sent_by) !== 'auto-send' // Exclude automated messages
        )

        if (sent.length > 0) continue // Agent already responded

        // Check if it's been stale for 4+ hours
        const hoursAgo = Math.round((now - receivedTime) / 3600000)
        if (hoursAgo >= STALE_HOURS) {
          alerts.push({
            name: lead.full_name || 'Unknown',
            city: lead.city || 'Unknown',
            hours: hoursAgo,
            assigned: lead.assigned_to || 'Unassigned',
          })
        }
      } catch { /* Skip individual lead errors */ }
    }

    // Dedup: check which leads were already alerted recently
    const alertedRaw = await getSetting('reply_alert_sent') || '{}'
    let alertedMap: Record<string, number> = {}
    try { alertedMap = JSON.parse(alertedRaw) } catch { alertedMap = {} }
    const nowMs = Date.now()
    const cooldownMs = ALERT_COOLDOWN_HOURS * 3600 * 1000

    // Filter out leads alerted within cooldown window
    const newAlerts = alerts.filter(a => {
      const key = a.name.replace(/\s+/g, '_')
      const lastAlerted = alertedMap[key] || 0
      return (nowMs - lastAlerted) > cooldownMs
    })

    // Send alerts (max 5 per run)
    const results: { name: string; sent: boolean; error?: string }[] = []
    for (const alert of newAlerts.slice(0, 5)) {
      try {
        const waResult = await sendTemplate(ALERT_PHONE, ALERT_TEMPLATE, [
          { type: 'text', text: alert.name },
          { type: 'text', text: alert.city },
          { type: 'text', text: `${alert.hours}` },
          { type: 'text', text: alert.assigned },
        ])
        results.push({ name: alert.name, sent: waResult.success, error: waResult.error })
        if (waResult.success) {
          alertedMap[alert.name.replace(/\s+/g, '_')] = nowMs
        }
      } catch (err) {
        results.push({ name: alert.name, sent: false, error: String(err) })
      }
    }

    // Persist alert timestamps (prune entries older than 24h to prevent unbounded growth)
    const pruned: Record<string, number> = {}
    for (const [k, v] of Object.entries(alertedMap)) {
      if (nowMs - v < 86400000) pruned[k] = v
    }
    await setSetting('reply_alert_sent', JSON.stringify(pruned))

    return NextResponse.json({
      success: true,
      stale_leads: alerts.length,
      alerts_sent: results.filter(r => r.sent).length,
      results,
    })
  } catch (err) {
    console.error('[reply-alert] Error:', err)
    return NextResponse.json({ success: false, error: apiError(err, 'Reply alert failed') }, { status: 500 })
  }
}

/**
 * GET /api/cron/reply-alert
 *
 * SLA sweeps:
 *   (a) HOT-tier leads (HOT / FINAL_NEGOTIATION / CALL_DONE_INTERESTED) untouched > 3 days
 *   (b) NEW leads uncontacted > 24 h
 *
 * Also returns route metadata so it can serve as a healthcheck.
 */
export async function GET(req: NextRequest) {
  // Auth: same fail-closed pattern as POST
  const authHeader = req.headers.get('authorization')
  const cronSecret = authHeader?.replace('Bearer ', '')

  if (!CRON_SECRET || cronSecret !== CRON_SECRET) {
    const { getSession, requireAuth } = await import('@/lib/auth')
    const session = await getSession()
    try {
      const user = requireAuth(session)
      if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const nowMs = Date.now()
  const DAY_MS = 86_400_000
  const HOT_BREACH_DAYS = 3
  const HOT_ADMIN_DAYS = 7
  const NEW_BREACH_HOURS = 24
  const NEW_ADMIN_HOURS = 72
  const SLA_DEDUP_WINDOW_MS = DAY_MS // 24 h dedup window
  const CAP_PER_SWEEP = 15

  let hot_breaches = 0
  let new_breaches = 0
  // Return a minimal info payload even if sweeps fail
  const sweepErrors: string[] = []

  try {
    const [leads, lastDiscussionMap, users, db] = await Promise.all([
      getLeads(),
      getLastDiscussionByPhone(),
      getUsers(),
      ensureInit(),
    ])

    const admins = users.filter(u => u.active && u.role === 'admin')

    // Helper: resolve assigned agent user record by name
    const agentByName = (name: string | undefined) =>
      users.find(u => u.active && u.name === name) ?? null

    // Helper: check if an SLA breach notification already fired for this lead row
    // in the last 24 h (avoids spam on every cron tick).
    async function recentBreachExists(leadRow: number): Promise<boolean> {
      try {
        const cutoff = new Date(nowMs - SLA_DEDUP_WINDOW_MS).toISOString().replace('T', ' ').slice(0, 19)
        const r = await db.execute({
          sql: `SELECT 1 FROM notifications
                WHERE type = 'sla_breach'
                  AND ref_lead_row = ?
                  AND created_at >= ?
                LIMIT 1`,
          args: [leadRow, cutoff],
        })
        return r.rows.length > 0
      } catch {
        return false
      }
    }

    // --- (a) HOT-TIER SWEEP ---
    try {
      const hotLeads = leads.filter(l => HOT_TIER_STATUSES.has(l.lead_status))

      // Sort oldest-first so the cap keeps the most stale leads
      const breachCandidates: { lead: typeof hotLeads[0]; lastTouchMs: number; daysSince: number }[] = []

      for (const lead of hotLeads) {
        const phone10 = lead.phone.replace(/\D/g, '').slice(-10)
        const normPhone = `91${phone10}`

        const disc = lastDiscussionMap.get(normPhone)
        const lastTouchMs = disc ? tsToMs(disc.at) : tsToMs(lead.created_time)
        const daysSince = (nowMs - lastTouchMs) / DAY_MS

        if (daysSince >= HOT_BREACH_DAYS) {
          breachCandidates.push({ lead, lastTouchMs, daysSince })
        }
      }

      // Oldest first, cap at 15
      breachCandidates.sort((a, b) => a.lastTouchMs - b.lastTouchMs)
      const hotTargets = breachCandidates.slice(0, CAP_PER_SWEEP)

      for (const { lead, daysSince } of hotTargets) {
        if (lead.row_number == null) continue
        const alreadyNotified = await recentBreachExists(lead.row_number)
        if (alreadyNotified) continue

        const daysRounded = Math.round(daysSince)
        const title = `HOT lead untouched ${daysRounded}d: ${lead.full_name || 'Unknown'}`
        const phone = lead.phone.replace(/\D/g, '') || ''
        const refPhone = phone.length >= 10 ? `91${phone.slice(-10)}` : phone || null

        // Notify assigned agent
        const agent = agentByName(lead.assigned_to)
        if (agent) {
          await notifyQuiet({
            user_id: agent.id,
            type: 'sla_breach',
            title,
            body: `${lead.city || ''} — last touch ${daysRounded}d ago`,
            ref_phone: refPhone,
            ref_lead_row: lead.row_number,
          })
        }

        // Notify all admins too if > 7 days
        if (daysSince >= HOT_ADMIN_DAYS) {
          for (const admin of admins) {
            if (admin.id === agent?.id) continue // already notified above
            await notifyQuiet({
              user_id: admin.id,
              type: 'sla_breach',
              title: `[ADMIN] ${title}`,
              body: `Assigned to ${lead.assigned_to || 'Unassigned'} — ${daysRounded}d without contact`,
              ref_phone: refPhone,
              ref_lead_row: lead.row_number,
            })
          }
        }

        hot_breaches++
      }
    } catch (err) {
      sweepErrors.push(`hot_sweep: ${String(err)}`)
      console.error('[reply-alert GET] hot sweep error:', err)
    }

    // --- (b) STALE-NEW SWEEP ---
    try {
      const newLeads = leads.filter(l => l.lead_status === 'NEW')

      const staleNewCandidates: { lead: typeof newLeads[0]; createdMs: number; hoursSince: number }[] = []

      for (const lead of newLeads) {
        const createdMs = tsToMs(lead.created_time)
        if (!createdMs) continue

        const hoursSince = (nowMs - createdMs) / 3_600_000
        if (hoursSince <= NEW_BREACH_HOURS) continue // not yet stale

        const phone10 = lead.phone.replace(/\D/g, '').slice(-10)
        const normPhone = `91${phone10}`

        // Zero touches = no sent message, no call log, no note
        const disc = lastDiscussionMap.get(normPhone)
        const hasTouched = !!disc

        if (!hasTouched) {
          staleNewCandidates.push({ lead, createdMs, hoursSince })
        }
      }

      // Oldest first, cap at 15
      staleNewCandidates.sort((a, b) => a.createdMs - b.createdMs)
      const newTargets = staleNewCandidates.slice(0, CAP_PER_SWEEP)

      for (const { lead, hoursSince } of newTargets) {
        if (lead.row_number == null) continue
        const alreadyNotified = await recentBreachExists(lead.row_number)
        if (alreadyNotified) continue

        const hoursRounded = Math.round(hoursSince)
        const title = `NEW lead uncontacted ${hoursRounded}h+: ${lead.full_name || 'Unknown'}`
        const phone = lead.phone.replace(/\D/g, '') || ''
        const refPhone = phone.length >= 10 ? `91${phone.slice(-10)}` : phone || null

        const agent = agentByName(lead.assigned_to)
        if (agent) {
          await notifyQuiet({
            user_id: agent.id,
            type: 'sla_breach',
            title,
            body: `${lead.city || ''} — created ${hoursRounded}h ago, never contacted`,
            ref_phone: refPhone,
            ref_lead_row: lead.row_number,
          })
        }

        // Notify admins if > 72 h
        if (hoursSince >= NEW_ADMIN_HOURS) {
          for (const admin of admins) {
            if (admin.id === agent?.id) continue
            await notifyQuiet({
              user_id: admin.id,
              type: 'sla_breach',
              title: `[ADMIN] ${title}`,
              body: `Assigned to ${lead.assigned_to || 'Unassigned'} — ${hoursRounded}h uncontacted`,
              ref_phone: refPhone,
              ref_lead_row: lead.row_number,
            })
          }
        }

        new_breaches++
      }
    } catch (err) {
      sweepErrors.push(`new_sweep: ${String(err)}`)
      console.error('[reply-alert GET] new sweep error:', err)
    }
  } catch (err) {
    sweepErrors.push(`setup: ${String(err)}`)
    console.error('[reply-alert GET] setup error:', err)
  }

  return NextResponse.json({
    success: true,
    name: 'reply-alert',
    description: 'Hourly check for REPLIED leads with no agent response for 4+ hours; SLA sweeps for HOT and NEW leads',
    stale_hours: STALE_HOURS,
    alert_phone: ALERT_PHONE,
    business_hours: '9 AM - 7 PM IST',
    replied_alerts: 0, // POST handler runs the WhatsApp alerts; GET runs the in-app SLA sweeps
    hot_breaches,
    new_breaches,
    ...(sweepErrors.length > 0 ? { sweep_errors: sweepErrors } : {}),
  })
}
