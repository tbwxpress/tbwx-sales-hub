/**
 * fetch() with a hard timeout.
 *
 * Plain fetch() has no timeout. When graph.facebook.com, the SOP or an AI API
 * hangs, the awaiting request (or cron run) hangs with it, holding its cron
 * lock and its memory until the container restarts. During the Sep–Oct 2026
 * CPU incident every stuck call made the box slower to recover. Every outbound
 * HTTP call in src/lib and src/app/api should go through this helper.
 *
 * The timeout covers the whole exchange, including reading the body
 * (res.json() / res.arrayBuffer()). On timeout the promise rejects with a
 * DOMException named 'TimeoutError', which callers' existing catch blocks
 * already treat as a network failure. A caller's own `init.signal` still works:
 * whichever fires first aborts the request.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000

export function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  ms: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const timeout = AbortSignal.timeout(ms)
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  return fetch(url, { ...init, signal })
}
