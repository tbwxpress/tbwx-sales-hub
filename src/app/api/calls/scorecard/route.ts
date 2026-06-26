import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAdmin } from '@/lib/auth'
import { apiError } from '@/lib/api-error'
import { getTelecallerScorecard, listCallRecordingsSince } from '@/lib/db'

export const runtime = 'nodejs'

// created_at is stored via SQLite datetime('now') => 'YYYY-MM-DD HH:MM:SS' (UTC,
// no T/Z). Build the cutoff in the SAME shape so string comparison is valid.
function sinceSql(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ')
}

// GET /api/calls/scorecard?days=30 — manager call-quality roll-up (admin only).
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    requireAdmin(session)

    const url = new URL(req.url)
    let days = parseInt(url.searchParams.get('days') || '30', 10)
    if (!Number.isFinite(days) || days < 1) days = 30
    if (days > 365) days = 365
    const since = sinceSql(days)

    const [leaderboard, rows] = await Promise.all([
      getTelecallerScorecard(since),
      listCallRecordingsSince(since, 200),
    ])

    const recent = rows.map((r) => {
      let report_card: unknown = null
      if (r.report_card) {
        try { report_card = JSON.parse(String(r.report_card)) } catch { /* leave null */ }
      }
      return { ...r, report_card }
    })

    return NextResponse.json({ success: true, data: { days, leaderboard, recent } })
  } catch (err) {
    // Inspect the raw error BEFORE apiError() sanitizes it to a generic fallback
    // in production — otherwise the admin/auth status mapping never matches.
    const raw = err instanceof Error ? err.message : ''
    const status = /admin/i.test(raw) ? 403 : /auth/i.test(raw) ? 401 : 500
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status })
  }
}
