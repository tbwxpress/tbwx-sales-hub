/**
 * Cron guard: one in-flight run per job, plus a time budget the job checks.
 *
 * Why this exists (production incident, 12 Sep – 7 Oct 2026): the hourly
 * work-autobounce cron ran thousands of SQLite statements. In libsql
 * local-file mode every statement is synchronous and blocks the whole Node
 * process, so one run pinned the single CPU at 90-99% for 9+ minutes. The site
 * timed out for everyone and the watchdog restarted the container, up to 24
 * times a day. The host crontab fires on a fixed clock, so a run that outlived
 * its slot overlapped the next tick (or a manual admin POST) and the load
 * stacked.
 *
 * withCronLock gives every cron route two guarantees:
 *  1. Never two concurrent runs of the same job in this process. A second call
 *     while one is in flight gets HTTP 409 { skipped: true, reason: 'already running' }.
 *  2. A budget the job checks between units of work (ctx.outOfTime()), so it
 *     stops early and returns partial results instead of hogging the box. The
 *     budget is cooperative: it never kills a run that is mid-statement.
 *
 * The lock is in-process only (a Map). The Hub runs as ONE Node process
 * (`next start` in one container), so that is enough here. Jobs that also need
 * a cross-process lock (mail-watcher) keep their DB lock on top of this.
 */
import { NextResponse } from 'next/server'

export interface CronContext {
  /** Epoch ms when this run started. */
  startedAt: number
  /** The budget this run was given, in ms. */
  budgetMs: number
  /** Ms left in the budget (never negative). */
  timeLeft(): number
  /** True once the budget is spent. Check it before starting the next unit of work. */
  outOfTime(): boolean
}

export interface CronLockOptions {
  /** Cooperative time budget for one run, in ms. */
  budgetMs: number
  /**
   * A run still holding the lock after this long is treated as hung (say, an
   * outbound call with no timeout) and the next call takes the lock over, with
   * a loud log line. Without this, one hung run would disable the job until the
   * next container restart. Default: 4x the budget, at least 15 minutes.
   */
  staleMs?: number
}

interface InFlight {
  startedAt: number
}

const inFlight = new Map<string, InFlight>()

export function createCronContext(budgetMs: number, startedAt = Date.now()): CronContext {
  return {
    startedAt,
    budgetMs,
    timeLeft: () => Math.max(0, startedAt + budgetMs - Date.now()),
    outOfTime: () => Date.now() - startedAt >= budgetMs,
  }
}

/** True while a run of `name` holds the lock (for status endpoints and tests). */
export function isCronRunning(name: string): boolean {
  return inFlight.has(name)
}

export async function withCronLock(
  name: string,
  opts: CronLockOptions,
  fn: (ctx: CronContext) => Promise<Response>,
): Promise<Response> {
  const now = Date.now()
  const staleMs = opts.staleMs ?? Math.max(opts.budgetMs * 4, 15 * 60_000)
  const current = inFlight.get(name)
  if (current) {
    const heldMs = now - current.startedAt
    if (heldMs < staleMs) {
      return NextResponse.json(
        {
          success: false,
          skipped: true,
          reason: 'already running',
          error: `${name} is already running`,
          job: name,
          running_for_ms: heldMs,
        },
        { status: 409 },
      )
    }
    console.error(`[cron-guard] ${name}: previous run has held the lock for ${Math.round(heldMs / 1000)}s (stale after ${Math.round(staleMs / 1000)}s), taking over`)
  }

  const entry: InFlight = { startedAt: now }
  inFlight.set(name, entry)
  try {
    return await fn(createCronContext(opts.budgetMs, now))
  } finally {
    // Only clear our own entry. A run that was declared stale and taken over
    // must not release the lock that now belongs to the newer run.
    if (inFlight.get(name) === entry) inFlight.delete(name)
  }
}
