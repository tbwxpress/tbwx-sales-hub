import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getBulkAutoMessageStatus } from '@/lib/db'

/**
 * GET /api/leads/auto-message-stats
 *
 * Returns delivery status of the first automated message for all leads.
 * Used by the dashboard to show WA delivery icons without N+1 queries.
 * Returns a map of phone (last 10 digits) -> status.
 */
export async function GET() {
  try {
    const session = await getSession()
    requireAuth(session)

    const stats = await getBulkAutoMessageStatus()

    return NextResponse.json({ success: true, data: stats })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}
