'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Lead {
  row_number: number
  full_name: string
  phone: string
  lead_status: string
  assigned_to: string
  created_time: string
}

interface AgentUser {
  id: string
  name: string
  role: string
  active: boolean
}

interface SessionUser {
  name: string
  role: string
}

interface AgentMetrics {
  name: string
  assigned: number
  contacted: number
  replied: number
  hot: number
  converted: number
  lost: number
  conversion_rate: number
  avg_response_days: number
}

// ─── WA Token Countdown ─────────────────────────────────────────────────────

const WA_TOKEN_SET_DATE = new Date('2026-03-18')
const WA_TOKEN_EXPIRY_DAYS = 60

function WATokenCountdown() {
  const now = new Date()
  const expiryDate = new Date(WA_TOKEN_SET_DATE)
  expiryDate.setDate(expiryDate.getDate() + WA_TOKEN_EXPIRY_DAYS)

  const diffMs = expiryDate.getTime() - now.getTime()
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))

  const isUrgent = daysRemaining < 14
  const isCritical = daysRemaining < 7

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium ${
        isCritical
          ? 'bg-danger/10 border-danger/30 text-danger'
          : isUrgent
          ? 'bg-[#f59e0b20] border-[#f59e0b30] text-[#fbbf24]'
          : 'bg-[#22c55e15] border-[#22c55e25] text-[#4ade80]'
      }`}
    >
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>
        WA Token: <span className="font-bold">{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</span> remaining
      </span>
      {isUrgent && (
        <span className="text-[10px] uppercase tracking-wider font-semibold ml-1 opacity-70">
          {isCritical ? '- RENEW NOW' : '- Renew Soon'}
        </span>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Statuses that count as "lead has engaged" (non-overlapping with contacted)
const TERMINAL_STATUSES = ['CONVERTED', 'LOST']
const NOT_YET_CONTACTED = ['NEW', 'DECK_SENT']

function calculateAgentMetrics(leads: Lead[], agents: AgentUser[]): AgentMetrics[] {
  const metricsMap = new Map<string, AgentMetrics>()

  for (const agent of agents) {
    metricsMap.set(agent.name, {
      name: agent.name,
      assigned: 0,
      contacted: 0,
      replied: 0,
      hot: 0,
      converted: 0,
      lost: 0,
      conversion_rate: 0,
      avg_response_days: 0,
    })
  }

  const responseDays = new Map<string, number[]>()

  for (const lead of leads) {
    const agentName = lead.assigned_to
    if (!agentName) continue

    if (!metricsMap.has(agentName)) {
      metricsMap.set(agentName, {
        name: agentName,
        assigned: 0, contacted: 0, replied: 0, hot: 0,
        converted: 0, lost: 0, conversion_rate: 0, avg_response_days: 0,
      })
    }

    const m = metricsMap.get(agentName)!
    m.assigned++

    const status = lead.lead_status?.toUpperCase() || ''

    // Contacted = any lead past NEW/DECK_SENT (they've been reached out to)
    if (!NOT_YET_CONTACTED.includes(status) && status !== '') {
      m.contacted++
    }

    // Replied = specifically REPLIED status only (not HOT/INTERESTED which are separate stages)
    if (status === 'REPLIED') {
      m.replied++
    }

    // Hot = status HOT only (not priority — agent should move lead to HOT status)
    if (status === 'HOT') {
      m.hot++
    }

    if (status === 'CONVERTED') {
      m.converted++
    }

    if (status === 'LOST') {
      m.lost++
    }

    // Response days: from lead creation to now, for leads that have replied or beyond
    if (!NOT_YET_CONTACTED.includes(status) && !TERMINAL_STATUSES.includes(status) && status !== 'CONTACTED' && lead.created_time) {
      const created = new Date(lead.created_time)
      if (!isNaN(created.getTime())) {
        const now = new Date()
        const days = Math.max(0, Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)))
        if (!responseDays.has(agentName)) responseDays.set(agentName, [])
        responseDays.get(agentName)!.push(days)
      }
    }
  }

  for (const [name, m] of metricsMap) {
    // Conversion rate = converted / assigned (same as pipeline)
    m.conversion_rate = m.assigned > 0 ? Math.round((m.converted / m.assigned) * 100) : 0
    const days = responseDays.get(name)
    m.avg_response_days = days && days.length > 0
      ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10
      : 0
  }

  return Array.from(metricsMap.values()).sort((a, b) => b.assigned - a.assigned)
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AgentStatsPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [agents, setAgents] = useState<AgentUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ─── Auth Check ──────────────────────────────────────────────────────────

  const fetchAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      const data = await res.json()
      if (!data.success) {
        router.push('/login')
        return null
      }
      if (data.data.role !== 'admin') {
        router.push('/dashboard')
        return null
      }
      setCurrentUser(data.data)
      return data.data as SessionUser
    } catch {
      router.push('/login')
      return null
    }
  }, [router])

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const [leadsRes, usersRes] = await Promise.all([
        fetch('/api/leads'),
        fetch('/api/users'),
      ])
      const [leadsData, usersData] = await Promise.all([
        leadsRes.json(),
        usersRes.json(),
      ])

      if (leadsData.success) setLeads(leadsData.data)
      else setError('Failed to load leads')

      if (usersData.success) setAgents(usersData.data.filter((u: AgentUser) => u.active))
    } catch {
      setError('Failed to load data')
    }
  }, [])

  // ─── Init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      setLoading(true)
      const user = await fetchAuth()
      if (user) {
        await fetchData()
      }
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Derived Data ────────────────────────────────────────────────────────

  const metrics = calculateAgentMetrics(leads, agents)

  const totals = metrics.reduce(
    (acc, m) => ({
      assigned: acc.assigned + m.assigned,
      contacted: acc.contacted + m.contacted,
      replied: acc.replied + m.replied,
      hot: acc.hot + m.hot,
      converted: acc.converted + m.converted,
      lost: acc.lost + m.lost,
    }),
    { assigned: 0, contacted: 0, replied: 0, hot: 0, converted: 0, lost: 0 }
  )

  const totalConversionRate = totals.assigned > 0
    ? Math.round((totals.converted / totals.assigned) * 100)
    : 0

  const unassigned = leads.filter(l => !l.assigned_to).length

  // ─── Loading ─────────────────────────────────────────────────────────────

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-56px)]">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-56px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-muted text-sm">Loading agent stats...</span>
          </div>
        </div>
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {/* Error Banner */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-danger hover:text-red-300 ml-4">
              Dismiss
            </button>
          </div>
        )}

        {/* Header + WA Token */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-text">Agent Performance</h1>
            <p className="text-sm text-dim mt-0.5">
              {metrics.length} agent{metrics.length !== 1 ? 's' : ''} tracked
              {unassigned > 0 && (
                <span className="text-accent ml-2">({unassigned} unassigned lead{unassigned !== 1 ? 's' : ''})</span>
              )}
            </p>
          </div>
          <WATokenCountdown />
        </div>

        {/* ─── Summary Cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[
            { label: 'Assigned', value: totals.assigned, color: 'text-text' },
            { label: 'Contacted', value: totals.contacted, color: 'text-[#f5c518]' },
            { label: 'Replied', value: totals.replied, color: 'text-[#4ade80]' },
            { label: 'Hot', value: totals.hot, color: 'text-[#fb923c]' },
            { label: 'Converted', value: totals.converted, color: 'text-[#34d399]' },
            { label: 'Lost', value: totals.lost, color: 'text-[#f87171]' },
          ].map(card => (
            <div
              key={card.label}
              className="bg-card border border-border rounded-lg px-4 py-3"
            >
              <p className="text-[10px] text-dim uppercase tracking-wider font-medium mb-1.5">
                {card.label}
              </p>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* ─── Overall Conversion Rate ────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg px-5 py-4 mb-6 flex items-center gap-4">
          <div className="flex-1">
            <p className="text-[10px] text-dim uppercase tracking-wider font-medium mb-1">Overall Conversion Rate</p>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-accent">{totalConversionRate}%</span>
              <span className="text-sm text-dim mb-1">
                ({totals.converted} of {totals.assigned} assigned leads)
              </span>
            </div>
          </div>
          {/* Simple bar */}
          <div className="w-48 hidden sm:block">
            <div className="h-2 bg-elevated rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, totalConversionRate)}%` }}
              />
            </div>
          </div>
        </div>

        {/* ─── Agent Table ────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated/50">
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Agent</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider">Assigned</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider">Contacted</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider">Replied</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider">Hot</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider">Converted</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider">Lost</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider">Conv. Rate</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider">Avg Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {metrics.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-muted">
                      No agent data available.
                    </td>
                  </tr>
                ) : (
                  metrics.map((m) => (
                    <tr key={m.name} className="hover:bg-elevated/30 transition-colors">
                      {/* Agent Name + Avatar */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-accent">
                              {m.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-text">{m.name}</span>
                        </div>
                      </td>

                      {/* Assigned */}
                      <td className="px-3 py-3 text-center">
                        <span className="text-text font-semibold">{m.assigned}</span>
                      </td>

                      {/* Contacted */}
                      <td className="px-3 py-3 text-center">
                        <span className="text-[#f5c518]">{m.contacted}</span>
                      </td>

                      {/* Replied */}
                      <td className="px-3 py-3 text-center">
                        <span className="text-[#4ade80]">{m.replied}</span>
                      </td>

                      {/* Hot */}
                      <td className="px-3 py-3 text-center">
                        <span className={m.hot > 0 ? 'text-[#fb923c] font-semibold' : 'text-dim'}>{m.hot}</span>
                      </td>

                      {/* Converted */}
                      <td className="px-3 py-3 text-center">
                        <span className={m.converted > 0 ? 'text-[#34d399] font-semibold' : 'text-dim'}>{m.converted}</span>
                      </td>

                      {/* Lost */}
                      <td className="px-3 py-3 text-center">
                        <span className={m.lost > 0 ? 'text-[#f87171]' : 'text-dim'}>{m.lost}</span>
                      </td>

                      {/* Conversion Rate */}
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className={`font-semibold ${
                            m.conversion_rate >= 20 ? 'text-[#34d399]' :
                            m.conversion_rate >= 10 ? 'text-[#fbbf24]' :
                            m.conversion_rate > 0 ? 'text-[#fb923c]' :
                            'text-dim'
                          }`}>
                            {m.conversion_rate}%
                          </span>
                          {/* Mini bar */}
                          <div className="w-12 h-1.5 bg-elevated rounded-full overflow-hidden hidden lg:block">
                            <div
                              className={`h-full rounded-full ${
                                m.conversion_rate >= 20 ? 'bg-[#34d399]' :
                                m.conversion_rate >= 10 ? 'bg-[#fbbf24]' :
                                'bg-[#fb923c]'
                              }`}
                              style={{ width: `${Math.min(100, m.conversion_rate)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Avg Response Days */}
                      <td className="px-3 py-3 text-center">
                        <span className={`${
                          m.avg_response_days === 0 ? 'text-dim' :
                          m.avg_response_days <= 3 ? 'text-[#4ade80]' :
                          m.avg_response_days <= 7 ? 'text-[#fbbf24]' :
                          'text-[#f87171]'
                        }`}>
                          {m.avg_response_days > 0 ? `${m.avg_response_days}d` : '-'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}

                {/* Totals Row */}
                {metrics.length > 0 && (
                  <tr className="bg-elevated/40 border-t-2 border-border">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-muted text-xs uppercase tracking-wider">Total</span>
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-text">{totals.assigned}</td>
                    <td className="px-3 py-3 text-center font-bold text-[#f5c518]">{totals.contacted}</td>
                    <td className="px-3 py-3 text-center font-bold text-[#4ade80]">{totals.replied}</td>
                    <td className="px-3 py-3 text-center font-bold text-[#fb923c]">{totals.hot}</td>
                    <td className="px-3 py-3 text-center font-bold text-[#34d399]">{totals.converted}</td>
                    <td className="px-3 py-3 text-center font-bold text-[#f87171]">{totals.lost}</td>
                    <td className="px-3 py-3 text-center font-bold text-accent">{totalConversionRate}%</td>
                    <td className="px-3 py-3 text-center text-dim">-</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
