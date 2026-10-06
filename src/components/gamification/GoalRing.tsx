'use client'

import { useId, type CSSProperties, type ReactNode } from 'react'
import { useCountUp } from './CountUp'

/**
 * GoalRing — today's points against the daily goal, drawn as a ring of
 * "waffle cells": a syrup-gold arc cut into segments by hairline gaps.
 * The arc pours in on mount and glides on every update; at 100% it turns
 * green and pulses once. Reduced motion → static.
 *
 * `cut` must match the surface the ring sits on (the gaps are painted in it).
 */
export default function GoalRing({
  value,
  goal,
  size = 56,
  stroke,
  cut = 'var(--color-card)',
  children,
  label,
}: {
  value: number
  goal: number
  size?: number
  stroke?: number
  cut?: string
  children?: ReactNode
  label?: string
}) {
  const rawId = useId()
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, '')
  const sw = stroke ?? Math.max(4, Math.round(size / 11))
  const safeGoal = Math.max(1, goal || 1)
  const pct = Math.min(1, Math.max(0, value) / safeGoal)
  const hit = value >= safeGoal
  const r = (size - sw) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - pct)
  const cells = size >= 96 ? 30 : 20
  const gap = Math.max(1.3, sw * 0.34)
  const shown = useCountUp(value)

  return (
    <div
      className="gam-ring relative shrink-0"
      data-hit={hit ? 'true' : undefined}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${value} of ${goal} points today${hit ? ' — goal hit' : ''}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`${id}-syrup`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={hit ? 'var(--color-success)' : 'var(--color-accent)'} />
            <stop offset="100%" stopColor={hit ? 'var(--color-status-won)' : 'var(--color-hot)'} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={sw}
          stroke="color-mix(in srgb, var(--color-accent) 14%, transparent)"
        />
        <circle
          className="gam-ring__fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={sw}
          stroke={`url(#${id}-syrup)`}
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ ['--gam-circ' as string]: c } as CSSProperties}
        />
        {/* waffle grid: hairline cuts across the whole ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={sw + 1}
          stroke={cut}
          strokeDasharray={`${gap} ${c / cells - gap}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {children ?? (
          <>
            <span
              className="font-extrabold tabular-nums text-text"
              style={{ fontSize: Math.max(12, Math.round(size * 0.28)), letterSpacing: '-0.02em' }}
            >
              {shown}
            </span>
            {size >= 72 && (
              <span className="mt-1 text-[11px] font-semibold text-dim tabular-nums">/ {goal} pts</span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
