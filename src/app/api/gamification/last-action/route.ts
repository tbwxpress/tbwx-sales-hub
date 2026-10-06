import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession } from '@/lib/auth'
import { getLastActionAwards } from '@/lib/gamification/engine'

export const dynamic = 'force-dynamic'

// GET /api/gamification/last-action?row=123&status=1&followup=1
// Called once right after a successful lead update so the floating "+5" chip
// shows the real points for that move. Two per-lead index reads, rate-limited
// to 30/min per agent; never polled.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }
    const sp = req.nextUrl.searchParams
    const row = Number(sp.get('row'))
    if (!Number.isInteger(row) || row <= 0) {
      return NextResponse.json({ success: false, error: 'row is required' }, { status: 400 })
    }
    const awards = await getLastActionAwards(session, row, {
      status: sp.get('status') === '1',
      followup: sp.get('followup') === '1',
    })
    return NextResponse.json({ success: true, data: { awards } }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
