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

interface SlaAgent {
  name: string
  avg_first_response_hours: number
  avg_close_days: number
  leads_tracked: number
}

interface SlaData {
  overall: { avg_first_response_hours: number; avg_close_days: number; total: number }
  agents: SlaAgent[]
}

interface AgentMetrics {
  name: string
  assigned: number
  contacted: number
  replied: number
  interested: number
  converted: number
  lost: number
  conversion_rate: number
  avg_response_days: number
}

// ─── WA Token Countdown ─────────────────────────────────────────────────────

const WA_TOKEN_SET_DATE = new Date('2026-04-29')
const WA_TOKEN_EXPIRY_DAYS = 90

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
          ? 'bg-warning/10 border-warning/20 text-warning'
          : 'bg-success/10 border-success/20 text-success'
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
const TERMINAL_STATUSES = ['CONVERTED', 'LOST', 'DELAYED']
const NOT_YET_CONTACTED = ['NEW']

function calculateAgentMetrics(leads: Lead[], agents: AgentUser[]): AgentMetrics[] {
  const metricsMap = new Map<string, AgentMetrics>()

  for (const agent of agents) {
    metricsMap.set(agent.name, {
      name: agent.name,
      assigned: 0,
      contacted: 0,
      replied: 0,
      interested: 0,
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
        assigned: 0, contacted: 0, replied: 0, interested: 0,
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

    // Interested = status HOT
    if (status === 'HOT') {
      m.interested++
    }

    if (status === 'DELAYED') {
      m.lost++
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

// ─── Self Activity View (rendered for non-admins) ────────────────────────────
// Shows the caller's own daily activity card, the peer-team average for the same
// day, and an anonymous rank ("#3 of 7"). Peers are never named in this view —
// non-admins can self-evaluate without seeing other agents' raw numbers.

interface SelfActivityViewProps {
  you: {
    name: string
    type: 'closer' | 'telecaller' | 'admin' | 'none'
    leads_touched: number
    actions: { manual_messages: number; calls_logged: number; notes_added: number; status_changes: number; reassignments_performed: number }
    status_progressions: Record<string, number>
    touched_leads: Array<{ lead_row: number | null; phone: string; name: string; current_status: string; actions: string[] }>
  }
  teamAvg: { leads_touched: number; manual_messages: number; calls_logged: number; notes_added: number; status_changes: number }
  rank: { position: number; of: number } | null
}

function SelfActivityView({ you, teamAvg, rank }: SelfActivityViewProps) {
  const totalActions = you.actions.manual_messages + you.actions.calls_logged + you.actions.notes_added + you.actions.status_changes + you.actions.reassignments_performed
  const compare = (mine: number, avg: number) => {
    if (avg === 0 && mine === 0) return { color: 'var(--color-dim)', label: '—' }
    if (avg === 0) return { color: 'var(--color-success)', label: 'above team' }
    const diff = mine - avg
    const pct = Math.round((diff / avg) * 100)
    if (pct >= 10) return { color: 'var(--color-success)', label: `+${pct}% vs team` }
    if (pct <= -10) return { color: 'var(--color-danger)', label: `${pct}% vs team` }
    return { color: 'var(--color-muted)', label: 'on par with team' }
  }

  const rows = [
    { label: '📞 Calls', mine: you.actions.calls_logged, avg: teamAvg.calls_logged },
    { label: '💬 Messages', mine: you.actions.manual_messages, avg: teamAvg.manual_messages },
    { label: '📝 Notes', mine: you.actions.notes_added, avg: teamAvg.notes_added },
    { label: '🔄 Status moves', mine: you.actions.status_changes, avg: teamAvg.status_changes },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
      {/* Headline card — your numbers */}
      <div className="lg:col-span-2 rounded-lg p-4" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[10px] text-dim uppercase tracking-wider mb-0.5">Your activity</p>
            <p className="text-lg font-bold text-text">{you.name}</p>
            <p className="text-[11px] text-dim capitalize">{you.type}</p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-bold ${totalActions > 0 ? 'text-success' : 'text-dim'}`}>{you.leads_touched}</p>
            <p className="text-[10px] text-dim uppercase tracking-wider">leads touched today</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-3 border-t border-border">
          {rows.map(r => {
            const c = compare(r.mine, r.avg)
            return (
              <div key={r.label} className="flex items-center justify-between text-xs">
                <span className="text-dim">{r.label}</span>
                <div className="text-right">
                  <span className="text-text font-semibold">{r.mine}</span>
                  <span className="text-[10px] ml-2" style={{ color: c.color }}>{c.label}</span>
                </div>
              </div>
            )
          })}
        </div>
        {Object.keys(you.status_progressions).length > 0 && (
          <div className="text-[10px] text-dim mt-3 pt-2 border-t border-border flex flex-wrap gap-1">
            <span className="text-dim uppercase tracking-wider text-[9px] mr-1">Moved leads:</span>
            {Object.entries(you.status_progressions).map(([k, v]) => (
              <span key={k} className="px-1.5 py-0.5 rounded bg-card text-muted">
                {k.replace(/^to_/, '→ ')}: <span className="text-text font-medium">{v}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Rank + team avg card */}
      <div className="rounded-lg p-4 flex flex-col" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
        <p className="text-[10px] text-dim uppercase tracking-wider mb-2">Your rank</p>
        {rank && rank.of > 1 ? (
          <>
            <p className="text-3xl font-bold text-accent leading-none">#{rank.position}</p>
            <p className="text-xs text-dim mt-1">of {rank.of} active teammates</p>
          </>
        ) : (
          <p className="text-xs text-dim">Solo run today — no peers active.</p>
        )}
        <div className="mt-auto pt-3 text-[10px] text-dim">
          Peer numbers stay private. You only see the team average — never an individual&apos;s data.
        </div>
      </div>
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AgentStatsPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [agents, setAgents] = useState<AgentUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [slaData, setSlaData] = useState<SlaData | null>(null)
  const [tcStats, setTcStats] = useState<{
    telecallers: Array<{ user_id: string; name: string; email: string; active: boolean; manual_assigned: number; auto_queue_eligible: number; total_queue: number; by_status: Record<string, number>; calls_logged_7d: number; notes_added_7d: number }>;
    auto_queue: { enabled: boolean; user_id: string; statuses: string[] };
  } | null>(null)

  // Daily Activity tracker
  const [activityDate, setActivityDate] = useState<string>(() => {
    const istNow = new Date(Date.now() + 330 * 60 * 1000)
    return istNow.toISOString().split('T')[0]
  })
  // Activity state — supports both admin (full leaderboard) and self (own card + team avg) shapes.
  // Admin shape uses `agents` + `totals`; self shape uses `you` + `team_avg` + `your_rank`.
  type AgentEntry = {
    user_id: string; name: string; email: string; role: string;
    type: 'closer' | 'telecaller' | 'admin' | 'none';
    active: boolean; leads_touched: number;
    actions: { manual_messages: number; calls_logged: number; notes_added: number; status_changes: number; reassignments_performed: number };
    status_progressions: Record<string, number>;
    touched_leads: Array<{ lead_row: number | null; phone: string; name: string; current_status: string; actions: string[] }>;
  }
  type ActivityState =
    | {
        scope: 'admin'; date: string;
        agents: AgentEntry[];
        totals: { leads_touched: number; manual_messages: number; calls_logged: number; notes_added: number; status_changes: number; reassignments_performed: number };
        warnings: string[];
      }
    | {
        scope: 'self'; date: string;
        you: AgentEntry | null;
        team_avg: { leads_touched: number; manual_messages: number; calls_logged: number; notes_added: number; status_changes: number };
        your_rank: { position: number; of: number } | null;
        warnings: string[];
      }
  const [activity, setActivity] = useState<ActivityState | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)

  // ─── Auth Check ──────────────────────────────────────────────────────────

  const fetchAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      const data = await res.json()
      if (!data.success) {
        router.push('/login')
        return null
      }
      // Both admins and agents/telecallers can view this page now.
      // The API responds with a self-scoped payload for non-admins.
      setCurrentUser(data.data)
      return data.data as SessionUser
    } catch {
      router.push('/login')
      return null
    }
  }, [router])

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchData = useCallback(async (isAdmin: boolean) => {
    try {
      // Leads endpoint is role-aware — agents see only their own anyway.
      const leadsRes = await fetch('/api/leads')
      const leadsData = await leadsRes.json()
      if (leadsData.success) setLeads(leadsData.data)
      else setError('Failed to load leads')

      // Admin-only endpoints: skip for non-admins to avoid 403 noise.
      if (!isAdmin) return

      const [usersRes, slaRes, tcRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/reports/sla'),
        fetch('/api/analytics/telecallers'),
      ])
      const [usersData, slaResult, tcResult] = await Promise.all([
        usersRes.json(),
        slaRes.json(),
        tcRes.json(),
      ])

      if (usersData.success) setAgents(usersData.data.filter((u: AgentUser) => u.active))
      if (slaResult.success) setSlaData(slaResult.data)
      if (tcResult.success) setTcStats(tcResult.data)
    } catch {
      setError('Failed to load data')
    }
  }, [])

  // ─── Daily Activity fetcher ──────────────────────────────────────────────

  const fetchActivity = useCallback(async (date: string) => {
    setActivityLoading(true)
    try {
      const res = await fetch(`/api/analytics/agent-activity?date=${encodeURIComponent(date)}`)
      const data = await res.json()
      if (data.success) setActivity(data.data)
    } catch { /* silent */ }
    setActivityLoading(false)
  }, [])

  useEffect(() => {
    fetchActivity(activityDate)
  }, [activityDate, fetchActivity])

  // ─── Init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      setLoading(true)
      const user = await fetchAuth()
      if (user) {
        await fetchData(user.role === 'admin')
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
      interested: acc.interested + m.interested,
      converted: acc.converted + m.converted,
      lost: acc.lost + m.lost,
    }),
    { assigned: 0, contacted: 0, replied: 0, interested: 0, converted: 0, lost: 0 }
  )

  const totalConversionRate = totals.assigned > 0
    ? Math.round((totals.converted / totals.assigned) * 100)
    : 0

  const unassigned = leads.filter(l => !l.assigned_to).length

  // ─── Loading ─────────────────────────────────────────────────────────────

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-56px)]">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }
  const isAdmin = currentUser.role === 'admin'

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
            { label: 'Contacted', value: totals.contacted, color: 'text-accent' },
            { label: 'Replied', value: totals.replied, color: 'text-status-replied' },
            { label: 'Interested', value: totals.interested, color: 'text-status-interested' },
            { label: 'Converted', value: totals.converted, color: 'text-status-converted' },
            { label: 'Lost', value: totals.lost, color: 'text-status-lost' },
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

        {/* ─── Daily Activity Tracker ─────────────────────────────────── */}
        <section className="bg-card border border-border rounded-xl p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-bold text-text">Daily Activity</h2>
              <p className="text-xs text-dim mt-0.5">
                Active actions only — manual messages, calls, notes, status changes, reassignments by each agent.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={activityDate}
                onChange={e => setActivityDate(e.target.value)}
                max={new Date(Date.now() + 330 * 60 * 1000).toISOString().split('T')[0]}
                className="bg-elevated border border-border rounded-md px-2 py-1 text-xs text-text focus:outline-none focus:border-accent/50"
              />
              {[
                { label: 'Today', off: 0 },
                { label: 'Yesterday', off: 1 },
                { label: 'Last 7d', off: 7 },
              ].map(c => (
                <button
                  key={c.label}
                  onClick={() => {
                    const istNow = new Date(Date.now() + 330 * 60 * 1000)
                    if (c.off === 7) {
                      // For "Last 7d" we just jump back 7 — simple proxy; full date-range UI is Phase 2
                      const t = new Date(istNow.getTime() - 7 * 24 * 60 * 60 * 1000)
                      setActivityDate(t.toISOString().split('T')[0])
                    } else {
                      const t = new Date(istNow.getTime() - c.off * 24 * 60 * 60 * 1000)
                      setActivityDate(t.toISOString().split('T')[0])
                    }
                  }}
                  className="text-[11px] px-2 py-1 rounded-md border border-border hover:border-accent/50 text-muted transition-colors"
                >
                  {c.label}
                </button>
              ))}
              <button
                onClick={() => fetchActivity(activityDate)}
                disabled={activityLoading}
                className="text-[11px] px-2 py-1 rounded-md text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
              >
                {activityLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Warnings */}
          {activity?.warnings && activity.warnings.length > 0 && (
            <div className="mb-4 space-y-1.5">
              {activity.warnings.map((w, i) => (
                <div
                  key={i}
                  className="text-xs px-3 py-2 rounded-md flex items-start gap-2"
                  style={{ background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)', color: 'var(--color-danger)' }}
                >
                  <span>⚠️</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Org totals strip (admin view) */}
          {activity?.scope === 'admin' && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4 text-center">
              {[
                { label: 'Leads touched', v: activity.totals.leads_touched },
                { label: 'Messages', v: activity.totals.manual_messages },
                { label: 'Calls', v: activity.totals.calls_logged },
                { label: 'Notes', v: activity.totals.notes_added },
                { label: 'Status moves', v: activity.totals.status_changes },
                { label: 'Reassigns', v: activity.totals.reassignments_performed },
              ].map(s => (
                <div key={s.label} className="bg-elevated rounded-md py-2">
                  <p className="text-[9px] text-dim uppercase tracking-wider">{s.label}</p>
                  <p className="text-lg font-bold text-text mt-0.5">{s.v}</p>
                </div>
              ))}
            </div>
          )}

          {/* Self view (non-admin): your card + team avg + anonymous rank */}
          {activity?.scope === 'self' && activity.you && (
            <SelfActivityView
              you={activity.you}
              teamAvg={activity.team_avg}
              rank={activity.your_rank}
            />
          )}

          {/* Per-agent cards (admin view) */}
          {activity?.scope === 'admin' && activity.agents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activity.agents.filter(a => a.active).map(a => {
                const isGhost = a.type === 'closer' && a.leads_touched === 0
                const isExpanded = expandedAgent === a.user_id
                const totalActions = a.actions.manual_messages + a.actions.calls_logged + a.actions.notes_added + a.actions.status_changes + a.actions.reassignments_performed
                return (
                  <div
                    key={a.user_id || a.name}
                    className="rounded-lg p-3 transition-colors"
                    style={{
                      background: 'var(--color-elevated)',
                      border: `1px solid ${isGhost ? 'color-mix(in srgb, var(--color-danger) 40%, transparent)' : totalActions > 0 ? 'color-mix(in srgb, var(--color-success) 30%, transparent)' : 'var(--color-border)'}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text truncate">{a.name}</p>
                        <p className="text-[10px] text-dim mt-0.5 capitalize">{a.type}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-bold ${isGhost ? 'text-danger' : totalActions > 0 ? 'text-success' : 'text-dim'}`}>{a.leads_touched}</p>
                        <p className="text-[9px] text-dim uppercase tracking-wider">leads touched</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] py-2 border-t border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-dim">💬 Messages</span><span className="text-text font-medium">{a.actions.manual_messages}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-dim">📞 Calls</span><span className="text-text font-medium">{a.actions.calls_logged}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-dim">📝 Notes</span><span className="text-text font-medium">{a.actions.notes_added}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-dim">🔄 Statuses</span><span className="text-text font-medium">{a.actions.status_changes}</span>
                      </div>
                      {a.actions.reassignments_performed > 0 && (
                        <div className="flex items-center justify-between col-span-2">
                          <span className="text-dim">🔀 Reassigns</span><span className="text-text font-medium">{a.actions.reassignments_performed}</span>
                        </div>
                      )}
                    </div>
                    {Object.keys(a.status_progressions).length > 0 && (
                      <div className="text-[10px] text-dim mt-2 flex flex-wrap gap-1">
                        {Object.entries(a.status_progressions).map(([k, v]) => (
                          <span key={k} className="px-1.5 py-0.5 rounded bg-card text-muted">
                            {k.replace(/^to_/, '→ ')}: <span className="text-text font-medium">{v}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {a.touched_leads.length > 0 && (
                      <button
                        onClick={() => setExpandedAgent(isExpanded ? null : a.user_id)}
                        className="text-[11px] text-accent hover:underline mt-2"
                      >
                        {isExpanded ? 'Hide' : `View ${a.touched_leads.length} touched lead${a.touched_leads.length === 1 ? '' : 's'}`}
                      </button>
                    )}
                    {isExpanded && (
                      <div className="mt-2 pt-2 border-t border-border space-y-1 max-h-64 overflow-y-auto">
                        {a.touched_leads.map((l, i) => (
                          <div key={i} className="text-[11px] flex items-center gap-2 hover:bg-card rounded px-1 py-0.5">
                            <span className="text-dim font-mono w-12 shrink-0">{l.lead_row || '—'}</span>
                            <a href={l.lead_row ? `/leads/${l.lead_row}` : '#'} className="text-accent hover:underline truncate flex-1">{l.name}</a>
                            <span className="text-dim text-[10px]">{l.current_status}</span>
                            <span className="text-[10px]">{l.actions.map(x => x === 'msg' ? '💬' : x === 'call' ? '📞' : x === 'note' ? '📝' : x === 'status' ? '🔄' : x === 'reassign' ? '🔀' : '·').join('')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : activityLoading ? (
            <p className="text-xs text-dim text-center py-6">Loading…</p>
          ) : (
            <p className="text-xs text-dim text-center py-6">No activity for this date.</p>
          )}
        </section>

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

        {/* ─── Agent Table (admin only) ─────────────────────────────────── */}
        {isAdmin && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated/50">
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Agent</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider">Assigned</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider">Contacted</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider">Replied</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider">Interested</th>
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
                        <span className="text-accent">{m.contacted}</span>
                      </td>

                      {/* Replied */}
                      <td className="px-3 py-3 text-center">
                        <span className="text-status-replied">{m.replied}</span>
                      </td>

                      {/* Interested */}
                      <td className="px-3 py-3 text-center">
                        <span className={m.interested > 0 ? 'text-status-interested font-semibold' : 'text-dim'}>{m.interested}</span>
                      </td>

                      {/* Converted */}
                      <td className="px-3 py-3 text-center">
                        <span className={m.converted > 0 ? 'text-status-converted font-semibold' : 'text-dim'}>{m.converted}</span>
                      </td>

                      {/* Lost */}
                      <td className="px-3 py-3 text-center">
                        <span className={m.lost > 0 ? 'text-status-lost' : 'text-dim'}>{m.lost}</span>
                      </td>

                      {/* Conversion Rate */}
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className={`font-semibold ${
                            m.conversion_rate >= 20 ? 'text-status-converted' :
                            m.conversion_rate >= 10 ? 'text-status-delayed' :
                            m.conversion_rate > 0 ? 'text-priority-hot' :
                            'text-dim'
                          }`}>
                            {m.conversion_rate}%
                          </span>
                          {/* Mini bar */}
                          <div className="w-12 h-1.5 bg-elevated rounded-full overflow-hidden hidden lg:block">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, m.conversion_rate)}%`,
                                backgroundColor: m.conversion_rate >= 20
                                  ? 'var(--color-status-converted)'
                                  : m.conversion_rate >= 10
                                  ? 'var(--color-status-delayed)'
                                  : 'var(--color-priority-hot)',
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Avg Response Days */}
                      <td className="px-3 py-3 text-center">
                        <span className={`${
                          m.avg_response_days === 0 ? 'text-dim' :
                          m.avg_response_days <= 3 ? 'text-status-replied' :
                          m.avg_response_days <= 7 ? 'text-status-delayed' :
                          'text-status-lost'
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
                    <td className="px-3 py-3 text-center font-bold text-accent">{totals.contacted}</td>
                    <td className="px-3 py-3 text-center font-bold text-status-replied">{totals.replied}</td>
                    <td className="px-3 py-3 text-center font-bold text-status-interested">{totals.interested}</td>
                    <td className="px-3 py-3 text-center font-bold text-status-converted">{totals.converted}</td>
                    <td className="px-3 py-3 text-center font-bold text-status-lost">{totals.lost}</td>
                    <td className="px-3 py-3 text-center font-bold text-accent">{totalConversionRate}%</td>
                    <td className="px-3 py-3 text-center text-dim">-</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}
        {/* ─── SLA Performance (admin only, gated by slaData) ──────── */}
        {slaData && (
          <div className="mt-6">
            <h2 className="text-base font-bold text-text mb-3">SLA Performance</h2>

            {/* Overall SLA */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <div className="bg-card border border-border rounded-lg px-4 py-3">
                <p className="text-[10px] text-dim uppercase tracking-wider font-medium mb-1.5">Avg First Response</p>
                <p className={`text-2xl font-bold ${
                  slaData.overall.avg_first_response_hours <= 4 ? 'text-status-converted' :
                  slaData.overall.avg_first_response_hours <= 12 ? 'text-status-delayed' :
                  'text-status-lost'
                }`}>
                  {slaData.overall.avg_first_response_hours > 0 ? `${slaData.overall.avg_first_response_hours}h` : '-'}
                </p>
                <p className="text-[10px] text-dim mt-0.5">Target: under 4h</p>
              </div>
              <div className="bg-card border border-border rounded-lg px-4 py-3">
                <p className="text-[10px] text-dim uppercase tracking-wider font-medium mb-1.5">Avg Time to Close</p>
                <p className={`text-2xl font-bold ${
                  slaData.overall.avg_close_days <= 15 ? 'text-status-converted' :
                  slaData.overall.avg_close_days <= 30 ? 'text-status-delayed' :
                  'text-status-lost'
                }`}>
                  {slaData.overall.avg_close_days > 0 ? `${slaData.overall.avg_close_days}d` : '-'}
                </p>
                <p className="text-[10px] text-dim mt-0.5">Target: under 30 days</p>
              </div>
              <div className="bg-card border border-border rounded-lg px-4 py-3">
                <p className="text-[10px] text-dim uppercase tracking-wider font-medium mb-1.5">Leads Tracked</p>
                <p className="text-2xl font-bold text-text">{slaData.overall.total}</p>
              </div>
            </div>

            {/* Per-Agent SLA Table */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-elevated/50">
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Agent</th>
                      <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider">Avg First Response</th>
                      <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider">Avg Time to Close</th>
                      <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider">Leads Tracked</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {slaData.agents.map(a => (
                      <tr key={a.name} className="hover:bg-elevated/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-accent">{a.name.charAt(0).toUpperCase()}</span>
                            </div>
                            <span className="font-medium text-text">{a.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`font-semibold ${
                            a.avg_first_response_hours === 0 ? 'text-dim' :
                            a.avg_first_response_hours <= 4 ? 'text-status-converted' :
                            a.avg_first_response_hours <= 12 ? 'text-status-delayed' :
                            'text-status-lost'
                          }`}>
                            {a.avg_first_response_hours > 0 ? `${a.avg_first_response_hours}h` : '-'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`font-semibold ${
                            a.avg_close_days === 0 ? 'text-dim' :
                            a.avg_close_days <= 15 ? 'text-status-converted' :
                            a.avg_close_days <= 30 ? 'text-status-delayed' :
                            'text-status-lost'
                          }`}>
                            {a.avg_close_days > 0 ? `${a.avg_close_days}d` : '-'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center text-muted">{a.leads_tracked}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─── Telecaller Activity ─────────────────────────────────── */}
        {tcStats && tcStats.telecallers.length > 0 && (
          <div className="mt-6 bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-text">Telecaller Activity</h2>
              <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                {tcStats.auto_queue.enabled
                  ? `Auto-queue ON · statuses: ${tcStats.auto_queue.statuses.join(', ')}`
                  : 'Auto-queue OFF'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-dim border-b border-border">
                    <th className="px-3 py-2 text-left font-medium">Telecaller</th>
                    <th className="px-3 py-2 text-center font-medium">Manual</th>
                    <th className="px-3 py-2 text-center font-medium">Auto-queue</th>
                    <th className="px-3 py-2 text-center font-medium">Total queue</th>
                    <th className="px-3 py-2 text-center font-medium">Calls (7d)</th>
                    <th className="px-3 py-2 text-center font-medium">Notes (7d)</th>
                  </tr>
                </thead>
                <tbody>
                  {tcStats.telecallers.map(tc => (
                    <tr key={tc.user_id} className="border-b border-border/50 hover:bg-elevated/50">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text">{tc.name}</span>
                          {!tc.active && <span className="text-[10px] text-danger">(inactive)</span>}
                        </div>
                        <p className="text-[11px] text-dim mt-0.5">{tc.email}</p>
                      </td>
                      <td className="px-3 py-3 text-center text-muted">{tc.manual_assigned}</td>
                      <td className="px-3 py-3 text-center text-muted">{tc.auto_queue_eligible}</td>
                      <td className="px-3 py-3 text-center font-semibold text-text">{tc.total_queue}</td>
                      <td className="px-3 py-3 text-center text-muted">{tc.calls_logged_7d}</td>
                      <td className="px-3 py-3 text-center text-muted">{tc.notes_added_7d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-dim mt-3">Manual = explicitly assigned via Lead detail or bulk action. Auto-queue = leads matching configured statuses (excludes opted-out leads). Calls/Notes count actions logged in the last 7 days, matched by name.</p>
          </div>
        )}
      </main>
    </div>
  )
}
