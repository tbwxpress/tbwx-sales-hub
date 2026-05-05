import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth, requireAdmin, hashPassword } from '@/lib/auth'
import { getUsers, createUser, updateUser } from '@/lib/users'

export async function GET() {
  try {
    const session = await getSession()
    requireAuth(session)

    const users = await getUsers()
    // Strip password hashes
    const safeUsers = users.map(({ password_hash, ...rest }) => rest)
    return NextResponse.json({ success: true, data: safeUsers })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const { name, email, password, role, can_assign, in_lead_pool, is_closer, is_telecaller } = await req.json()
    if (!name || !email || !password) {
      return NextResponse.json({ success: false, error: 'Name, email, and password required' }, { status: 400 })
    }

    const hashed = await hashPassword(password)
    const id = await createUser({
      name,
      email,
      password_hash: hashed,
      role: role || 'agent',
      can_assign: can_assign || false,
      active: true,
      in_lead_pool: in_lead_pool || false,
      is_closer: is_closer || false,
      is_telecaller: is_telecaller || false,
    })

    return NextResponse.json({ success: true, data: { id } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const { user_id, can_assign, active, role, in_lead_pool, is_closer, is_telecaller } = await req.json()
    if (!user_id) {
      return NextResponse.json({ success: false, error: 'User ID required' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (can_assign !== undefined) updates.can_assign = can_assign
    if (active !== undefined) updates.active = active
    if (role !== undefined) updates.role = role
    if (in_lead_pool !== undefined) updates.in_lead_pool = in_lead_pool
    if (is_closer !== undefined) updates.is_closer = is_closer
    if (is_telecaller !== undefined) updates.is_telecaller = is_telecaller

    await updateUser(user_id, updates)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
