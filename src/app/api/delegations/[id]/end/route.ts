import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getDelegationById, endDelegation, insertLeadEdit } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { id } = await params
    const delegId = parseInt(id)
    if (isNaN(delegId)) {
      return NextResponse.json({ success: false, error: 'Invalid delegation id' }, { status: 400 })
    }

    const delegation = await getDelegationById(delegId)
    if (!delegation) {
      return NextResponse.json({ success: false, error: 'Delegation not found' }, { status: 404 })
    }
    if (delegation.status === 'ended') {
      return NextResponse.json({ success: false, error: 'Delegation already ended' }, { status: 409 })
    }

    // from_agent, to_agent, or admin can end
    const isParty =
      user.id === delegation.from_agent_id || user.id === delegation.to_agent_id
    if (user.role !== 'admin' && !isParty) {
      return NextResponse.json({ success: false, error: 'Not authorized to end this delegation' }, { status: 403 })
    }

    await endDelegation(delegId, user.id)

    await insertLeadEdit({
      lead_row: delegation.lead_row,
      phone: delegation.phone,
      field_name: 'delegation',
      old_value: delegation.status,
      new_value: 'ended',
      changed_by: user.name,
      changed_by_id: user.id,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to end delegation') }, { status: 500 })
  }
}
