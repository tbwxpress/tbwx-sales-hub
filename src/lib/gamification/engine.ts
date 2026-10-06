/**
 * Gamification engine (SERVER ONLY) — reads existing tables, never writes to them.
 *
 * Performance contract (the SQLite client is synchronous and blocks the whole
 * server while a query runs):
 *   - every query is per-agent + date-bounded and hits an index, with a LIMIT;
 *   - nothing loops over the leads table;
 *   - each agent's numbers are computed at most once per minute (module Map
 *     cache, in-flight promises shared so a burst of requests runs ONE query set);
 *   - the leaderboard is computed at most once per minute for the whole team.
 *
 * Schema additions (created lazily, idempotent — see ensureSchema for why):
 *   - INDEX idx_call_logs_logged_by_date ON call_logs(logged_by, created_at)
 *   - TABLE gamification_badges(user_id, badge_id, earned_at)
 */

import { ensureInit, getSetting, setSetting } from '@/lib/db'
import { getUsers } from '@/lib/users'
import type { SessionUser, User } from '@/lib/types'
import {
  GAMIFICATION_LIVE,
  GAMIFICATION_SETTING_KEYS,
  DEFAULT_DAILY_GOAL,
  MIN_DAILY_GOAL,
  MAX_DAILY_GOAL,
  CACHE_TTL_MS,
  BADGE_LOOKBACK_DAYS,
  EARLY_BIRD_FROM_MIN,
} from './config'
import {
  BADGE_BY_ID,
  FOLLOWUP_AWARD,
  addDays,
  buildLeaderboard,
  computeStreak,
  emptyTally,
  evaluateBadges,
  followupOnTime,
  istDayOfMs,
  parseDbTime,
  statusAward,
  streakMilestones,
  tallyByDay,
  utcBoundForIstDay,
  weekStartOf,
  type Award,
  type CallCount,
  type DayTally,
  type FollowupRow,
  type LeaderInput,
  type LeaderRow,
  type StatusRow,
  type StreakInfo,
} from './points'

type Db = Awaited<ReturnType<typeof ensureInit>>
type DbRow = Record<string, unknown>

interface AgentRef {
  id: string
  name: string
}

// ─── Lazy schema ────────────────────────────────────────────────────────

let schemaReady: Promise<void> | null = null

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = await ensureInit()
      // WHY this index: per-agent call counts filter call_logs by logged_by +
      // created_at. db.ts only indexes call_logs(phone), so without it every
      // gamification read would scan the whole call log — the blocking pattern
      // behind the production incident. Idempotent; built once per process.
      await db.execute('CREATE INDEX IF NOT EXISTS idx_call_logs_logged_by_date ON call_logs(logged_by, created_at)')
      // WHY this table: window-based badges (Marathon, Early Bird, streaks…)
      // are evaluated over the last ~40 days; once earned they must stay earned
      // after the window moves on. One row per (agent, badge), written once.
      await db.execute(`
        CREATE TABLE IF NOT EXISTS gamification_badges (
          user_id TEXT NOT NULL,
          badge_id TEXT NOT NULL,
          earned_at TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          PRIMARY KEY (user_id, badge_id)
        )
      `)
    })().catch(err => {
      schemaReady = null
      throw err
    })
  }
  return schemaReady
}

// ─── Tiny TTL cache (shares in-flight promises) ─────────────────────────

interface CacheEntry {
  at: number
  value: Promise<unknown>
}

const cache = new Map<string, CacheEntry>()

function cached<T>(key: string, fn: () => Promise<T>, ttl = CACHE_TTL_MS): { value: Promise<T>; at: number } {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && now - hit.at < ttl) return hit as { value: Promise<T>; at: number }
  if (cache.size > 500) {
    for (const [k, e] of cache) if (now - e.at > ttl) cache.delete(k)
  }
  const entry: CacheEntry = { at: now, value: fn() }
  cache.set(key, entry)
  // Never cache a failure — the next request retries.
  entry.value.catch(() => { if (cache.get(key) === entry) cache.delete(key) })
  return entry as { value: Promise<T>; at: number }
}

// ─── Owner config ───────────────────────────────────────────────────────

export interface GamificationConfig {
  enabled: boolean
  dailyGoal: number
}

export function clampGoal(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return DEFAULT_DAILY_GOAL
  return Math.min(MAX_DAILY_GOAL, Math.max(MIN_DAILY_GOAL, v))
}

export function getGamificationConfig(): Promise<GamificationConfig> {
  return cached('config', async () => {
    if (!GAMIFICATION_LIVE) return { enabled: false, dailyGoal: DEFAULT_DAILY_GOAL }
    const [enabled, goal] = await Promise.all([
      getSetting(GAMIFICATION_SETTING_KEYS.enabled).catch(() => null),
      getSetting(GAMIFICATION_SETTING_KEYS.dailyGoal).catch(() => null),
    ])
    return {
      enabled: enabled !== 'false', // absent = on
      dailyGoal: goal ? clampGoal(goal) : DEFAULT_DAILY_GOAL,
    }
  }).value
}

export async function updateGamificationConfig(patch: { enabled?: boolean; dailyGoal?: number }): Promise<GamificationConfig> {
  if (typeof patch.enabled === 'boolean') await setSetting(GAMIFICATION_SETTING_KEYS.enabled, String(patch.enabled))
  if (patch.dailyGoal !== undefined) await setSetting(GAMIFICATION_SETTING_KEYS.dailyGoal, String(clampGoal(patch.dailyGoal)))
  cache.delete('config')
  return getGamificationConfig()
}

// ─── Per-agent week tally (4 indexed queries) ───────────────────────────

const IST_DAY_SQL = `substr(datetime(created_at, '+330 minutes'), 1, 10)`
const IST_HM_SQL = `substr(datetime(created_at, '+330 minutes'), 12, 5)`

export interface WeekTally {
  today: DayTally
  weekPoints: number
  /** Week points up to the end of yesterday (for rank movement). */
  prevPoints: number
}

async function loadWeek(db: Db, agent: AgentRef, today: string): Promise<WeekTally> {
  const since = utcBoundForIstDay(weekStartOf(today))
  const [callLogs, railCalls, moves, edits] = await Promise.all([
    // idx_call_logs_logged_by_date
    db.execute({
      sql: `SELECT ${IST_DAY_SQL} AS d, phone AS k, COUNT(*) AS n
            FROM call_logs WHERE logged_by = ? AND created_at >= ?
            GROUP BY d, k LIMIT 5000`,
      args: [agent.name, since],
    }),
    // idx_work_events_user_date
    db.execute({
      sql: `SELECT ${IST_DAY_SQL} AS d, lead_row AS k, COUNT(*) AS n
            FROM work_events WHERE user_id = ? AND channel = 'call' AND created_at >= ?
            GROUP BY d, k LIMIT 5000`,
      args: [agent.id, since],
    }),
    // idx_lsc_changed_by_date
    db.execute({
      sql: `SELECT lead_row, old_status, new_status, created_at
            FROM lead_status_changes
            WHERE changed_by = ? AND source IN ('manual', 'work') AND created_at >= ?
            ORDER BY created_at ASC LIMIT 3000`,
      args: [agent.name, since],
    }),
    // idx_lead_edits_changed_by_date
    db.execute({
      sql: `SELECT lead_row, old_value, created_at
            FROM lead_edits
            WHERE changed_by = ? AND field_name = 'next_followup' AND created_at >= ?
            ORDER BY created_at ASC LIMIT 3000`,
      args: [agent.name, since],
    }),
  ])

  const calls: CallCount[] = [
    ...callLogs.rows.map((r: DbRow) => ({ day: String(r.d || ''), key: `p:${String(r.k || '')}`, count: Number(r.n) || 0 })),
    ...railCalls.rows.map((r: DbRow) => ({ day: String(r.d || ''), key: `r:${String(r.k ?? '')}`, count: Number(r.n) || 0 })),
  ]
  const statuses: StatusRow[] = moves.rows.map((r: DbRow) => ({
    at: String(r.created_at || ''),
    leadRow: Number(r.lead_row) || 0,
    oldStatus: String(r.old_status || ''),
    newStatus: String(r.new_status || ''),
  }))
  const followups: FollowupRow[] = edits.rows.map((r: DbRow) => ({
    at: String(r.created_at || ''),
    leadRow: Number(r.lead_row) || 0,
    oldValue: String(r.old_value || ''),
  }))

  const byDay = tallyByDay({ calls, statuses, followups })
  let weekPoints = 0
  for (const t of byDay.values()) weekPoints += t.points
  const todayTally = byDay.get(today) || emptyTally(today)
  return { today: todayTally, weekPoints, prevPoints: weekPoints - todayTally.points }
}

function weekEntry(agent: AgentRef, today: string): { value: Promise<WeekTally>; at: number } {
  return cached(`week:${agent.id}:${today}`, async () => {
    await ensureSchema()
    return loadWeek(await ensureInit(), agent, today)
  })
}

function getWeek(agent: AgentRef, today: string): Promise<WeekTally> {
  return weekEntry(agent, today).value
}

// ─── Per-agent streak + badges ──────────────────────────────────────────

export interface EarnedBadge {
  id: string
  name: string
  earnedAt: string
}

export interface AgentExtras {
  streak: StreakInfo
  badges: EarnedBadge[]
}

async function loadExtras(db: Db, agent: AgentRef, today: string): Promise<AgentExtras> {
  const lookStart = addDays(today, -BADGE_LOOKBACK_DAYS)
  const since = utcBoundForIstDay(lookStart)
  const firstCallSql = `MIN(CASE WHEN ${IST_HM_SQL} >= '06:00' THEN ${IST_HM_SQL} END)`

  const stored = await db.execute({
    sql: 'SELECT badge_id, earned_at FROM gamification_badges WHERE user_id = ?',
    args: [agent.id],
  })
  const have = new Map<string, string>()
  for (const r of stored.rows as DbRow[]) have.set(String(r.badge_id), String(r.earned_at))

  const [callDaysRes, railDaysRes, hotRes] = await Promise.all([
    db.execute({
      sql: `SELECT ${IST_DAY_SQL} AS d, COUNT(*) AS n, ${firstCallSql} AS first_hm
            FROM call_logs WHERE logged_by = ? AND created_at >= ? GROUP BY d LIMIT 400`,
      args: [agent.name, since],
    }),
    db.execute({
      sql: `SELECT ${IST_DAY_SQL} AS d, COUNT(*) AS n, ${firstCallSql} AS first_hm
            FROM work_events WHERE user_id = ? AND channel = 'call' AND created_at >= ? GROUP BY d LIMIT 400`,
      args: [agent.id, since],
    }),
    have.has('hot_streak')
      ? Promise.resolve(null)
      : db.execute({
          sql: `SELECT ${IST_DAY_SQL} AS d, COUNT(DISTINCT lead_row) AS n
                FROM lead_status_changes
                WHERE changed_by = ? AND source IN ('manual', 'work') AND new_status = 'HOT' AND created_at >= ?
                GROUP BY d LIMIT 400`,
          args: [agent.name, since],
        }),
  ])

  const callsByDay: Record<string, number> = {}
  const firstCallMinByDay: Record<string, number> = {}
  for (const r of [...callDaysRes.rows, ...railDaysRes.rows] as DbRow[]) {
    const d = String(r.d || '')
    if (!d) continue
    callsByDay[d] = (callsByDay[d] || 0) + (Number(r.n) || 0)
    const hm = r.first_hm == null ? '' : String(r.first_hm)
    if (/^\d{2}:\d{2}$/.test(hm)) {
      const min = Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5))
      if (min >= EARLY_BIRD_FROM_MIN && (firstCallMinByDay[d] === undefined || min < firstCallMinByDay[d])) firstCallMinByDay[d] = min
    }
  }
  const callDays = Object.keys(callsByDay).filter(d => callsByDay[d] > 0)
  const streak = computeStreak(callDays, today)
  const milestones = streakMilestones(callDays, lookStart, today, [7, 30])

  const hotLeadsByDay: Record<string, number> = {}
  for (const r of (hotRes?.rows || []) as DbRow[]) hotLeadsByDay[String(r.d || '')] = Number(r.n) || 0

  // All-time lookups only until earned — after that they're never run again.
  let firstConversionDay: string | null = null
  if (!have.has('first_blood')) {
    const r = await db.execute({
      sql: `SELECT created_at FROM lead_status_changes
            WHERE changed_by = ? AND source IN ('manual', 'work') AND new_status = 'CONVERTED'
            ORDER BY created_at ASC LIMIT 1`,
      args: [agent.name],
    })
    const ms = parseDbTime(String((r.rows[0] as DbRow | undefined)?.created_at || ''))
    if (Number.isFinite(ms)) firstConversionDay = istDayOfMs(ms)
  }
  let comebackDay: string | null = null
  if (!have.has('comeback')) {
    const r = await db.execute({
      sql: `SELECT c.created_at FROM lead_status_changes c
            WHERE c.changed_by = ? AND c.source IN ('manual', 'work') AND c.new_status = 'CONVERTED'
              AND (c.old_status IN ('DELAYED', 'NO_RESPONSE') OR EXISTS (
                SELECT 1 FROM lead_status_changes p
                WHERE p.lead_row = c.lead_row AND p.new_status IN ('DELAYED', 'NO_RESPONSE') AND p.created_at < c.created_at
              ))
            ORDER BY c.created_at ASC LIMIT 1`,
      args: [agent.name],
    })
    const ms = parseDbTime(String((r.rows[0] as DbRow | undefined)?.created_at || ''))
    if (Number.isFinite(ms)) comebackDay = istDayOfMs(ms)
  }

  const computed = evaluateBadges({
    firstConversionDay,
    comebackDay,
    hotLeadsByDay,
    callsByDay,
    firstCallMinByDay,
    streak7Day: milestones[7],
    streak30Day: milestones[30],
  })

  // Persist first-time earns (rare write: at most once per agent per badge).
  const fresh = computed.filter(b => !have.has(b.id))
  for (const b of fresh) {
    try {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO gamification_badges (user_id, badge_id, earned_at) VALUES (?, ?, ?)',
        args: [agent.id, b.id, b.earnedAt],
      })
      have.set(b.id, b.earnedAt)
    } catch (err) {
      console.error('[gamification] badge persist non-critical:', err)
    }
  }
  for (const b of computed) if (!have.has(b.id)) have.set(b.id, b.earnedAt)

  const badges: EarnedBadge[] = [...have.entries()]
    .filter(([id]) => BADGE_BY_ID[id])
    .map(([id, earnedAt]) => ({ id, name: BADGE_BY_ID[id].name, earnedAt }))
    .sort((a, b) => a.earnedAt.localeCompare(b.earnedAt))

  return { streak, badges }
}

function getExtras(agent: AgentRef, today: string): Promise<AgentExtras> {
  return cached(`extras:${agent.id}:${today}`, async () => {
    await ensureSchema()
    return loadExtras(await ensureInit(), agent, today)
  }).value
}

// ─── Team leaderboard (once a minute for everyone) ──────────────────────

function isBoardAgent(u: User): boolean {
  return u.active && u.role !== 'admin'
}

function agentRoleLabel(u: User): 'telecaller' | 'closer' {
  if (u.agent_role === 'telecaller' || u.agent_role === 'closer') return u.agent_role
  return u.is_telecaller ? 'telecaller' : 'closer'
}

function getTeamWeek(today: string): Promise<Array<LeaderInput & { user: User; tally: WeekTally }>> {
  return cached(`team:${today}`, async () => {
    const users = (await getUsers()).filter(isBoardAgent)
    const out: Array<LeaderInput & { user: User; tally: WeekTally }> = []
    // Sequential on purpose: the client is synchronous anyway, and this keeps
    // each agent's 4 indexed queries short and back-to-back.
    for (const u of users) {
      const tally = await getWeek({ id: u.id, name: u.name }, today)
      out.push({ id: u.id, name: u.name, points: tally.weekPoints, prevPoints: tally.prevPoints, user: u, tally })
    }
    return out
  }).value
}

// ─── Public API ─────────────────────────────────────────────────────────

export interface MePayload {
  enabled: boolean
  role?: 'agent' | 'admin'
  name?: string
  today?: {
    points: number
    goal: number
    calls: number
    moved: number
    hot: number
    converted: number
    followups: number
  }
  week?: { points: number; rank: number | null; gapToNext: number | null }
  streak?: number
  streakInfo?: StreakInfo
  badges?: EarnedBadge[]
  leaderboard?: LeaderRow[]
  /** How old the cached numbers are (ms) — the client uses it to merge optimistic points. */
  ageMs?: number
}

export async function getMe(user: SessionUser): Promise<MePayload> {
  const cfg = await getGamificationConfig()
  if (!cfg.enabled) return { enabled: false }
  // The owner sees the overview, not a personal scorecard.
  if (user.role === 'admin') return { enabled: true, role: 'admin', name: user.name }

  const now = Date.now()
  const today = istDayOfMs(now)
  const agent = { id: user.id, name: user.name }
  const mine = weekEntry(agent, today)
  const [week, extras, team] = await Promise.all([mine.value, getExtras(agent, today), getTeamWeek(today)])

  // An inactive / brand-new agent is not on the team list yet — include them anyway.
  const inputs: LeaderInput[] = team.map(t => ({ id: t.id, name: t.name, points: t.points, prevPoints: t.prevPoints }))
  if (!inputs.some(i => i.id === agent.id)) inputs.push({ id: agent.id, name: agent.name, points: week.weekPoints, prevPoints: week.prevPoints })
  const board = buildLeaderboard(inputs, agent.id, 5)

  return {
    enabled: true,
    role: 'agent',
    name: user.name,
    today: {
      points: week.today.points,
      goal: cfg.dailyGoal,
      calls: week.today.calls,
      moved: week.today.moved,
      hot: week.today.hot,
      converted: week.today.converted,
      followups: week.today.followups,
    },
    week: { points: week.weekPoints, rank: board.myRank, gapToNext: board.gapToNext },
    streak: extras.streak.days,
    streakInfo: extras.streak,
    badges: extras.badges,
    leaderboard: board.rows,
    ageMs: Math.max(0, now - mine.at),
  }
}

export interface OverviewRow {
  id: string
  name: string
  role: 'telecaller' | 'closer'
  todayPoints: number
  weekPoints: number
  goalHit: boolean
  calls: number
  moved: number
  hot: number
  converted: number
  followups: number
  streak: number
  streakAtRisk: boolean
  badges: number
}

export async function getOverview(): Promise<{ config: GamificationConfig; rows: OverviewRow[] }> {
  const config = await getGamificationConfig()
  const today = istDayOfMs(Date.now())
  const team = await getTeamWeek(today)
  const rows: OverviewRow[] = []
  for (const t of team) {
    const extras = await getExtras({ id: t.id, name: t.name }, today)
    rows.push({
      id: t.id,
      name: t.name,
      role: agentRoleLabel(t.user),
      todayPoints: t.tally.today.points,
      weekPoints: t.tally.weekPoints,
      goalHit: t.tally.today.points >= config.dailyGoal,
      calls: t.tally.today.calls,
      moved: t.tally.today.moved,
      hot: t.tally.today.hot,
      converted: t.tally.today.converted,
      followups: t.tally.today.followups,
      streak: extras.streak.days,
      streakAtRisk: extras.streak.atRisk,
      badges: extras.badges.length,
    })
  }
  rows.sort((a, b) => b.weekPoints - a.weekPoints || a.name.localeCompare(b.name))
  return { config, rows }
}

// ─── Instant feedback for one action (the floating "+5" chip) ───────────

// The chip lookup fires within a second of the change — anything older than
// this belongs to an earlier action and must not be shown again.
const RECENT_MS = 30_000
const actionHits = new Map<string, number[]>()

/** ≤ 30 lookups per agent per minute — a lookup is 2 tiny per-lead index reads. */
function allowAction(userId: string): boolean {
  const now = Date.now()
  const hits = (actionHits.get(userId) || []).filter(t => now - t < 60_000)
  if (hits.length >= 30) { actionHits.set(userId, hits); return false }
  hits.push(now)
  actionHits.set(userId, hits)
  if (actionHits.size > 500) actionHits.clear()
  return true
}

/**
 * Points earned by the user's most recent change to ONE lead (status move
 * and/or follow-up date), read back from the audit rows the change just wrote.
 * Both reads hit per-lead indexes (idx_lsc_lead, idx_lead_edits_row).
 * Mirrors tallyByDay's once-per-day dedupe so the chip never over-promises.
 */
export async function getLastActionAwards(user: SessionUser, leadRow: number, kinds: { status: boolean; followup: boolean }): Promise<Award[]> {
  const cfg = await getGamificationConfig()
  if (!cfg.enabled || user.role === 'admin' || !allowAction(user.id)) return []
  await ensureSchema()
  const db = await ensureInit()
  const now = Date.now()
  const today = istDayOfMs(now)
  const todayStart = utcBoundForIstDay(today)
  const awards: Award[] = []

  if (kinds.status) {
    const r = await db.execute({
      sql: `SELECT old_status, new_status, created_at FROM lead_status_changes
            WHERE lead_row = ? AND changed_by = ? AND source IN ('manual', 'work')
            ORDER BY id DESC LIMIT 1`,
      args: [leadRow, user.name],
    })
    const row = r.rows[0] as DbRow | undefined
    const at = parseDbTime(String(row?.created_at || ''))
    if (row && Number.isFinite(at) && now - at < RECENT_MS && istDayOfMs(at) === today) {
      const award = statusAward(String(row.old_status || ''), String(row.new_status || ''))
      if (award) {
        const dup = await db.execute({
          sql: `SELECT COUNT(*) AS n FROM lead_status_changes
                WHERE lead_row = ? AND changed_by = ? AND new_status = ? AND source IN ('manual', 'work') AND created_at >= ?`,
          args: [leadRow, user.name, String(row.new_status || ''), todayStart],
        })
        if (Number((dup.rows[0] as DbRow | undefined)?.n ?? 0) <= 1) awards.push(award)
      }
    }
  }

  if (kinds.followup) {
    const r = await db.execute({
      sql: `SELECT old_value, created_at FROM lead_edits
            WHERE lead_row = ? AND changed_by = ? AND field_name = 'next_followup'
            ORDER BY id DESC LIMIT 1`,
      args: [leadRow, user.name],
    })
    const row = r.rows[0] as DbRow | undefined
    const at = parseDbTime(String(row?.created_at || ''))
    if (row && Number.isFinite(at) && now - at < RECENT_MS && followupOnTime(String(row.old_value || ''), at)) {
      const dup = await db.execute({
        sql: `SELECT COUNT(*) AS n FROM lead_edits
              WHERE lead_row = ? AND changed_by = ? AND field_name = 'next_followup'
                AND substr(old_value, 1, 10) = ? AND created_at >= ?`,
        args: [leadRow, user.name, today, todayStart],
      })
      if (Number((dup.rows[0] as DbRow | undefined)?.n ?? 0) <= 1) awards.push(FOLLOWUP_AWARD)
    }
  }

  return awards
}
