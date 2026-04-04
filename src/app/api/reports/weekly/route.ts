import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads } from '@/lib/sheets'
import { getSlaAverages } from '@/lib/db'
import { getUsers } from '@/lib/users'
import { LEAD_STATUSES } from '@/config/client'

/**
 * GET /api/reports/weekly — Weekly funnel + agent leaderboard
 */
export async function GET() {
  try {
    const session = await getSession()
    requireAuth(session)

    const [leads, users, sla] = await Promise.all([
      getLeads(),
      getUsers(),
      getSlaAverages(),
    ])

    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    const weekAgoStr = weekAgo.toISOString().split('T')[0]

    // Leads created this week
    const newThisWeek = leads.filter(l => l.created_time && l.created_time >= weekAgoStr)

    // Full funnel (all leads)
    const funnel = LEAD_STATUSES.map(status => {
      const count = leads.filter(l => l.lead_status === status).length
      return { stage: status, count }
    })

    // Stage-to-stage conversion rates
    const funnelWithConversion = funnel.map((item, i) => {
      const prev = i === 0 ? leads.length : funnel[i - 1].count
      const conversion = prev > 0 ? Math.round((item.count / prev) * 100) : 0
      return { ...item, conversion }
    })

    // Biggest drop-off point
    let worstDropoff = { stage: '', dropPct: 0 }
    for (let i = 1; i < funnel.length; i++) {
      if (funnel[i - 1].count === 0) continue
      const drop = Math.round((1 - funnel[i].count / funnel[i - 1].count) * 100)
      if (drop > worstDropoff.dropPct) {
        worstDropoff = { stage: `${funnel[i - 1].stage} → ${funnel[i].stage}`, dropPct: drop }
      }
    }

    // Agent leaderboard
    const activeAgents = users.filter(u => u.active)
    const leaderboard = activeAgents.map(agent => {
      const agentLeads = leads.filter(l => l.assigned_to === agent.name)
      const converted = agentLeads.filter(l => l.lead_status === 'CONVERTED').length
      const contacted = agentLeads.filter(l => !['NEW'].includes(l.lead_status)).length
      const conversionRate = agentLeads.length > 0 ? Math.round((converted / agentLeads.length) * 100) : 0
      return {
        name: agent.name,
        assigned: agentLeads.length,
        contacted,
        converted,
        conversionRate,
      }
    }).sort((a, b) => b.converted - a.converted || b.conversionRate - a.conversionRate)

    // Conversions this week
    const conversionsThisWeek = leads.filter(l =>
      l.lead_status === 'CONVERTED' && l.created_time && l.created_time >= weekAgoStr
    ).length

    const totalConverted = leads.filter(l => l.lead_status === 'CONVERTED').length
    const overallConversionRate = leads.length > 0 ? Math.round((totalConverted / leads.length) * 100) : 0

    return NextResponse.json({
      success: true,
      data: {
        period: { from: weekAgoStr, to: now.toISOString().split('T')[0] },
        newLeadsThisWeek: newThisWeek.length,
        conversionsThisWeek,
        totalLeads: leads.length,
        totalConverted,
        overallConversionRate,
        funnel: funnelWithConversion,
        worstDropoff,
        leaderboard,
        sla,
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Weekly report failed') }, { status: 500 })
  }
}
