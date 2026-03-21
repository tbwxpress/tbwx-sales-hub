import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { bulkUpdateField } from '@/lib/sheets'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    if (user.role !== 'admin' && !user.can_assign) {
      return NextResponse.json({ success: false, error: 'Not authorized to assign leads' }, { status: 403 })
    }

    const { lead_ids, assigned_to } = await req.json()
    if (!lead_ids?.length || !assigned_to) {
      return NextResponse.json({ success: false, error: 'lead_ids and assigned_to required' }, { status: 400 })
    }

    // Single API call to update all rows at once (avoids rate limits)
    await bulkUpdateField(lead_ids, 'assigned_to', assigned_to)

    return NextResponse.json({ success: true, data: { updated: lead_ids.length } })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Assignment failed' }, { status: 500 })
  }
}
