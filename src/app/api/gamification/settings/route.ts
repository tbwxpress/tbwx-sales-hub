import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession } from '@/lib/auth'
import { getGamificationConfig, updateGamificationConfig } from '@/lib/gamification/engine'

export const dynamic = 'force-dynamic'

// GET   /api/gamification/settings → { enabled, dailyGoal }
// PATCH /api/gamification/settings (admin) body { enabled?: boolean, daily_goal?: number }
// Stored in the existing `settings` table (gamification.enabled / gamification.daily_goal).
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }
    return NextResponse.json({ success: true, data: await getGamificationConfig() })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to load settings') }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }
    const body = await req.json().catch(() => ({}))
    const patch: { enabled?: boolean; dailyGoal?: number } = {}
    if (typeof body?.enabled === 'boolean') patch.enabled = body.enabled
    if (body?.daily_goal !== undefined) {
      const n = Number(body.daily_goal)
      if (!Number.isFinite(n)) {
        return NextResponse.json({ success: false, error: 'daily_goal must be a number' }, { status: 400 })
      }
      patch.dailyGoal = n
    }
    if (patch.enabled === undefined && patch.dailyGoal === undefined) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    }
    return NextResponse.json({ success: true, data: await updateGamificationConfig(patch) })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to save settings') }, { status: 500 })
  }
}
