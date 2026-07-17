import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import { getUsers } from '@/lib/users'
import { getSetting, setSetting } from '@/lib/db'
import { getFreshScoreboard } from '@/lib/performance'

// Fresh-era scoreboard (admin only): per-agent performance measured from an
// admin-set start date forward, so legacy leads stop drowning the numbers.
// GET → { epoch, rows }. POST { epoch: 'YYYY-MM-DD' } → set the start date.

const EPOCH_KEY = 'stats.epoch'

function todayIst(): string {
  // IST = UTC+5:30 — "today" should flip at Indian midnight, not UTC.
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }

    let epoch = await getSetting(EPOCH_KEY)
    if (!epoch) {
      // First use: pin the era to today (IST) and persist so it doesn't slide.
      epoch = todayIst()
      try { await setSetting(EPOCH_KEY, epoch) } catch { /* best-effort */ }
    }

    const users = await getUsers()
    const agents = users.filter(u => u.active && u.role !== 'admin').map(u => u.name)
    const rows = await getFreshScoreboard(epoch, agents)

    return NextResponse.json({ success: true, data: { epoch, rows } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }
    const body = await req.json()
    const epoch = String(body?.epoch || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(epoch)) {
      return NextResponse.json({ success: false, error: 'epoch must be YYYY-MM-DD' }, { status: 400 })
    }
    await setSetting(EPOCH_KEY, epoch)
    return NextResponse.json({ success: true, data: { epoch } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
