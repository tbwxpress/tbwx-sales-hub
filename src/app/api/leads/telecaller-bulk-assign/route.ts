import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import { assignTelecaller, unassignTelecaller } from '@/lib/telecaller'
import { getUsers } from '@/lib/users'
import { getLeadByRow } from '@/lib/sheets'

// POST /api/leads/telecaller-bulk-assign
// Body: { lead_rows: number[], telecaller_user_id: string | null, notes?: string }
// Pass telecaller_user_id = null to unassign in bulk.
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const { lead_rows, telecaller_user_id, notes } = await req.json()
    if (!Array.isArray(lead_rows) || lead_rows.length === 0) {
      return NextResponse.json({ success: false, error: 'lead_rows must be a non-empty array' }, { status: 400 })
    }
    const rows = lead_rows.map(Number).filter(Number.isFinite)
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid lead_rows' }, { status: 400 })
    }

    // Validate telecaller (when assigning)
    let telecallerName = ''
    if (telecaller_user_id) {
      const users = await getUsers()
      const tc = users.find(u => u.id === telecaller_user_id)
      if (!tc) return NextResponse.json({ success: false, error: 'Telecaller user not found' }, { status: 404 })
      if (!tc.is_telecaller) return NextResponse.json({ success: false, error: 'User is not a telecaller' }, { status: 400 })
      telecallerName = tc.name
    }

    // Authorization: admin/can_assign can bulk-assign anything; other agents can only bulk-assign their own leads
    const adminOrAssigner = user.role === 'admin' || user.can_assign
    let processed = 0
    let skipped = 0
    const skippedRows: number[] = []

    for (const row of rows) {
      if (!adminOrAssigner) {
        const lead = await getLeadByRow(row)
        if (!lead || lead.assigned_to !== user.name) {
          skipped++
          skippedRows.push(row)
          continue
        }
      }
      if (telecaller_user_id) {
        await assignTelecaller(row, telecaller_user_id, user.id, notes || null)
      } else {
        await unassignTelecaller(row)
      }
      processed++
    }

    return NextResponse.json({
      success: true,
      data: {
        processed,
        skipped,
        skipped_rows: skippedRows,
        action: telecaller_user_id ? `assigned to ${telecallerName}` : 'unassigned',
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
