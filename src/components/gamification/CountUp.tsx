'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Animate a number from its previous value to the new one (ease-out cubic).
 * Starts from 0 on first mount so KPI tiles "count in". Instant under
 * prefers-reduced-motion.
 */
export function useCountUp(value: number, duration = 700): number {
  const target = Number.isFinite(value) ? value : 0
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)
  const currentRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    if (from === target) return
    const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = reduce ? 1 : Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const v = Math.round(from + (target - from) * eased)
      currentRef.current = v
      setDisplay(v)
      if (p < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      fromRef.current = currentRef.current
    }
  }, [target, duration])

  return display
}

export default function CountUp({
  value,
  duration,
  format = n => n.toLocaleString('en-IN'),
  className,
}: {
  value: number
  duration?: number
  format?: (n: number) => string
  className?: string
}) {
  const n = useCountUp(value, duration)
  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {format(n)}
    </span>
  )
}
