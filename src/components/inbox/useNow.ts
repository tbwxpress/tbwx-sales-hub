'use client'

import { useEffect, useState } from 'react'

/**
 * Shared ticking clock for the inbox triage UI. Returns `Date.now()` and
 * re-renders the subscriber every `intervalMs` (default 45s) so live elements —
 * the "waiting {Xh}" badges and the 24-hour window countdown — stay current
 * without each one spinning up its own interval.
 *
 * Pauses cheaply: the interval keeps firing but at a relaxed cadence, so the
 * cost is one setState per tick regardless of how many rows consume it.
 */
export function useNow(intervalMs = 45000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}

/**
 * Compact "time since" for the waiting-badge: "12m", "3h", "2d".
 * Always rounds down to the dominant unit so the badge stays one token wide.
 */
export function formatWaiting(fromIso: string, now: number): string {
  if (!fromIso) return ''
  const ms = now - new Date(fromIso).getTime()
  if (ms < 0) return 'now'
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}
