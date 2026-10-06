import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession } from '@/lib/auth'
import { getMe } from '@/lib/gamification/engine'

export const dynamic = 'force-dynamic'

// GET /api/gamification/me → today's points vs goal, streak, badges and the
// friendly weekly leaderboard for the signed-in agent. Numbers are cached
// server-side for 60s per agent (see engine.ts) — poll at most once a minute.
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }
    const data = await getMe(session)
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to load points') }, { status: 500 })
  }
}
