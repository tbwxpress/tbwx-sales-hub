import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads, updateLead } from '@/lib/sheets'
import { getLatestNudgeByLead, recordFollowupNudge, insertMessage, getOptedOutPhones, normalizePhone } from '@/lib/db'
import { getFollowupTemplateName } from '@/lib/template-settings'
import { sendTemplate } from '@/lib/whatsapp'

// Owner-approved automated follow-ups.
//
// Eligible: the agent's own open DELAYED / CALL_DONE_INTERESTED leads, minus
// opt-outs, minus leads already answered today, minus recent sends (7d
// cooldown) and recent skips (3d cooldown — skipping shouldn't nag daily).
// GET returns the daily ask list (capped at 15, most-overdue first); POST
// records the owner's per-lead decision and, on approval, fires the utility
// template immediately.

const ELIGIBLE_STATUSES = new Set(['DELAYED', 'CALL_DONE_INTERESTED'])
const SENT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
const SKIP_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000
const DAILY_CAP = 15

function parseNudgeTs(ts: string): number {
  return new Date(ts.replace(' ', 'T') + 'Z').getTime() || 0
}

async function eligibleLeadsFor(userName: string) {
  const [leads, nudges, optedOut] = await Promise.all([
    getLeads(),
    getLatestNudgeByLead(),
    getOptedOutPhones(),
  ])
  const now = Date.now()
  const todayUtc = new Date().toISOString().slice(0, 10)
  return leads
    .filter(l => {
      if (l.assigned_to !== userName) return false
      if (!ELIGIBLE_STATUSES.has(l.lead_status)) return false
      if (!l.phone || optedOut.has(normalizePhone(l.phone))) return false
      const n = nudges.get(l.row_number)
      if (n) {
        const ts = parseNudgeTs(n.created_at)
        if (n.created_at.slice(0, 10) === todayUtc) return false // answered today
        if (n.decision === 'sent' && now - ts < SENT_COOLDOWN_MS) return false
        if (n.decision === 'skipped' && now - ts < SKIP_COOLDOWN_MS) return false
      }
      return true
    })
    .sort((a, b) => (a.next_followup || '9999').localeCompare(b.next_followup || '9999'))
}

// GET /api/followup-nudges — today's ask list for the logged-in agent.
export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role === 'admin') {
      // Admin owns no book — nothing to approve.
      return NextResponse.json({ success: true, data: { items: [], template: await getFollowupTemplateName() } })
    }
    const eligible = await eligibleLeadsFor(user.name)
    const items = eligible.slice(0, DAILY_CAP).map(l => ({
      lead_row: l.row_number,
      name: l.full_name || l.phone,
      phone: l.phone,
      status: l.lead_status,
      next_followup: l.next_followup || '',
      city: l.city || '',
    }))
    return NextResponse.json({
      success: true,
      data: { items, total_eligible: eligible.length, template: await getFollowupTemplateName() },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// POST /api/followup-nudges — { lead_row, action: 'send' | 'skip' }
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const body = await req.json()
    const leadRow = Number(body?.lead_row)
    const action = String(body?.action || '')
    if (!Number.isFinite(leadRow) || !['send', 'skip'].includes(action)) {
      return NextResponse.json({ success: false, error: 'lead_row and action (send|skip) required' }, { status: 400 })
    }

    const leads = await getLeads()
    const lead = leads.find(l => l.row_number === leadRow)
    if (!lead) return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 })
    if (user.role !== 'admin' && lead.assigned_to !== user.name) {
      return NextResponse.json({ success: false, error: 'Not your lead' }, { status: 403 })
    }

    if (action === 'skip') {
      await recordFollowupNudge({ lead_row: leadRow, phone: lead.phone, decision: 'skipped', decided_by: user.name })
      return NextResponse.json({ success: true, data: { decision: 'skipped' } })
    }

    // send — utility template, allowed outside the 24h window.
    const template = await getFollowupTemplateName()
    const firstName = String(lead.full_name || '').trim().split(/\s+/)[0] || 'there'
    const ref = `TBWX-${leadRow}`
    const result = await sendTemplate(normalizePhone(lead.phone), template, [
      { type: 'text', text: firstName },
      { type: 'text', text: ref },
    ])
    if (!result.success) {
      await recordFollowupNudge({ lead_row: leadRow, phone: lead.phone, decision: 'failed', decided_by: user.name, template_used: template })
      return NextResponse.json({ success: false, error: result.error || 'WhatsApp send failed' }, { status: 502 })
    }

    await insertMessage({
      phone: normalizePhone(lead.phone),
      direction: 'sent',
      text: `[Template: ${template}] owner-approved follow-up`,
      timestamp: new Date().toISOString(),
      sent_by: user.name,
      wa_message_id: result.message_id || '',
      status: 'sent',
      template_used: template,
      read: true,
    })
    await recordFollowupNudge({ lead_row: leadRow, phone: lead.phone, decision: 'sent', decided_by: user.name, template_used: template })

    // Push the follow-up date out past the cooldown so the same lead doesn't
    // sit overdue while the template works.
    const next = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    try { await updateLead(leadRow, { next_followup: next }) } catch { /* non-critical */ }

    return NextResponse.json({ success: true, data: { decision: 'sent', template } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
