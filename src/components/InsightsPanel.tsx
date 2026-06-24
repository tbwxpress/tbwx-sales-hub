'use client'

// ─────────────────────────────────────────────────────────────────────────────
// InsightsPanel — "What's converting (AI insights)" (admin).
//
// Read-only cohort win-rate board fed by GET /api/work/insights (ADMIN).
// Surfaces which captured sales signals correlate with wins, so the owner can
// see, at a glance, what's actually converting:
//   • overall win rate of decided (won+lost) leads
//   • win rate broken down by money readiness, buyer type, and objection
//
// Self-contained: owns its own one-shot fetch. The parent (dashboard) gates it
// admin-only. Additive — touches nothing existing. Grows with the data: early
// on it's expected to be near-empty (only buckets with n≥3 are returned).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { Sparkles, AlertTriangle, TrendingUp } from 'lucide-react'

// ─── Types (mirror the backend contract) ─────────────────────────────────────

interface InsightRow {
  key: string
  label: string
  won: number
  lost: number
  n: number
  rate: number
}

interface Insights {
  overall: { won: number; lost: number; n: number; rate: number }
  by_objection: InsightRow[]
  by_capital: InsightRow[]
  by_persona: InsightRow[]
}

// ─── Row colour logic ────────────────────────────────────────────────────────
//
// Green when a bucket converts at or above the overall rate; red when it lags
// well below (>10 pts under). In between stays neutral so only the genuinely
// strong / weak cohorts pop.
function rateColor(rate: number, overall: number): string {
  if (rate >= overall) return 'var(--color-success)'
  if (rate <= overall - 10) return 'var(--color-danger)'
  return 'var(--color-body)'
}

// ─── A labelled group of rows ────────────────────────────────────────────────

function InsightGroup({
  title,
  rows,
  overall,
}: {
  title: string
  rows: InsightRow[]
  overall: number
}) {
  return (
    <div>
      <div className="text-eyebrow mb-1.5" style={{ color: 'var(--color-dim)' }}>
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs py-1" style={{ color: 'var(--color-dim)' }}>
          Not enough data yet
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map(r => {
            const color = rateColor(r.rate, overall)
            return (
              <li
                key={r.key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate" style={{ color: 'var(--color-body)' }}>
                  {r.label}
                </span>
                <span className="shrink-0 tabular-nums" style={{ color }}>
                  <span className="font-bold">{r.rate}%</span>
                  <span className="ml-1 text-xs" style={{ color: 'var(--color-dim)' }}>
                    ({r.won}/{r.n})
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InsightsPanel() {
  const [insights, setInsights] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/work/insights')
        const json = await res.json()
        if (!alive) return
        if (!res.ok || !json?.success) {
          setError(json?.error || `Server error (${res.status})`)
          return
        }
        setInsights(json.insights as Insights)
        setError('')
      } catch {
        if (alive) setError('Failed to load insights')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // ─── Loading skeleton (matches dashboard's animate-pulse style) ──────────
  if (loading) {
    return (
      <section aria-label="Conversion insights" className="mb-6">
        <div className="rounded-xl border border-border bg-card overflow-hidden animate-pulse">
          <div className="px-4 py-3 border-b border-border">
            <div className="h-3 w-48 rounded bg-elevated" />
          </div>
          <div className="px-4 py-4 space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-2 w-28 rounded bg-elevated" />
                <div className="h-3 w-full rounded bg-elevated" />
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  const overall = insights?.overall
  const allEmpty =
    !insights ||
    (overall?.n === 0 &&
      insights.by_capital.length === 0 &&
      insights.by_persona.length === 0 &&
      insights.by_objection.length === 0)

  return (
    <section aria-label="Conversion insights" className="mb-6 animate-fade-in">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)' }}
        >
          <Sparkles className="w-4 h-4" style={{ color: 'var(--color-accent)' }} strokeWidth={2} />
        </span>
        <h2 className="text-heading" style={{ color: 'var(--color-text)' }}>
          What&apos;s converting{' '}
          <span className="text-caption font-normal" style={{ color: 'var(--color-dim)' }}>
            · AI insights · all-time
          </span>
        </h2>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
      >
        {error ? (
          <div
            className="px-4 py-3 text-sm flex items-center gap-2"
            style={{ color: 'var(--color-danger)' }}
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : allEmpty ? (
          // ─── Expected early state — grows with the data ───────────────
          <div className="px-6 py-8 flex flex-col items-center text-center gap-2">
            <span
              className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-1"
              style={{ background: 'var(--color-elevated)' }}
            >
              <TrendingUp className="w-6 h-6" style={{ color: 'var(--color-dim)' }} strokeWidth={1.5} />
            </span>
            <p className="text-sm max-w-xs" style={{ color: 'var(--color-body)' }}>
              Not enough closed leads yet — insights appear as leads convert/close.
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Overall win rate line */}
            {overall && (
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2.5"
                style={{ background: 'var(--color-elevated)' }}
              >
                <TrendingUp className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent)' }} strokeWidth={2.2} />
                <span className="text-sm" style={{ color: 'var(--color-body)' }}>
                  Overall:{' '}
                  <span className="font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>
                    {overall.rate}% won
                  </span>{' '}
                  <span className="tabular-nums" style={{ color: 'var(--color-dim)' }}>
                    ({overall.won}/{overall.n} decided)
                  </span>
                </span>
              </div>
            )}

            {/* The three signal breakdowns */}
            <InsightGroup
              title="By money readiness"
              rows={insights.by_capital}
              overall={overall?.rate ?? 0}
            />
            <InsightGroup
              title="By buyer type"
              rows={insights.by_persona}
              overall={overall?.rate ?? 0}
            />
            <InsightGroup
              title="By objection"
              rows={insights.by_objection}
              overall={overall?.rate ?? 0}
            />
          </div>
        )}
      </div>
    </section>
  )
}
