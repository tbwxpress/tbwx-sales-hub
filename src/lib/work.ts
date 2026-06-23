/**
 * Guided Work Mode — the priority engine + playbook.
 *
 * Additive, reversible experiment. Two drivers over the SAME shared data
 * (leads / statuses / messages / notes); this module never changes Free-mode
 * behavior. It computes an agent's ordered work queue fresh per request
 * (role-tuned, window-aware), applies a forced outcome (status + next_followup
 * + routing + audit) in one path, and powers cadence stats + the owner panel.
 *
 * Reuses: normalizePhone/last10, FOLLOWUP_DAYS, recordFirstResponse,
 * notifications (notifyQuiet), recordLeadClose + Meta CAPI (like the leads
 * PATCH route), lead_status_changes (source 'work'), assignment_log.
 */

import type { Lead, User, AgentRole } from './types'
import { FOLLOWUP_DAYS } from '@/config/client'
import { getLeads, updateLead } from './sheets'
import { getUsers } from './users'
import { notifyQuiet } from './notifications'
import { istToday, istDate } from './format'
import { leadScore } from './scoring'
import {
  getLastMessageByPhone,
  getLastReceivedMessageByPhone,
  getAssignmentHistory,
  getStatusChangesForLead,
  getCallLogs,
  insertStatusChange,
  logAssignment,
  insertNote,
  insertWorkEvent,
  recordFirstResponse,
  recordLeadClose,
  getWorkEventsForUserSince,
  getLastWorkEventByLead,
  getWorkEventCountsSince,
  getLastWorkEventAtByUser,
  getLeadSignalsByRows,
  upsertLeadSignal,
  type WorkEvent,
  type LeadSignal,
} from './db'

// ─── Constants ───────────────────────────────────────────────────────
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const ACTIVE_EXCLUDED = new Set(['CONVERTED', 'LOST', 'ARCHIVED'])
// Days of no engagement before a closer lead auto-bounces to a telecaller re-warm.
export const AUTOBOUNCE_DAYS = Number(process.env.WORK_AUTOBOUNCE_DAYS || 7)
// "Stalled HOT" / "no contact" threshold for the closer queue.
const STALLED_DAYS = 3
// Outcomes that are a dial/touch but NOT a real conversation — they count toward
// the attempts target but not the conversations target.
const NON_CONNECT_ACTIONS = new Set(['no_answer', 'no_response'])

const last10 = (p: string) => String(p || '').replace(/\D/g, '').slice(-10)

// ─── Card / Milestone shapes (the UI contract) ───────────────────────

export interface Milestone {
  key: string
  label: string
  who: string
  at: string          // ISO (or raw stored) timestamp
  rel: string         // humanized, e.g. "12d ago"
}

export interface OutcomeOption {
  key: string
  label: string
}

export interface WorkCard {
  lead_row: number
  name: string
  phone: string
  city: string
  lead_status: string
  lead_priority: string
  model_interest: string
  timeline: string
  experience: string
  campaign_name: string
  platform: string
  why_now: string
  window: { open: boolean; last_received_at: string | null }
  lifecycle: Milestone[]
  primary_action: 'whatsapp' | 'call'
  outcomes: OutcomeOption[]
  queue_reason: string
  remaining: number
  // Sales-AI: explainable propensity score + the captured structured signals.
  score: number
  score_reasons: string[]
  temperature: 'warming' | 'flat' | 'cooling'
  signals: {
    objection: string | null
    sentiment: string | null
    capital_readiness: string | null
    decision_maker: string | null
    buyer_persona: string | null
  } | null
}

export interface WorkStats {
  // Two honest targets: every logged outcome is an "attempt" (dial/touch); an
  // outcome where the agent actually reached/engaged the lead is a "conversation"
  // (everything except a pure no-answer / no-response). attempts_target is the
  // volume bar (~200), conversations_target the quality floor (≥50).
  attempts_today: number
  attempts_target: number
  conversations_today: number
  conversations_target: number
  streak: number
  queue_depth: number
}

// ─── Outcome catalogs (validated per role) ───────────────────────────

export const TELECALLER_OUTCOMES: OutcomeOption[] = [
  { key: 'interested', label: 'Interested → qualify' },
  { key: 'callback', label: 'Callback' },
  { key: 'no_answer', label: 'No answer' },
  { key: 'not_ready', label: 'Not ready' },
  { key: 'deck_sent', label: 'Deck/info sent' },
  { key: 'not_interested', label: 'Not interested' },
]

export const CLOSER_OUTCOMES: OutcomeOption[] = [
  { key: 'advanced', label: 'Advanced / replied' },
  { key: 'deck_sent', label: 'Sent deck/quote' },
  { key: 'booked', label: 'Booked visit/call' },
  { key: 'not_ready', label: 'Not ready' },
  { key: 'no_response', label: 'No response' },
  { key: 'going_cold', label: 'Going cold → telecaller' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
]

const TELECALLER_KEYS = new Set(TELECALLER_OUTCOMES.map(o => o.key))
const CLOSER_KEYS = new Set(CLOSER_OUTCOMES.map(o => o.key))

function outcomesForRole(role: AgentRole): OutcomeOption[] {
  return role === 'telecaller' ? TELECALLER_OUTCOMES : CLOSER_OUTCOMES
}

// ─── Helpers ─────────────────────────────────────────────────────────

// "12d ago" / "3h ago" / "just now". Tolerant of bad/empty timestamps.
function humanizeRel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Math.max(0, now - t)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function toIsoDate(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().split('T')[0]
}

// A user-picked callback/booked date, never today or in the past: a same-day
// pick would parse as "due" for the rest of the day and re-loop the card, so
// clamp it to tomorrow. (YYYY-MM-DD string compare is safe.)
function futureDateOr(providedTime: string | undefined, fallbackDays = 1): string {
  if (!providedTime) return toIsoDate(fallbackDays)
  return providedTime > toIsoDate(0) ? providedTime : toIsoDate(1)
}

// The effective agent role for a session user, honoring agent_role and falling
// back to the legacy is_telecaller flag.
export function effectiveRole(user: Pick<User, 'agent_role' | 'is_telecaller'>): AgentRole {
  if (user.agent_role === 'telecaller' || user.agent_role === 'closer') return user.agent_role
  return user.is_telecaller ? 'telecaller' : 'closer'
}

// ─── Routing helpers ─────────────────────────────────────────────────

// Active assigned-lead counts per agent NAME (assigned_to stores the name).
async function activeLeadCountByAgentName(leads: Lead[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const l of leads) {
    if (ACTIVE_EXCLUDED.has(l.lead_status)) continue
    const name = l.assigned_to
    if (!name) continue
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  return counts
}

// Least-loaded ACTIVE closer (agent_role='closer'). Round-robin tiebreak:
// among the lowest-count closers, pick deterministically by name so load
// spreads evenly across repeated calls within a tick.
export async function pickLeastLoadedCloser(): Promise<string | null> {
  const [users, leads] = await Promise.all([getUsers(), getLeads()])
  const closers = users.filter(u => u.active && effectiveRole(u) === 'closer')
  if (closers.length === 0) return null
  const counts = await activeLeadCountByAgentName(leads)
  let best: User | null = null
  let bestCount = Infinity
  for (const c of [...closers].sort((a, b) => a.name.localeCompare(b.name))) {
    const n = counts.get(c.name) || 0
    if (n < bestCount) { bestCount = n; best = c }
  }
  return best ? best.name : null
}

// Least-loaded ACTIVE telecaller for the re-warm loop. originalQualifier is a
// soft hint (kept for future "return to same telecaller" tuning); v1 just picks
// the least-loaded active telecaller.
export async function pickTelecallerForReWarm(originalQualifier?: string): Promise<string | null> {
  void originalQualifier
  const [users, leads] = await Promise.all([getUsers(), getLeads()])
  const telecallers = users.filter(u => u.active && effectiveRole(u) === 'telecaller')
  if (telecallers.length === 0) return null
  const counts = await activeLeadCountByAgentName(leads)
  let best: User | null = null
  let bestCount = Infinity
  for (const t of [...telecallers].sort((a, b) => a.name.localeCompare(b.name))) {
    const n = counts.get(t.name) || 0
    if (n < bestCount) { bestCount = n; best = t }
  }
  return best ? best.name : null
}

// ─── Lifecycle strip ─────────────────────────────────────────────────

// Build the chronological lifecycle for a lead from created_time + campaign,
// lead_status_changes, assignment_log, and last call/message.
async function buildLifecycle(
  lead: Lead,
  lastMsg: { direction: string; timestamp: string; text: string } | undefined,
  now: number,
): Promise<Milestone[]> {
  const ms: Milestone[] = []

  // Came in
  if (lead.created_time) {
    ms.push({
      key: 'came_in',
      label: lead.campaign_name ? `Came in (${lead.campaign_name})` : 'Came in',
      who: lead.platform || 'ad',
      at: lead.created_time,
      rel: humanizeRel(lead.created_time, now),
    })
  }

  // Status moves (qualified → DECK_SENT etc.)
  try {
    const changes = await getStatusChangesForLead(lead.row_number)
    for (const c of changes) {
      ms.push({
        key: `status_${c.id}`,
        label: `${c.old_status || '—'} → ${c.new_status}`,
        who: String(c.changed_by || ''),
        at: String(c.created_at || ''),
        rel: humanizeRel(String(c.created_at || ''), now),
      })
    }
  } catch { /* lifecycle is best-effort */ }

  // Ownership handoffs (incl. the telecaller↔closer loop)
  try {
    const handoffs = await getAssignmentHistory(lead.row_number)
    for (const h of handoffs) {
      ms.push({
        key: `assign_${h.id}`,
        label: h.from_agent ? `${h.from_agent} → ${h.to_agent}` : `Assigned to ${h.to_agent}`,
        who: String(h.assigned_by || ''),
        at: String(h.created_at || ''),
        rel: humanizeRel(String(h.created_at || ''), now),
      })
    }
  } catch { /* lifecycle is best-effort */ }

  // Last contact (call or message)
  let lastContactAt = ''
  let lastContactLabel = ''
  try {
    const calls = await getCallLogs(lead.phone)
    if (calls.length > 0) {
      lastContactAt = String(calls[0].created_at || '')
      lastContactLabel = 'Last call'
    }
  } catch { /* best-effort */ }
  if (lastMsg?.timestamp && lastMsg.timestamp > lastContactAt) {
    lastContactAt = lastMsg.timestamp
    lastContactLabel = lastMsg.direction === 'received' ? 'Last reply' : 'Last message'
  }
  if (lastContactAt) {
    ms.push({
      key: 'last_contact',
      label: lastContactLabel,
      who: '',
      at: lastContactAt,
      rel: humanizeRel(lastContactAt, now),
    })
  }

  // Chronological ascending
  ms.sort((a, b) => String(a.at).localeCompare(String(b.at)))
  return ms
}

// ─── Window state ────────────────────────────────────────────────────

interface WindowState { open: boolean; last_received_at: string | null }

function windowFromLastMsg(
  lastMsg: { direction: string; timestamp: string } | undefined,
  now: number,
): WindowState {
  if (lastMsg && lastMsg.direction === 'received' && lastMsg.timestamp) {
    const ts = new Date(lastMsg.timestamp).getTime()
    if (!Number.isNaN(ts) && now - ts < TWENTY_FOUR_HOURS_MS) {
      return { open: true, last_received_at: lastMsg.timestamp }
    }
    return { open: false, last_received_at: lastMsg.timestamp }
  }
  return { open: false, last_received_at: null }
}

// ─── Priority engine ─────────────────────────────────────────────────

interface RankedLead {
  lead: Lead
  bucket: number       // 1..5 (lower = higher priority)
  queue_reason: string
  why_now: string
  window: WindowState
  lastMsg?: { direction: string; timestamp: string; text: string }
  score?: number
  scoreReasons?: string[]
  temperature?: 'warming' | 'flat' | 'cooling'
}

const HOT_SET = new Set(['HOT', 'CALL_DONE_INTERESTED', 'FINAL_NEGOTIATION'])

function ageDaysOf(iso: string | undefined, now: number): number {
  if (!iso) return Infinity
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return Infinity
  return (now - t) / DAY_MS
}

// Parse a timestamp that may be a SQLite 'YYYY-MM-DD HH:MM:SS' (space-separated)
// OR an ISO 'YYYY-MM-DDTHH:MM:SSZ' string into epoch ms. Normalising the
// separator is essential: a raw string `>=` between a space-form and a T-form
// timestamp ALWAYS mis-compares (space 0x20 < 'T' 0x54), so never compare these
// as strings.
function tsToMs(s: string | null | undefined): number {
  if (!s) return 0
  let str = String(s).trim().replace(' ', 'T')
  // A bare 'YYYY-MM-DDTHH:MM:SS' with no zone is a SQLite datetime('now') value,
  // which is UTC — pin it to UTC ('Z') so it isn't read as server-local if the
  // runtime TZ is ever not UTC. ISO strings with a Z/offset are left alone.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(str)) str += 'Z'
  const t = new Date(str).getTime()
  return Number.isNaN(t) ? 0 : t
}

function isCallbackDue(lead: Lead, now: number): boolean {
  if (!lead.next_followup) return false
  const t = new Date(lead.next_followup).getTime()
  return !Number.isNaN(t) && t <= now
}

// Telecaller queue ordering. Returns ranked leads (excludes ones that don't
// belong in any bucket → not surfaced).
function rankTelecaller(
  leads: Lead[],
  lastMsgByPhone: Map<string, { direction: string; timestamp: string; text: string }>,
  lastWorkByLead: Map<number, WorkEvent>,
  now: number,
): RankedLead[] {
  const ranked: RankedLead[] = []
  for (const lead of leads) {
    const lastMsg = lastMsgByPhone.get(last10(lead.phone))
    const window = windowFromLastMsg(lastMsg, now)
    const lastWork = lastWorkByLead.get(lead.row_number)
    // A logged work event counts as "contacted" too — this is what stops a
    // no-answer/callback on a fresh NEW lead from re-looping the same card
    // (bucket ② below excludes everContacted leads).
    const everContacted = !!lastMsg || !!lead.first_call_date || lead.attempted_contact === 'Yes' || !!lastWork

    // A work event newer than the customer's last reply = we already handled it;
    // don't keep re-serving the same open-window card (the re-loop bug).
    const reEngagedAlready = !!lastWork && tsToMs(lastWork.created_at) >= tsToMs(window.last_received_at)

    // ① open-window WhatsApp reply (unless we already worked it since that reply)
    if (window.open && !reEngagedAlready) {
      ranked.push({
        lead, bucket: 1, window, lastMsg,
        queue_reason: 'open_window_reply',
        why_now: lastMsg?.text ? `replied ${humanizeRel(window.last_received_at, now)}: "${lastMsg.text.slice(0, 80)}"` : 'customer messaged — window open',
      })
      continue
    }
    // ② fresh NEW never-contacted
    if (lead.lead_status === 'NEW' && !everContacted) {
      ranked.push({
        lead, bucket: 2, window, lastMsg,
        queue_reason: 'fresh_new',
        why_now: 'new — first touch',
      })
      continue
    }
    // ③ callback due (callback-flagged = next_followup reached on a DELAYED/NO_RESPONSE follow-up)
    if (isCallbackDue(lead, now)) {
      ranked.push({
        lead, bucket: 3, window, lastMsg,
        queue_reason: 'callback_due',
        why_now: `callback/follow-up due ${humanizeRel(lead.next_followup, now) || 'now'}`,
      })
      continue
    }
    // ④ interested, not yet called (a work event means it WAS just handled —
    // let it return later via its follow-up, don't re-loop it onto the rail).
    if (HOT_SET.has(lead.lead_status) && !lastWork) {
      ranked.push({
        lead, bucket: 4, window, lastMsg,
        queue_reason: 'interested_not_called',
        why_now: `${lead.lead_status} — needs a call`,
      })
      continue
    }
    // ⑤ oldest overdue
    if (lead.next_followup) {
      const t = new Date(lead.next_followup).getTime()
      if (!Number.isNaN(t) && t < now) {
        const daysOver = Math.max(1, Math.round((now - t) / DAY_MS))
        ranked.push({
          lead, bucket: 5, window, lastMsg,
          queue_reason: 'oldest_overdue',
          why_now: `${daysOver}d overdue`,
        })
      }
    }
  }
  return ranked
}

// Closer queue ordering.
function rankCloser(
  leads: Lead[],
  lastMsgByPhone: Map<string, { direction: string; timestamp: string; text: string }>,
  lastReceivedByPhone: Map<string, { last_received_at: string }>,
  lastWorkByLead: Map<number, WorkEvent>,
  now: number,
): RankedLead[] {
  const ranked: RankedLead[] = []
  for (const lead of leads) {
    const lastMsg = lastMsgByPhone.get(last10(lead.phone))
    const lastReceivedAt = lastReceivedByPhone.get(last10(lead.phone))?.last_received_at || ''
    const window = windowFromLastMsg(lastMsg, now)
    const lastWork = lastWorkByLead.get(lead.row_number)
    // A work event newer than the customer's last reply = we already re-engaged;
    // don't keep re-serving the same card (bucket ① open-window AND ③ re-engage).
    const reEngagedAlready = !!lastWork && tsToMs(lastWork.created_at) >= tsToMs(lastReceivedAt)

    // ① open-window reply (HOT / soonest-closing first handled in sort)
    if (window.open && !reEngagedAlready) {
      ranked.push({
        lead, bucket: 1, window, lastMsg,
        queue_reason: 'open_window_reply',
        why_now: lastMsg?.text ? `replied ${humanizeRel(window.last_received_at, now)}: "${lastMsg.text.slice(0, 80)}"` : 'customer waiting — window open',
      })
      continue
    }
    // ② new qualified handoff — just routed in, no closer touch yet
    const handedOffRecently = !lastWork && (lead.lead_status === 'CALL_DONE_INTERESTED' || lead.lead_status === 'HOT')
    if (handedOffRecently) {
      ranked.push({
        lead, bucket: 2, window, lastMsg,
        queue_reason: 'new_qualified_handoff',
        why_now: 'new qualified handoff — first closer touch',
      })
      continue
    }
    // ④ stalled HOT — HOT, no contact 3d+ (checked before re-engage so a HOT
    // lead takes its higher-priority bucket and isn't double-counted in ③).
    if (HOT_SET.has(lead.lead_status)) {
      const lastTouchAt = lastWork?.created_at || lastMsg?.timestamp || lead.first_call_date || ''
      if (ageDaysOf(lastTouchAt, now) >= STALLED_DAYS) {
        ranked.push({
          lead, bucket: 4, window, lastMsg,
          queue_reason: 'stalled_hot',
          why_now: `HOT, no contact ${Math.round(ageDaysOf(lastTouchAt, now))}d+`,
        })
        continue
      }
    }
    // ③ re-engage — the customer replied at some point and the 24h window is now
    // closed. Fires off the last INBOUND message (not the absolute-last message),
    // so a lead the agent followed up on after the reply is still surfaced.
    // (Open-window ①, new-handoff ②, and stalled-HOT ④ already `continue`d above,
    // so this can't double-count them.)
    // Suppress if the closer already re-engaged AFTER that last reply (handled by
    // reEngagedAlready, computed above) — otherwise the same lead re-loops onto
    // the rail on every outcome. It returns via ⑤ when its follow-up comes due.
    if (lastReceivedAt && !window.open && !reEngagedAlready) {
      ranked.push({
        lead, bucket: 3, window, lastMsg,
        queue_reason: 're_engage',
        why_now: `replied ${humanizeRel(lastReceivedAt, now)}, then quiet`,
      })
      continue
    }
    // ⑤ oldest overdue follow-up
    if (lead.next_followup) {
      const t = new Date(lead.next_followup).getTime()
      if (!Number.isNaN(t) && t < now) {
        const daysOver = Math.max(1, Math.round((now - t) / DAY_MS))
        ranked.push({
          lead, bucket: 5, window, lastMsg,
          queue_reason: 'oldest_overdue',
          why_now: `${daysOver}d overdue`,
        })
      }
    }
  }
  return ranked
}

// Secondary sort within a bucket: HOT first, then soonest next_followup, then
// oldest created_time.
function withinBucketSort(a: RankedLead, b: RankedLead): number {
  const aHot = a.lead.lead_priority === 'HOT' || a.lead.lead_status === 'HOT'
  const bHot = b.lead.lead_priority === 'HOT' || b.lead.lead_status === 'HOT'
  if (aHot !== bHot) return aHot ? -1 : 1
  const af = a.lead.next_followup || '9999-12-31'
  const bf = b.lead.next_followup || '9999-12-31'
  if (af !== bf) return af < bf ? -1 : 1
  return String(a.lead.created_time).localeCompare(String(b.lead.created_time))
}

export interface WorkQueueResult {
  cards: WorkCard[]
  queue_depth: number
  book_size: number // active leads assigned to this agent (their whole pile)
}

// Compact the per-lead signal projection down to the card-facing subset (or null
// when nothing has been captured yet).
function signalForCard(sig: LeadSignal | undefined): WorkCard['signals'] {
  if (!sig) return null
  if (!sig.objection && !sig.sentiment && !sig.capital_readiness && !sig.decision_maker && !sig.buyer_persona) return null
  return {
    objection: sig.objection,
    sentiment: sig.sentiment,
    capital_readiness: sig.capital_readiness,
    decision_maker: sig.decision_maker,
    buyer_persona: sig.buyer_persona,
  }
}

/**
 * The agent's ordered work queue: their assigned, active leads only, role-tuned
 * and window-aware, each lead locked to this agent (assigned_to = user.name).
 * Returns the next card(s) (default 1; pass opts.limit for more).
 */
export async function getWorkQueue(
  user: Pick<User, 'name' | 'agent_role' | 'is_telecaller' | 'daily_target'>,
  opts?: { limit?: number; countOnly?: boolean },
): Promise<WorkQueueResult> {
  const limit = Math.max(1, opts?.limit ?? 1)
  const role = effectiveRole(user)
  const now = Date.now()

  // Their assigned, active leads only. A lead is "locked" to an agent via
  // assigned_to — so the same lead is never served to two people.
  // merged leads are set to lead_status='ARCHIVED' (in ACTIVE_EXCLUDED), so the
  // status filter already excludes them.
  const allLeads = await getLeads()
  const mine = allLeads.filter(
    l => l.assigned_to === user.name && !ACTIVE_EXCLUDED.has(l.lead_status),
  )

  const [lastMsgByPhone, lastWorkByLead, lastReceivedByPhone] = await Promise.all([
    getLastMessageByPhone(),
    getLastWorkEventByLead(mine.map(l => l.row_number)),
    getLastReceivedMessageByPhone(),
  ])

  let ranked: RankedLead[]
  if (role === 'telecaller') {
    ranked = rankTelecaller(mine, lastMsgByPhone, lastWorkByLead, now)
  } else {
    ranked = rankCloser(mine, lastMsgByPhone, lastReceivedByPhone, lastWorkByLead, now)
  }

  // Count-only callers (getWorkStats, getOwnerPanel's per-agent loop) need just
  // the queue depth — skip the signals fetch, the per-lead scoring + sort, and
  // buildLifecycle below. queue_depth = ranked.length (rankers drop no-bucket leads).
  if (opts?.countOnly) {
    return { cards: [], queue_depth: ranked.length, book_size: mine.length }
  }

  const signalsByRow = await getLeadSignalsByRows(mine.map(l => l.row_number))

  // Sales-AI: score each ranked lead (explainable), then sort by bucket → score →
  // the legacy tiebreak. Buckets keep the window/recency safety; the score makes
  // within-bucket order intelligent (a budget-confirmed lead beats a tyre-kicker).
  for (const r of ranked) {
    const sc = leadScore(r.lead, signalsByRow.get(r.lead.row_number), {
      lastReceivedAt: lastReceivedByPhone.get(last10(r.lead.phone))?.last_received_at || null,
      now,
    })
    r.score = sc.score
    r.scoreReasons = sc.reasons
    r.temperature = sc.temperature
  }

  ranked.sort((a, b) => (a.bucket - b.bucket) || ((b.score ?? 0) - (a.score ?? 0)) || withinBucketSort(a, b))

  const depth = ranked.length
  const top = ranked.slice(0, limit)
  const cards: WorkCard[] = []
  for (const r of top) {
    const lifecycle = await buildLifecycle(r.lead, r.lastMsg, now)
    cards.push({
      lead_row: r.lead.row_number,
      name: r.lead.full_name || r.lead.phone,
      phone: r.lead.phone,
      city: r.lead.city || '',
      lead_status: r.lead.lead_status,
      lead_priority: r.lead.lead_priority || '',
      model_interest: r.lead.model_interest || '',
      timeline: r.lead.timeline || '',
      experience: r.lead.experience || '',
      campaign_name: r.lead.campaign_name || '',
      platform: r.lead.platform || '',
      why_now: r.why_now,
      window: r.window,
      lifecycle,
      primary_action: r.window.open ? 'whatsapp' : 'call',
      outcomes: outcomesForRole(role),
      queue_reason: r.queue_reason,
      remaining: depth,
      score: r.score ?? 0,
      score_reasons: r.scoreReasons ?? [],
      temperature: r.temperature ?? 'flat',
      signals: signalForCard(signalsByRow.get(r.lead.row_number)),
    })
  }

  return { cards, queue_depth: depth, book_size: mine.length }
}

// ─── Stats ───────────────────────────────────────────────────────────

// Start of "today" as an ISO string (server-local). Matches how the rest of the
// app derives todayStr (new Date().toISOString().split('T')[0]).
function startOfTodayIso(): string {
  // Most-recent IST midnight, expressed as a UTC 'YYYY-MM-DD HH:MM:SS' string so
  // it compares correctly against work_events.created_at (UTC, space-separated).
  const istMidnightUtcMs = new Date(`${istToday()}T00:00:00+05:30`).getTime()
  return new Date(istMidnightUtcMs).toISOString().replace('T', ' ').slice(0, 19)
}

/**
 * attempts/conversations (today + targets) + streak + queue_depth for the cadence
 * header. Counts come from work_events bucketed by IST calendar day; queue_depth
 * from the priority engine.
 */
export async function getWorkStats(
  user: Pick<User, 'id' | 'name' | 'agent_role' | 'is_telecaller' | 'daily_target'>,
): Promise<WorkStats> {
  // Conversations = the quality floor (≥50 by default). daily_target is the
  // conversation target. The attempts/dials target is computed below, scaled to
  // the agent's actual book.
  const conversations_target = user.daily_target || 50
  // Pull ~60 days of events once; compute today's counts + streak from them.
  const since = new Date(Date.now() - 60 * DAY_MS).toISOString()
  const events = await getWorkEventsForUserSince(user.id, since)

  // Bucket by IST calendar day (work_events.created_at is UTC; the team is in
  // India and the app rolls "today" at IST midnight — see format.ts).
  const todayKey = istToday()
  const attemptsByDay = new Map<string, number>()
  const convByDay = new Map<string, number>()
  for (const e of events) {
    const ms = tsToMs(e.created_at)
    if (!ms) continue
    const day = istDate(new Date(ms))
    attemptsByDay.set(day, (attemptsByDay.get(day) || 0) + 1)
    if (!NON_CONNECT_ACTIONS.has(String(e.action || ''))) {
      convByDay.set(day, (convByDay.get(day) || 0) + 1)
    }
  }
  const attempts_today = attemptsByDay.get(todayKey) || 0
  const conversations_today = convByDay.get(todayKey) || 0

  // Streak = consecutive IST days (ending today, or yesterday if today not yet
  // hit) where the user hit the CONVERSATION target (the meaningful one).
  let streak = 0
  let i = (convByDay.get(todayKey) || 0) < conversations_target ? 1 : 0
  for (; i < 60; i++) {
    const key = istDate(new Date(Date.now() - i * DAY_MS))
    if ((convByDay.get(key) || 0) >= conversations_target) {
      streak++
    } else {
      break
    }
  }

  const { queue_depth, book_size } = await getWorkQueue(user, { limit: 1, countOnly: true })
  // Dials/attempts target scales to the agent's active book. Telecallers (high-
  // volume click-to-dial) are floored at a humane 120/day and capped at 200;
  // closers (fewer, deeper touches) floored at 40, capped at 120. 120–150/day is
  // the sustainable telecaller band — beyond ~200 manual dials, quality drops and
  // burnout follows. A small book still gets the floor; a big backlog the cap.
  const role = effectiveRole(user)
  const floor = role === 'telecaller' ? 120 : 40
  const cap = role === 'telecaller' ? 200 : 120
  const attempts_target = Math.min(cap, Math.max(floor, book_size))
  return { attempts_today, attempts_target, conversations_today, conversations_target, streak, queue_depth }
}

// ─── Playbook ────────────────────────────────────────────────────────

export interface ApplyOutcomeInput {
  userId: string
  userName: string
  leadRow: number
  outcome: string
  channel: 'call' | 'whatsapp' | 'template' | 'system'
  note?: string
  alsoWhatsapp?: boolean
  // Sales-AI structured capture (all optional, tap-not-type). undefined = not
  // captured (don't overwrite); null = explicitly cleared.
  objection?: string | null
  sentiment?: string | null
  capital_readiness?: string | null
  decision_maker?: string | null
  buyer_persona?: string | null
  next_step?: string | null
  connected?: boolean | null
}

export interface ApplyOutcomeResult {
  ok: boolean
  nextStatus: string
  routedTo?: string
  error?: string
  /** Nudge the rep to send a WhatsApp after a no-answer (re-opens the 24h window). */
  suggest_whatsapp?: boolean
}

// Per-outcome status + follow-up resolution. Returns the next status and the
// next_followup date (ISO yyyy-mm-dd, or '' to clear). Uses FOLLOWUP_DAYS for
// the canonical per-status intervals (same source the leads PATCH route uses).
function resolveOutcome(
  role: AgentRole,
  outcome: string,
  current: Lead,
  providedTime?: string,
): { nextStatus: string; nextFollowup: string; route: 'closer' | 'telecaller' | null; won: boolean } {
  const keep = current.lead_status
  if (role === 'telecaller') {
    switch (outcome) {
      case 'interested':
        return { nextStatus: 'CALL_DONE_INTERESTED', nextFollowup: toIsoDate(FOLLOWUP_DAYS.CALL_DONE_INTERESTED ?? 2), route: 'closer', won: false }
      case 'callback':
        return { nextStatus: keep, nextFollowup: futureDateOr(providedTime), route: null, won: false }
      case 'no_answer':
        return { nextStatus: keep, nextFollowup: toIsoDate(1), route: null, won: false }
      case 'not_ready':
        return { nextStatus: 'DELAYED', nextFollowup: toIsoDate(FOLLOWUP_DAYS.DELAYED ?? 7), route: null, won: false }
      case 'deck_sent':
        return { nextStatus: 'DECK_SENT', nextFollowup: toIsoDate(FOLLOWUP_DAYS.DECK_SENT ?? 1), route: null, won: false }
      case 'not_interested':
        return { nextStatus: 'LOST', nextFollowup: '', route: null, won: false }
    }
  } else {
    switch (outcome) {
      case 'advanced':
        return { nextStatus: keep, nextFollowup: toIsoDate(2), route: null, won: false }
      case 'deck_sent':
        return { nextStatus: 'DECK_SENT', nextFollowup: toIsoDate(2), route: null, won: false }
      case 'booked':
        return { nextStatus: keep, nextFollowup: futureDateOr(providedTime), route: null, won: false }
      case 'not_ready':
        return { nextStatus: 'DELAYED', nextFollowup: toIsoDate(FOLLOWUP_DAYS.DELAYED ?? 7), route: null, won: false }
      case 'no_response':
        return { nextStatus: keep, nextFollowup: toIsoDate(1), route: null, won: false }
      case 'going_cold':
        return { nextStatus: 'DELAYED', nextFollowup: toIsoDate(FOLLOWUP_DAYS.DELAYED ?? 7), route: 'telecaller', won: false }
      case 'won':
        return { nextStatus: 'CONVERTED', nextFollowup: '', route: null, won: true }
      case 'lost':
        return { nextStatus: 'LOST', nextFollowup: '', route: null, won: false }
    }
  }
  return { nextStatus: keep, nextFollowup: current.next_followup || '', route: null, won: false }
}

/**
 * Apply a forced outcome from the work rail: status + next_followup + routing +
 * audit, in one cohesive path. Writes lead_status_changes (source 'work'),
 * assignment_log on any reassignment, a work_events row, an optional lead_note,
 * and notifications on handoffs / Won. Returns { ok, nextStatus, routedTo? }.
 *
 * Mirrors the leads PATCH route's status + CAPI behavior for CONVERTED/HOT.
 */
export async function applyWorkOutcome(input: ApplyOutcomeInput): Promise<ApplyOutcomeResult> {
  const { userId, userName, leadRow, outcome, channel, note, alsoWhatsapp } = input

  const allLeads = await getLeads()
  const lead = allLeads.find(l => l.row_number === leadRow)
  if (!lead) return { ok: false, nextStatus: '', error: 'Lead not found' }

  // Resolve the acting user (role validation + ownership guard both need it).
  const users = await getUsers()
  const me = users.find(u => u.id === userId)

  // Ownership guard (mirrors the leads PATCH route): an agent may only act on a
  // lead assigned to them, unless they're an admin or a can_assign user acting
  // on an unassigned lead.
  const isMine = lead.assigned_to === userName
  const isUnassigned = !lead.assigned_to
  if (!isMine && !(me?.role === 'admin' || (me?.can_assign && isUnassigned))) {
    return { ok: false, nextStatus: lead.lead_status, error: 'Lead not assigned to you' }
  }

  // Validate the outcome against the acting user's role.
  const role = me ? effectiveRole(me) : 'closer'
  const validKeys = role === 'telecaller' ? TELECALLER_KEYS : CLOSER_KEYS
  if (!validKeys.has(outcome)) {
    return { ok: false, nextStatus: lead.lead_status, error: `Invalid outcome "${outcome}" for role ${role}` }
  }

  const m = note?.match(/^(\d{4}-\d{2}-\d{2})/)
  const providedTime = (outcome === 'callback' || outcome === 'booked') && m ? m[1] : undefined
  const { nextStatus, nextFollowup, route, won } = resolveOutcome(role, outcome, lead, providedTime)

  // Resolve routing target (reassignment) up front.
  let routedTo: string | undefined
  if (route === 'closer') {
    routedTo = (await pickLeastLoadedCloser()) || undefined
  } else if (route === 'telecaller') {
    routedTo = (await pickTelecallerForReWarm(lead.assigned_to)) || undefined
  }

  // 1) Status change + audit (source 'work'). Only when it actually changes.
  if (nextStatus && nextStatus !== lead.lead_status) {
    await insertStatusChange({
      lead_row: leadRow,
      phone: lead.phone,
      old_status: lead.lead_status,
      new_status: nextStatus,
      changed_by: userName,
      changed_by_id: userId,
      source: 'work',
    })
  }

  // 2) Build the field patch (status + follow-up + optional reassignment).
  const patch: Record<string, string> = {}
  if (nextStatus && nextStatus !== lead.lead_status) patch.lead_status = nextStatus
  // next_followup always set from the playbook (even if status unchanged).
  patch.next_followup = nextFollowup
  if (routedTo && routedTo !== lead.assigned_to) {
    patch.assigned_to = routedTo
    try {
      await logAssignment({
        lead_row: leadRow,
        phone: lead.phone,
        from_agent: lead.assigned_to || '',
        to_agent: routedTo,
        assigned_by: userName,
      })
    } catch (e) {
      console.error('[work] logAssignment non-critical:', e)
    }
  }

  // Mark the lead as "touched" on any real human channel so a fresh NEW lead
  // leaves the never-contacted queue (and the rest of the app shows it as
  // contacted) — defence-in-depth against a no-answer/callback re-looping.
  if (channel === 'call' || channel === 'whatsapp') {
    if (lead.attempted_contact !== 'Yes') patch.attempted_contact = 'Yes'
    if (!lead.first_call_date) patch.first_call_date = new Date().toISOString().split('T')[0]
  }
  await updateLead(leadRow, patch)

  // 3) SLA: first human call or first human (non-template) WhatsApp.
  if (channel === 'call' || channel === 'whatsapp') {
    try { await recordFirstResponse(lead.phone, lead.created_time || new Date().toISOString()) } catch { /* non-critical */ }
  }

  // 4) Terminal close → SLA close (any won/lost, like the leads PATCH route) +
  // Meta CAPI Purchase strictly on a Win.
  if (nextStatus === 'CONVERTED' || nextStatus === 'LOST') {
    try { await recordLeadClose(lead.phone, nextStatus) } catch { /* non-critical */ }
  }
  if (won) {
    try {
      const [firstName, ...rest] = String(lead.full_name || '').trim().split(/\s+/)
      const { fireConvertedEvent } = await import('./meta-capi')
      await fireConvertedEvent({
        lead_row: leadRow,
        phone: lead.phone,
        email: lead.email,
        first_name: firstName,
        last_name: rest.join(' '),
        city: lead.city,
        lead_id: lead.id,
      }).catch(e => console.error('[work CAPI] Purchase event failed:', e))
    } catch { /* CAPI non-critical */ }
  }

  // 5) Optional free-text note. Save any non-empty note unless it's purely the
  // captured callback/booked date (which is already applied to next_followup).
  if (note && note.trim() && note.trim() !== providedTime) {
    try { await insertNote({ phone: lead.phone, note, created_by: userName }) } catch { /* non-critical */ }
  }

  // Sales-AI: was the lead actually reached on this touch? (no-answer/no-response
  // = not connected). Explicit input.connected wins; otherwise derive from action.
  const isNonConnect = outcome === 'no_answer' || outcome === 'no_response'
  const connected = input.connected ?? (channel === 'call' || channel === 'whatsapp' ? !isNonConnect : null)

  // 6) work_events row (the single source of "did the work happen").
  await insertWorkEvent({
    user_id: userId,
    user_name: userName,
    lead_row: leadRow,
    role,
    channel,
    action: outcome,
    outcome: nextStatus,
    also_whatsapp: !!alsoWhatsapp,
    objection: input.objection ?? null,
    sentiment: input.sentiment ?? null,
    connected,
  })

  // Project the latest captured signals onto the lead (shared brain — read by the
  // scorer + BOTH UIs). Only non-undefined fields overwrite; connected_ever sticky.
  const hasSignal =
    input.objection !== undefined || input.sentiment !== undefined ||
    input.capital_readiness !== undefined || input.decision_maker !== undefined ||
    input.buyer_persona !== undefined || input.next_step !== undefined || connected === true
  if (hasSignal) {
    await upsertLeadSignal(leadRow, {
      objection: input.objection,
      sentiment: input.sentiment,
      capital_readiness: input.capital_readiness,
      decision_maker: input.decision_maker,
      buyer_persona: input.buyer_persona,
      next_step: input.next_step,
      connected_ever: connected === true ? true : undefined,
      updated_by: userName,
    })
  }

  // 7) Notifications on handoffs / Won.
  try {
    if (routedTo && route === 'closer') {
      const target = users.find(u => u.name === routedTo && u.active)
      if (target) {
        await notifyQuiet({
          user_id: target.id,
          type: 'lead_assigned',
          title: `Qualified lead: ${lead.full_name || lead.phone}`,
          body: `Routed by ${userName}${lead.lead_priority ? ` · ${lead.lead_priority}` : ''}`,
          ref_phone: lead.phone,
          ref_lead_row: leadRow,
        })
      }
    } else if (routedTo && route === 'telecaller') {
      const target = users.find(u => u.name === routedTo && u.active)
      if (target) {
        await notifyQuiet({
          user_id: target.id,
          type: 'lead_assigned',
          title: `Re-warm: ${lead.full_name || lead.phone}`,
          body: `Cooling lead handed back by ${userName}`,
          ref_phone: lead.phone,
          ref_lead_row: leadRow,
        })
      }
    }
    if (won) {
      // Notify owner(s)/admins of the Win.
      for (const admin of users.filter(u => u.role === 'admin' && u.active)) {
        await notifyQuiet({
          user_id: admin.id,
          type: 'lead_hot',
          title: `🎉 Won: ${lead.full_name || lead.phone}`,
          body: `Closed by ${userName}`,
          ref_phone: lead.phone,
          ref_lead_row: leadRow,
        })
      }
    }
  } catch { /* notifications non-critical */ }

  return { ok: true, nextStatus: nextStatus || lead.lead_status, routedTo, suggest_whatsapp: (isNonConnect && channel !== 'whatsapp') || undefined }
}

// ─── Auto-bounce (anti-rot) ──────────────────────────────────────────

export interface AutoBounceResult {
  bounced: number
  details: Array<{ lead_row: number; from: string; to: string }>
}

/**
 * Bounce closer leads with no engagement (no work_event / message / call) for
 * AUTOBOUNCE_DAYS+ to a telecaller re-warm queue: reassign + status DELAYED +
 * assignment_log + notify. Additive — never touches Free-mode leads' behavior
 * beyond the same reassignment the owner could do manually.
 */
export async function runAutoBounce(): Promise<AutoBounceResult> {
  const now = Date.now()
  const result: AutoBounceResult = { bounced: 0, details: [] }

  const [users, allLeads] = await Promise.all([getUsers(), getLeads()])
  const closerNames = new Set(
    users.filter(u => u.active && effectiveRole(u) === 'closer').map(u => u.name),
  )
  const candidates = allLeads.filter(
    l => l.assigned_to && closerNames.has(l.assigned_to)
      && !ACTIVE_EXCLUDED.has(l.lead_status),
  )
  if (candidates.length === 0) return result

  const [lastMsgByPhone, lastWorkByLead] = await Promise.all([
    getLastMessageByPhone(),
    getLastWorkEventByLead(candidates.map(l => l.row_number)),
  ])

  let callsByPhone: Map<string, string> | null = null

  for (const lead of candidates) {
    const lastMsg = lastMsgByPhone.get(last10(lead.phone))
    const lastWork = lastWorkByLead.get(lead.row_number)

    // Most-recent engagement across work_events / message / call.
    let lastTouch = ''
    if (lastWork?.created_at && lastWork.created_at > lastTouch) lastTouch = lastWork.created_at
    if (lastMsg?.timestamp && lastMsg.timestamp > lastTouch) lastTouch = lastMsg.timestamp
    // Lazy call lookup only if still no engagement found above.
    if (!lastTouch) {
      if (!callsByPhone) callsByPhone = new Map()
      let callAt = callsByPhone.get(last10(lead.phone))
      if (callAt === undefined) {
        try {
          const calls = await getCallLogs(lead.phone)
          callAt = calls.length > 0 ? String(calls[0].created_at || '') : ''
        } catch { callAt = '' }
        callsByPhone.set(last10(lead.phone), callAt)
      }
      if (callAt) lastTouch = callAt
    }

    // No engagement ever → fall back to created_time so brand-new unworked
    // handoffs don't bounce on day one.
    const referenceAt = lastTouch || lead.created_time || ''
    if (ageDaysOf(referenceAt, now) < AUTOBOUNCE_DAYS) continue

    const to = await pickTelecallerForReWarm(lead.assigned_to)
    if (!to || to === lead.assigned_to) continue

    const from = lead.assigned_to
    await insertStatusChange({
      lead_row: lead.row_number,
      phone: lead.phone,
      old_status: lead.lead_status,
      new_status: 'DELAYED',
      changed_by: 'System',
      changed_by_id: 'system-cron',
      source: 'cron',
    })
    await logAssignment({
      lead_row: lead.row_number,
      phone: lead.phone,
      from_agent: from,
      to_agent: to,
      assigned_by: 'System (auto-bounce)',
    })
    await updateLead(lead.row_number, {
      lead_status: lead.lead_status === 'DELAYED' ? lead.lead_status : 'DELAYED',
      assigned_to: to,
      next_followup: toIsoDate(1),
    })
    await insertWorkEvent({
      user_id: 'system-cron',
      user_name: 'System',
      lead_row: lead.row_number,
      role: 'system',
      channel: 'system',
      action: 'auto_bounce',
      outcome: 'DELAYED',
    })
    try {
      const target = users.find(u => u.name === to && u.active)
      if (target) {
        await notifyQuiet({
          user_id: target.id,
          type: 'lead_assigned',
          title: `Re-warm (auto): ${lead.full_name || lead.phone}`,
          body: `Stalled ${AUTOBOUNCE_DAYS}d+ on ${from} — bounced to you`,
          ref_phone: lead.phone,
          ref_lead_row: lead.row_number,
        })
      }
    } catch { /* non-critical */ }

    result.bounced++
    result.details.push({ lead_row: lead.row_number, from, to })
  }

  return result
}

// ─── Owner cockpit ───────────────────────────────────────────────────

export interface OwnerAgentRow {
  name: string
  role: AgentRole
  work_mode: string
  in_work_mode_today: boolean
  cleared_today: number
  queue_depth: number
  stalled_hot: number
  untouched: number
  last_action_at: string | null
}

export interface OwnerPanel {
  agents: OwnerAgentRow[]
  pipeline: {
    qualified_handoffs_today: number
    rewarm_bounces_today: number
    wins_today: number
  }
}

/**
 * Per-agent live work panel for the owner cockpit + cross-stage pipeline
 * counters, all fed from the same work_events log + the shared leads data.
 */
export async function getOwnerPanel(): Promise<OwnerPanel> {
  const now = Date.now()
  const sinceToday = startOfTodayIso()
  const [users, allLeads] = await Promise.all([getUsers(), getLeads()])
  const [clearedByUser, lastActionByUser] = await Promise.all([
    getWorkEventCountsSince(sinceToday),
    getLastWorkEventAtByUser(sinceToday),
  ])

  const lastMsgByPhone = await getLastMessageByPhone()
  const activeLeads = allLeads.filter(l => !ACTIVE_EXCLUDED.has(l.lead_status))

  // Per-agent stalled-HOT + untouched counts.
  const stalledByName = new Map<string, number>()
  const untouchedByName = new Map<string, number>()
  for (const l of activeLeads) {
    if (!l.assigned_to) continue
    const lastMsg = lastMsgByPhone.get(last10(l.phone))
    const everContacted = !!lastMsg || !!l.first_call_date || l.attempted_contact === 'Yes'
    if (!everContacted) {
      untouchedByName.set(l.assigned_to, (untouchedByName.get(l.assigned_to) || 0) + 1)
    }
    const isHot = l.lead_status === 'HOT' || l.lead_priority === 'HOT'
    if (isHot) {
      const lastTouch = lastMsg?.timestamp || l.first_call_date || ''
      if (ageDaysOf(lastTouch, now) >= STALLED_DAYS) {
        stalledByName.set(l.assigned_to, (stalledByName.get(l.assigned_to) || 0) + 1)
      }
    }
  }

  const agents: OwnerAgentRow[] = []
  for (const u of users.filter(u => u.active)) {
    const role = effectiveRole(u)
    const { queue_depth } = await getWorkQueue(
      { name: u.name, agent_role: u.agent_role, is_telecaller: u.is_telecaller, daily_target: u.daily_target },
      { limit: 1, countOnly: true },
    )
    agents.push({
      name: u.name,
      role,
      work_mode: u.work_mode,
      in_work_mode_today: (clearedByUser.get(u.id) || 0) > 0,
      cleared_today: clearedByUser.get(u.id) || 0,
      queue_depth,
      stalled_hot: stalledByName.get(u.name) || 0,
      untouched: untouchedByName.get(u.name) || 0,
      last_action_at: lastActionByUser.get(u.id) || null,
    })
  }

  // Pipeline counters today, from work_events. work_events.created_at is SQLite
  // datetime('now') (space-separated 'YYYY-MM-DD HH:MM:SS'), so the >= text
  // comparison must use the matching space-separated start-of-day string.
  const sinceIso = startOfTodayIso()
  let qualified = 0, rewarm = 0, wins = 0
  // Read all of today's events via per-user pulls (small N of agents).
  for (const u of users) {
    const evs = await getWorkEventsForUserSince(u.id, sinceIso)
    for (const e of evs) {
      if (e.action === 'interested') qualified++
      else if (e.action === 'going_cold' || e.action === 'auto_bounce') rewarm++
      else if (e.action === 'won') wins++
    }
  }
  // System auto-bounce events (user_id 'system-cron') aren't tied to a real user.
  const sysEvents = await getWorkEventsForUserSince('system-cron', sinceIso)
  for (const e of sysEvents) if (e.action === 'auto_bounce') rewarm++

  return {
    agents,
    pipeline: { qualified_handoffs_today: qualified, rewarm_bounces_today: rewarm, wins_today: wins },
  }
}
