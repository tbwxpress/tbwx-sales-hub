/**
 * Gamification — owner switches + tunables (client-safe: no server imports).
 *
 * OFF SWITCH (two ways, either one turns it off):
 *   1. Code:     set GAMIFICATION_LIVE = false below and redeploy.
 *   2. Runtime:  Agent Stats → "Points & badges" panel → switch off
 *                (writes settings key `gamification.enabled` = 'false').
 * When off, /api/gamification/me answers { enabled: false } and every
 * gamification component renders nothing — agents see the app exactly as before.
 */

export const GAMIFICATION_LIVE = true

/** Rows in the existing `settings` table (key → value). */
export const GAMIFICATION_SETTING_KEYS = {
  enabled: 'gamification.enabled',
  dailyGoal: 'gamification.daily_goal',
} as const

/** Points needed for a "goal hit" day unless the owner sets another number. */
export const DEFAULT_DAILY_GOAL = 60
export const MIN_DAILY_GOAL = 10
export const MAX_DAILY_GOAL = 1000

/** The points formula — every number comes from data the hub already records. */
export const POINTS = {
  /** A call logged (Log Call modal, or a call outcome on the work rail). */
  CALL: 2,
  /** A lead moved forward a stage (e.g. Auto-Messaged → Replied). */
  MOVED_FORWARD: 5,
  /** A lead moved to HOT (replaces the +5, not added to it). */
  HOT: 15,
  /** A lead moved to CONVERTED (replaces the +5). */
  CONVERTED: 100,
  /** A follow-up handled on the day it was due. */
  FOLLOWUP_ON_TIME: 3,
} as const

/** Anti-spam: only the first N calls to the same lead in a day earn points. */
export const MAX_CALL_POINTS_PER_LEAD_PER_DAY = 3

/** Server cache per agent + client polling interval (perf rule: ≤ once a minute). */
export const CACHE_TTL_MS = 60_000
export const CLIENT_POLL_MS = 60_000

/** How far back the streak + window-based badges look (30 working days ≈ 35 calendar days). */
export const BADGE_LOOKBACK_DAYS = 40

/** Badge thresholds. */
export const MARATHON_CALLS = 40
export const HOT_STREAK_LEADS = 3
/** Early Bird: first call of the day between 06:00 and 10:30 IST (minutes since midnight). */
export const EARLY_BIRD_FROM_MIN = 6 * 60
export const EARLY_BIRD_BEFORE_MIN = 10 * 60 + 30

/** Browser event any screen can fire after a successful lead change. */
export const HUB_LEAD_UPDATED_EVENT = 'hub:lead-updated'
