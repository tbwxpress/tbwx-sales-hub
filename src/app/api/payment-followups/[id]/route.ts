import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import {
  getPaymentFollowup,
  updatePaymentFollowup,
  deletePaymentFollowup,
  insertLeadEdit,
} from '@/lib/db'
import { getUserById } from '@/lib/users'

// PATCH /api/payment-followups/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    // Owner-private: payment followups are admin-only at every layer.
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }
    const { id } = await params
    const followupId = parseInt(id)
    if (isNaN(followupId)) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
    }

    const existing = await getPaymentFollowup(followupId)
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    const body = await req.json()
    const updates: Record<string, unknown> = {}

    // Admin can update any field
    const allowedAdminFields = [
      'franchise_name', 'amount', 'currency', 'due_date',
      'assigned_to_id', 'status', 'reason', 'cleared_amount', 'notes',
      'cleared_at', 'cleared_by_id',
    ]
    for (const field of allowedAdminFields) {
      if (field in body) updates[field] = body[field]
    }

    // If reassigning, resolve new agent name
    if (updates.assigned_to_id && updates.assigned_to_id !== existing.assigned_to_id) {
      const agent = await getUserById(updates.assigned_to_id as string)
      if (!agent || !agent.active) {
        return NextResponse.json({ success: false, error: 'Assigned agent not found or inactive' }, { status: 400 })
      }
      updates.assigned_to_name = agent.name
    }

    // Auto-set cleared_at and cleared_by_id when status moves to cleared
    if (updates.status === 'cleared' && existing.status !== 'cleared') {
      updates.cleared_at = new Date().toISOString().slice(0, 19)
      updates.cleared_by_id = user.id
    }

    const updated = await updatePaymentFollowup(
      followupId,
      updates as Parameters<typeof updatePaymentFollowup>[1],
      { id: user.id, name: user.name },
    )

    // If linked to a lead and status changed, audit-log
    if (existing.lead_row && updates.status && updates.status !== existing.status) {
      await insertLeadEdit({
        lead_row: existing.lead_row,
        phone: existing.phone,
        field_name: 'payment_followup_status',
        old_value: existing.status,
        new_value: updates.status as string,
        changed_by: user.name,
        changed_by_id: user.id,
      })
    }

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to update followup') }, { status: 500 })
  }
}

// DELETE /api/payment-followups/[id] — admin only
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    // Owner-private: payment followups are admin-only at every layer.
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }

    const { id } = await params
    const followupId = parseInt(id)
    if (isNaN(followupId)) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
    }

    const existing = await getPaymentFollowup(followupId)
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    await deletePaymentFollowup(followupId)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to delete followup') }, { status: 500 })
  }
}
