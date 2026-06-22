'use client'

import { useEffect, useMemo, useState } from 'react'

/**
 * WonCelebration — a tasteful, short-lived overlay that fires ONLY on a `won`
 * outcome before the next card loads. CSS-only confetti (no library): a burst
 * of warm-gold/green shards that fall and fade, behind a centered "🎉 Won!"
 * card. Auto-dismisses after ~1.6s, then calls `onDone` so the rail advances.
 *
 * Honors prefers-reduced-motion: the confetti is suppressed and only the calm
 * "Won!" badge shows, still auto-dismissing.
 */

const COLORS = [
  'var(--color-accent)',
  'var(--color-success)',
  'var(--color-hot)',
  '#ffe08a',
  '#fff',
]

export default function WonCelebration({
  name,
  onDone,
}: {
  name: string
  onDone: () => void
}) {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(onDone, reduced ? 1100 : 1700)
    return () => clearTimeout(t)
  }, [onDone, reduced])

  // Pre-compute confetti shards once so they don't reshuffle on re-render.
  const shards = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.25,
        duration: 0.9 + Math.random() * 0.8,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 6,
        rotate: Math.random() * 360,
        drift: (Math.random() - 0.5) * 120,
      })),
    [],
  )

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'color-mix(in srgb, var(--color-bg) 60%, transparent)', backdropFilter: 'blur(2px)' }}
      role="status"
      aria-live="assertive"
      aria-label={`Won — ${name}`}
    >
      {!reduced && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {shards.map((s) => (
            <span
              key={s.id}
              className="work-confetti absolute top-[-8%] rounded-sm"
              style={{
                left: `${s.left}%`,
                width: s.size,
                height: s.size * 1.6,
                background: s.color,
                // CSS custom props consumed by the keyframes (see <style> in page).
                ['--cf-delay' as string]: `${s.delay}s`,
                ['--cf-dur' as string]: `${s.duration}s`,
                ['--cf-rot' as string]: `${s.rotate}deg`,
                ['--cf-drift' as string]: `${s.drift}px`,
              }}
            />
          ))}
        </div>
      )}

      <div className="work-won-pop glass relative flex flex-col items-center gap-1 rounded-2xl px-8 py-6 text-center glow-success">
        <div className="text-4xl" aria-hidden>🎉</div>
        <div className="text-display text-gradient-gold">Won!</div>
        <div className="text-body text-muted">{name} just converted</div>
      </div>
    </div>
  )
}
