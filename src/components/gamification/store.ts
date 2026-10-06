'use client'

/**
 * Client store for /api/gamification/me — one shared copy for every widget.
 *
 *  - Polls at most once a minute, only while a widget that asked for polling
 *    is mounted AND the tab is visible (perf rule from the 7 Oct incident).
 *  - Optimistic layer: an action shows its points instantly (the server cache
 *    is up to 60s old). Pending awards are dropped once a server snapshot that
 *    was computed AFTER them arrives, so nothing is ever double-counted.
 */

import { useEffect, useSyncExternalStore } from 'react'
import { CLIENT_POLL_MS } from '@/lib/gamification/config'
import type { Award, AwardKind, StreakInfo } from '@/lib/gamification/points'

export interface LeaderRowDTO {
  agent: string
  points: number
  rank: number
  movement: number
  isMe: boolean
}

export interface BadgeDTO {
  id: string
  name: string
  earnedAt: string
}

export interface TodayDTO {
  points: number
  goal: number
  calls: number
  moved: number
  hot: number
  converted: number
  followups: number
}

export interface MeData {
  enabled: boolean
  role?: 'agent' | 'admin'
  name?: string
  today?: TodayDTO
  week?: { points: number; rank: number | null; gapToNext: number | null }
  streak?: number
  streakInfo?: StreakInfo
  badges?: BadgeDTO[]
  leaderboard?: LeaderRowDTO[]
  ageMs?: number
}

interface Pending {
  kind: AwardKind
  points: number
  at: number
}

export interface GamificationState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Server data with optimistic awards folded in — what widgets render. */
  view: MeData | null
}

const INITIAL: GamificationState = { status: 'idle', view: null }
const PENDING_MAX_AGE_MS = 3 * 60_000
const MIN_REFETCH_MS = 55_000

let state: GamificationState = INITIAL
let server: MeData | null = null
let serverComputedAt = 0
let pending: Pending[] = []
let lastFetchAt = 0
let inflight: Promise<MeData | null> | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

const getSnapshot = () => state
const getServerSnapshot = () => INITIAL

function fold(): MeData | null {
  if (!server || !server.enabled || !server.today) return server
  const now = Date.now()
  pending = pending.filter(p => p.at > serverComputedAt && now - p.at < PENDING_MAX_AGE_MS)
  if (pending.length === 0) return server
  const today = { ...server.today }
  let extra = 0
  let calls = 0
  for (const p of pending) {
    extra += p.points
    if (p.kind === 'call') { today.calls++; calls++ }
    else if (p.kind === 'forward') today.moved++
    else if (p.kind === 'hot') today.hot++
    else if (p.kind === 'converted') today.converted++
    else if (p.kind === 'followup') today.followups++
  }
  today.points += extra
  let streakInfo = server.streakInfo
  let streak = server.streak
  if (calls > 0 && streakInfo && !streakInfo.todayDone) {
    // First call of the day keeps / starts the streak right away.
    const workingDay = new Date(now + 330 * 60_000).getUTCDay() !== 0
    streakInfo = { days: streakInfo.days + (workingDay ? 1 : 0), todayDone: true, atRisk: false }
    streak = streakInfo.days
  }
  return {
    ...server,
    today,
    streak,
    streakInfo,
    week: server.week ? { ...server.week, points: server.week.points + extra } : server.week,
  }
}

function publish(status: GamificationState['status']) {
  state = { status, view: fold() }
  emit()
}

/** Fetch /me unless a fresh copy (< 55s) is already here. */
export function refreshMe(force = false): Promise<MeData | null> {
  if (inflight) return inflight
  if (!force && server && Date.now() - lastFetchAt < MIN_REFETCH_MS) return Promise.resolve(server)
  if (!force && !server && lastFetchAt && Date.now() - lastFetchAt < MIN_REFETCH_MS) return Promise.resolve(null)
  lastFetchAt = Date.now()
  if (!server) publish('loading')
  inflight = fetch('/api/gamification/me', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then((json: { success?: boolean; data?: MeData } | null) => {
      if (json?.success && json.data) {
        server = json.data
        serverComputedAt = Date.now() - Math.max(0, Number(json.data.ageMs) || 0)
        publish('ready')
      } else {
        publish(server ? 'ready' : 'error')
      }
      return server
    })
    .catch(() => {
      publish(server ? 'ready' : 'error')
      return server
    })
    .finally(() => { inflight = null })
  return inflight
}

/** Current data, fetching once if nothing is loaded yet. */
export async function ensureMe(): Promise<MeData | null> {
  return server ? state.view : refreshMe()
}

/** Add points the user just earned so every widget updates instantly. */
export function addAwards(awards: Award[]) {
  if (!awards.length) return
  const now = Date.now()
  for (const a of awards) pending.push({ kind: a.kind, points: a.points, at: now })
  publish(state.status === 'idle' ? 'ready' : state.status)
}

// ─── Shared, visibility-aware poller (ref-counted) ──────────────────────

let pollers = 0
let timer: ReturnType<typeof setInterval> | null = null

function startTimer() {
  if (timer === null) timer = setInterval(() => { void refreshMe() }, CLIENT_POLL_MS)
}

function stopTimer() {
  if (timer !== null) { clearInterval(timer); timer = null }
}

function onVisibility() {
  if (document.visibilityState === 'visible') {
    void refreshMe()
    startTimer()
  } else {
    stopTimer()
  }
}

function retainPolling(): () => void {
  pollers++
  if (pollers === 1) {
    document.addEventListener('visibilitychange', onVisibility)
    if (document.visibilityState === 'visible') startTimer()
  }
  void refreshMe()
  return () => {
    pollers--
    if (pollers === 0) {
      stopTimer()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }
}

/**
 * Read gamification data. `poll: true` (default) keeps it fresh every 60s
 * while mounted and visible; `poll: false` just reads whatever is loaded.
 */
export function useGamification(opts: { poll?: boolean } = {}): GamificationState {
  const poll = opts.poll !== false
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  useEffect(() => (poll ? retainPolling() : undefined), [poll])
  return snap
}

/** Non-React subscription (badge watcher in the provider). */
export function subscribeGamification(fn: (s: GamificationState) => void): () => void {
  return subscribe(() => fn(state))
}
