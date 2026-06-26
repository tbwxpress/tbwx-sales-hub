import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { getLeads } from '@/lib/sheets'
import { insertWorkFeedback, getRecentWorkFeedback } from '@/lib/db'
import { effectiveRole } from '@/lib/work'
import { FEEDBACK_REASON_KEYS } from '@/config/sales-signals'

// POST /api/work/feedback — "Shouldn't be here?" ranking feedback.
// Body: { lead_row, reason_code, note?, queue_reason?, score?, lead_status? }
// Records WHY the agent thinks the card was surfaced wrongly, alongside the
// system's case for showing it (queue_reason + score + lead_status at flag-time).
// Ownership-gated (mirrors /api/work/outcome): an agent may only flag a lead
// assigned to them, unless they're an admin or a can_assign user on an unassigned
// lead. NEVER changes the lead, advances the card, or writes a work_event.
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const sessionUser = requireAuth(session)
    const user = await getUserById(sessionUser.id)
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const body = await req.json()
    const leadRow = Number(body?.lead_row)
    const reasonCode = String(body?.reason_code || '')
    if (!Number.isFinite(leadRow) || !reasonCode) {
      return NextResponse.json({ success: false, error: 'lead_row and reason_code are required' }, { status: 400 })
    }
    if (!FEEDBACK_REASON_KEYS.has(reasonCode)) {
      return NextResponse.json({ success: false, error: `Invalid reason_code "${reasonCode}"` }, { status: 400 })
    }

    // Ownership guard (mirrors applyWorkOutcome): own lead, or admin / can_assign
    // acting on an unassigned lead.
    const allLeads = await getLeads()
    const lead = allLeads.find(l => l.row_number === leadRow)
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 })
    }
    const isMine = lead.assigned_to === user.name
    const isUnassigned = !lead.assigned_to
    if (!isMine && !(user.role === 'admin' || (user.can_assign && isUnassigned))) {
      return NextResponse.json({ success: false, error: 'Lead not assigned to you' }, { status: 403 })
    }

    await insertWorkFeedback({
      user_id: user.id,
      user_name: user.name,
      lead_row: leadRow,
      role: effectiveRole(user),
      reason_code: reasonCode,
      // Clamp lengths server-side (client caps note at 140; defense-in-depth vs a
      // crafted POST bloating the DB). queue_reason/lead_status are system values.
      note: typeof body?.note === 'string' ? body.note.slice(0, 500) : undefined,
      queue_reason: typeof body?.queue_reason === 'string' ? body.queue_reason.slice(0, 200) : undefined,
      score: Number.isFinite(Number(body?.score)) ? Number(body.score) : undefined,
      lead_status: typeof body?.lead_status === 'string' ? body.lead_status.slice(0, 60) : undefined,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to record feedback') }, { status: 500 })
  }
}

// GET /api/work/feedback — ADMIN ONLY. Recent ranking-feedback rows for the owner
// "Ranking feedback" panel. Read-only.
export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }
    const feedback = await getRecentWorkFeedback()
    return NextResponse.json({ success: true, feedback })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to load feedback') }, { status: 500 })
  }
}
