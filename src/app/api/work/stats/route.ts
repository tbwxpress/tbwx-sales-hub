import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { getWorkStats } from '@/lib/work'

// GET /api/work/stats → { cleared_today, target, streak, queue_depth }
export async function GET() {
  try {
    const session = await getSession()
    const sessionUser = requireAuth(session)
    const user = await getUserById(sessionUser.id)
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }
    const stats = await getWorkStats(user)
    return NextResponse.json(stats)
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to load work stats') }, { status: 500 })
  }
}
