'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'

interface FunnelItem { stage: string; count: number; pct: number; dropoff: number }
interface SourceItem { source: string; count: number; pct: number }
interface ScoreItem { range: string; count: number }

interface AnalyticsData {
  summary: { totalLeads: number; activeLeads: number; converted: number; conversionRate: number }
  funnel: FunnelItem[]
  sources: SourceItem[]
  scoreDistribution: ScoreItem[]
  priorities: { HOT: number; WARM: number; COLD: number; NONE: number }
  sla: { avg_first_response_hours: number; avg_close_days: number; total: number }
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'var(--color-status-new)',
  DECK_SENT: 'var(--color-status-deck-sent)',
  REPLIED: 'var(--color-status-replied)',
  CALLING: 'var(--color-status-calling)',
  CALL_DONE: 'var(--color-status-call-done)',
  INTERESTED: 'var(--color-status-interested)',
  NEGOTIATION: 'var(--color-status-negotiation)',
  CONVERTED: 'var(--color-status-converted)',
  DELAYED: 'var(--color-status-delayed)',
  LOST: 'var(--color-status-lost)',
}

export default function AnalyticsPage() {
  const router = useRouter()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const authRes = await fetch('/api/auth/me')
        const authData = await authRes.json()
        if (!authData.success) { router.push('/login'); return }

        const res = await fetch('/api/analytics')
        const d = await res.json()
        if (d.success) setData(d.data)
      } catch { /* ignore */ }
      setLoading(false)
    }
    load()
  }, [router])

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-56px)]">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  const maxFunnel = Math.max(...data.funnel.map(f => f.count), 1)
  const maxSource = Math.max(...data.sources.map(s => s.count), 1)
  const maxScore = Math.max(...data.scoreDistribution.map(s => s.count), 1)

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        <h1 className="text-xl font-bold text-text mb-1">Analytics</h1>
        <p className="text-sm text-dim mb-6">{data.summary.totalLeads} total leads &middot; {data.summary.activeLeads} active &middot; {data.summary.converted} converted ({data.summary.conversionRate}%)</p>

        {/* ─── Summary Cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-[10px] text-dim uppercase tracking-wider font-medium mb-1">Avg First Response</p>
            <p className={`text-2xl font-bold ${data.sla.avg_first_response_hours <= 4 ? 'text-success' : data.sla.avg_first_response_hours <= 12 ? 'text-warning' : 'text-danger'}`}>
              {data.sla.avg_first_response_hours > 0 ? `${data.sla.avg_first_response_hours}h` : '-'}
            </p>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-[10px] text-dim uppercase tracking-wider font-medium mb-1">Avg Time to Close</p>
            <p className={`text-2xl font-bold ${data.sla.avg_close_days <= 15 ? 'text-success' : data.sla.avg_close_days <= 30 ? 'text-warning' : 'text-danger'}`}>
              {data.sla.avg_close_days > 0 ? `${data.sla.avg_close_days}d` : '-'}
            </p>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-[10px] text-dim uppercase tracking-wider font-medium mb-1">HOT Leads</p>
            <p className="text-2xl font-bold text-priority-hot">{data.priorities.HOT}</p>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-[10px] text-dim uppercase tracking-wider font-medium mb-1">Conversion Rate</p>
            <p className="text-2xl font-bold text-accent">{data.summary.conversionRate}%</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ─── Conversion Funnel ──────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-sm font-bold text-text mb-4">Conversion Funnel</h2>
            <div className="space-y-2.5">
              {data.funnel.map((item, i) => (
                <div key={item.stage} className="flex items-center gap-3">
                  <span className="text-[10px] font-semibold text-dim w-24 text-right uppercase tracking-wider">
                    {item.stage.replace('_', ' ')}
                  </span>
                  <div className="flex-1 relative">
                    <div className="h-6 bg-elevated rounded overflow-hidden">
                      <div
                        className="h-full rounded transition-all duration-700 flex items-center px-2"
                        style={{
                          width: `${Math.max(2, (item.count / maxFunnel) * 100)}%`,
                          backgroundColor: STATUS_COLORS[item.stage] || 'var(--color-muted)',
                          opacity: 0.85,
                        }}
                      >
                        <span className="text-[10px] font-bold text-white drop-shadow-sm whitespace-nowrap">
                          {item.count}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-dim w-10 text-right">
                    {item.pct}%
                  </span>
                  {i > 0 && item.dropoff > 0 && (
                    <span className="text-[9px] text-danger/70 w-10 text-right">
                      -{item.dropoff}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ─── Lead Sources ────────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-sm font-bold text-text mb-4">Lead Sources</h2>
            {data.sources.length === 0 ? (
              <p className="text-sm text-dim">No source data available</p>
            ) : (
              <div className="space-y-2.5">
                {data.sources.map((s, i) => {
                  const colors = [
                    'var(--color-accent)', 'var(--color-status-interested)', 'var(--color-status-replied)',
                    'var(--color-status-negotiation)', 'var(--color-status-calling)', 'var(--color-status-deck-sent)',
                    'var(--color-warning)', 'var(--color-dim)',
                  ]
                  return (
                    <div key={s.source} className="flex items-center gap-3">
                      <span className="text-[11px] text-muted w-28 text-right truncate" title={s.source}>
                        {s.source}
                      </span>
                      <div className="flex-1">
                        <div className="h-5 bg-elevated rounded overflow-hidden">
                          <div
                            className="h-full rounded transition-all duration-700 flex items-center px-2"
                            style={{
                              width: `${Math.max(3, (s.count / maxSource) * 100)}%`,
                              backgroundColor: colors[i % colors.length],
                              opacity: 0.8,
                            }}
                          >
                            <span className="text-[10px] font-bold text-white drop-shadow-sm">{s.count}</span>
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] text-dim w-10 text-right">{s.pct}%</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ─── Score Distribution ──────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-sm font-bold text-text mb-4">Lead Score Distribution</h2>
            <div className="flex items-end gap-3 h-40">
              {data.scoreDistribution.map((s, i) => {
                const colors = ['var(--color-score-poor)', 'var(--color-score-low)', 'var(--color-score-fair)', 'var(--color-score-good)', 'var(--color-score-great)']
                const height = maxScore > 0 ? Math.max(4, (s.count / maxScore) * 100) : 4
                return (
                  <div key={s.range} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-muted">{s.count}</span>
                    <div className="w-full bg-elevated rounded-t overflow-hidden" style={{ height: '100%', display: 'flex', alignItems: 'flex-end' }}>
                      <div
                        className="w-full rounded-t transition-all duration-700"
                        style={{
                          height: `${height}%`,
                          backgroundColor: colors[i],
                          opacity: 0.85,
                        }}
                      />
                    </div>
                    <span className="text-[9px] text-dim">{s.range}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ─── Priority Breakdown ──────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-sm font-bold text-text mb-4">Priority Breakdown</h2>
            <div className="space-y-3">
              {[
                { label: 'HOT', count: data.priorities.HOT, color: 'var(--color-priority-hot)' },
                { label: 'WARM', count: data.priorities.WARM, color: 'var(--color-priority-warm)' },
                { label: 'COLD', count: data.priorities.COLD, color: 'var(--color-priority-cold)' },
                { label: 'Unset', count: data.priorities.NONE, color: 'var(--color-dim)' },
              ].map(p => {
                const total = data.summary.totalLeads || 1
                return (
                  <div key={p.label} className="flex items-center gap-3">
                    <span className="text-xs font-semibold w-12 text-right" style={{ color: p.color }}>{p.label}</span>
                    <div className="flex-1 h-4 bg-elevated rounded overflow-hidden">
                      <div
                        className="h-full rounded transition-all duration-700"
                        style={{ width: `${Math.max(1, (p.count / total) * 100)}%`, backgroundColor: p.color, opacity: 0.8 }}
                      />
                    </div>
                    <span className="text-xs text-muted w-16 text-right">{p.count} ({Math.round((p.count / total) * 100)}%)</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
