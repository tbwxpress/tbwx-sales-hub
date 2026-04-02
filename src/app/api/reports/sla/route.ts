import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads } from '@/lib/sheets'
import { getSlaForAgentPhones, getSlaAverages, normalizePhone } from '@/lib/db'
import { getUsers } from '@/lib/users'

/**
 * GET /api/reports/sla — Per-agent SLA averages
 */
export async function GET() {
  try {
    const session = await getSession()
    requireAuth(session)

    const [leads, users, overallAvg] = await Promise.all([
      getLeads(),
      getUsers(),
      getSlaAverages(),
    ])

    const activeAgents = users.filter(u => u.active)

    // Group lead phones by agent
    const agentData: {
      name: string
      avg_first_response_hours: number
      avg_close_days: number
      leads_tracked: number
    }[] = []

    for (const agent of activeAgents) {
      const agentLeads = leads.filter(l => l.assigned_to === agent.name)
      const phones = agentLeads.map(l => normalizePhone(l.phone)).filter(Boolean)

      if (phones.length === 0) {
        agentData.push({ name: agent.name, avg_first_response_hours: 0, avg_close_days: 0, leads_tracked: 0 })
        continue
      }

      const slaRows = await getSlaForAgentPhones(phones)

      const withResponse = slaRows.filter(r => r.first_response_seconds)
      const withClose = slaRows.filter(r => r.time_to_close_seconds)

      const avgResponse = withResponse.length > 0
        ? Math.round(withResponse.reduce((sum, r) => sum + Number(r.first_response_seconds), 0) / withResponse.length / 3600 * 10) / 10
        : 0

      const avgClose = withClose.length > 0
        ? Math.round(withClose.reduce((sum, r) => sum + Number(r.time_to_close_seconds), 0) / withClose.length / 86400 * 10) / 10
        : 0

      agentData.push({
        name: agent.name,
        avg_first_response_hours: avgResponse,
        avg_close_days: avgClose,
        leads_tracked: slaRows.length,
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        overall: overallAvg,
        agents: agentData,
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'SLA report failed') }, { status: 500 })
  }
}
