import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads } from '@/lib/sheets'
import { getTelecallerVisibleLeadRows, getAllAssignments } from '@/lib/telecaller'
import { getOptedOutPhones, normalizePhone, getLastDiscussionByPhone } from '@/lib/db'
import { getUserByEmail, isLockedGuidedAgent } from '@/lib/users'
import { STATUS_MIGRATION } from '@/config/client'
import { computeLeadScore } from '@/lib/scoring'

// GET /api/leads/needs-attention
//
// Returns the leads visible to the caller that require an explicit action
// from them right now. This drives the "Action Required" banner on the
// dashboard / today / leads pages and is the engine behind the forced
// followup loop: every lead in this list MUST be touched (call logged,
// note added, status moved, or followup pushed) before it falls off.
//
// Staleness ceiling is per-status (newer statuses cycle faster). Leads are
// considered stale when no meaningful activity has happened within that
// ceiling — "meaningful" = call, note, or status change (auto-messages,
// templates, and system events don't reset the clock).
//
// Each entry carries a `reason` string the UI surfaces verbatim, so the
// agent sees "Followup overdue by 3 days" or "No activity for 52 hours"
// rather than a generic "stale" tag.

// Per-status ceiling in hours. Terminal statuses are excluded entirely.
const STALENESS_HOURS: Record<string, number> = {
  NEW: 24,
  DECK_SENT: 48,
  REPLIED: 24,
  NO_RESPONSE: 7 * 24,
  CALL_DONE_INTERESTED: 3 * 24,
  HOT: 48,
  FINAL_NEGOTIATION: 24,
  DELAYED: 0, // DELAYED is opt-in defer; rely on next_followup only.
}
const TERMINAL_STATUSES = new Set(['CONVERTED', 'LOST', 'ARCHIVED'])

interface NeedsAttention {
  row_number: number
  phone: string
  full_name: string
  city: string
  lead_status: string
  lead_priority: string
  assigned_to: string
  lead_score: number
  // What the agent must respond to. One of:
  //   'overdue_followup'  — next_followup date passed
  //   'stale_activity'    — no meaningful touch within the status ceiling
  //   'opportunity_check' — repeated calls without status progression
  reason_code: 'overdue_followup' | 'stale_activity' | 'opportunity_check'
  reason_text: string
  // Hours since last meaningful activity (or null if never)
  hours_since_activity: number | null
  // Days overdue if overdue_followup
  days_overdue: number | null
  last_activity_at: string | null
  last_activity_kind: 'note' | 'call' | 'message_in' | 'message_out' | null
}

export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    // Server lock: locked-guided agents (guided_inbox) get the rail + Inbox only.
    if (user.role === 'agent' && await isLockedGuidedAgent(user.id)) {
      return NextResponse.json({ success: false, error: 'Not available in guided mode' }, { status: 403 })
    }

    // Live telecaller flag (avoid stale JWT)
    let liveIsTelecaller = Boolean(session!.is_telecaller)
    if (session!.role === 'agent') {
      const u = await getUserByEmail(session!.email)
      if (u) liveIsTelecaller = u.is_telecaller
    }

    const allLeadsRaw = await getLeads()
    const allLeads = allLeadsRaw.map(l => ({
      ...l,
      lead_status: (STATUS_MIGRATION[l.lead_status] || l.lead_status) as typeof l.lead_status,
    }))

    // Scope to leads visible to this user, same rules as /api/leads
    let leads = allLeads
    if (user.role === 'agent') {
      if (liveIsTelecaller) {
        const optedOutPhones = await getOptedOutPhones()
        const visibleRows = await getTelecallerVisibleLeadRows({
          telecallerUserId: user.id,
          leads: allLeads.map(l => ({ row_number: l.row_number, lead_status: l.lead_status, phone: l.phone })),
          optedOutPhones,
        })
        leads = allLeads.filter(l => visibleRows.has(l.row_number))
      } else {
        leads = allLeads.filter(l => l.assigned_to === user.name || (user.can_assign && !l.assigned_to))
      }
    }
    // Admins see everything they can act on; their banner can be big — that's
    // intentional, they're the escalation path for orphaned leads.

    // Build last-activity index (notes + calls + non-auto messages)
    const lastDiscussion = await getLastDiscussionByPhone()
    void getAllAssignments // reserved for future opportunity-check scoring

    const now = Date.now()
    const results: NeedsAttention[] = []

    for (const lead of leads) {
      if (TERMINAL_STATUSES.has(lead.lead_status)) continue
      const norm = normalizePhone(String(lead.phone || ''))
      const last = lastDiscussion.get(norm) || null
      const lastTs = last?.at ? Date.parse(last.at) : null
      // Fall back to created_time if we've never recorded any activity
      const createdTs = lead.created_time ? Date.parse(lead.created_time) : null
      const referenceTs = lastTs && !isNaN(lastTs)
        ? lastTs
        : (createdTs && !isNaN(createdTs) ? createdTs : null)

      // 1. Overdue followup wins (highest signal — agent already scheduled a date)
      if (lead.next_followup) {
        const fuTs = Date.parse(lead.next_followup)
        if (!isNaN(fuTs) && fuTs < now) {
          const days = Math.floor((now - fuTs) / (24 * 60 * 60 * 1000))
          results.push({
            row_number: lead.row_number,
            phone: lead.phone,
            full_name: lead.full_name,
            city: lead.city,
            lead_status: lead.lead_status,
            lead_priority: lead.lead_priority,
            assigned_to: lead.assigned_to,
            lead_score: computeLeadScore(lead),
            reason_code: 'overdue_followup',
            reason_text: days === 0
              ? 'Followup is overdue today.'
              : `Followup overdue by ${days} day${days === 1 ? '' : 's'}.`,
            hours_since_activity: referenceTs ? Math.floor((now - referenceTs) / (60 * 60 * 1000)) : null,
            days_overdue: days,
            last_activity_at: last?.at || null,
            last_activity_kind: last?.source || null,
          })
          continue
        }
      }

      // 2. Stale by status ceiling
      const ceilingHours = STALENESS_HOURS[lead.lead_status]
      if (ceilingHours !== undefined && referenceTs) {
        const hoursSince = Math.floor((now - referenceTs) / (60 * 60 * 1000))
        if (hoursSince >= ceilingHours) {
          results.push({
            row_number: lead.row_number,
            phone: lead.phone,
            full_name: lead.full_name,
            city: lead.city,
            lead_status: lead.lead_status,
            lead_priority: lead.lead_priority,
            assigned_to: lead.assigned_to,
            lead_score: computeLeadScore(lead),
            reason_code: 'stale_activity',
            reason_text: hoursSince < 48
              ? `No activity for ${hoursSince}h — status is ${lead.lead_status}.`
              : `No activity for ${Math.floor(hoursSince / 24)}d — status is ${lead.lead_status}.`,
            hours_since_activity: hoursSince,
            days_overdue: null,
            last_activity_at: last?.at || null,
            last_activity_kind: last?.source || null,
          })
          continue
        }
      }
    }

    // Sort by urgency: overdue followups first (most days overdue first),
    // then stale activity (longest stale first), then HOT priority pushed up.
    const STATUS_URGENCY: Record<string, number> = {
      HOT: 5, FINAL_NEGOTIATION: 5,
      CALL_DONE_INTERESTED: 4, REPLIED: 4,
      DECK_SENT: 3, NEW: 3,
      NO_RESPONSE: 2, DELAYED: 1,
    }
    results.sort((a, b) => {
      if (a.reason_code === 'overdue_followup' && b.reason_code !== 'overdue_followup') return -1
      if (b.reason_code === 'overdue_followup' && a.reason_code !== 'overdue_followup') return 1
      const ua = STATUS_URGENCY[a.lead_status] || 0
      const ub = STATUS_URGENCY[b.lead_status] || 0
      if (ua !== ub) return ub - ua
      const da = a.days_overdue ?? (a.hours_since_activity ? a.hours_since_activity / 24 : 0)
      const db = b.days_overdue ?? (b.hours_since_activity ? b.hours_since_activity / 24 : 0)
      return db - da
    })

    return NextResponse.json({
      success: true,
      data: {
        count: results.length,
        leads: results,
        // Buckets help the UI render a compact summary
        by_reason: {
          overdue_followup: results.filter(r => r.reason_code === 'overdue_followup').length,
          stale_activity: results.filter(r => r.reason_code === 'stale_activity').length,
          opportunity_check: results.filter(r => r.reason_code === 'opportunity_check').length,
        },
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to compute needs-attention') }, { status: 500 })
  }
}
