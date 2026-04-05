import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { fetchMetaAdsSnapshot } from '@/lib/meta-ads'
import { getMetaAdsSnapshot, setMetaAdsSnapshot } from '@/lib/db'
import { META_ADS } from '@/config/client'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * POST /api/meta-ads/sync
 *
 * Syncs Meta Ads data from Graph API into SQLite cache.
 * Rate limited: won't sync if last sync was within refreshCooldownMinutes
 * unless ?force=true (admin only) or called by cron with valid secret.
 *
 * Designed to run every 6 hours via external cron.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = authHeader?.replace('Bearer ', '')
  const isCron = CRON_SECRET && cronSecret === CRON_SECRET

  let isAdmin = false
  if (!isCron) {
    const { getSession, requireAuth } = await import('@/lib/auth')
    const session = await getSession()
    try {
      const user = requireAuth(session)
      if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Admin only' }, { status: 403 })
      }
      isAdmin = true
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    // Rate limit check — don't sync if last sync was within cooldown window
    // (unless force=true from an admin)
    const force = new URL(req.url).searchParams.get('force') === 'true'
    const existing = await getMetaAdsSnapshot('full')

    if (existing && !force) {
      const fetchedAt = new Date(existing.fetched_at).getTime()
      const minutesAgo = (Date.now() - fetchedAt) / 60000
      const cooldown = isAdmin ? META_ADS.refreshCooldownMinutes : 60 // Cron: 1h min, admin: 15min

      if (minutesAgo < cooldown) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: `Last synced ${Math.round(minutesAgo)} minutes ago (cooldown: ${cooldown}m)`,
          fetched_at: existing.fetched_at,
        })
      }
    }

    // Check credentials are configured
    if (!META_ADS.accessToken || !META_ADS.adAccountId) {
      return NextResponse.json({
        success: false,
        error: 'Meta Ads not configured — set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID',
      }, { status: 500 })
    }

    // Fetch fresh snapshot from Meta API (5 calls total, sequenced)
    const snapshot = await fetchMetaAdsSnapshot()

    // Store in cache
    await setMetaAdsSnapshot('full', snapshot)

    return NextResponse.json({
      success: true,
      fetched_at: snapshot.fetched_at,
      active_campaigns: snapshot.active_campaign_count,
      total_daily_budget: snapshot.total_daily_budget,
    })
  } catch (err) {
    console.error('[meta-ads/sync] Error:', err)
    return NextResponse.json({
      success: false,
      error: apiError(err, 'Meta Ads sync failed'),
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'meta-ads-sync',
    description: 'Syncs Meta Ads data into SQLite cache',
    sync_interval_hours: META_ADS.syncIntervalHours,
    refresh_cooldown_minutes: META_ADS.refreshCooldownMinutes,
    configured: !!(META_ADS.accessToken && META_ADS.adAccountId),
  })
}
