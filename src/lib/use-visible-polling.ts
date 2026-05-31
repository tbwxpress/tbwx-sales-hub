'use client'

import { useEffect, useRef } from 'react'

/**
 * Polls `callback` every `intervalMs` ms while the tab is visible.
 *
 * - Fires once on mount (when enabled).
 * - Pauses the interval when document.visibilityState !== 'visible'.
 * - Re-fires once + resumes the interval when the tab becomes visible again.
 * - Cleans up timer + listener on unmount or dep change.
 *
 * Uses a ref for `callback` so the interval does NOT restart every render
 * when an inline arrow function is passed (matches the known-good pattern
 * used in `src/app/leads/[id]/page.tsx`).
 */
export function useVisiblePolling(
  callback: () => void,
  intervalMs: number,
  enabled: boolean = true,
): void {
  const callbackRef = useRef(callback)

  // Keep ref pointing at the latest callback without restarting the interval.
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return

    const fire = () => callbackRef.current()

    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer !== null) return
      timer = setInterval(fire, intervalMs)
    }
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        fire() // immediate refresh on return-to-tab
        start()
      } else {
        stop()
      }
    }

    // Initial fire + start (only if currently visible).
    fire()
    if (document.visibilityState === 'visible') {
      start()
    }

    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [intervalMs, enabled])
}
