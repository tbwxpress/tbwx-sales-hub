import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getLeads } from '@/lib/sheets'
import { getUsers } from '@/lib/users'
import { LEAD_STATUSES } from '@/config/client'

const CRON_SECRET = process.env.CRON_SECRET
const DIGEST_TO = process.env.DIGEST_EMAIL_TO || 'tbwxpress@gmail.com'
const DIGEST_CC = process.env.DIGEST_EMAIL_CC || 'sales@tbwxpress.com'

/**
 * POST /api/cron/weekly-report
 *
 * Runs Monday 9:30 AM IST. Sends weekly funnel + leaderboard via email.
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
    const [leads, users] = await Promise.all([getLeads(), getUsers()])

    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    const weekAgoStr = weekAgo.toISOString().split('T')[0]

    // Funnel
    const funnel = LEAD_STATUSES.map(status => ({
      stage: status,
      count: leads.filter(l => l.lead_status === status).length,
    }))

    const funnelText = funnel
      .map(f => `  ${f.stage.padEnd(12)} ${String(f.count).padStart(4)}`)
      .join('\n')

    // Agent leaderboard
    const activeAgents = users.filter(u => u.active)
    const leaderboard = activeAgents.map(agent => {
      const agentLeads = leads.filter(l => l.assigned_to === agent.name)
      const converted = agentLeads.filter(l => l.lead_status === 'CONVERTED').length
      const rate = agentLeads.length > 0 ? Math.round((converted / agentLeads.length) * 100) : 0
      return { name: agent.name, assigned: agentLeads.length, converted, rate }
    }).sort((a, b) => b.converted - a.converted)

    const leaderboardText = leaderboard
      .map((a, i) => `  ${i + 1}. ${a.name.padEnd(12)} ${a.converted} converted (${a.rate}%) — ${a.assigned} assigned`)
      .join('\n')

    // New + conversions this week
    const newThisWeek = leads.filter(l => l.created_time && l.created_time >= weekAgoStr).length
    const totalConverted = leads.filter(l => l.lead_status === 'CONVERTED').length
    const overallRate = leads.length > 0 ? Math.round((totalConverted / leads.length) * 100) : 0

    const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })

    // Send email
    const { google } = await import('googleapis')
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN })
    const gmail = google.gmail({ version: 'v1', auth })

    const senderEmail = process.env.EMAIL_SENDER || 'ai@tbwxpress.com'
    const subject = `TBWX Weekly Report — ${dateStr}`

    const body = `TBWX Weekly Sales Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Week ending: ${dateStr}

NEW leads this week: ${newThisWeek}
Total leads: ${leads.length}
Total converted: ${totalConverted} (${overallRate}%)

PIPELINE FUNNEL
${funnelText}

AGENT LEADERBOARD
${leaderboardText}

View full analytics: https://sales.tbwxpress.com/analytics

— TBWX Sales Hub
`

    const headers = [
      `From: TBWX Sales Hub <${senderEmail}>`,
      `To: ${DIGEST_TO}`,
      ...(DIGEST_CC ? [`Cc: ${DIGEST_CC}`] : []),
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      body,
    ].join('\r\n')

    const encoded = Buffer.from(headers).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const emailResult = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    })

    return NextResponse.json({
      success: true,
      email_sent: !!emailResult.data.id,
      stats: { newThisWeek, totalConverted, overallRate, agents: leaderboard.length },
    })
  } catch (err) {
    console.error('[weekly-report] Error:', err)
    return NextResponse.json({ success: false, error: apiError(err, 'Weekly report failed') }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'weekly-report',
    description: 'Weekly funnel + leaderboard sent Monday 9:30 AM IST',
    digest_to: DIGEST_TO,
    digest_cc: DIGEST_CC,
  })
}
