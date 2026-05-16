import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getRecentLeadEdits, getStatusChangesForAllLeads, getAssignmentHistoryRecent } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const days = Math.min(parseInt(searchParams.get('days') || '7'), 90)
    const agent_id = searchParams.get('agent_id') || undefined
    const field = searchParams.get('field') || undefined
    const suspicious = searchParams.get('suspicious') === 'true'

    const edits = await getRecentLeadEdits(days, {
      changed_by_id: agent_id,
      field_name: field,
    })

    const status_changes = await getStatusChangesForAllLeads(days, { changed_by_id: agent_id })
    const assignments = await getAssignmentHistoryRecent(days, { assigned_by_id: agent_id })

    // Suspicious filter: surface edits + status changes that match bad-faith patterns
    if (suspicious) {
      // 1. Priority downgrades (HOT->COLD or HOT->WARM)
      const suspiciousStatusChanges = status_changes.filter(s => {
        const oldStatus = String(s.old_status ?? '')
        const newStatus = String(s.new_status ?? '')
        const oldHot = oldStatus === 'HOT'
        const newCold = newStatus === 'COLD' || newStatus === 'LOST' || newStatus === 'WARM'
        // LOST without prior CALL_DONE_INTERESTED is also suspicious but we approximate:
        // flag LOST where old_status was not a progression status
        const progressionStatuses = new Set(['CALL_DONE_INTERESTED', 'HOT', 'FINAL_NEGOTIATION', 'REPLIED'])
        const lostTooEarly = newStatus === 'LOST' && !progressionStatuses.has(oldStatus)
        return (oldHot && newCold) || lostTooEarly
      })

      // 2. Priority field downgrades via lead_edits
      const suspiciousEdits = edits.filter(e => {
        if (String(e.field_name ?? '') === 'lead_priority') {
          return String(e.old_value ?? '') === 'HOT' && (String(e.new_value ?? '') === 'COLD' || String(e.new_value ?? '') === 'WARM')
        }
        return false
      })

      // 3. Self-reassignments: assigned_to changed by the same agent who is now the owner
      const suspiciousAssignments = assignments.filter(a =>
        a.to_agent && a.assigned_by && String(a.to_agent) === String(a.assigned_by)
      )

      return NextResponse.json({
        success: true,
        data: {
          edits: suspiciousEdits,
          status_changes: suspiciousStatusChanges,
          assignments: suspiciousAssignments,
          suspicious: true,
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: { edits, status_changes, assignments, suspicious: false },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
