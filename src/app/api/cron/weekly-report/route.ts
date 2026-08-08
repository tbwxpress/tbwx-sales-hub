import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSetting, setSetting } from '@/lib/db'
import { buildWindow, gatherWeeklyReport, renderWeeklyReportHtml } from '@/lib/weekly-report'
import { encodeSubject } from '@/lib/email'

const CRON_SECRET = process.env.CRON_SECRET
const DIGEST_TO = process.env.DIGEST_EMAIL_TO || 'tbwxpress@gmail.com'
const DIGEST_CC = process.env.DIGEST_EMAIL_CC || ''

// Watermark: the end of the window the last DELIVERED report covered. The
// next report starts exactly there, so a missed Saturday is never a data
// gap — the following one simply covers the longer stretch.
const WATERMARK_KEY = 'weekly_report.last_sent_at'
const MAX_LOOKBACK_DAYS = 31

/**
 * POST /api/cron/weekly-report
 *
 * Saturday 19:00 IST (13:30 UTC). Detailed owner report of the Sales Hub
 * week, emailed as HTML. Read-only: queries and sends mail, nothing else.
 * Body/query `preview=1` sends a clearly-labelled preview WITHOUT advancing
 * the watermark, so a live run still covers the same period.
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

  let preview = req.nextUrl.searchParams.get('preview') === '1'
  try {
    const body = await req.json()
    if (body?.preview === true) preview = true
  } catch { /* no body is fine */ }

  try {
    const now = new Date()

    // Window start = watermark, clamped so a long dormancy can't produce a
    // monster report; default 7 days for the very first run.
    let since = new Date(now.getTime() - 7 * 86400000)
    const stored = await getSetting(WATERMARK_KEY).catch(() => null)
    if (stored) {
      const parsed = new Date(stored)
      if (!isNaN(parsed.getTime())) {
        const earliest = new Date(now.getTime() - MAX_LOOKBACK_DAYS * 86400000)
        since = parsed < earliest ? earliest : parsed
      }
    }
    if (since >= now) since = new Date(now.getTime() - 7 * 86400000)

    const win = buildWindow(since, now)
    const priorSpanMs = now.getTime() - since.getTime()
    const prior = buildWindow(new Date(since.getTime() - priorSpanMs), since)

    const data = await gatherWeeklyReport(win, prior)
    const html = renderWeeklyReportHtml(data, { preview })

    const subject = `${preview ? '[PREVIEW] ' : ''}Sales Hub Weekly — ${win.label}` +
      ` · ${data.headline.converted} converted, ${data.headline.qualified} qualified`

    const { google } = await import('googleapis')
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN })
    const gmail = google.gmail({ version: 'v1', auth })
    const senderEmail = process.env.EMAIL_SENDER || 'ai@tbwxpress.com'

    const raw = [
      `From: TBWX Sales Hub <${senderEmail}>`,
      `To: ${DIGEST_TO}`,
      ...(DIGEST_CC ? [`Cc: ${DIGEST_CC}`] : []),
      `Subject: ${encodeSubject(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      html,
    ].join('\r\n')

    const encoded = Buffer.from(raw, 'utf-8')
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const emailResult = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    })

    // Only a DELIVERED live report moves the watermark.
    if (!preview && emailResult.data.id) {
      await setSetting(WATERMARK_KEY, win.untilIso).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      preview,
      email_sent: !!emailResult.data.id,
      window: { since: win.sinceIso, until: win.untilIso, label: win.label, days: win.days },
      summary: {
        converted: data.headline.converted,
        qualified: data.headline.qualified,
        new_leads: data.headline.new_leads,
        ignored_conversations: data.engagement.reduce((a, e) => a + e.ignored, 0),
        insights: data.insights.length,
      },
    })
  } catch (err) {
    console.error('[weekly-report] Error:', err)
    return NextResponse.json({ success: false, error: apiError(err, 'Weekly report failed') }, { status: 500 })
  }
}

export async function GET() {
  const last = await getSetting(WATERMARK_KEY).catch(() => null)
  return NextResponse.json({
    name: 'weekly-report',
    description: 'Detailed owner report, emailed Saturday 19:00 IST; covers everything since the last delivered report',
    digest_to: DIGEST_TO,
    digest_cc: DIGEST_CC || null,
    last_covered_until: last,
    preview_hint: 'POST with ?preview=1 to send a labelled sample without moving the watermark',
  })
}
