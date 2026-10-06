'use client'

import { useEffect } from 'react'

/**
 * Confetti — a tiny canvas burst (no dependency, ~2KB). Waffle-house palette:
 * syrup gold, butter, toasted brown, cream, plus a pop of green and orange.
 * Square "waffle bits", round "sprinkles" and thin "ribbons".
 *
 * `fireConfetti()` is imperative (call it from any success handler);
 * `<Confetti fireKey={n} />` fires once each time `fireKey` changes to a truthy value.
 * Skipped entirely under prefers-reduced-motion.
 */

const PALETTE = ['#f5c518', '#ffd95a', '#e6b800', '#b07a3c', '#7a4a1e', '#faf5eb', '#22c55e', '#f97316']
const DURATION_MS = 2600

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rot: number
  vr: number
  color: string
  shape: 0 | 1 | 2
  wobble: number
}

let active = 0

export function fireConfetti(opts: { origin?: { x: number; y: number } | null; count?: number } = {}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  if (active >= 2) return // never stack more than two bursts

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  active++

  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: `${w}px`,
    height: `${h}px`,
    pointerEvents: 'none',
    zIndex: '9999',
  } as Partial<CSSStyleDeclaration>)
  document.body.appendChild(canvas)
  ctx.scale(dpr, dpr)

  const ox = opts.origin?.x ?? w / 2
  const oy = opts.origin?.y ?? h * 0.38
  const n = Math.min(220, opts.count ?? (w < 500 ? 90 : 140))
  const parts: Particle[] = []
  for (let i = 0; i < n; i++) {
    const angle = (-90 + (Math.random() - 0.5) * 110) * (Math.PI / 180)
    const speed = 7 + Math.random() * 9
    parts.push({
      x: ox + (Math.random() - 0.5) * 24,
      y: oy + (Math.random() - 0.5) * 12,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      color: PALETTE[i % PALETTE.length],
      shape: (i % 3) as 0 | 1 | 2,
      wobble: Math.random() * 10,
    })
  }

  const start = performance.now()
  const draw = (now: number) => {
    const t = now - start
    ctx.clearRect(0, 0, w, h)
    const fade = t > DURATION_MS - 700 ? Math.max(0, (DURATION_MS - t) / 700) : 1
    for (const p of parts) {
      p.vy += 0.32
      p.vx *= 0.985
      p.vy *= 0.985
      p.x += p.vx + Math.sin((t / 140) + p.wobble) * 0.6
      p.y += p.vy
      p.rot += p.vr
      ctx.save()
      ctx.globalAlpha = fade
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      if (p.shape === 0) {
        // waffle bit: a little square with a darker cross-hatch
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
        ctx.fillStyle = 'rgba(90,50,10,0.35)'
        ctx.fillRect(-p.size / 2, -0.6, p.size, 1.2)
        ctx.fillRect(-0.6, -p.size / 2, 1.2, p.size)
      } else if (p.shape === 1) {
        ctx.beginPath()
        ctx.arc(0, 0, p.size / 2.6, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillRect(-p.size / 2, -1.2, p.size * 1.3, 2.4)
      }
      ctx.restore()
    }
    if (t < DURATION_MS) {
      requestAnimationFrame(draw)
    } else {
      canvas.remove()
      active = Math.max(0, active - 1)
    }
  }
  requestAnimationFrame(draw)
}

export default function Confetti({ fireKey, origin }: { fireKey: number | string | null | undefined; origin?: { x: number; y: number } | null }) {
  useEffect(() => {
    if (fireKey) fireConfetti({ origin })
    // origin is read at fire time only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fireKey])
  return null
}
