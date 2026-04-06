import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads } from '@/lib/sheets'
import { findCity } from '@/config/india-cities'

/**
 * GET /api/analytics/regions
 *
 * Aggregates leads by city and computes:
 * - Lead count per city (with lat/lng for heatmap)
 * - State-level rollup
 * - Per-agent performance per city (conversion rate)
 * - Top cities by volume and conversion
 */
export async function GET() {
  try {
    const session = await getSession()
    requireAuth(session)

    const leads = await getLeads()

    // 1. Aggregate by city
    const cityMap = new Map<string, {
      name: string
      state: string
      lat: number
      lng: number
      total: number
      converted: number
      interested: number
      lost: number
      agents: Map<string, { total: number; converted: number; interested: number }>
    }>()

    const stateMap = new Map<string, { total: number; converted: number; interested: number }>()
    const unmatchedCities = new Map<string, number>()

    for (const lead of leads) {
      if (!lead.city) continue
      const coord = findCity(lead.city)

      if (!coord) {
        unmatchedCities.set(lead.city, (unmatchedCities.get(lead.city) || 0) + 1)
        continue
      }

      const key = coord.name
      if (!cityMap.has(key)) {
        cityMap.set(key, {
          name: coord.name,
          state: coord.state,
          lat: coord.lat,
          lng: coord.lng,
          total: 0,
          converted: 0,
          interested: 0,
          lost: 0,
          agents: new Map(),
        })
      }
      const c = cityMap.get(key)!
      c.total++
      if (lead.lead_status === 'CONVERTED') c.converted++
      if (lead.lead_status === 'HOT' || lead.lead_status === 'FINAL_NEGOTIATION') c.interested++
      if (lead.lead_status === 'LOST') c.lost++

      // Agent tracking
      if (lead.assigned_to) {
        if (!c.agents.has(lead.assigned_to)) {
          c.agents.set(lead.assigned_to, { total: 0, converted: 0, interested: 0 })
        }
        const a = c.agents.get(lead.assigned_to)!
        a.total++
        if (lead.lead_status === 'CONVERTED') a.converted++
        if (lead.lead_status === 'HOT' || lead.lead_status === 'FINAL_NEGOTIATION') a.interested++
      }

      // State rollup
      if (!stateMap.has(coord.state)) {
        stateMap.set(coord.state, { total: 0, converted: 0, interested: 0 })
      }
      const s = stateMap.get(coord.state)!
      s.total++
      if (lead.lead_status === 'CONVERTED') s.converted++
      if (lead.lead_status === 'HOT' || lead.lead_status === 'FINAL_NEGOTIATION') s.interested++
    }

    // Convert to arrays
    const cities = Array.from(cityMap.values()).map(c => ({
      name: c.name,
      state: c.state,
      lat: c.lat,
      lng: c.lng,
      total: c.total,
      converted: c.converted,
      interested: c.interested,
      lost: c.lost,
      conversionRate: c.total > 0 ? Math.round((c.converted / c.total) * 100) : 0,
      agents: Array.from(c.agents.entries())
        .map(([name, stats]) => ({
          name,
          total: stats.total,
          converted: stats.converted,
          interested: stats.interested,
          conversionRate: stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total),
    })).sort((a, b) => b.total - a.total)

    const states = Array.from(stateMap.entries())
      .map(([name, stats]) => ({
        name,
        total: stats.total,
        converted: stats.converted,
        interested: stats.interested,
        conversionRate: stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)

    const unmatched = Array.from(unmatchedCities.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)

    return NextResponse.json({
      success: true,
      data: {
        cities,
        states,
        unmatched,
        totalLeads: leads.length,
        totalMatched: leads.length - Array.from(unmatchedCities.values()).reduce((a, b) => a + b, 0),
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Regions analytics failed') }, { status: 500 })
  }
}
