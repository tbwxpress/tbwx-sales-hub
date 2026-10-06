import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession } from '@/lib/auth'
import { getOverview } from '@/lib/gamification/engine'

export const dynamic = 'force-dynamic'

// GET /api/gamification/overview (admin only) → every active agent's points
// today + this week, streak and badge count, plus the owner switch state.
// Each agent's numbers come from the same 60s cache the agents' own view uses.
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }
    const data = await getOverview()
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to load overview') }, { status: 500 })
  }
}
