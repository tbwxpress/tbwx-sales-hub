import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getMetaAdsSnapshot } from '@/lib/db'
import { META_ADS } from '@/config/client'

/**
 * GET /api/meta-ads/summary
 *
 * Reads Meta Ads data from SQLite cache — does NOT hit Graph API.
 * Used by the admin dashboard widget.
 */
export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const snapshot = await getMetaAdsSnapshot('full')

    if (!snapshot) {
      return NextResponse.json({
        success: true,
        configured: !!(META_ADS.accessToken && META_ADS.adAccountId),
        data: null,
        message: 'No snapshot yet — trigger a sync to fetch data',
      })
    }

    // Calculate how stale the data is
    const fetchedAt = new Date(snapshot.fetched_at).getTime()
    const minutesAgo = Math.round((Date.now() - fetchedAt) / 60000)

    return NextResponse.json({
      success: true,
      configured: true,
      data: snapshot.data,
      fetched_at: snapshot.fetched_at,
      stale_minutes: minutesAgo,
      cooldown_minutes: META_ADS.refreshCooldownMinutes,
    })
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: apiError(err, 'Failed to load Meta Ads summary'),
    }, { status: 500 })
  }
}
