import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getAssignmentHistory } from '@/lib/db'

// GET /api/leads/[id]/assignments — get assignment history for a lead
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    requireAuth(session)
    const { id } = await params
    const rowNum = parseInt(id)
    const history = await getAssignmentHistory(rowNum)
    return NextResponse.json({ success: true, data: history })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed') },
      { status: 500 }
    )
  }
}
