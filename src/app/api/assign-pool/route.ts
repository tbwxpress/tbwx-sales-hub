import { NextRequest, NextResponse } from 'next/server'
import { getUsers } from '@/lib/users'
import { effectiveRole } from '@/lib/work'

export const dynamic = 'force-dynamic'

// GET /api/assign-pool — names of Closers currently receiving brand-new leads.
// Called by tbwx-website at form-submit time so the Admin "Receiving" toggles
// are the single source of truth for the website's assignment pool too (the
// website falls back to its SALESHUB_ASSIGN_POOL env if this call fails).
// Eligibility mirrors the auto-send cron: active + receives_new_leads + not
// paused, closers only. Auth: CRON_SECRET bearer (same trusted-internal secret
// the crons use).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!secret || token !== secret) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const users = await getUsers()
    const pool = users
      .filter(u => u.active && u.receives_new_leads && !u.lead_pool_paused && effectiveRole(u) === 'closer')
      .map(u => u.name)
    return NextResponse.json({ success: true, pool })
  } catch (err) {
    console.error('[assign-pool]', err)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
