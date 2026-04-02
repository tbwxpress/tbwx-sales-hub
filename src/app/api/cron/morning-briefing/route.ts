import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getLeads } from '@/lib/sheets'
import { sendDigestEmail, type DigestData } from '@/lib/email'
import { sendTemplate } from '@/lib/whatsapp'

const CRON_SECRET = process.env.CRON_SECRET
const DIGEST_TO = process.env.DIGEST_EMAIL_TO || 'tbwxpress@gmail.com'
const DIGEST_CC = process.env.DIGEST_EMAIL_CC || 'sales@tbwxpress.com'
const GAVISH_PHONE = process.env.DIGEST_WA_PHONE || '917973933630'
const BRIEFING_TEMPLATE = 'daily_briefing'

/**
 * POST /api/cron/morning-briefing
 *
 * Daily briefing sent at 9 AM IST via WhatsApp + email.
 * Computes overnight metrics from Google Sheets + SQLite.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = authHeader?.replace('Bearer ', '')

  if (CRON_SECRET && cronSecret !== CRON_SECRET) {
    // Fall back to session auth for manual trigger
    const { getSession, requireAuth } = await import('@/lib/auth')
    const session = await getSession()
    try {
      const user = requireAuth(session)
      if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Admin only' }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const leads = await getLeads()
    const today = new Date().toISOString().split('T')[0]
    const now = new Date()

    // New leads: created_time starts with today's date
    const newLeads = leads.filter(l => l.created_time?.startsWith(today))
    const hotLeads = newLeads.filter(l => l.lead_priority === 'HOT')

    // Overdue follow-ups: next_followup < today, not CONVERTED/LOST
    const CLOSED = ['CONVERTED', 'LOST']
    const overdue = leads.filter(l =>
      l.next_followup &&
      l.next_followup < today &&
      !CLOSED.includes(l.lead_status)
    )

    // Break overdue by agent
    const overdueMap = new Map<string, number>()
    for (const l of overdue) {
      const agent = l.assigned_to || 'Unassigned'
      overdueMap.set(agent, (overdueMap.get(agent) || 0) + 1)
    }
    const overdueByAgent = Array.from(overdueMap.entries())
      .map(([agent, count]) => ({ agent, count }))
      .sort((a, b) => b.count - a.count)

    // REPLIED leads waiting (no outbound after their reply — approximate by status)
    const repliedLeads = leads.filter(l => l.lead_status === 'REPLIED')

    // Find oldest REPLIED lead (by next_followup or created_time)
    let oldestRepliedName: string | undefined
    let oldestRepliedHours: number | undefined
    if (repliedLeads.length > 0) {
      const sorted = repliedLeads.sort((a, b) =>
        (a.next_followup || a.created_time || '').localeCompare(b.next_followup || b.created_time || '')
      )
      const oldest = sorted[0]
      oldestRepliedName = oldest.full_name
      const ref = oldest.next_followup || oldest.created_time
      if (ref) {
        oldestRepliedHours = Math.round((now.getTime() - new Date(ref).getTime()) / 3600000)
      }
    }

    // Pipeline counts
    const interested = leads.filter(l => l.lead_status === 'INTERESTED').length
    const negotiation = leads.filter(l => l.lead_status === 'NEGOTIATION').length

    // Conversions today
    const conversionsToday = leads.filter(l =>
      l.lead_status === 'CONVERTED' && l.created_time?.startsWith(today)
    ).length

    // Call logs today — will be added in Phase 2 with proper DB query
    const callsToday = 0

    // Top priority action
    let topPriorityAction: string | undefined
    if (repliedLeads.length > 0 && oldestRepliedName) {
      const oldest = repliedLeads.find(l => l.full_name === oldestRepliedName)
      topPriorityAction = `${oldestRepliedName} (${oldest?.city || 'Unknown'}) replied${oldestRepliedHours ? ` ${oldestRepliedHours}h ago` : ''} — no one has responded.`
    } else if (overdue.length > 0) {
      topPriorityAction = `${overdue.length} overdue follow-ups need attention.`
    }

    const digestData: DigestData = {
      date: new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
      newLeads: newLeads.length,
      hotLeads: hotLeads.length,
      overdueTotal: overdue.length,
      overdueByAgent,
      repliedWaiting: repliedLeads.length,
      oldestRepliedName,
      oldestRepliedHours,
      pipelineInterested: interested,
      pipelineNegotiation: negotiation,
      callsLogged: callsToday,
      conversionsToday,
      topPriorityAction,
    }

    // 1. Send email digest
    const emailResult = await sendDigestEmail(DIGEST_TO, DIGEST_CC, digestData)

    // 2. Send WhatsApp briefing (if template is approved)
    let waResult: { success: boolean; error?: string } = { success: false, error: 'Template not sent' }
    try {
      // Template params: new_leads, overdue, replied_waiting, pipeline_summary, top_priority
      const pipelineSummary = `${interested} Interested, ${negotiation} Negotiation`
      waResult = await sendTemplate(GAVISH_PHONE, BRIEFING_TEMPLATE, [
        { type: 'text', text: `${newLeads.length}${hotLeads.length > 0 ? ` (${hotLeads.length} HOT)` : ''}` },
        { type: 'text', text: String(overdue.length) },
        { type: 'text', text: String(repliedLeads.length) },
        { type: 'text', text: pipelineSummary },
        { type: 'text', text: topPriorityAction || 'All clear — pipeline is healthy.' },
      ])
    } catch {
      // WhatsApp template may not be approved yet — email is the fallback
    }

    return NextResponse.json({
      success: true,
      data: digestData,
      email: { success: emailResult.success, error: emailResult.error },
      whatsapp: { success: waResult.success, error: waResult.error },
    })
  } catch (err) {
    console.error('[morning-briefing] Error:', err)
    return NextResponse.json(
      { success: false, error: apiError(err, 'Morning briefing failed') },
      { status: 500 }
    )
  }
}

// GET — info endpoint
export async function GET() {
  return NextResponse.json({
    name: 'morning-briefing',
    description: 'Daily WhatsApp + email briefing at 9 AM IST',
    digest_to: DIGEST_TO,
    digest_cc: DIGEST_CC,
    wa_phone: GAVISH_PHONE,
    template: BRIEFING_TEMPLATE,
  })
}
