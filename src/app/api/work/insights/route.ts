import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getConversionInsights } from '@/lib/work'

// GET /api/work/insights — ADMIN ONLY. The Phase-3 learning report: empirical
// won/lost conversion rates per captured signal (objection / capital / persona),
// joined from terminal lead status + lead_signals. Read-only — it informs the
// owner ("price objections convert at X%"), it does NOT yet re-weight the score.
export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }
    const insights = await getConversionInsights()
    return NextResponse.json({ success: true, insights })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to load insights') }, { status: 500 })
  }
}
