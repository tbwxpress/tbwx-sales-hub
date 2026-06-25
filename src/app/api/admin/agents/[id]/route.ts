import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getUserById, updateUser } from '@/lib/users'
import type { WorkMode, AgentRole, GuidedSurface } from '@/lib/types'

// PATCH /api/admin/agents/:id (ADMIN)
// Set { work_mode?, agent_role?, daily_target? } for a user. The two Guided
// dials + daily target the owner controls. Additive — never touches other
// user fields.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    }

    const { id } = await params
    const target = await getUserById(id)
    if (!target) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }
    if (target.role !== 'agent') {
      return NextResponse.json({ success: false, error: 'Only agents can be put on the guided rail' }, { status: 400 })
    }

    const body = await req.json()
    const updates: { work_mode?: WorkMode; guided_surface?: GuidedSurface; agent_role?: AgentRole; daily_target?: number; receives_new_leads?: boolean } = {}

    if (body?.work_mode !== undefined) {
      if (body.work_mode !== 'guided' && body.work_mode !== 'free') {
        return NextResponse.json({ success: false, error: "work_mode must be 'guided' or 'free'" }, { status: 400 })
      }
      updates.work_mode = body.work_mode
    }
    if (body?.guided_surface !== undefined) {
      if (body.guided_surface !== 'guided_free' && body.guided_surface !== 'guided_inbox') {
        return NextResponse.json({ success: false, error: "guided_surface must be 'guided_free' or 'guided_inbox'" }, { status: 400 })
      }
      updates.guided_surface = body.guided_surface
    }
    if (body?.agent_role !== undefined) {
      if (body.agent_role !== 'telecaller' && body.agent_role !== 'closer') {
        return NextResponse.json({ success: false, error: "agent_role must be 'telecaller' or 'closer'" }, { status: 400 })
      }
      updates.agent_role = body.agent_role
    }
    if (body?.daily_target !== undefined) {
      const n = Number(body.daily_target)
      if (!Number.isFinite(n) || n < 0 || n > 1000) {
        return NextResponse.json({ success: false, error: 'daily_target must be a number between 0 and 1000' }, { status: 400 })
      }
      updates.daily_target = Math.round(n)
    }
    if (body?.receives_new_leads !== undefined) {
      if (typeof body.receives_new_leads !== 'boolean') {
        return NextResponse.json({ success: false, error: 'receives_new_leads must be a boolean' }, { status: 400 })
      }
      updates.receives_new_leads = body.receives_new_leads
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    }

    await updateUser(id, updates)
    const fresh = await getUserById(id)
    return NextResponse.json({
      success: true,
      data: fresh
        ? { id: fresh.id, work_mode: fresh.work_mode, guided_surface: fresh.guided_surface, agent_role: fresh.agent_role, daily_target: fresh.daily_target, receives_new_leads: fresh.receives_new_leads }
        : null,
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to update agent') }, { status: 500 })
  }
}
