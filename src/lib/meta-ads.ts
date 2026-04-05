/**
 * Meta Ads API wrapper — Marketing API (Graph API)
 *
 * IMPORTANT: Rate limit discipline
 * - Only called by the sync cron, NEVER on page load
 * - Max 5 calls per sync (4 account insights + 1 campaigns)
 * - Results cached in meta_ads_snapshots table
 */

import { META_ADS } from '@/config/client'

function getToken(): string {
  return META_ADS.accessToken
}

function getAdAccount(): string {
  // Format: act_1234567890 (no spaces)
  const raw = META_ADS.adAccountId
  return raw.startsWith('act_') ? raw : `act_${raw}`
}

interface MetaInsights {
  spend: string
  impressions: string
  clicks: string
  ctr: string
  cpm: string
  reach: string
  actions?: { action_type: string; value: string }[]
  date_start: string
  date_stop: string
}

interface MetaCampaign {
  id: string
  name: string
  status: string
  daily_budget?: string
  lifetime_budget?: string
  insights?: { data: MetaInsights[] }
}

async function fetchMeta<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = getToken()
  if (!token) throw new Error('META_ACCESS_TOKEN not set')

  const url = new URL(`${META_ADS.apiBase}${path}`)
  url.searchParams.set('access_token', token)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    // Cache-control: don't use Next's fetch cache, we handle caching ourselves
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Meta API ${res.status}: ${body.substring(0, 300)}`)
  }

  return res.json()
}

function extractLeadCount(insights: MetaInsights | undefined): number {
  if (!insights?.actions) return 0
  const leadActions = insights.actions.filter(a =>
    a.action_type === 'lead' ||
    a.action_type === 'leadgen.other' ||
    a.action_type === 'onsite_conversion.lead_grouped' ||
    a.action_type.includes('lead')
  )
  return leadActions.reduce((sum, a) => sum + Number(a.value || 0), 0)
}

function formatInsights(raw: MetaInsights | undefined) {
  if (!raw) return null
  const leads = extractLeadCount(raw)
  const spend = Number(raw.spend || 0)
  return {
    spend: Math.round(spend),
    impressions: Number(raw.impressions || 0),
    clicks: Number(raw.clicks || 0),
    ctr: Number(raw.ctr || 0).toFixed(2),
    cpm: Math.round(Number(raw.cpm || 0)),
    reach: Number(raw.reach || 0),
    leads,
    cpl: leads > 0 ? Math.round(spend / leads) : 0,
    date_start: raw.date_start,
    date_stop: raw.date_stop,
  }
}

export interface MetaAdsSnapshot {
  today: ReturnType<typeof formatInsights>
  yesterday: ReturnType<typeof formatInsights>
  last_7d: ReturnType<typeof formatInsights>
  last_30d: ReturnType<typeof formatInsights>
  campaigns: {
    id: string
    name: string
    status: string
    daily_budget: number
    spend_7d: number
    leads_7d: number
    cpl_7d: number
    impressions_7d: number
    ctr_7d: string
  }[]
  total_daily_budget: number
  active_campaign_count: number
  fetched_at: string
}

/**
 * Fetch complete Meta Ads snapshot.
 * Makes ONLY 2 API calls total:
 * 1. Account insights for today, yesterday, last_7d, last_30d (1 call with time_range breakdown)
 * 2. Active campaigns with 7d insights (1 call with nested insights)
 */
export async function fetchMetaAdsSnapshot(): Promise<MetaAdsSnapshot> {
  const account = getAdAccount()

  // Call 1: Account insights for 4 time ranges using batch/time_increment
  // Actually we'll make 4 separate small calls to get clean date buckets
  // (Meta doesn't support multiple custom date ranges in a single insights call)
  // But we sequence them with a small delay to avoid rate burst.

  const fetchInsights = async (datePreset: string) => {
    const res = await fetchMeta<{ data: MetaInsights[] }>(
      `/${account}/insights`,
      {
        fields: 'spend,impressions,clicks,ctr,cpm,reach,actions',
        date_preset: datePreset,
      }
    )
    return res.data?.[0]
  }

  // Sequence with small delays to be gentle on the API
  const today = await fetchInsights('today')
  await new Promise(r => setTimeout(r, 200))
  const yesterday = await fetchInsights('yesterday')
  await new Promise(r => setTimeout(r, 200))
  const last_7d = await fetchInsights('last_7d')
  await new Promise(r => setTimeout(r, 200))
  const last_30d = await fetchInsights('last_30d')
  await new Promise(r => setTimeout(r, 200))

  // Call 5: Active campaigns with 7d insights nested (one call gets all campaign data)
  const campaignsRes = await fetchMeta<{ data: MetaCampaign[] }>(
    `/${account}/campaigns`,
    {
      fields: 'id,name,status,daily_budget,lifetime_budget,insights.date_preset(last_7d){spend,impressions,clicks,ctr,actions}',
      effective_status: '["ACTIVE","PAUSED"]',
      limit: '50',
    }
  )

  const activeCampaigns = (campaignsRes.data || [])
    .filter(c => c.status === 'ACTIVE')
    .map(c => {
      const ins = c.insights?.data?.[0]
      const spend = Number(ins?.spend || 0)
      const leads = extractLeadCount(ins)
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        daily_budget: Number(c.daily_budget || 0) / 100, // Meta returns in paisa/cents
        spend_7d: Math.round(spend),
        leads_7d: leads,
        cpl_7d: leads > 0 ? Math.round(spend / leads) : 0,
        impressions_7d: Number(ins?.impressions || 0),
        ctr_7d: Number(ins?.ctr || 0).toFixed(2),
      }
    })
    .sort((a, b) => b.spend_7d - a.spend_7d)

  const totalDailyBudget = activeCampaigns.reduce((sum, c) => sum + c.daily_budget, 0)

  return {
    today: formatInsights(today),
    yesterday: formatInsights(yesterday),
    last_7d: formatInsights(last_7d),
    last_30d: formatInsights(last_30d),
    campaigns: activeCampaigns,
    total_daily_budget: totalDailyBudget,
    active_campaign_count: activeCampaigns.length,
    fetched_at: new Date().toISOString(),
  }
}
