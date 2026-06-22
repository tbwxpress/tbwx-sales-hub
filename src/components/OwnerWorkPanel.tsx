'use client'

// ─────────────────────────────────────────────────────────────────────────────
// OwnerWorkPanel — the owner accountability cockpit for Guided Work Mode.
//
// A live "Work Mode · Today" ops board (spec §9). Fed by GET /api/work/owner-panel
// (ADMIN). Surfaces, at a glance:
//   • pipeline movement today (qualified handoffs / re-warm bounces / wins)
//   • a per-agent live table sorted WORST-FIRST so problems jump out —
//     an agent hoarding HOT leads or sitting idle on untouched leads floats
//     to the top in red, exactly the accountability the audit demanded.
//
// Self-contained: owns its own fetch + visibility-aware ~45s poll + manual
// refresh. The parent (dashboard) gates it admin-only. Additive — touches
// nothing existing.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { timeAgo } from '@/lib/format'
import {
  Activity,
  RefreshCw,
  ArrowRightLeft,
  Undo2,
  Trophy,
  AlertTriangle,
  Flame,
  CircleOff,
  Phone,
  Headphones,
} from 'lucide-react'

// ─── Types (mirror the backend contract) ─────────────────────────────────────

interface OwnerAgentRow {
  name: string
  role: 'telecaller' | 'closer'
  work_mode: 'guided' | 'free'
  in_work_mode_today: boolean
  cleared_today: number
  queue_depth: number
  stalled_hot: number
  untouched: number
  last_action_at: string | null
}

interface OwnerPanelData {
  agents: OwnerAgentRow[]
  pipeline: {
    qualified_handoffs_today: number
    rewarm_bounces_today: number
    wins_today: number
  }
}

// ─── Severity engine ─────────────────────────────────────────────────────────
//
// One score per agent so the table can sort WORST-FIRST. The weights are
// deliberately ordered by how much each signal should alarm the owner:
//   stalled HOT (hoarding)  >  untouched (idle)  >  staleness  >  big queue.
// Higher score = more wrong = higher in the table.

const HOUR = 1000 * 60 * 60

function hoursSince(ts: string | null): number {
  if (!ts) return Infinity
  const d = new Date(ts)
  if (isNaN(d.getTime())) return Infinity
  return (Date.now() - d.getTime()) / HOUR
}

function severityScore(a: OwnerAgentRow): number {
  const idleHours = hoursSince(a.last_action_at)
  // never-acted-today guided agents read as fully idle (cap the Infinity)
  const idle = Number.isFinite(idleHours) ? idleHours : 72
  return (
    a.stalled_hot * 100 + // hoarding HOT is the loudest alarm
    a.untouched * 40 + // idle-with-untouched is the next
    Math.min(idle, 72) * 4 + // staleness, capped so it can't dominate
    a.queue_depth * 1 // depth is a soft tiebreaker
  )
}

// ─── Small presentational helpers ────────────────────────────────────────────

// Live "in Work Mode today" indicator — a soft pulsing gold dot when active,
// a hollow muted dot when not. Pure CSS animation (no motion lib).
function LiveDot({ active }: { active: boolean }) {
  if (!active) {
    return (
      <span
        className="inline-block w-2 h-2 rounded-full shrink-0"
        style={{ border: '1.5px solid var(--color-dim)', opacity: 0.5 }}
        aria-hidden
      />
    )
  }
  return (
    <span className="relative inline-flex w-2.5 h-2.5 shrink-0" aria-hidden>
      <span
        className="motion-safe:animate-ping absolute inline-flex w-full h-full rounded-full opacity-60"
        style={{ background: 'var(--color-accent)' }}
      />
      <span
        className="relative inline-flex w-2.5 h-2.5 rounded-full"
        style={{ background: 'var(--color-accent)', boxShadow: '0 0 6px var(--color-accent)' }}
      />
    </span>
  )
}

function RoleBadge({ role }: { role: OwnerAgentRow['role'] }) {
  const isCloser = role === 'closer'
  const Icon = isCloser ? Headphones : Phone
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
      style={{
        background: isCloser
          ? 'color-mix(in srgb, var(--color-status-hot) 14%, transparent)'
          : 'var(--color-elevated)',
        color: isCloser ? 'var(--color-status-hot)' : 'var(--color-muted)',
      }}
    >
      <Icon className="w-2.5 h-2.5" strokeWidth={2.5} />
      {isCloser ? 'Closer' : 'Telecaller'}
    </span>
  )
}

// Guided = gold (on the rail), Free = muted (full ownership) — spec §8 palette.
function ModeBadge({ mode }: { mode: OwnerAgentRow['work_mode'] }) {
  const isGuided = mode === 'guided'
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
      style={{
        background: isGuided
          ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)'
          : 'var(--color-elevated)',
        color: isGuided ? 'var(--color-accent)' : 'var(--color-dim)',
        border: isGuided ? '1px solid color-mix(in srgb, var(--color-accent) 35%, transparent)' : '1px solid transparent',
      }}
    >
      {isGuided ? 'Guided' : 'Free'}
    </span>
  )
}

// A pipeline stat card — three of these sit on top (spec §9 pipeline row).
function PipelineStat({
  label,
  value,
  color,
  Icon,
}: {
  label: string
  value: number
  color: string
  Icon: typeof Trophy
}) {
  return (
    <div
      className="stat-card card-hover rounded-xl p-4 border flex items-center gap-3"
      style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}
      >
        <Icon className="w-4 h-4" style={{ color }} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <div className="text-display leading-none tabular-nums" style={{ color }}>
          {value}
        </div>
        <div className="text-caption mt-1 truncate" style={{ color: 'var(--color-dim)' }}>
          {label}
        </div>
      </div>
    </div>
  )
}

// ─── Metric cell colour logic (the "make problems jump out" rules) ───────────

// stalled-HOT: amber if >0, red if "large" (≥3 = a real hoarding signal).
function stalledColor(n: number): string | undefined {
  if (n <= 0) return undefined
  return n >= 3 ? 'var(--color-danger)' : 'var(--color-warning)'
}

// A numeric metric cell. `tone` paints the number + a faint chip behind it.
function MetricCell({
  value,
  tone,
  emphasize,
  title,
}: {
  value: number
  tone?: string
  emphasize?: boolean
  title?: string
}) {
  const color = tone ?? 'var(--color-body)'
  return (
    <span
      title={title}
      className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-md text-sm font-bold tabular-nums"
      style={{
        color,
        background: tone ? `color-mix(in srgb, ${tone} 12%, transparent)` : 'transparent',
        boxShadow: emphasize && tone ? `inset 0 0 0 1px color-mix(in srgb, ${tone} 30%, transparent)` : undefined,
      }}
    >
      {value}
    </span>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

const POLL_MS = 45000

export default function OwnerWorkPanel() {
  const [data, setData] = useState<OwnerPanelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const res = await fetch('/api/work/owner-panel')
      const json = await res.json()
      // The endpoint returns { error } (no `success` field) on 403/500, so gate
      // on res.ok first and surface the server's real message.
      if (!res.ok) {
        setError(json?.error || `Server error (${res.status})`)
        return
      }
      // tolerate both {success,data} and a raw object shape from the backend
      const payload: OwnerPanelData | undefined = json?.data ?? (json?.agents ? json : undefined)
      if (payload && Array.isArray(payload.agents)) {
        setData(payload)
        setLastUpdated(new Date())
        setError('')
      } else if (json?.error) {
        setError(json.error)
      } else {
        setError('Unexpected response')
      }
    } catch {
      setError('Failed to load work panel')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Initial load + visibility-aware poll. We pause polling when the tab is
  // hidden (don't burn the API on a backgrounded dashboard) and refresh
  // immediately on return so the owner never stares at stale numbers.
  useEffect(() => {
    load()

    function startPoll() {
      stopPoll()
      pollRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') load()
      }, POLL_MS)
    }
    function stopPoll() {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        load()
        startPoll()
      } else {
        stopPoll()
      }
    }

    startPoll()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopPoll()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  // Only guided agents belong on the rail board; sort worst-first.
  const rows = useMemo(() => {
    if (!data) return []
    return data.agents
      .filter(a => a.work_mode === 'guided')
      .sort((a, b) => severityScore(b) - severityScore(a))
  }, [data])

  const pipeline = data?.pipeline

  // ─── Loading skeleton (matches dashboard's animate-pulse style) ──────────
  if (loading) {
    return (
      <section aria-label="Work Mode owner panel" className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-xl p-4 border border-border bg-card animate-pulse flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-elevated shrink-0" />
              <div className="space-y-2">
                <div className="h-6 w-10 rounded bg-elevated" />
                <div className="h-2 w-24 rounded bg-elevated" />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card overflow-hidden animate-pulse">
          <div className="px-4 py-3 border-b border-border">
            <div className="h-3 w-40 rounded bg-elevated" />
          </div>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <div className="w-7 h-7 rounded-full bg-elevated shrink-0" />
              <div className="flex-1 h-3 rounded bg-elevated" />
              <div className="h-5 w-12 rounded bg-elevated" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Work Mode owner panel" className="mb-6 animate-fade-in">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
            style={{ background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)' }}
          >
            <Activity className="w-4 h-4" style={{ color: 'var(--color-accent)' }} strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-heading flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              Work Mode
              <span className="text-caption font-normal" style={{ color: 'var(--color-dim)' }}>
                · Today
              </span>
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[10px] hidden sm:inline tabular-nums" style={{ color: 'var(--color-dim)' }}>
              updated {timeAgo(lastUpdated.toISOString())}
            </span>
          )}
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            aria-label="Refresh work panel"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            style={{
              background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
              color: 'var(--color-accent)',
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} strokeWidth={2.5} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          className="mb-3 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2"
          style={{
            background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
            color: 'var(--color-danger)',
            border: '1px solid color-mix(in srgb, var(--color-danger) 20%, transparent)',
          }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ─── Pipeline stat cards ────────────────────────────────────────── */}
      {pipeline && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <PipelineStat
            label="Qualified handoffs today"
            value={pipeline.qualified_handoffs_today}
            color="var(--color-success)"
            Icon={ArrowRightLeft}
          />
          <PipelineStat
            label="Re-warm bounces"
            value={pipeline.rewarm_bounces_today}
            color="var(--color-warning)"
            Icon={Undo2}
          />
          <PipelineStat
            label="Wins today"
            value={pipeline.wins_today}
            color="var(--color-accent)"
            Icon={Trophy}
          />
        </div>
      )}

      {/* ─── Per-agent live ops table ───────────────────────────────────── */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
      >
        <div
          className="flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span className="text-eyebrow" style={{ color: 'var(--color-muted)' }}>
            Agents on the rail
          </span>
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--color-dim)' }}>
            <AlertTriangle className="w-3 h-3" style={{ color: 'var(--color-warning)' }} />
            sorted worst-first
          </span>
        </div>

        {rows.length === 0 ? (
          // ─── Empty state ───────────────────────────────────────────────
          <div className="px-6 py-10 flex flex-col items-center text-center gap-2">
            <span
              className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-1"
              style={{ background: 'var(--color-elevated)' }}
            >
              <Activity className="w-6 h-6" style={{ color: 'var(--color-dim)' }} strokeWidth={1.5} />
            </span>
            <p className="text-sm font-medium" style={{ color: 'var(--color-body)' }}>
              No agents in Work Mode
            </p>
            <p className="text-xs max-w-xs" style={{ color: 'var(--color-dim)' }}>
              Turn it on in <span style={{ color: 'var(--color-accent)' }}>Admin → Agents</span> to start
              the guided conveyor for a rep.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr
                  className="text-eyebrow"
                  style={{ color: 'var(--color-dim)', background: 'color-mix(in srgb, var(--color-elevated) 40%, transparent)' }}
                >
                  <th className="text-left font-semibold px-4 py-2.5">Agent</th>
                  <th className="text-left font-semibold px-2 py-2.5">Mode</th>
                  <th className="text-center font-semibold px-2 py-2.5" title="Cleared today">
                    Cleared
                  </th>
                  <th className="text-center font-semibold px-2 py-2.5" title="Leads waiting in their queue">
                    Queue
                  </th>
                  <th className="text-center font-semibold px-2 py-2.5" title="HOT leads stalled with no contact">
                    Stalled HOT
                  </th>
                  <th className="text-center font-semibold px-2 py-2.5" title="Assigned leads never touched">
                    Untouched
                  </th>
                  <th className="text-right font-semibold px-4 py-2.5">Last action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a, i) => {
                  const idleHours = hoursSince(a.last_action_at)
                  // "stale or none" → red. >6h idle is a flag for a guided rep
                  // who should be clearing cards continuously.
                  const lastStale = !a.last_action_at || idleHours > 6
                  const stalled = stalledColor(a.stalled_hot)
                  const untouchedTone = a.untouched > 0 ? 'var(--color-danger)' : undefined
                  // worst row (top) gets a subtle warm left-rail accent
                  const isWorst = i === 0 && (a.stalled_hot > 0 || a.untouched > 0 || lastStale)

                  return (
                    <tr
                      key={a.name}
                      className="border-t transition-colors motion-safe:animate-fade-in-up"
                      style={{
                        borderColor: 'var(--color-border)',
                        background: isWorst
                          ? 'color-mix(in srgb, var(--color-danger) 5%, transparent)'
                          : i % 2 === 1
                            ? 'color-mix(in srgb, var(--color-elevated) 22%, transparent)'
                            : 'transparent',
                        boxShadow: isWorst ? 'inset 3px 0 0 var(--color-danger)' : undefined,
                        animationDelay: `${Math.min(i, 8) * 35}ms`,
                        animationFillMode: 'backwards',
                      }}
                    >
                      {/* Agent — avatar + name + role + live dot */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
                            style={{
                              background: 'var(--color-accent-soft)',
                              color: 'var(--color-accent)',
                              border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
                            }}
                          >
                            {a.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <LiveDot active={a.in_work_mode_today} />
                              <span
                                className="text-sm font-semibold truncate"
                                style={{ color: 'var(--color-text)' }}
                              >
                                {a.name}
                              </span>
                            </div>
                            <div className="mt-0.5">
                              <RoleBadge role={a.role} />
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Mode */}
                      <td className="px-2 py-2.5">
                        <ModeBadge mode={a.work_mode} />
                      </td>

                      {/* Cleared today — gold when they've cleared, muted "—" when nothing yet */}
                      <td className="px-2 py-2.5 text-center">
                        {a.cleared_today > 0 ? (
                          <span
                            className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-md text-sm font-bold tabular-nums"
                            style={{
                              color: 'var(--color-accent)',
                              background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                            }}
                          >
                            {a.cleared_today}
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--color-dim)' }} title="Nothing cleared yet today">
                            nothing yet
                          </span>
                        )}
                      </td>

                      {/* Queue depth */}
                      <td className="px-2 py-2.5 text-center">
                        <MetricCell value={a.queue_depth} title="Leads waiting in queue" />
                      </td>

                      {/* Stalled HOT — amber if any, red if large */}
                      <td className="px-2 py-2.5 text-center">
                        {a.stalled_hot > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <Flame
                              className="w-3.5 h-3.5"
                              style={{ color: stalled }}
                              strokeWidth={2.5}
                              aria-hidden
                            />
                            <MetricCell
                              value={a.stalled_hot}
                              tone={stalled}
                              emphasize={a.stalled_hot >= 3}
                              title={a.stalled_hot >= 3 ? 'Hoarding HOT leads — intervene' : 'HOT leads stalling'}
                            />
                          </span>
                        ) : (
                          <span className="text-sm tabular-nums" style={{ color: 'var(--color-dim)' }}>
                            0
                          </span>
                        )}
                      </td>

                      {/* Untouched — red if any */}
                      <td className="px-2 py-2.5 text-center">
                        {a.untouched > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <CircleOff
                              className="w-3.5 h-3.5"
                              style={{ color: 'var(--color-danger)' }}
                              strokeWidth={2.5}
                              aria-hidden
                            />
                            <MetricCell value={a.untouched} tone={untouchedTone} emphasize title="Assigned leads never contacted" />
                          </span>
                        ) : (
                          <span className="text-sm tabular-nums" style={{ color: 'var(--color-dim)' }}>
                            0
                          </span>
                        )}
                      </td>

                      {/* Last action — relative, red if stale or none */}
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className="text-xs font-medium tabular-nums whitespace-nowrap"
                          style={{ color: lastStale ? 'var(--color-danger)' : 'var(--color-muted)' }}
                        >
                          {a.last_action_at ? timeAgo(a.last_action_at) : 'never'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
