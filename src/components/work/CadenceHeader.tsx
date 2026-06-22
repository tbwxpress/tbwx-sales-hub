'use client'

import { Flame } from 'lucide-react'
import type { WorkStats } from './types'

/**
 * CadenceHeader — pinned top of the rail. The agent's always-visible momentum:
 * a gold progress ring (cleared / target), a "{queue_depth} left" count, and a
 * streak chip. Tasteful "operator pride," not childish gamification.
 *
 * The ring is a pure SVG radial bar (stroke-dasharray = circumference, animated
 * stroke-dashoffset) so it fills smoothly via a CSS transition — no animation
 * library, matching the rest of the app. Respects prefers-reduced-motion through
 * the global media query (the transition simply lands instantly).
 */
export default function CadenceHeader({ stats }: { stats: WorkStats }) {
  const target = Math.max(1, stats.target || 1)
  const cleared = Math.max(0, stats.cleared_today || 0)
  const pct = Math.min(100, Math.round((cleared / target) * 100))
  const hitTarget = cleared >= target

  // Ring geometry — small, dense, gold.
  const size = 46
  const stroke = 4
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - pct / 100)

  return (
    <header
      className="glass-nav sticky top-0 z-30 border-b border-border safe-top"
      style={{ boxShadow: '0 1px 0 0 color-mix(in srgb, var(--color-border) 50%, transparent)' }}
    >
      <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-2.5">
        {/* Progress ring */}
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90"
            role="progressbar"
            aria-valuenow={cleared}
            aria-valuemin={0}
            aria-valuemax={target}
            aria-label={`${cleared} of ${target} cleared today`}
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="transparent"
              strokeWidth={stroke}
              stroke="color-mix(in srgb, var(--color-accent) 14%, transparent)"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="transparent"
              strokeWidth={stroke}
              stroke={hitTarget ? 'var(--color-success)' : 'var(--color-accent)'}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.43,0.13,0.23,0.96), stroke 0.3s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[13px] font-bold leading-none tabular-nums text-text">{cleared}</span>
            <span className="text-[7px] font-semibold leading-none text-dim">/{target}</span>
          </div>
        </div>

        {/* Labels */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-heading font-bold text-text">Today&apos;s rail</span>
            {hitTarget && (
              <span className="text-eyebrow text-[var(--color-success)]">target hit</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-caption text-muted">
            <span className="tabular-nums font-semibold text-body">{stats.queue_depth}</span>
            <span>left</span>
            <span className="text-dim">·</span>
            <span className="tabular-nums">🎯 {target}</span>
          </div>
        </div>

        {/* Streak chip */}
        {stats.streak > 0 && (
          <div
            className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-caption font-bold tabular-nums"
            style={{
              background: 'color-mix(in srgb, var(--color-hot) 16%, transparent)',
              color: 'var(--color-hot)',
            }}
            title={`${stats.streak} consecutive days hitting target`}
          >
            <Flame className="h-3.5 w-3.5" strokeWidth={2.4} />
            {stats.streak}-day
          </div>
        )}
      </div>
    </header>
  )
}
