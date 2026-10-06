/**
 * POST /api/cron/work-autobounce
 *
 * Anti-rot rule for Guided Work Mode: bounce closer leads with NO engagement
 * (no work_event / message / call) for WORK_AUTOBOUNCE_DAYS+ (default 7) to a
 * telecaller re-warm queue — reassign + status DELAYED + assignment_log + notify.
 * Additive and reversible: it only performs the same reassignment the owner
 * could do by hand, and never touches Free-mode behavior of any other feature.
 *
 * Must be wired to an external scheduler (VPS at-job / host crontab / n8n).
 * Schedule: ONCE A DAY. It ran hourly from 12 Sep 2026, and each run held the
 * CPU at 90-99% for 9+ minutes, so the site timed out and the watchdog restarted
 * the container. The scan is now set-based (see runAutoBounce), capped at
 * WORK_AUTOBOUNCE_MAX_PER_RUN reassignments (default 50) and a 60 s budget,
 * and guarded by withCronLock so two runs can never overlap (a second call
 * gets 409). The daily run also prunes processed_events older than 30 days.
 *   curl -X POST https://sales.tbwxpress.com/api/cron/work-autobounce \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * Threshold is configurable via WORK_AUTOBOUNCE_DAYS (see src/lib/work.ts).
 * NOTE: Do NOT auto-register — the scheduler entry must be created manually.
 */
import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { runAutoBounce, AUTOBOUNCE_DAYS, AUTOBOUNCE_BUDGET_MS } from '@/lib/work'
import { pruneProcessedEvents } from '@/lib/db'
import { withCronLock } from '@/lib/cron-guard'

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') || ''
    const secret = process.env.CRON_SECRET
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    return await withCronLock('work-autobounce', { budgetMs: AUTOBOUNCE_BUDGET_MS }, async (ctx) => {
      const result = await runAutoBounce({ outOfTime: ctx.outOfTime })
      // Housekeeping rides on this job now that it runs once a day: the webhook
      // idempotency claims only need to outlive Meta's redelivery window.
      const pruned_events = await pruneProcessedEvents(30)
      return NextResponse.json({
        success: true,
        threshold_days: AUTOBOUNCE_DAYS,
        bounced: result.bounced,
        scanned: result.scanned,
        truncated: result.truncated,
        pruned_events,
        details: result.details,
      })
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Auto-bounce cron failed') }, { status: 500 })
  }
}
