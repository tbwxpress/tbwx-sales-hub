import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getPendingForLeadAndAgent } from '@/lib/update-requests'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ row: string }> }
) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { row } = await params
    const leadRow = Number(row)
    if (!Number.isFinite(leadRow)) {
      return NextResponse.json({ success: false, error: 'Invalid row' }, { status: 400 })
    }

    const r = await getPendingForLeadAndAgent(leadRow, user.id)
    return NextResponse.json({ success: true, data: r })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed') },
      { status: 500 }
    )
  }
}
