import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads } from '@/lib/sheets'
import { getSlaAverages } from '@/lib/db'
import { computeLeadScore } from '@/lib/scoring'
import { LEAD_STATUSES } from '@/config/client'

/**
 * GET /api/analytics — Funnel, sources, response time, score distribution
 */
export async function GET() {
  try {
    const session = await getSession()
    requireAuth(session)

    const leads = await getLeads()
    const slaAvg = await getSlaAverages()

    // 1. Funnel: count at each stage in pipeline order
    const statusOrder = [...LEAD_STATUSES]
    const funnel = statusOrder.map(status => {
      const count = leads.filter(l => l.lead_status === status).length
      return { stage: status, count }
    })

    // Calculate drop-off percentages
    const funnelWithDropoff = funnel.map((item, i) => {
      const prev = i === 0 ? leads.length : funnel[i - 1].count
      const dropoff = prev > 0 ? Math.round((1 - item.count / prev) * 100) : 0
      const pct = leads.length > 0 ? Math.round((item.count / leads.length) * 100) : 0
      return { ...item, pct, dropoff }
    })

    // 2. Sources: group by platform/campaign
    const sourceMap = new Map<string, number>()
    for (const lead of leads) {
      const platform = lead.platform || ''
      const campaign = lead.campaign_name || ''
      let source = 'Unknown'
      if (platform.toLowerCase().includes('fb') || platform.toLowerCase().includes('facebook') || platform.toLowerCase().includes('ig') || platform.toLowerCase().includes('instagram')) {
        source = 'Meta Ads'
      } else if (campaign.toLowerCase().includes('google')) {
        source = 'Google Ads'
      } else if (campaign && campaign !== '') {
        source = campaign.length > 25 ? campaign.slice(0, 25) + '...' : campaign
      } else if (platform && platform !== '') {
        source = platform
      } else {
        source = 'Organic / Direct'
      }
      sourceMap.set(source, (sourceMap.get(source) || 0) + 1)
    }
    const sources = Array.from(sourceMap.entries())
      .map(([source, count]) => ({
        source,
        count,
        pct: leads.length > 0 ? Math.round((count / leads.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8) // Top 8 sources

    // 3. Score distribution: bucket into ranges
    const scores = leads.map(l => computeLeadScore(l))
    const scoreRanges = [
      { range: '0-20', min: 0, max: 20 },
      { range: '21-40', min: 21, max: 40 },
      { range: '41-60', min: 41, max: 60 },
      { range: '61-80', min: 61, max: 80 },
      { range: '81-100', min: 81, max: 100 },
    ]
    const scoreDistribution = scoreRanges.map(r => ({
      range: r.range,
      count: scores.filter(s => s >= r.min && s <= r.max).length,
    }))

    // 4. Pipeline summary
    const totalLeads = leads.length
    const activeLeads = leads.filter(l => !['CONVERTED', 'LOST'].includes(l.lead_status)).length
    const converted = leads.filter(l => l.lead_status === 'CONVERTED').length
    const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0

    // 5. Priority breakdown
    const priorities = {
      HOT: leads.filter(l => l.lead_priority === 'HOT').length,
      WARM: leads.filter(l => l.lead_priority === 'WARM').length,
      COLD: leads.filter(l => l.lead_priority === 'COLD').length,
      NONE: leads.filter(l => !l.lead_priority).length,
    }

    return NextResponse.json({
      success: true,
      data: {
        summary: { totalLeads, activeLeads, converted, conversionRate },
        funnel: funnelWithDropoff,
        sources,
        scoreDistribution,
        priorities,
        sla: slaAvg,
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Analytics failed') }, { status: 500 })
  }
}
