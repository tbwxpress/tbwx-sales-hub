/**
 * POST /api/cron/expire-delegations
 *
 * Auto-expires active delegations whose expires_at has passed.
 * Must be wired to an external scheduler (VPS at-job or n8n).
 *
 * Suggested schedule: daily at 00:05 IST
 * curl -X POST https://sales.tbwxpress.com/api/cron/expire-delegations \
 *   -H "Authorization: Bearer $CRON_SECRET"
 *
 * NOTE: Do NOT auto-register this — the VPS at-job / n8n webhook must be
 * created manually by the user.
 */
import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { withCronLock } from '@/lib/cron-guard'
import { getExpiredActiveDelegations, endDelegation, insertLeadEdit } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') || ''
    const secret = process.env.CRON_SECRET
    if (secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // One run at a time: a slow run overlapping the next tick stacks the load
    // (see src/lib/cron-guard.ts for the Sep-Oct 2026 CPU incident).
    return await withCronLock('expire-delegations', { budgetMs: 60_000 }, async () => {
      const expired = await getExpiredActiveDelegations()

      for (const d of expired) {
        await endDelegation(d.id, 'system-cron')
        await insertLeadEdit({
          lead_row: d.lead_row,
          phone: d.phone,
          field_name: 'delegation',
          old_value: 'active',
          new_value: `auto-ended on ${new Date().toISOString().slice(0, 10)} (expired)`,
          changed_by: 'System',
          changed_by_id: 'system-cron',
        })
      }

      return NextResponse.json({ success: true, expired: expired.length })
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Expire cron failed') }, { status: 500 })
  }
}
