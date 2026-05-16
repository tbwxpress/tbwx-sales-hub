import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getDelegationsForLead } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requireAuth(session)
    const { id } = await params
    const lead_row = parseInt(id)
    if (isNaN(lead_row)) {
      return NextResponse.json({ success: false, error: 'Invalid lead id' }, { status: 400 })
    }
    const delegations = await getDelegationsForLead(lead_row)
    return NextResponse.json({ success: true, data: delegations })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
