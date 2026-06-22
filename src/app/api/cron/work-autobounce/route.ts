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
 * Suggested schedule: daily.
 *   curl -X POST https://sales.tbwxpress.com/api/cron/work-autobounce \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * Threshold is configurable via WORK_AUTOBOUNCE_DAYS (see src/lib/work.ts).
 * NOTE: Do NOT auto-register — the scheduler entry must be created manually.
 */
import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { runAutoBounce, AUTOBOUNCE_DAYS } from '@/lib/work'

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') || ''
    const secret = process.env.CRON_SECRET
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const result = await runAutoBounce()
    return NextResponse.json({
      success: true,
      threshold_days: AUTOBOUNCE_DAYS,
      bounced: result.bounced,
      details: result.details,
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Auto-bounce cron failed') }, { status: 500 })
  }
}
