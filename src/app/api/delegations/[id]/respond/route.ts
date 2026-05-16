import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getDelegationById, respondToDelegation, insertLeadEdit } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { id } = await params
    const delegId = parseInt(id)
    if (isNaN(delegId)) {
      return NextResponse.json({ success: false, error: 'Invalid delegation id' }, { status: 400 })
    }

    const body = await req.json()
    const action = body.action as 'accept' | 'decline'
    if (action !== 'accept' && action !== 'decline') {
      return NextResponse.json({ success: false, error: 'action must be accept or decline' }, { status: 400 })
    }

    const delegation = await getDelegationById(delegId)
    if (!delegation) {
      return NextResponse.json({ success: false, error: 'Delegation not found' }, { status: 404 })
    }
    if (delegation.status !== 'pending') {
      return NextResponse.json({ success: false, error: `Delegation is already ${delegation.status}` }, { status: 409 })
    }

    // Only the to_agent or admin can respond
    if (user.role !== 'admin' && user.id !== delegation.to_agent_id) {
      return NextResponse.json({ success: false, error: 'Not authorized to respond to this delegation' }, { status: 403 })
    }

    await respondToDelegation(delegId, action, delegation.to_agent_id)

    await insertLeadEdit({
      lead_row: delegation.lead_row,
      phone: delegation.phone,
      field_name: 'delegation',
      old_value: 'pending',
      new_value: action === 'accept' ? 'accepted' : 'declined',
      changed_by: user.name,
      changed_by_id: user.id,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to respond') }, { status: 500 })
  }
}
