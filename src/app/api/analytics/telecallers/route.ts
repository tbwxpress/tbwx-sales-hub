import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import { getUsers } from '@/lib/users'
import { getAllAssignments, getAutoQueueConfig } from '@/lib/telecaller'
import { getLeads } from '@/lib/sheets'

interface TelecallerStat {
  user_id: string
  name: string
  email: string
  active: boolean
  // Manual + auto-queue counts
  manual_assigned: number
  auto_queue_eligible: number
  total_queue: number
  // Outcome breakdown across queue
  by_status: Record<string, number>
  // Activity metrics — calls logged + notes added (matched by user name)
  calls_logged_7d: number
  notes_added_7d: number
}

export async function GET() {
  try {
    const session = await getSession()
    requireAuth(session)

    const [users, assignments, autoQueue, leads] = await Promise.all([
      getUsers(),
      getAllAssignments(),
      getAutoQueueConfig(),
      getLeads(),
    ])

    const telecallers = users.filter(u => u.is_telecaller)
    const leadsByRow = new Map(leads.map(l => [l.row_number, l]))

    // Build per-telecaller stats
    const stats: TelecallerStat[] = []

    // For each telecaller, find their queue
    for (const tc of telecallers) {
      const manualRows = assignments.filter(a => a.telecaller_user_id === tc.id).map(a => a.lead_row)
      const queueRows = new Set<number>(manualRows)

      // Auto-queue contributions
      let autoEligibleCount = 0
      if (autoQueue.enabled && autoQueue.user_id === tc.id && autoQueue.statuses.length > 0) {
        const statusSet = new Set(autoQueue.statuses)
        for (const lead of leads) {
          if (statusSet.has(lead.lead_status) && !queueRows.has(lead.row_number)) {
            queueRows.add(lead.row_number)
            autoEligibleCount++
          }
        }
      }

      // Status breakdown
      const byStatus: Record<string, number> = {}
      for (const row of queueRows) {
        const lead = leadsByRow.get(row)
        if (!lead) continue
        byStatus[lead.lead_status] = (byStatus[lead.lead_status] || 0) + 1
      }

      stats.push({
        user_id: tc.id,
        name: tc.name,
        email: tc.email,
        active: tc.active,
        manual_assigned: manualRows.length,
        auto_queue_eligible: autoEligibleCount,
        total_queue: queueRows.size,
        by_status: byStatus,
        // Filled in below
        calls_logged_7d: 0,
        notes_added_7d: 0,
      })
    }

    // Activity metrics (calls + notes in last 7 days, matched by user name)
    if (telecallers.length > 0) {
      const { createClient } = await import('@libsql/client')
      const dbUrl = process.env.TURSO_DATABASE_URL || 'file:data/inbox.db'
      const authToken = process.env.TURSO_AUTH_TOKEN || undefined
      const db = createClient({ url: dbUrl, authToken })
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const callsRes = await db.execute({
        sql: "SELECT logged_by, COUNT(*) as n FROM call_logs WHERE created_at >= ? AND logged_by != '' GROUP BY logged_by",
        args: [sevenDaysAgo],
      })
      const notesRes = await db.execute({
        sql: "SELECT created_by, COUNT(*) as n FROM lead_notes WHERE created_at >= ? AND created_by != '' GROUP BY created_by",
        args: [sevenDaysAgo],
      })

      const callsByName = new Map<string, number>()
      for (const r of callsRes.rows) callsByName.set(String(r.logged_by), Number(r.n))
      const notesByName = new Map<string, number>()
      for (const r of notesRes.rows) notesByName.set(String(r.created_by), Number(r.n))

      for (const stat of stats) {
        stat.calls_logged_7d = callsByName.get(stat.name) || 0
        stat.notes_added_7d = notesByName.get(stat.name) || 0
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        telecallers: stats,
        auto_queue: autoQueue,
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
