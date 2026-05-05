import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import { assignTelecaller, unassignTelecaller, getAssignmentForLead } from '@/lib/telecaller'
import { getUsers } from '@/lib/users'
import { getLeadByRow } from '@/lib/sheets'

// POST /api/leads/[id]/telecaller — assign a telecaller to a lead
// Allowed: lead owner agent, admin, can_assign user
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const { id } = await ctx.params
    const leadRow = parseInt(id, 10)
    if (!Number.isFinite(leadRow)) {
      return NextResponse.json({ success: false, error: 'Invalid lead id' }, { status: 400 })
    }

    const { telecaller_user_id, notes } = await req.json()
    if (!telecaller_user_id) {
      return NextResponse.json({ success: false, error: 'telecaller_user_id required' }, { status: 400 })
    }

    // Validate telecaller user exists and has the flag
    const users = await getUsers()
    const tc = users.find(u => u.id === telecaller_user_id)
    if (!tc) {
      return NextResponse.json({ success: false, error: 'Telecaller user not found' }, { status: 404 })
    }
    if (!tc.is_telecaller) {
      return NextResponse.json({ success: false, error: 'User is not a telecaller' }, { status: 400 })
    }

    // Authorization: admin OR can_assign OR the lead's owner
    if (user.role !== 'admin' && !user.can_assign) {
      const lead = await getLeadByRow(leadRow)
      if (!lead || lead.assigned_to !== user.name) {
        return NextResponse.json({ success: false, error: 'Only the lead owner, admins, or can-assign users may assign a telecaller' }, { status: 403 })
      }
    }

    await assignTelecaller(leadRow, telecaller_user_id, user.id, notes || null)

    // Notify the telecaller that they have a new lead in their queue
    try {
      const { notifyQuiet } = await import('@/lib/notifications')
      const lead = await getLeadByRow(leadRow)
      await notifyQuiet({
        user_id: telecaller_user_id,
        type: 'lead_assigned',
        title: `New telecalling assignment${lead?.full_name ? `: ${lead.full_name}` : ''}`,
        body: `Owner: ${lead?.assigned_to || 'unassigned'} · Status: ${lead?.lead_status || ''}${notes ? ` · ${notes}` : ''}`,
        ref_phone: lead?.phone || null,
        ref_lead_row: leadRow,
      })
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// DELETE /api/leads/[id]/telecaller — unassign telecaller from lead
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const { id } = await ctx.params
    const leadRow = parseInt(id, 10)
    if (!Number.isFinite(leadRow)) {
      return NextResponse.json({ success: false, error: 'Invalid lead id' }, { status: 400 })
    }

    if (user.role !== 'admin' && !user.can_assign) {
      const lead = await getLeadByRow(leadRow)
      if (!lead || lead.assigned_to !== user.name) {
        return NextResponse.json({ success: false, error: 'Only the lead owner, admins, or can-assign users may unassign' }, { status: 403 })
      }
    }

    await unassignTelecaller(leadRow)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// GET /api/leads/[id]/telecaller — fetch current assignment for a lead
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requireAuth(session)

    const { id } = await ctx.params
    const leadRow = parseInt(id, 10)
    if (!Number.isFinite(leadRow)) {
      return NextResponse.json({ success: false, error: 'Invalid lead id' }, { status: 400 })
    }

    const a = await getAssignmentForLead(leadRow)
    if (!a) return NextResponse.json({ success: true, data: null })

    const users = await getUsers()
    const tc = users.find(u => u.id === a.telecaller_user_id)
    return NextResponse.json({
      success: true,
      data: {
        ...a,
        telecaller_name: tc?.name || 'Unknown',
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
