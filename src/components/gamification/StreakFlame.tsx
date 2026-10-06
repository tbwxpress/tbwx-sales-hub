'use client'

import { useId } from 'react'

/**
 * StreakFlame — the calling streak (working days in a row with ≥ 1 call).
 *  - burning + gentle flicker: today's call is in
 *  - dimmed with a pulse ring: streak alive but today's first call is pending
 *  - grey ember: no streak yet
 */

const OUTER = 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'
const INNER = 'M12 21.2a3.1 3.1 0 0 1-3.1-3.1c0-1.5 1.1-2.5 1.9-3.6.4 1 1 1.6 1.9 2 .9.5 2.4 1.1 2.4 2.5a3.1 3.1 0 0 1-3.1 2.2z'

export function FlameIcon({ lit, size = 18 }: { lit: boolean; size?: number }) {
  const rawId = useId()
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={lit ? 'gam-flame' : undefined}>
      <defs>
        <linearGradient id={`${id}-f`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={lit ? 'var(--color-hot)' : 'var(--color-dim)'} />
          <stop offset="100%" stopColor={lit ? 'var(--color-accent)' : 'var(--color-border-light)'} />
        </linearGradient>
      </defs>
      <path d={OUTER} fill={`url(#${id}-f)`} />
      {lit && <path d={INNER} fill="#fff3c4" opacity={0.9} />}
    </svg>
  )
}

export default function StreakFlame({
  days,
  todayDone,
  atRisk,
  size = 'sm',
}: {
  days: number
  todayDone: boolean
  atRisk: boolean
  size?: 'sm' | 'lg'
}) {
  const lit = days > 0 && (todayDone || !atRisk)
  const title = days === 0
    ? 'No calling streak yet — log a call today to start one'
    : atRisk
      ? `${days}-day streak — log a call today to keep it`
      : `${days}-day calling streak (Mon–Sat, at least one call a day)`

  if (size === 'lg') {
    return (
      <div className="flex items-center gap-3" title={title}>
        <span className={`gam-flame-wrap relative flex h-14 w-14 items-center justify-center rounded-2xl ${atRisk ? 'gam-flame-wrap--risk' : ''}`}
          style={{ background: lit ? 'color-mix(in srgb, var(--color-hot) 14%, transparent)' : 'var(--color-elevated)' }}>
          <FlameIcon lit={lit || atRisk} size={34} />
        </span>
        <div className="min-w-0">
          <p className="text-display leading-none tabular-nums" style={{ color: lit ? 'var(--color-hot)' : 'var(--color-text)' }}>
            {days}
            <span className="ml-1 text-heading font-semibold text-muted">{days === 1 ? 'day' : 'days'}</span>
          </p>
          <p className="mt-1 text-caption text-dim">
            {days === 0 ? 'Log a call to light it' : atRisk ? 'Call today to keep it burning' : 'Calling streak · Mon–Sat'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <span
      className={`gam-streak-chip inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-caption font-bold tabular-nums ${atRisk ? 'gam-streak-chip--risk' : ''}`}
      style={{
        background: lit ? 'color-mix(in srgb, var(--color-hot) 15%, transparent)' : 'var(--color-elevated)',
        color: lit ? 'var(--color-hot)' : 'var(--color-dim)',
      }}
      title={title}
      aria-label={title}
    >
      <FlameIcon lit={lit || atRisk} size={15} />
      {days}
    </span>
  )
}
