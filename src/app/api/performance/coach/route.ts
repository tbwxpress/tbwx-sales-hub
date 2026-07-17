import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import { getUsers } from '@/lib/users'
import { getCoachMetrics, getCoachRead } from '@/lib/performance'

// GET /api/performance/coach — per-agent introspection metrics (+ AI read).
//   Agents: always their own numbers. Admin: ?agent=<Name> to inspect anyone.
//   ?read=1 additionally returns the Gemini coaching narrative (cached per
//   agent per day server-side, so repeated clicks don't burn quota).
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    let agentName = user.name
    if (user.role === 'admin') {
      const q = req.nextUrl.searchParams.get('agent')
      if (q) agentName = q
      else return NextResponse.json({ success: false, error: 'agent param required for admin' }, { status: 400 })
    }

    // Resolve the inspected agent's role label for the coach prompt.
    let roleType = 'closer'
    try {
      const users = await getUsers()
      const target = users.find(u => u.name === agentName)
      if (target) roleType = target.agent_role || (target.is_telecaller ? 'telecaller' : 'closer')
    } catch { /* default closer */ }

    const metrics = await getCoachMetrics(agentName)

    let coach = null
    if (req.nextUrl.searchParams.get('read') === '1') {
      try {
        coach = await getCoachRead(agentName, roleType, metrics)
      } catch (err) {
        // Metrics still render; the AI read degrades gracefully.
        return NextResponse.json({ success: true, data: { metrics, coach: null, coach_error: apiError(err, 'Coach unavailable') } })
      }
    }

    return NextResponse.json({ success: true, data: { metrics, coach } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// Ensure this route is always dynamic (reads session + live DB).
export const dynamic = 'force-dynamic'
