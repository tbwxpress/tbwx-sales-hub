'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/**
 * Guided Work Mode router (additive, opt-in, reversible).
 *
 * Mounted once in the root layout. After auth resolves, if the session user is
 * in Guided mode it sends them to `/work` (their home / the rail) — UNLESS they
 * are already somewhere it must not interfere: `/work`, `/login`, or any `/api`
 * path. Free users (the default for everyone) are NEVER touched: the effect
 * early-returns the instant it sees `work_mode !== 'guided'`, so their routing
 * is byte-identical to today.
 *
 * Safety:
 *  - One-shot per session: a ref guards against re-redirect loops.
 *  - Re-checks the live pathname before replacing, so a guided user can still
 *    navigate INTO a lead detail from the card without being yanked back.
 *  - Renders nothing; failures are swallowed (never blocks the app shell).
 */
export default function GuidedRedirect() {
  const router = useRouter()
  const pathname = usePathname()
  const redirected = useRef(false)

  useEffect(() => {
    let cancelled = false

    // Paths the redirect must never fight with. /inbox + /sso are exempt so a
    // guided_inbox agent can reach the WhatsApp Inbox tab without being bounced.
    function isExempt(path: string | null): boolean {
      if (!path) return true
      return (
        path === '/work' ||
        path.startsWith('/work/') ||
        path === '/inbox' ||
        path.startsWith('/inbox/') ||
        path.startsWith('/sso') ||
        path === '/login' ||
        path.startsWith('/api') ||
        path.startsWith('/admin')
      )
    }

    // Already handled this session, or we're somewhere exempt — do nothing.
    if (redirected.current || isExempt(pathname)) return

    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        if (cancelled || redirected.current) return
        // The ONLY branch that does anything. Free (default) users fall through.
        if (d?.success && d.data?.work_mode === 'guided') {
          // guided_free (default): the agent roams the full app — never redirect.
          // Only guided_inbox is locked to the rail (+ exempt Inbox/SSO).
          const guidedSurface = d.data?.guided_surface || 'guided_free'
          if (guidedSurface !== 'guided_inbox') return
          // Re-read the live path: the user may have navigated since the fetch
          // started (e.g. opened a lead). Only redirect from a non-exempt home.
          if (!isExempt(window.location.pathname)) {
            redirected.current = true
            router.replace('/work')
          }
        }
      })
      .catch(() => { /* non-critical — never block the app */ })

    return () => { cancelled = true }
    // Re-run on path change so a fresh login (then landing on `/`) still routes.
  }, [pathname, router])

  return null
}
