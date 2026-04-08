import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getLeads } from '@/lib/sheets'
import { getMessages, getSetting, setSetting } from '@/lib/db'
import { sendTemplate } from '@/lib/whatsapp'

const CRON_SECRET = process.env.CRON_SECRET
const ALERT_PHONE = process.env.DIGEST_WA_PHONE || '917973933630'
const ALERT_TEMPLATE = process.env.REPLY_ALERT_TEMPLATE || 'reply_alert'
const STALE_HOURS = 4
const ALERT_COOLDOWN_HOURS = 8 // Don't re-alert for the same lead within this window

/**
 * POST /api/cron/reply-alert
 *
 * Runs hourly. Finds REPLIED leads with no agent response for 4+ hours.
 * Sends WhatsApp alert to Gavish during business hours (9 AM - 7 PM IST).
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = authHeader?.replace('Bearer ', '')

  if (CRON_SECRET && cronSecret !== CRON_SECRET) {
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

export async function GET() {
  return NextResponse.json({
    name: 'reply-alert',
    description: 'Hourly check for REPLIED leads with no agent response for 4+ hours',
    stale_hours: STALE_HOURS,
    alert_phone: ALERT_PHONE,
    business_hours: '9 AM - 7 PM IST',
  })
}
