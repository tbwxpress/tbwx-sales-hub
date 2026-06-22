import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { getWorkQueue, getWorkStats } from '@/lib/work'

// GET /api/work/queue?limit=1
// The next card(s) for the session agent (role + window aware) + cadence stats.
// Works regardless of mode — the UI decides when to surface the rail.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const sessionUser = requireAuth(session)
    // Read fresh — JWT doesn't carry work_mode / agent_role / daily_target.
    const user = await getUserById(sessionUser.id)
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const limitParam = Number(new URL(req.url).searchParams.get('limit') || '1')
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(20, limitParam)) : 1

    const [{ cards }, stats] = await Promise.all([
      getWorkQueue(user, { limit }),
      getWorkStats(user),
    ])
    return NextResponse.json({ cards, stats })
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to load work queue') }, { status: 500 })
  }
}
