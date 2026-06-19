'use client'

/**
 * KpiCard — a single polished KPI metric widget for the admin dashboard.
 *
 * Layout (re-themed from a 21st.dev KPI-card pattern to TBWX tokens):
 *   ┌──────────────────────────────────────┐
 *   │ LABEL (eyebrow)            [mini chart]│
 *   │ 1,234  ▲ 12%                          │   ← big value + delta
 *   │ caption                              │
 *   └──────────────────────────────────────┘
 *
 * Visuals are 100% TBWX brand:
 *   - `.stat-card .card-hover` → gold top-border reveal + lift on hover
 *   - `.text-eyebrow` / `.text-display` / `.text-caption` type scale
 *   - colours via theme vars only (var(--color-*), var(--chart-*))
 *
 * The recharts mini-chart is rendered by the sibling chart components which are
 * dynamically imported (see ./KpiSparkline) so recharts stays out of the
 * initial dashboard bundle — this app has had perf regressions, so charts load
 * lazily and the card is fully usable (value + delta) before the chart paints.
 */

import { type ReactNode } from 'react'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'

export type DeltaDirection = 'up' | 'down' | 'flat'

export interface KpiDelta {
  /** Absolute percentage magnitude, already rounded (e.g. 12 → "12%"). */
  pct: number
  direction: DeltaDirection
  /** Whether "up" is good (leads, conversions) or bad (e.g. avg response time). */
  goodWhenUp?: boolean
  /** Tooltip-ish helper shown next to the delta, e.g. "vs last week". */
  label?: string
}

export interface KpiCardProps {
  /** Small uppercase label. */
  label: string
  /** Big formatted value. */
  value: string | number
  /** Optional sub-caption under the value. */
  caption?: string
  /** Optional delta vs a previous period. Omit entirely when there is no
   *  honest comparison available — never fabricate a delta. */
  delta?: KpiDelta
  /** Right-side mini chart (sparkline / mini-bar / mini-donut). */
  chart?: ReactNode
  /** Accent for the value text; defaults to brand gold. */
  valueColor?: string
  /** Stagger index for the entrance animation. */
  index?: number
}

function deltaTone(d: KpiDelta): string {
  if (d.direction === 'flat') return 'var(--color-dim)'
  const goodWhenUp = d.goodWhenUp ?? true
  const isGood = d.direction === 'up' ? goodWhenUp : !goodWhenUp
  return isGood ? 'var(--color-success)' : 'var(--color-danger)'
}

export default function KpiCard({
  label,
  value,
  caption,
  delta,
  chart,
  valueColor = 'var(--color-accent)',
  index = 0,
}: KpiCardProps) {
  const tone = delta ? deltaTone(delta) : undefined
  const DeltaIcon = !delta
    ? null
    : delta.direction === 'up'
      ? ArrowUp
      : delta.direction === 'down'
        ? ArrowDown
        : Minus

  return (
    <div
      className="stat-card card-hover rounded-xl border p-4 flex flex-col justify-between cursor-default"
      style={{
        background: 'var(--color-card)',
        borderColor: 'var(--color-border)',
        // stagger entrance without relying on a parent .stagger-children wrapper
        animation: 'fade-in-up 0.4s ease-out both',
        animationDelay: `${index * 60}ms`,
        minHeight: 116,
      }}
    >
      {/* Top row: label + mini chart */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-eyebrow" style={{ color: 'var(--color-muted)' }}>
          {label}
        </span>
        {chart ? (
          <div className="shrink-0 -mt-0.5" aria-hidden>
            {chart}
          </div>
        ) : null}
      </div>

      {/* Value + delta */}
      <div className="flex items-end gap-2 flex-wrap">
        <span className="text-display leading-none" style={{ color: valueColor }}>
          {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
        </span>

        {delta && DeltaIcon ? (
          <span
            className="inline-flex items-center gap-0.5 text-[11px] font-semibold leading-none pb-0.5"
            style={{ color: tone }}
            title={delta.label ? `${delta.pct}% ${delta.label}` : `${delta.pct}%`}
          >
            <DeltaIcon className="w-3 h-3" strokeWidth={2.5} aria-hidden />
            {delta.pct}%
          </span>
        ) : null}
      </div>

      {/* Caption */}
      {(caption || delta?.label) && (
        <p className="text-caption mt-1.5" style={{ color: 'var(--color-dim)' }}>
          {delta?.label && delta.direction !== 'flat' ? (
            <span style={{ color: 'var(--color-muted)' }}>{delta.label}</span>
          ) : (
            caption
          )}
        </p>
      )}
    </div>
  )
}

/** Skeleton placeholder matching KpiCard's footprint, using the brand shimmer. */
export function KpiCardSkeleton() {
  return (
    <div
      className="rounded-xl border p-4 flex flex-col justify-between"
      style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)', minHeight: 116 }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="skeleton h-2.5 w-16" />
        <div className="skeleton h-9 w-16 rounded-md" />
      </div>
      <div className="skeleton h-7 w-20 mb-2" />
      <div className="skeleton h-2.5 w-24" />
    </div>
  )
}
