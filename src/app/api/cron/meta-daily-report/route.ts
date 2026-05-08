import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { apiError } from '@/lib/api-error'
import { getLeads } from '@/lib/sheets'
import { getOptedOutPhones, normalizePhone } from '@/lib/db'
import { getCapiStats, getRecentCapiEvents, getMetaCapiSettings, getLastAudienceSync } from '@/lib/meta-capi'

const CRON_SECRET = process.env.CRON_SECRET
const REPORT_TO = process.env.META_REPORT_TO || process.env.DIGEST_EMAIL_TO || 'tbwxpress@gmail.com'
const REPORT_CC = process.env.META_REPORT_CC || ''

function getGmail() {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN })
  return google.gmail({ version: 'v1', auth })
}

async function sendEmail(opts: { to: string; cc: string; subject: string; html: string; text: string }) {
  const senderName = 'TBWX Sales Hub'
  const senderEmail = process.env.EMAIL_SENDER || 'ai@tbwxpress.com'

  const boundary = `tbwx_${Date.now()}`
  const headers = [
    `From: ${senderName} <${senderEmail}>`,
    `To: ${opts.to}`,
    ...(opts.cc ? [`Cc: ${opts.cc}`] : []),
    `Subject: ${opts.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    opts.text,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    opts.html,
    ``,
    `--${boundary}--`,
  ].join('\r\n')

  const encoded = Buffer.from(headers)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const gmail = getGmail()
  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } })
  return res.data.id || ''
}

// POST /api/cron/meta-daily-report
//   - Sends a Meta optimization digest email
//   - Auth: CRON_SECRET bearer or admin session
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const provided = authHeader?.replace('Bearer ', '')
    const isCron = CRON_SECRET && provided === CRON_SECRET
    if (!isCron) {
      const { getSession, requireAuth, requireAdmin } = await import('@/lib/auth')
      const session = await getSession()
      const user = requireAuth(session)
      requireAdmin(user)
    }

    // ─── Compute window (last 24h IST roughly = since same time yesterday UTC) ───
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const todayIST = new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [leads, optedOutSet, capiStats, recentEvents, settings, lastSync] = await Promise.all([
      getLeads(),
      getOptedOutPhones(),
      getCapiStats(),
      getRecentCapiEvents(20),
      getMetaCapiSettings(),
      getLastAudienceSync(),
    ])

    // ─── Lead transitions in last 24h ───────────────────────────────
    const leadCreatedToday = leads.filter(l => l.created_time && new Date(l.created_time) >= yesterday).length
    const convertedTotal = leads.filter(l => l.lead_status === 'CONVERTED').length
    const lostTotal = leads.filter(l => l.lead_status === 'LOST').length
    const hotTotal = leads.filter(l => l.lead_status === 'HOT').length

    // Phone-validated audiences
    const buyerPhonesValid = leads.filter(l => l.lead_status === 'CONVERTED' && normalizePhone(l.phone || '')).length
    const excludePhonesValid = leads.filter(l => l.lead_status === 'LOST' && normalizePhone(l.phone || '')).length + optedOutSet.size

    // CAPI event mix in last 24h
    const recentEvents24h = recentEvents.filter(e => new Date(e.created_at) >= yesterday)
    const sent24h = recentEvents24h.filter(e => e.status === 'sent').length
    const failed24h = recentEvents24h.filter(e => e.status === 'failed').length
    const purchaseSent = recentEvents24h.filter(e => e.event_name === 'Purchase' && e.status === 'sent').length
    const leadSent = recentEvents24h.filter(e => e.event_name === 'Lead' && e.status === 'sent').length

    // ─── Meta API: live audience counts ─────────────────────────────
    let buyersLiveCount: number | null = null
    let excludeLiveCount: number | null = null
    if (settings.access_token && lastSync.result?.buyers?.audience_id && lastSync.result?.exclude?.audience_id) {
      try {
        const META_GRAPH = process.env.META_GRAPH_API_BASE || 'https://graph.facebook.com/v21.0'
        const fetchSize = async (id: string) => {
          const r = await fetch(`${META_GRAPH}/${id}?fields=approximate_count_lower_bound,approximate_count_upper_bound&access_token=${encodeURIComponent(settings.access_token)}`)
          if (!r.ok) return null
          const j = await r.json() as { approximate_count_lower_bound?: number; approximate_count_upper_bound?: number }
          return j.approximate_count_lower_bound ?? null
        }
        buyersLiveCount = await fetchSize(lastSync.result.buyers.audience_id)
        excludeLiveCount = await fetchSize(lastSync.result.exclude.audience_id)
      } catch { /* non-critical */ }
    }

    // ─── Build email body ───────────────────────────────────────────
    const status = settings.enabled ? '🟢 LIVE' : '🔴 DISABLED'
    const testBadge = settings.test_event_code ? ' (test mode)' : ''

    const subject = `TBWX Meta Optimization — ${todayIST}`

    const text = `TBWX Meta Optimization Daily Report — ${todayIST}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CAPI Status: ${status}${testBadge}
Pixel: ${settings.pixel_id}

LAST 24H
  CAPI events sent:    ${sent24h}  (Purchase ${purchaseSent} · Lead ${leadSent})
  CAPI events failed:  ${failed24h}
  New leads:           ${leadCreatedToday}

PIPELINE TOTALS
  CONVERTED leads:     ${convertedTotal}  (Buyers audience seed)
  HOT leads:           ${hotTotal}
  LOST leads:          ${lostTotal}
  Opted-out:           ${optedOutSet.size}

CUSTOM AUDIENCES (Meta-side count after match)
  Buyers:   ${buyersLiveCount ?? '—'}  (CRM has ${buyerPhonesValid} valid phones queued)
  Exclude:  ${excludeLiveCount ?? '—'}  (CRM has ${excludePhonesValid} valid phones queued)

LAST AUDIENCE SYNC: ${lastSync.ts || 'never'}
LIFETIME CAPI EVENTS: ${capiStats.total}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEXT ACTIONS:
${convertedTotal < 50 ? '  · Buyers audience needs ~50 seeds for a quality Lookalike. Currently ' + convertedTotal + '. Keep firing CAPI events as you convert.' : '  · Buyers audience is well-seeded. Create a 1% Lookalike off it for prospecting.'}
${excludeLiveCount === null ? '' : excludeLiveCount > 0 ? '  · Confirm "TBWX CRM — Exclude (auto-synced)" is set as Exclusion in every active ad set.' : ''}
${failed24h > 5 ? '  · ⚠ ' + failed24h + ' CAPI events failed yesterday — check Sales Hub Admin → Meta Conversions API panel.' : ''}

— Sent by Sales Hub cron · sales.tbwxpress.com/admin
`

    const eventRows = recentEvents24h.slice(0, 10).map(e => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #2a1f10;font-size:11px;color:#b8a088;">${e.created_at?.slice(11, 16) || ''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #2a1f10;font-size:12px;color:#faf5eb;">${e.event_name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #2a1f10;font-size:11px;color:#d9c9a8;text-align:right;">${e.currency} ${Number(e.value).toLocaleString('en-IN')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #2a1f10;font-size:10px;color:${e.status === 'sent' ? '#22c55e' : e.status === 'failed' ? '#ef4444' : '#f59e0b'};text-transform:uppercase;letter-spacing:0.05em;">${e.status}</td>
      </tr>
    `).join('')

    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,'Segoe UI',sans-serif;color:#faf5eb;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;">
  <h1 style="font-size:18px;color:#f5c518;margin:0 0 4px;">TBWX Meta Optimization</h1>
  <p style="font-size:11px;color:#b8a088;margin:0 0 20px;letter-spacing:0.05em;text-transform:uppercase;">Daily Report · ${todayIST}</p>

  <div style="background:#241a0e;border:1px solid #4a3520;border-radius:10px;padding:16px;margin-bottom:14px;">
    <p style="font-size:11px;color:#b8a088;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.08em;">CAPI Status</p>
    <p style="font-size:18px;color:${settings.enabled ? '#22c55e' : '#ef4444'};margin:0;font-weight:700;">${status}${testBadge}</p>
    <p style="font-size:11px;color:#d9c9a8;margin:6px 0 0;">Pixel ${settings.pixel_id}</p>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
    <tr>
      <td style="background:#241a0e;border:1px solid #4a3520;border-radius:8px;padding:14px;width:48%;">
        <div style="font-size:10px;color:#b8a088;text-transform:uppercase;letter-spacing:0.08em;">Last 24h sent</div>
        <div style="font-size:24px;font-weight:700;color:#22c55e;margin-top:4px;">${sent24h}</div>
        <div style="font-size:11px;color:#d9c9a8;margin-top:2px;">${purchaseSent} Purchase · ${leadSent} Lead</div>
      </td>
      <td style="width:4%;"></td>
      <td style="background:#241a0e;border:1px solid #4a3520;border-radius:8px;padding:14px;width:48%;">
        <div style="font-size:10px;color:#b8a088;text-transform:uppercase;letter-spacing:0.08em;">Failed 24h</div>
        <div style="font-size:24px;font-weight:700;color:${failed24h > 0 ? '#ef4444' : '#d9c9a8'};margin-top:4px;">${failed24h}</div>
        <div style="font-size:11px;color:#d9c9a8;margin-top:2px;">All-time: ${capiStats.total}</div>
      </td>
    </tr>
  </table>

  <div style="background:#241a0e;border:1px solid #4a3520;border-radius:10px;padding:16px;margin-bottom:14px;">
    <p style="font-size:11px;color:#b8a088;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.08em;">Custom Audiences</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:4px 0;color:#d9c9a8;font-size:13px;">Buyers (Lookalike seed)</td><td style="padding:4px 0;text-align:right;color:#faf5eb;font-weight:600;">${buyersLiveCount ?? '—'}<span style="color:#b8a088;font-weight:400;font-size:11px;"> · ${buyerPhonesValid} in CRM</span></td></tr>
      <tr><td style="padding:4px 0;color:#d9c9a8;font-size:13px;">Exclude (LOST + opted-out)</td><td style="padding:4px 0;text-align:right;color:#faf5eb;font-weight:600;">${excludeLiveCount ?? '—'}<span style="color:#b8a088;font-weight:400;font-size:11px;"> · ${excludePhonesValid} in CRM</span></td></tr>
    </table>
    <p style="font-size:10px;color:#b8a088;margin:10px 0 0;">Last sync: ${lastSync.ts || 'never'}</p>
  </div>

  <div style="background:#241a0e;border:1px solid #4a3520;border-radius:10px;padding:16px;margin-bottom:14px;">
    <p style="font-size:11px;color:#b8a088;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.08em;">Pipeline Totals</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:3px 0;color:#d9c9a8;font-size:13px;">CONVERTED</td><td style="padding:3px 0;text-align:right;color:#22c55e;font-weight:600;">${convertedTotal}</td></tr>
      <tr><td style="padding:3px 0;color:#d9c9a8;font-size:13px;">HOT</td><td style="padding:3px 0;text-align:right;color:#f59e0b;font-weight:600;">${hotTotal}</td></tr>
      <tr><td style="padding:3px 0;color:#d9c9a8;font-size:13px;">LOST</td><td style="padding:3px 0;text-align:right;color:#ef4444;font-weight:600;">${lostTotal}</td></tr>
      <tr><td style="padding:3px 0;color:#d9c9a8;font-size:13px;">New (24h)</td><td style="padding:3px 0;text-align:right;color:#faf5eb;font-weight:600;">${leadCreatedToday}</td></tr>
    </table>
  </div>

  ${recentEvents24h.length > 0 ? `
  <div style="background:#241a0e;border:1px solid #4a3520;border-radius:10px;padding:16px;margin-bottom:14px;">
    <p style="font-size:11px;color:#b8a088;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.08em;">Recent CAPI events</p>
    <table style="width:100%;border-collapse:collapse;">${eventRows}</table>
  </div>` : ''}

  <p style="font-size:11px;color:#b8a088;margin:20px 0 0;text-align:center;">
    Sent by <a href="https://sales.tbwxpress.com/admin" style="color:#f5c518;text-decoration:none;">Sales Hub</a> · Auto-generated daily
  </p>
</div>
</body></html>`

    const messageId = await sendEmail({ to: REPORT_TO, cc: REPORT_CC, subject, html, text })

    return NextResponse.json({
      success: true,
      data: {
        sent_to: REPORT_TO,
        message_id: messageId,
        events_24h: { sent: sent24h, failed: failed24h },
        audiences: { buyers: buyersLiveCount, exclude: excludeLiveCount },
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'meta-daily-report',
    description: 'Sends a daily Meta CAPI optimization digest email',
    schedule: '9 AM IST (3:30 UTC)',
    recipient: REPORT_TO,
  })
}
