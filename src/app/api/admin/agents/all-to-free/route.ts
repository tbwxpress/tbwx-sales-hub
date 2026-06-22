import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getUsers, updateUser } from '@/lib/users'

// POST /api/admin/agents/all-to-free (ADMIN)
// Kill-switch: set every user's work_mode to 'free' — instantly pauses/ends the
// Guided experiment for everyone. Lossless (data is shared); only the driver
// flips back to today's app.
export async function POST() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    }

    const users = await getUsers()
    let updated = 0
    for (const u of users) {
      if (u.work_mode !== 'free') {
        await updateUser(u.id, { work_mode: 'free' })
        updated++
      }
    }
    return NextResponse.json({ success: true, data: { updated, total: users.length } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to reset agents to free') }, { status: 500 })
  }
}
