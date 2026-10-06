/**
 * Gamification — the points formula, streak and badge rules.
 *
 * PURE module (no DB, no Node APIs) so the client can import the badge catalog
 * and award labels too. The server engine (./engine.ts) feeds it rows from
 * tables the hub already writes — nothing here changes how agents work:
 *
 *   call_logs / work_events(channel='call')  → calls
 *   lead_status_changes (source manual|work) → moved forward / HOT / CONVERTED
 *   lead_edits (field next_followup)         → follow-up handled on its due day
 *
 * All day boundaries are IST (UTC+5:30, no DST), matching the rest of the app.
 */

import {
  POINTS,
  MAX_CALL_POINTS_PER_LEAD_PER_DAY,
  MARATHON_CALLS,
  HOT_STREAK_LEADS,
  EARLY_BIRD_FROM_MIN,
  EARLY_BIRD_BEFORE_MIN,
} from './config'

// ─── IST time helpers ───────────────────────────────────────────────────

export const IST_OFFSET_MIN = 330
const DAY_MS = 86_400_000

/**
 * Parse a DB timestamp → epoch ms. SQLite's datetime('now') writes
 * 'YYYY-MM-DD HH:MM:SS' in UTC with no zone marker; ISO strings pass through.
 * Returns NaN for garbage.
 */
export function parseDbTime(ts: string | null | undefined): number {
  if (!ts) return NaN
  let s = String(ts).trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = s.replace(' ', 'T') + 'Z'
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00Z'
  return Date.parse(s)
}

/** IST calendar day (YYYY-MM-DD) for an epoch ms. */
export function istDayOfMs(ms: number): string {
  return new Date(ms + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10)
}

/** Minutes since IST midnight for an epoch ms. */
export function istMinutesOfMs(ms: number): number {
  const d = new Date(ms + IST_OFFSET_MIN * 60_000)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

/** Shift an IST day key by n calendar days. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(day + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday for an IST day key. */
export function weekdayOf(day: string): number {
  return new Date(day + 'T00:00:00Z').getUTCDay()
}

/** Working days are Monday–Saturday. Sunday neither builds nor breaks a streak. */
export function isWorkingDay(day: string): boolean {
  return weekdayOf(day) !== 0
}

/** Monday (IST) of the week that contains `day`. Leaderboards reset Monday. */
export function weekStartOf(day: string): string {
  const wd = weekdayOf(day)
  return addDays(day, wd === 0 ? -6 : 1 - wd)
}

/**
 * IST midnight of `day` expressed as a UTC 'YYYY-MM-DD HH:MM:SS' string — the
 * exact format datetime('now') stores, so `created_at >= ?` compares correctly
 * (an ISO 'T' bound would sort AFTER same-day space-separated rows).
 */
export function utcBoundForIstDay(day: string): string {
  const ms = Date.parse(day + 'T00:00:00Z') - IST_OFFSET_MIN * 60_000
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

// ─── Stage awards ───────────────────────────────────────────────────────

/** Funnel position. Parked stages (No Response / Delayed) sit level with Auto-Messaged. */
const FUNNEL_RANK: Record<string, number> = {
  NEW: 0,
  DECK_SENT: 1,
  NO_RESPONSE: 1,
  DELAYED: 1,
  REPLIED: 2,
  CALL_DONE_INTERESTED: 3,
  HOT: 4,
  FINAL_NEGOTIATION: 5,
  CONVERTED: 6,
}

/** Stages that earn the plain "moved forward" points (HOT/CONVERTED have their own). */
const FORWARD_TARGETS = new Set(['DECK_SENT', 'REPLIED', 'CALL_DONE_INTERESTED', 'FINAL_NEGOTIATION'])

export type AwardKind = 'call' | 'forward' | 'hot' | 'converted' | 'followup'

export interface Award {
  kind: AwardKind
  points: number
  label: string
}

export const CALL_AWARD: Award = { kind: 'call', points: POINTS.CALL, label: 'Call logged' }
export const FOLLOWUP_AWARD: Award = { kind: 'followup', points: POINTS.FOLLOWUP_ON_TIME, label: 'Follow-up done on time' }

/**
 * Points for one status transition. Only forward moves score; a backward or
 * sideways move (e.g. HOT → Replied, anything → Lost) scores nothing.
 * HOT and CONVERTED replace the +5 rather than stacking on it.
 * Unknown / Lost / Archived "from" stages count as the start of the funnel,
 * so reviving a lost lead is rewarded like any other forward move.
 */
export function statusAward(oldStatus: string | null | undefined, newStatus: string | null | undefined): Award | null {
  const from = String(oldStatus || '').toUpperCase()
  const to = String(newStatus || '').toUpperCase()
  if (!to || from === to) return null
  if (to === 'CONVERTED') return { kind: 'converted', points: POINTS.CONVERTED, label: 'Sale closed!' }
  const toRank = FUNNEL_RANK[to]
  if (toRank === undefined) return null
  const fromRank = FUNNEL_RANK[from] ?? 0
  if (toRank <= fromRank) return null
  if (to === 'HOT') return { kind: 'hot', points: POINTS.HOT, label: 'Lead is HOT' }
  if (FORWARD_TARGETS.has(to)) return { kind: 'forward', points: POINTS.MOVED_FORWARD, label: 'Lead moved forward' }
  return null
}

/**
 * A follow-up counts as "done on time" when its date was edited ON the day it
 * was due (the old value = today, IST). Rescheduling an overdue follow-up, or
 * pushing a future one, earns nothing — so the points can't be farmed by
 * shuffling dates around.
 */
export function followupOnTime(oldValue: string | null | undefined, editedAtMs: number): boolean {
  const due = String(oldValue || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(editedAtMs)) return false
  return due === istDayOfMs(editedAtMs)
}

// ─── Daily tally ────────────────────────────────────────────────────────

/** Calls grouped by (IST day, lead) — the SQL does the grouping. */
export interface CallCount {
  day: string
  /** Lead identity: 'p:<phone>' for call_logs, 'r:<row>' for rail calls. */
  key: string
  count: number
}

export interface StatusRow {
  at: string
  leadRow: number
  oldStatus: string
  newStatus: string
}

export interface FollowupRow {
  at: string
  leadRow: number
  oldValue: string
}

export interface DayTally {
  day: string
  points: number
  calls: number
  moved: number
  hot: number
  converted: number
  followups: number
}

export function emptyTally(day: string): DayTally {
  return { day, points: 0, calls: 0, moved: 0, hot: 0, converted: 0, followups: 0 }
}

/**
 * Turn raw activity into per-day points.
 *  - Calls: every call is counted, but only the first 3 per lead per day score.
 *  - Stage moves: each (lead, new stage) scores once per day — flipping a lead
 *    HOT → Final → HOT can't farm points.
 *  - Follow-ups: once per lead per day, only when handled on the due day.
 */
export function tallyByDay(input: { calls: CallCount[]; statuses: StatusRow[]; followups: FollowupRow[] }): Map<string, DayTally> {
  const out = new Map<string, DayTally>()
  const get = (day: string) => {
    let t = out.get(day)
    if (!t) { t = emptyTally(day); out.set(day, t) }
    return t
  }

  for (const c of input.calls) {
    const n = Math.max(0, Math.floor(Number(c.count) || 0))
    if (!c.day || n === 0) continue
    const t = get(c.day)
    t.calls += n
    t.points += Math.min(n, MAX_CALL_POINTS_PER_LEAD_PER_DAY) * POINTS.CALL
  }

  const seenMoves = new Set<string>()
  for (const s of input.statuses) {
    const ms = parseDbTime(s.at)
    if (!Number.isFinite(ms)) continue
    const award = statusAward(s.oldStatus, s.newStatus)
    if (!award) continue
    const day = istDayOfMs(ms)
    const key = `${day}|${s.leadRow}|${String(s.newStatus).toUpperCase()}`
    if (seenMoves.has(key)) continue
    seenMoves.add(key)
    const t = get(day)
    t.points += award.points
    if (award.kind === 'converted') t.converted++
    else if (award.kind === 'hot') t.hot++
    else t.moved++
  }

  const seenFollowups = new Set<string>()
  for (const f of input.followups) {
    const ms = parseDbTime(f.at)
    if (!followupOnTime(f.oldValue, ms)) continue
    const day = istDayOfMs(ms)
    const key = `${day}|${f.leadRow}`
    if (seenFollowups.has(key)) continue
    seenFollowups.add(key)
    const t = get(day)
    t.followups++
    t.points += POINTS.FOLLOWUP_ON_TIME
  }

  return out
}

// ─── Streaks ────────────────────────────────────────────────────────────

export interface StreakInfo {
  /** Consecutive working days (Mon–Sat) with ≥ 1 call, ending today or the last working day. */
  days: number
  /** A call is already logged today. */
  todayDone: boolean
  /** Today is a working day, no call yet, and there is a streak to lose. */
  atRisk: boolean
}

/**
 * Streak = consecutive working days (Mon–Sat, IST) with at least one call.
 * Today without a call yet does NOT break the streak (the day isn't over) —
 * it just flags it as at risk. Sundays are skipped entirely.
 */
export function computeStreak(callDays: Iterable<string>, today: string, maxLookback = 400): StreakInfo {
  const set = new Set(callDays)
  const todayDone = set.has(today)
  let cursor = today
  if (isWorkingDay(today) && !todayDone) cursor = addDays(today, -1)
  let days = 0
  for (let i = 0; i < maxLookback; i++) {
    if (!isWorkingDay(cursor)) { cursor = addDays(cursor, -1); continue }
    if (!set.has(cursor)) break
    days++
    cursor = addDays(cursor, -1)
  }
  return { days, todayDone, atRisk: isWorkingDay(today) && !todayDone && days > 0 }
}

/**
 * The first day (within [from, to]) on which a running streak reached each
 * target length — used as the "earned" date of the streak badges.
 */
export function streakMilestones(callDays: Iterable<string>, from: string, to: string, targets: number[]): Record<number, string | null> {
  const set = new Set(callDays)
  const out: Record<number, string | null> = {}
  for (const t of targets) out[t] = null
  let run = 0
  let cursor = from
  for (let guard = 0; cursor <= to && guard < 800; guard++) {
    if (isWorkingDay(cursor)) {
      if (set.has(cursor)) {
        run++
        for (const t of targets) if (run >= t && out[t] === null) out[t] = cursor
      } else {
        run = 0
      }
    }
    cursor = addDays(cursor, 1)
  }
  return out
}

// ─── Badges ─────────────────────────────────────────────────────────────

export type BadgeIcon = 'swords' | 'flame' | 'footprints' | 'sunrise' | 'comeback' | 'week' | 'crown'

export interface BadgeDef {
  id: string
  name: string
  /** One line, plain English — shown on the locked badge. */
  howTo: string
  icon: BadgeIcon
}

export const BADGES: readonly BadgeDef[] = [
  { id: 'first_blood', name: 'First Blood', howTo: 'Close your first sale — move a lead to Converted.', icon: 'swords' },
  { id: 'hot_streak', name: 'Hot Streak', howTo: `Make ${HOT_STREAK_LEADS} different leads HOT in one day.`, icon: 'flame' },
  { id: 'marathon', name: 'Marathon', howTo: `Log ${MARATHON_CALLS} calls in a single day.`, icon: 'footprints' },
  { id: 'early_bird', name: 'Early Bird', howTo: 'Log your first call of the day before 10:30 AM.', icon: 'sunrise' },
  { id: 'comeback', name: 'Comeback', howTo: 'Convert a lead that was once Delayed or No Response.', icon: 'comeback' },
  { id: 'streak_7', name: '7-Day Streak', howTo: 'Call at least once a day for 7 working days in a row.', icon: 'week' },
  { id: 'streak_30', name: '30-Day Streak', howTo: 'Keep your calling streak alive for 30 working days.', icon: 'crown' },
]

export const BADGE_BY_ID: Record<string, BadgeDef> = Object.fromEntries(BADGES.map(b => [b.id, b]))

export interface BadgeFacts {
  /** IST day of the first CONVERTED move by this agent (all time). */
  firstConversionDay: string | null
  /** IST day of the first conversion of a lead that was once DELAYED / NO_RESPONSE. */
  comebackDay: string | null
  /** Distinct leads moved to HOT, per IST day. */
  hotLeadsByDay: Record<string, number>
  /** Calls logged, per IST day. */
  callsByDay: Record<string, number>
  /** Earliest call time (minutes since IST midnight, ≥ 06:00 only) per day. */
  firstCallMinByDay: Record<string, number>
  /** First day the streak reached 7 / 30 working days. */
  streak7Day: string | null
  streak30Day: string | null
}

function firstDayWhere(map: Record<string, number>, test: (n: number) => boolean): string | null {
  let best: string | null = null
  for (const [day, n] of Object.entries(map)) {
    if (test(n) && (best === null || day < best)) best = day
  }
  return best
}

/** Which badges the facts prove, each with the IST day it was earned. */
export function evaluateBadges(f: BadgeFacts): Array<{ id: string; earnedAt: string }> {
  const earned: Array<{ id: string; earnedAt: string }> = []
  const push = (id: string, day: string | null) => { if (day) earned.push({ id, earnedAt: day }) }
  push('first_blood', f.firstConversionDay)
  push('hot_streak', firstDayWhere(f.hotLeadsByDay, n => n >= HOT_STREAK_LEADS))
  push('marathon', firstDayWhere(f.callsByDay, n => n >= MARATHON_CALLS))
  push('early_bird', firstDayWhere(f.firstCallMinByDay, m => m >= EARLY_BIRD_FROM_MIN && m < EARLY_BIRD_BEFORE_MIN))
  push('comeback', f.comebackDay)
  push('streak_7', f.streak7Day)
  push('streak_30', f.streak30Day)
  return earned
}

// ─── Leaderboard ────────────────────────────────────────────────────────

export interface LeaderInput {
  id: string
  name: string
  /** Points this week (Mon → now). */
  points: number
  /** Points this week up to the end of yesterday — for rank-movement arrows. */
  prevPoints: number
}

export interface LeaderRow {
  agent: string
  points: number
  rank: number
  /** + moved up, − moved down since yesterday, 0 = same / not comparable. */
  movement: number
  isMe: boolean
}

export interface Leaderboard {
  rows: LeaderRow[]
  myRank: number | null
  /** Points needed to pass the next person up (null if #1 or nobody above). */
  gapToNext: number | null
}

export function firstName(full: string): string {
  return String(full || '').trim().split(/\s+/)[0] || 'Agent'
}

/** First names only; a shared first name gets a last-name initial ("Amit S."). */
function displayNames(rows: LeaderInput[]): Map<string, string> {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const f = firstName(r.name).toLowerCase()
    counts.set(f, (counts.get(f) || 0) + 1)
  }
  const out = new Map<string, string>()
  for (const r of rows) {
    const parts = String(r.name || '').trim().split(/\s+/)
    const f = firstName(r.name)
    const dup = (counts.get(f.toLowerCase()) || 0) > 1 && parts.length > 1
    out.set(r.id, dup ? `${f} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : f)
  }
  return out
}

/** Standard competition ranking: ties share a rank (1, 1, 3). */
function rankOf(points: number, all: number[]): number {
  let higher = 0
  for (const p of all) if (p > points) higher++
  return higher + 1
}

/**
 * Friendly weekly board: the top `top` agents who have scored, plus "you".
 * Nobody below you is ever listed, and the bottom of the table is never shown.
 */
export function buildLeaderboard(input: LeaderInput[], meId: string, top = 5): Leaderboard {
  const names = displayNames(input)
  const pts = input.map(r => r.points)
  const prev = input.map(r => r.prevPoints)
  const comparable = prev.some(p => p > 0)
  const ranked = input
    .map(r => {
      const rank = rankOf(r.points, pts)
      const movement = comparable ? rankOf(r.prevPoints, prev) - rank : 0
      return { id: r.id, row: { agent: names.get(r.id) || 'Agent', points: r.points, rank, movement, isMe: r.id === meId } }
    })
    .sort((a, b) => b.row.points - a.row.points || a.row.agent.localeCompare(b.row.agent))

  const rows = ranked.filter(r => r.row.points > 0).slice(0, top).map(r => r.row)
  const me = ranked.find(r => r.id === meId)
  if (me && !rows.some(r => r.isMe)) rows.push(me.row)

  let gapToNext: number | null = null
  if (me) {
    const above = pts.filter(p => p > me.row.points)
    if (above.length) gapToNext = Math.min(...above) - me.row.points + 1
  }
  return { rows, myRank: me ? me.row.rank : null, gapToNext }
}
