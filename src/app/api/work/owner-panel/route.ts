import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getOwnerPanel } from '@/lib/work'

// GET /api/work/owner-panel (ADMIN)
// Per-agent work panel + cross-stage pipeline counters for the owner cockpit.
export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    const panel = await getOwnerPanel()
    return NextResponse.json(panel)
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to load owner panel') }, { status: 500 })
  }
}
