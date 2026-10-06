'use client'

import { useEffect, useState } from 'react'

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

// Confetti shards are computed once at module load from a seeded PRNG
// (mulberry32): random-looking, stable across re-renders, and pure during
// render (Math.random() in render breaks React's purity rules).
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(0x7b3c)
const SHARDS = Array.from({ length: 36 }, (_, i) => ({
  id: i,
  left: rand() * 100,
  delay: rand() * 0.25,
  duration: 0.9 + rand() * 0.8,
  color: COLORS[i % COLORS.length],
  size: 6 + rand() * 6,
  rotate: rand() * 360,
  drift: (rand() - 0.5) * 120,
}))

export default function WonCelebration({
  name,
  onDone,
}: {
  name: string
  onDone: () => void
}) {
  // Client-only overlay (shown after a tap), so reading matchMedia once at
  // mount is safe — no effect + setState round-trip needed.
  const [reduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const t = setTimeout(onDone, reduced ? 1100 : 1700)
    return () => clearTimeout(t)
  }, [onDone, reduced])

  const shards = SHARDS

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
