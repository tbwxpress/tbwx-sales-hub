import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeadEdits, getStatusChangesForLead, getAssignmentHistory } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requireAuth(session)
    const { id } = await params
    const leadRow = parseInt(id)
    if (isNaN(leadRow)) {
      return NextResponse.json({ success: false, error: 'Invalid lead id' }, { status: 400 })
    }

    const [edits, status_changes, assignments] = await Promise.all([
      getLeadEdits(leadRow, 100),
      getStatusChangesForLead(leadRow),
      getAssignmentHistory(leadRow),
    ])

    return NextResponse.json({ success: true, data: { edits, status_changes, assignments } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
