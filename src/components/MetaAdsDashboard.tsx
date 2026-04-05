'use client'

import { useState, useEffect, useCallback } from 'react'

interface Insights {
  spend: number
  impressions: number
  clicks: number
  ctr: string
  cpm: number
  reach: number
  leads: number
  cpl: number
}

interface Campaign {
  id: string
  name: string
  status: string
  daily_budget: number
  spend_7d: number
  leads_7d: number
  cpl_7d: number
  impressions_7d: number
  ctr_7d: string
}

interface Snapshot {
  today: Insights | null
  yesterday: Insights | null
  last_7d: Insights | null
  last_30d: Insights | null
  campaigns: Campaign[]
  total_daily_budget: number
  active_campaign_count: number
  fetched_at: string
}

interface SummaryResponse {
  success: boolean
  configured: boolean
  data: Snapshot | null
  fetched_at?: string
  stale_minutes?: number
  cooldown_minutes?: number
  message?: string
}

function formatCurrency(n: number): string {
  if (!n) return '₹0'
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`
  return `₹${n}`
}

function formatNumber(n: number): string {
  if (!n) return '0'
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function formatStale(minutes: number | undefined): string {
  if (minutes === undefined) return 'never'
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export default function MetaAdsDashboard() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/meta-ads/summary')
      const data: SummaryResponse = await res.json()
      setSummary(data)
    } catch {
      setError('Failed to load Meta Ads data')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  async function handleSync() {
    setSyncing(true)
    setError('')
    try {
      const res = await fetch('/api/meta-ads/sync', { method: 'POST' })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || data.reason || 'Sync failed')
      } else if (data.skipped) {
        setError(data.reason || 'Sync skipped (cooldown active)')
      }
      await fetchSummary()
    } catch {
      setError('Sync failed')
    }
    setSyncing(false)
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="h-4 bg-elevated rounded w-40 mb-4 animate-pulse" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-elevated rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!summary?.configured) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 8h6v2H9V8zm0 3h6v2H9v-2zm0 3h4v2H9v-2z M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text">Meta Ads Dashboard</h3>
            <p className="text-xs text-dim">Not configured</p>
          </div>
        </div>
        <div className="bg-elevated/50 border border-border rounded-lg p-3 mt-3">
          <p className="text-xs text-dim leading-relaxed">
            Set these environment variables on the VPS to enable Meta Ads analytics:
          </p>
          <ul className="text-[11px] text-muted mt-2 space-y-1 font-mono">
            <li>META_ACCESS_TOKEN=...</li>
            <li>META_AD_ACCOUNT_ID=act_377967454881310</li>
          </ul>
        </div>
      </div>
    )
  }

  const data = summary.data

  if (!data) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text">Meta Ads Dashboard</h3>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-xs bg-accent/10 hover:bg-accent/20 text-accent px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 font-medium"
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
        <p className="text-xs text-dim">{summary.message || 'No data yet — click Sync Now to fetch from Meta'}</p>
        {error && <p className="text-xs text-danger mt-2">{error}</p>}
      </div>
    )
  }

  const metrics = [
    { label: 'Today', value: data.today, color: 'text-accent' },
    { label: 'Yesterday', value: data.yesterday, color: 'text-muted' },
    { label: 'Last 7 days', value: data.last_7d, color: 'text-status-interested' },
    { label: 'Last 30 days', value: data.last_30d, color: 'text-status-deck-sent' },
  ]

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text">Meta Ads Dashboard</h3>
            <p className="text-[11px] text-dim">
              {data.active_campaign_count} active • ₹{data.total_daily_budget.toLocaleString('en-IN')}/day budget • Synced {formatStale(summary.stale_minutes)}
            </p>
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="text-xs bg-elevated hover:bg-border text-muted hover:text-text px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
          title="Sync from Meta (rate-limited to avoid bans)"
        >
          <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          {syncing ? 'Syncing' : 'Sync'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-warning bg-warning/10 border border-warning/20 rounded px-3 py-2">{error}</div>
      )}

      {/* Metric Cards — 4 time ranges */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map(m => (
          <div key={m.label} className="bg-elevated/50 border border-border rounded-lg p-3">
            <p className="text-[10px] text-dim uppercase tracking-wider font-medium mb-1.5">{m.label}</p>
            <p className={`text-xl font-bold ${m.color}`}>
              {m.value ? formatCurrency(m.value.spend) : '—'}
            </p>
            {m.value && (
              <div className="mt-2 space-y-1 text-[10px]">
                <div className="flex justify-between text-dim">
                  <span>Leads</span>
                  <span className="text-text font-medium">{m.value.leads}</span>
                </div>
                <div className="flex justify-between text-dim">
                  <span>CPL</span>
                  <span className="text-text font-medium">{m.value.cpl > 0 ? `₹${m.value.cpl}` : '—'}</span>
                </div>
                <div className="flex justify-between text-dim">
                  <span>CTR</span>
                  <span className="text-text font-medium">{m.value.ctr}%</span>
                </div>
                <div className="flex justify-between text-dim">
                  <span>Reach</span>
                  <span className="text-text font-medium">{formatNumber(m.value.reach)}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Active Campaigns Table */}
      {data.campaigns.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Active Campaigns (7d)</h4>
          <div className="bg-elevated/30 border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-dim uppercase tracking-wider">Campaign</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-dim uppercase tracking-wider">Budget/day</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-dim uppercase tracking-wider">Spend 7d</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-dim uppercase tracking-wider">Leads</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-dim uppercase tracking-wider">CPL</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-dim uppercase tracking-wider">CTR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {data.campaigns.map(c => (
                  <tr key={c.id} className="hover:bg-elevated/50 transition-colors">
                    <td className="px-3 py-2 text-text font-medium truncate max-w-[200px]" title={c.name}>{c.name}</td>
                    <td className="px-3 py-2 text-right text-muted">₹{c.daily_budget.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 text-right text-text font-medium">{formatCurrency(c.spend_7d)}</td>
                    <td className="px-3 py-2 text-right text-text font-medium">{c.leads_7d}</td>
                    <td className="px-3 py-2 text-right">
                      {c.cpl_7d > 0 ? (
                        <span className={`font-medium ${c.cpl_7d <= 80 ? 'text-status-converted' : c.cpl_7d <= 150 ? 'text-status-delayed' : 'text-status-lost'}`}>
                          ₹{c.cpl_7d}
                        </span>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-muted">{c.ctr_7d}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Note */}
      <p className="text-[10px] text-dim italic">
        Data cached from Meta Graph API. Auto-refreshes every {Math.round((summary.cooldown_minutes || 15) / 15) * 6}h via cron. Manual sync has a {summary.cooldown_minutes}-min cooldown to protect the ad account from rate-limit bans.
      </p>
    </div>
  )
}
