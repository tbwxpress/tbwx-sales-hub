'use client'

import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'
import AgentQueue from '@/components/AgentQueue'
import NeedsAttentionBanner from '@/components/NeedsAttentionBanner'
import UpdateRequestWidget from '@/components/UpdateRequestWidget'
import DashboardWidgets from '@/components/DashboardWidgets'
import OwnerWorkPanel from '@/components/OwnerWorkPanel'
import InsightsPanel from '@/components/InsightsPanel'
import RankingFeedbackPanel from '@/components/RankingFeedbackPanel'
import { KpiCardSkeleton } from '@/components/KpiCard'
import { toast } from 'sonner'
import { timeAgo, followupLabel } from '@/lib/format'
import { scoreColor, scoreBg, scoreBorder } from '@/lib/score-colors'
import Badge, { statusTone, priorityTone } from '@/components/ui/Badge'
import { Clock, CheckCircle2, AlertTriangle, ChevronDown } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Lead {
  row_number: number
  full_name: string
  phone: string
  email: string
  city: string
  state: string
  lead_status: string
  lead_priority: string
  assigned_to: string
  created_time: string
  wa_message_id: string
  next_followup: string
  lead_score?: number
}

function makeStatusVars(cssVar: string): { bg: string; text: string; border: string } {
  return {
    bg: `color-mix(in srgb, ${cssVar} 15%, transparent)`,
    text: cssVar,
    border: `color-mix(in srgb, ${cssVar} 30%, transparent)`,
  }
}

interface Stats {
  total: number
  new: number
  deck_sent: number
  replied: number
  no_response: number
  call_done_interested: number
  hot: number
  converted: number
  delayed: number
  lost: number
  unassigned: number
  overdue_followups: number
}

interface SessionUser {
  name: string
  role: string
  can_assign: boolean
}

interface AgentUser {
  id: string
  name: string
  role: string
  active: boolean
}

interface Task {
  id: string
  title: string
  contact_name?: string
  due_at: string
  completed: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  NEW:                    makeStatusVars('var(--color-status-new)'),
  DECK_SENT:              makeStatusVars('var(--color-status-deck-sent)'),
  REPLIED:                makeStatusVars('var(--color-status-replied)'),
  NO_RESPONSE:            makeStatusVars('var(--color-status-no-response)'),
  CALL_DONE_INTERESTED:   makeStatusVars('var(--color-status-call-done-interested)'),
  HOT:                    makeStatusVars('var(--color-status-hot)'),
  FINAL_NEGOTIATION:      makeStatusVars('var(--color-status-final-negotiation)'),
  CONVERTED:              makeStatusVars('var(--color-status-converted)'),
  DELAYED:                makeStatusVars('var(--color-status-delayed)'),
  LOST:                   makeStatusVars('var(--color-status-lost)'),
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  HOT:  makeStatusVars('var(--color-priority-hot)'),
  WARM: makeStatusVars('var(--color-priority-warm)'),
  COLD: makeStatusVars('var(--color-priority-cold)'),
}

const STATUS_OPTIONS = ['NEW', 'DECK_SENT', 'REPLIED', 'NO_RESPONSE', 'CALL_DONE_INTERESTED', 'HOT', 'FINAL_NEGOTIATION', 'CONVERTED', 'DELAYED', 'LOST', 'ARCHIVED']
const PRIORITY_OPTIONS = ['HOT', 'WARM', 'COLD']

// Map stat card labels to status filter values. Module-scope so React
// reference-equality stays stable across renders.
const STAT_FILTER_MAP: Record<string, string> = {
  'Total': '__ALL__',
  'New': 'NEW',
  'Deck Sent': 'DECK_SENT',
  'Replied': 'REPLIED',
  'No Response': 'NO_RESPONSE',
  'HOT': 'HOT',
  'Converted': 'CONVERTED',
  'Delayed': 'DELAYED',
  'Lost': 'LOST',
  'Unassigned': '__UNASSIGNED__',
  'Overdue': '__OVERDUE__',
}


// ─── Helpers ─────────────────────────────────────────────────────────────────

function hoursSinceCreation(dateStr: string): number {
  if (!dateStr) return 0
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 0
  return (Date.now() - d.getTime()) / (1000 * 60 * 60)
}

function responseTimeBadge(lead: Lead): { label: string; colorClass: string } | null {
  const hours = hoursSinceCreation(lead.created_time)
  // If status is NEW, show "NEW" badge in blue for leads <1hr old, otherwise show age
  if (lead.lead_status === 'NEW') {
    if (hours < 1) return { label: 'NEW', colorClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30' }
    if (hours < 4) return { label: `${Math.floor(hours)}h`, colorClass: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' }
    if (hours < 24) return { label: `${Math.floor(hours)}h`, colorClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30' }
    const days = Math.floor(hours / 24)
    return { label: `${days}d`, colorClass: 'bg-red-500/15 text-red-400 border-red-500/30' }
  }
  // For leads beyond NEW status, show how long since creation (proxy for response time)
  if (['DECK_SENT', 'REPLIED', 'NO_RESPONSE', 'CALL_DONE_INTERESTED', 'HOT', 'FINAL_NEGOTIATION', 'CONVERTED', 'DELAYED', 'LOST'].includes(lead.lead_status)) {
    if (hours < 1) return { label: '<1h', colorClass: 'bg-green-500/15 text-green-400 border-green-500/30' }
    if (hours < 4) return { label: `${Math.floor(hours)}h`, colorClass: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' }
    if (hours < 24) return { label: `${Math.floor(hours)}h`, colorClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30' }
    const days = Math.floor(hours / 24)
    return { label: `${days}d`, colorClass: 'bg-red-500/15 text-red-400 border-red-500/30' }
  }
  return null
}

function computeAvgResponseHours(leads: Lead[]): string {
  // For leads past NEW, use hours since creation as a proxy
  const responded = leads.filter(l => !['NEW', 'LOST'].includes(l.lead_status) && l.created_time)
  if (responded.length === 0) return '-'
  const totalHours = responded.reduce((sum, l) => sum + hoursSinceCreation(l.created_time), 0)
  const avg = totalHours / responded.length
  if (avg < 1) return '<1h'
  if (avg < 24) return `${Math.round(avg)}h`
  return `${Math.round(avg / 24)}d`
}

// ─── Admin Header Component ──────────────────────────────────────────────────

const AdminHeader = memo(function AdminHeader({
  user,
  stats,
  leads,
  agents,
}: {
  user: SessionUser
  stats: Stats | null
  leads: Lead[]
  agents: AgentUser[]
}) {
  // Greeting + date are time-of-day dependent; recompute per mount/render is fine
  // (cheap; if leads change while open at the stroke of noon the greeting updates).
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })

  // All four below are O(n) on leads/agents — memoize so a parent re-render
  // (poll tick, focus, unrelated state) doesn't redo the work.
  const hotLeadCount = useMemo(
    () =>
      leads.filter(l => l.lead_priority === 'HOT' && !['CONVERTED', 'LOST'].includes(l.lead_status)).length,
    [leads]
  )

  const featuredStats = useMemo(
    () => [
      {
        label: 'Total Leads',
        value: stats?.total ?? 0,
        color: 'var(--color-accent)',
        sub: `${stats?.new ?? 0} new today`,
      },
      {
        label: 'Replied',
        value: stats?.replied ?? 0,
        color: 'var(--color-success)',
        sub: 'awaiting response',
      },
      {
        label: 'Hot Leads',
        value: hotLeadCount,
        color: 'var(--color-hot)',
        sub: 'need attention now',
      },
      {
        label: 'Converted',
        value: stats?.converted ?? 0,
        color: 'var(--color-status-converted)',
        sub: `${stats?.lost ?? 0} lost`,
      },
    ],
    [stats?.total, stats?.new, stats?.replied, stats?.converted, stats?.lost, hotLeadCount]
  )

  const agentPerf = useMemo(
    () =>
      agents.map(agent => {
        const assigned = leads.filter(l => l.assigned_to?.toLowerCase() === agent.name.toLowerCase())
        const contacted = assigned.filter(l => !['NEW', 'DECK_SENT'].includes(l.lead_status))
        const pct = assigned.length > 0 ? Math.round((contacted.length / assigned.length) * 100) : 0
        return { name: agent.name, pct, contacted: contacted.length, total: assigned.length }
      }).filter(a => a.total > 0).sort((a, b) => b.pct - a.pct),
    [agents, leads]
  )

  const staleLeads = useMemo(
    () =>
      leads.filter(l => {
        if (['CONVERTED', 'LOST', 'DELAYED'].includes(l.lead_status)) return false
        if (!l.next_followup) return false
        const daysPast = (Date.now() - new Date(l.next_followup).getTime()) / (1000 * 60 * 60 * 24)
        return daysPast > 3
      }).slice(0, 5),
    [leads]
  )

  const recent = useMemo(
    () =>
      [...leads]
        .sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime())
        .slice(0, 8),
    [leads]
  )

  return (
    <div className="mb-6">
      {/* Greeting */}
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h1 className="text-heading" style={{ color: 'var(--color-text)' }}>
            {greeting}, {user.name} 👋
          </h1>
          <p className="text-caption mt-0.5" style={{ color: 'var(--color-muted)' }}>{today}</p>
        </div>
      </div>

      {/* 4 Featured Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {featuredStats.map(stat => (
          <div
            key={stat.label}
            className="rounded-xl p-4 border"
            style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="text-eyebrow mb-2" style={{ color: 'var(--color-muted)' }}>
              {stat.label}
            </div>
            <div className="text-display leading-none mb-1.5" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="text-caption" style={{ color: 'var(--color-dim)' }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Recent Leads mini-table */}
      {(() => {
        return (
          <div className="rounded-xl border mb-3 overflow-hidden" style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-eyebrow" style={{ color: 'var(--color-muted)' }}>Recent Leads</span>
              <Link href="/leads" className="text-caption font-medium" style={{ color: 'var(--color-accent)' }}>View all →</Link>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {recent.map((lead, i) => {
                const daysAgo = Math.floor((Date.now() - new Date(lead.created_time).getTime()) / (1000*60*60*24))
                return (
                  <Link key={lead.row_number} href={`/leads/${lead.row_number}`} className="flex items-center gap-3 px-4 py-2.5" style={{ background: i % 2 === 1 ? 'color-mix(in srgb, var(--color-elevated) 30%, transparent)' : 'transparent' }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
                      {lead.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium truncate block" style={{ color: 'var(--color-text)' }}>{lead.full_name}</span>
                      <span className="text-[10px]" style={{ color: 'var(--color-dim)' }}>{lead.city}</span>
                    </div>
                    <Badge tone={statusTone(lead.lead_status)}>{lead.lead_status.replace('_', ' ')}</Badge>
                    <span className="hidden sm:inline-flex"><Badge tone={priorityTone(lead.lead_priority)}>{lead.lead_priority}</Badge></span>
                    <span className="text-[10px] shrink-0 hidden md:block" style={{ color: 'var(--color-dim)' }}>{lead.assigned_to || '—'}</span>
                    <span className="text-[10px] shrink-0" style={{ color: 'var(--color-dim)' }}>{daysAgo === 0 ? 'today' : `${daysAgo}d ago`}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Two-panel row: Agent Performance + Stale Leads */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">

        {/* Agent Performance (wider) */}
        <div
          className="lg:col-span-3 rounded-xl p-4 border"
          style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="text-eyebrow mb-3" style={{ color: 'var(--color-muted)' }}>
            Agent Performance
          </div>
          {agentPerf.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--color-dim)' }}>No agent data yet</p>
          ) : (
            <div className="space-y-3">
              {agentPerf.map(agent => (
                <div key={agent.name} className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                    style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}
                  >
                    {agent.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium truncate" style={{ color: 'var(--color-text)' }}>{agent.name}</span>
                      <span className="text-[10px] ml-2 shrink-0" style={{ color: 'var(--color-muted)' }}>
                        {agent.contacted}/{agent.total}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${agent.pct}%`,
                          background: 'linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))',
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-[11px] font-bold w-10 text-right shrink-0" style={{ color: 'var(--color-accent)' }}>
                    {agent.pct}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stale Leads (narrower) */}
        <div
          className="lg:col-span-2 rounded-xl p-4 border"
          style={{
            background: 'var(--color-card)',
            borderColor: 'var(--color-border)',
            borderLeft: '3px solid var(--color-warning)',
          }}
        >
          <div className="text-eyebrow mb-3 flex items-center gap-1" style={{ color: 'var(--color-warning)' }}>
            <AlertTriangle className="w-3 h-3" /> Stale Follow-ups
          </div>
          {staleLeads.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--color-dim)' }}>All follow-ups are on track</p>
          ) : (
            <div className="space-y-2">
              {staleLeads.map(lead => {
                const daysPast = Math.floor((Date.now() - new Date(lead.next_followup).getTime()) / (1000 * 60 * 60 * 24))
                return (
                  <Link
                    key={lead.row_number}
                    href={`/leads/${lead.row_number}`}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg transition-colors duration-150"
                    style={{ background: 'color-mix(in srgb, var(--color-warning) 6%, transparent)' }}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate" style={{ color: 'var(--color-text)' }}>{lead.full_name}</div>
                      <div className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{lead.city}</div>
                    </div>
                    <span className="text-[10px] font-semibold ml-2 shrink-0" style={{ color: 'var(--color-warning)' }}>
                      {daysPast}d overdue
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
})

// ─── Component ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()

  // State
  const [user, setUser] = useState<SessionUser | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [agents, setAgents] = useState<AgentUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Per-section loading states
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingLeads, setLoadingLeads] = useState(true)
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [loadingTasks, setLoadingTasks] = useState(true)

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([])

  // Auto-message (n8n) delivery status per phone
  const [waStats, setWaStats] = useState<Record<string, { status: string; template_used: string; timestamp: string }>>({})

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [assignedFilter, setAssignedFilter] = useState('')
  const [sortBy, setSortBy] = useState('score')

  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [dashPage, setDashPage] = useState(0)
  // Render the leads table 50/page. It was rendering the ENTIRE list, mounting
  // every row to the DOM — cost grew linearly with lead count (the main reason
  // the dashboard felt slow as leads accumulated).
  const pagedLeads = useMemo(
    () => leads.slice(dashPage * 50, dashPage * 50 + 50),
    [leads, dashPage],
  )
  const dashPageCount = Math.max(1, Math.ceil(leads.length / 50))
  useEffect(() => {
    if (dashPage >= dashPageCount) setDashPage(Math.max(0, dashPageCount - 1))
  }, [dashPageCount, dashPage])
  const [assignTo, setAssignTo] = useState('')
  const [assigning, setAssigning] = useState(false)

  // Win/Loss

  // Add Lead Modal
  const [showAddLead, setShowAddLead] = useState(false)
  const [addLeadForm, setAddLeadForm] = useState({ full_name: '', phone: '', email: '', city: '', state: '', model_interest: '', lead_priority: 'WARM', notes: '', source: '' })
  const [addLeadSaving, setAddLeadSaving] = useState(false)

  // Stale Leads
  const [staleOpen, setStaleOpen] = useState(false)

  // Pending delegation requests (to me)
  const [pendingDelegations, setPendingDelegations] = useState<Array<{
    id: number; lead_row: number; from_agent_name: string; to_agent_name: string; message: string; created_at: string
  }>>([])
  const [respondingDelegation, setRespondingDelegation] = useState<number | null>(null)

  // Payment followups widget
  const [paymentFollowups, setPaymentFollowups] = useState<Array<{
    id: number; franchise_name: string; amount: number; currency: string; due_date: string | null; status: string; assigned_to_name: string
  }>>([])
  const [pfAdminCounts, setPfAdminCounts] = useState<Record<string, number>>({})

  // WA Backfill
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<{
    synced: number; already_exists: number; missing_count: number; total_leads: number
    missing: Array<{ row_number: number; full_name: string; phone: string; city: string; lead_status: string; created_time: string }>
  } | null>(null)

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      const data = await res.json()
      if (!data.success) {
        router.push('/login')
        return null
      }
      setUser(data.data)
      return data.data as SessionUser
    } catch {
      router.push('/login')
      return null
    }
  }, [router])

  const fetchStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const res = await fetch('/api/leads?stats=true')
      const data = await res.json()
      if (data.success) setStats(data.data)
    } catch {
      // stats are non-critical
    } finally {
      setLoadingStats(false)
    }
  }, [])

  const fetchLeads = useCallback(async () => {
    setLoadingLeads(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      // Handle special filters locally, pass regular ones to API
      const isSpecialFilter = statusFilter.startsWith('__')
      if (statusFilter && !isSpecialFilter) params.set('status', statusFilter)
      if (assignedFilter) params.set('assigned', assignedFilter)
      if (sortBy && sortBy !== 'score') params.set('sort', sortBy)

      const qs = params.toString()
      const res = await fetch(`/api/leads${qs ? `?${qs}` : ''}`)
      const data = await res.json()
      if (data.success) {
        let filtered = data.data
        // Apply special client-side filters
        if (statusFilter === '__UNASSIGNED__') {
          filtered = filtered.filter((l: Lead) => !l.assigned_to)
        } else if (statusFilter === '__OVERDUE__') {
          const now = new Date()
          filtered = filtered.filter((l: Lead) =>
            l.next_followup &&
            l.lead_status !== 'CONVERTED' &&
            l.lead_status !== 'LOST' &&
            new Date(l.next_followup) < now
          )
        }
        setLeads(filtered)
      } else {
        setError(data.error || 'Failed to load leads')
      }
    } catch {
      setError('Failed to load leads')
    } finally {
      setLoadingLeads(false)
    }
  }, [search, statusFilter, assignedFilter, sortBy])

  const fetchAgents = useCallback(async (currentUser: SessionUser) => {
    if (currentUser.role === 'admin') {
      setLoadingAgents(true)
      try {
        const res = await fetch('/api/users')
        const data = await res.json()
        if (data.success) setAgents(data.data.filter((u: AgentUser) => u.active))
      } catch {
        // non-critical
      } finally {
        setLoadingAgents(false)
      }
    } else {
      setLoadingAgents(false)
    }
  }, [])

  const fetchTasks = useCallback(async () => {
    setLoadingTasks(true)
    try {
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)
      const res = await fetch(`/api/tasks?completed=false&due_before=${todayEnd.toISOString()}`)
      const data = await res.json()
      if (data.success) {
        setTasks(data.data || [])
      }
    } catch {
      // Tasks API may not exist yet — silently ignore
      setTasks([])
    } finally {
      setLoadingTasks(false)
    }
  }, [])

  const fetchPendingDelegations = useCallback(async () => {
    try {
      const res = await fetch('/api/delegations?to_me=true&status=pending')
      const data = await res.json()
      if (data.success) setPendingDelegations(data.data || [])
    } catch { /* non-critical */ }
  }, [])

  const fetchPaymentFollowups = useCallback(async (currentUser: SessionUser) => {
    try {
      const res = await fetch('/api/payment-followups')
      const data = await res.json()
      if (!data.success) return
      const items = data.data || []
      if (currentUser.role === 'admin') {
        const counts: Record<string, number> = {}
        for (const f of items) {
          counts[f.status] = (counts[f.status] || 0) + 1
        }
        setPfAdminCounts(counts)
      } else {
        const active = items.filter((f: { status: string }) => f.status !== 'cleared')
        setPaymentFollowups(active.slice(0, 5))
      }
    } catch { /* non-critical */ }
  }, [])

  const fetchWaStats = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/auto-message-stats')
      const data = await res.json()
      if (data.success) {
        setWaStats(data.data || {})
      }
    } catch {
      // non-critical
    }
  }, [])

  // ─── Initial Load ────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      setLoading(true)
      // User-independent data starts IMMEDIATELY, in parallel with the auth check
      // (these APIs self-authenticate) — no more gating every fetch on /api/auth/me.
      fetchStats()
      fetchLeads()
      fetchTasks()
      fetchWaStats()
      fetchPendingDelegations()
      // Only the two role-dependent fetches need the resolved user.
      const currentUser = await fetchUser()
      if (currentUser) {
        fetchAgents(currentUser)
        fetchPaymentFollowups(currentUser)
      }
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Refetch leads when filters change ───────────────────────────────────

  useEffect(() => {
    if (!user) return
    setDashPage(0)
    fetchLeads()
  }, [search, statusFilter, assignedFilter, sortBy, fetchLeads, user])

  // ─── Handlers ────────────────────────────────────────────────────────────

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
    setAssignedFilter('')
    setSortBy('score')
  }

  const toggleSelect = useCallback((rowNum: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(rowNum)) next.delete(rowNum)
      else next.add(rowNum)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelected(prev => {
      if (prev.size === leads.length) return new Set()
      return new Set(leads.map(l => l.row_number))
    })
  }, [leads])

  // Inline status change
  async function updateLeadField(rowNum: number, field: string, value: string) {
    try {
      const res = await fetch(`/api/leads/${rowNum}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      const data = await res.json()
      if (data.success) {
        // Update local state immediately
        setLeads(prev => prev.map(l =>
          l.row_number === rowNum ? { ...l, [field]: value } : l
        ))
        toast.success(`${field === 'lead_status' ? 'Status' : 'Priority'} updated to ${value}`)
        // Refresh stats in background
        fetchStats()
      } else {
        setError(data.error || 'Update failed')
      }
    } catch {
      setError('Update failed')
    }
  }

  const [bulkStatus, setBulkStatus] = useState('')

  async function bulkStatusChange() {
    if (!bulkStatus || selected.size === 0) return
    setAssigning(true)
    try {
      const ids = Array.from(selected)
      await Promise.all(ids.map(id =>
        fetch(`/api/leads/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_status: bulkStatus }),
        })
      ))
      setLeads(prev => prev.map(l =>
        selected.has(l.row_number) ? { ...l, lead_status: bulkStatus } : l
      ))
      toast.success(`${selected.size} leads updated to ${bulkStatus.replace('_', ' ')}`)
      setSelected(new Set())
      setBulkStatus('')
      fetchStats()
    } catch {
      setError('Bulk status update failed')
    }
    setAssigning(false)
  }

  async function bulkAssign() {
    if (!assignTo || selected.size === 0) return
    setAssigning(true)
    try {
      const res = await fetch('/api/leads/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: Array.from(selected), assigned_to: assignTo }),
      })
      const data = await res.json()
      if (data.success) {
        setSelected(new Set())
        setAssignTo('')
        toast.success(`${selected.size} leads assigned to ${assignTo}`)
        await Promise.all([fetchLeads(), fetchStats()])
      } else {
        setError(data.error || 'Assignment failed')
      }
    } catch {
      setError('Assignment failed')
    }
    setAssigning(false)
  }

  async function handleAddLead() {
    if (!addLeadForm.full_name.trim() || !addLeadForm.phone.trim()) {
      setError('Name and phone are required')
      return
    }
    setAddLeadSaving(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addLeadForm),
      })
      const data = await res.json()
      if (data.success) {
        setShowAddLead(false)
        setAddLeadForm({ full_name: '', phone: '', email: '', city: '', state: '', model_interest: '', lead_priority: 'WARM', notes: '', source: '' })
        toast.success('Lead added successfully')
        await Promise.all([fetchLeads(), fetchStats()])
      } else {
        setError(data.error || 'Failed to add lead')
      }
    } catch {
      setError('Failed to add lead')
    }
    setAddLeadSaving(false)
  }

  async function completeTask(taskId: string) {
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId }),
      })
      setTasks(prev => prev.filter(t => t.id !== taskId))
      toast.success('Task completed')
    } catch {
      setError('Failed to complete task')
    }
  }


  // ─── Unique assigned names for filter dropdown ───────────────────────────

  const assignedNames = useMemo(
    () => [...new Set(leads.map(l => l.assigned_to).filter(Boolean))],
    [leads]
  )

  // ─── Stale Leads ─────────────────────────────────────────────────────────

  const staleLeads = useMemo(
    () =>
      leads.filter(l => {
        if (['CONVERTED', 'LOST', 'DELAYED'].includes(l.lead_status)) return false
        if (!l.created_time) return false
        const daysSince = hoursSinceCreation(l.created_time) / 24
        return daysSince > 14
      }),
    [leads]
  )

  // Avg response time — O(n) reducer; memoize so filter typing doesn't recompute.
  const avgResponseHours = useMemo(() => computeAvgResponseHours(leads), [leads])

  // ─── Stat Cards Config ───────────────────────────────────────────────────

  function handleStatClick(label: string) {
    const filterValue = STAT_FILTER_MAP[label]
    if (!filterValue) return

    if (filterValue === '__ALL__') {
      // Clear all filters
      setStatusFilter('')
      setAssignedFilter('')
      return
    }

    // Toggle: if already filtering by this, clear it
    setStatusFilter(prev => prev === filterValue ? '' : filterValue)
  }

  const statCards = useMemo(
    () =>
      stats
        ? [
            { label: 'Total', value: stats.total, color: 'text-text', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
            { label: 'New', value: stats.new, color: 'text-blue-400', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
            { label: 'Deck Sent', value: stats.deck_sent, color: 'text-purple-400', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
            { label: 'Replied', value: stats.replied, color: 'text-green-400', icon: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6' },
            { label: 'No Response', value: stats.no_response, color: 'text-yellow-400', icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' },
            { label: 'HOT', value: stats.hot, color: 'text-orange-400', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
            { label: 'Converted', value: stats.converted, color: 'text-emerald-400', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
            { label: 'Delayed', value: stats.delayed, color: 'text-amber-400', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
            { label: 'Lost', value: stats.lost, color: 'text-red-400', icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' },
            { label: 'Unassigned', value: stats.unassigned, color: 'text-accent', icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' },
            { label: 'Overdue', value: stats.overdue_followups, color: 'text-red-400', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
          ]
        : [],
    [stats]
  )

  // ─── Role-Aware: Agents see action queue ────────────────────────────────

  if (!loading && user && user.role === 'agent') {
    return <AgentQueue user={user} />
  }

  // ─── Loading State ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fade-in">
          {/* Skeleton: Tasks + Response Time row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="lg:col-span-2 bg-card border border-border rounded-lg px-5 py-4">
              <div className="skeleton h-4 w-28 mb-4" />
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="skeleton h-5 w-full" />)}
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg px-5 py-4">
              <div className="skeleton h-3 w-32 mb-3" />
              <div className="skeleton h-9 w-16 mb-2" />
              <div className="skeleton h-3 w-40" />
            </div>
          </div>
          {/* Skeleton: Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="bg-card border border-border rounded-lg px-4 py-3">
                <div className="skeleton h-3 w-12 mb-3" />
                <div className="skeleton h-7 w-10" />
              </div>
            ))}
          </div>
          {/* Skeleton: Filter bar */}
          <div className="bg-card border border-border rounded-lg px-4 py-3 mb-4">
            <div className="skeleton h-9 w-full" />
          </div>
          {/* Skeleton: Table rows */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-elevated/50">
              <div className="skeleton h-4 w-full" />
            </div>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="px-4 py-3 border-b border-border flex gap-4">
                <div className="skeleton h-4 w-8" />
                <div className="skeleton h-4 w-24" />
                <div className="skeleton h-4 w-20" />
                <div className="skeleton h-4 w-16 flex-1" />
                <div className="skeleton h-4 w-16" />
                <div className="skeleton h-4 w-14" />
              </div>
            ))}
          </div>
        </main>
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fade-in">
        {/* Role-aware view label */}
        <p className="text-xs italic mb-4" style={{ color: 'var(--color-dim)' }}>
          {user?.role === 'admin'
            ? 'Dashboard — overview of all activity'
            : user?.role === 'telecaller'
            ? 'Dashboard — your calling queue'
            : 'Dashboard — your queue'}
        </p>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-danger hover:text-red-300 ml-4">
              Dismiss
            </button>
          </div>
        )}

        {/* Update requests from Sales Head */}
        <UpdateRequestWidget />

        {/* Forced followup loop — leads requiring an explicit touch right now. */}
        <NeedsAttentionBanner defaultExpanded />

        {/* ─── Owner Work Panel — Guided Work Mode cockpit (admin) ────── */}
        {user?.role === 'admin' && <OwnerWorkPanel />}

        {/* ─── What's converting — AI conversion insights (admin) ─────── */}
        {user?.role === 'admin' && <InsightsPanel />}

        {/* ─── Ranking feedback — "Shouldn't be here?" flags (admin) ───── */}
        {user?.role === 'admin' && <RankingFeedbackPanel />}

        {/* ─── KPI Metric Widgets (admin) ─────────────────────────────── */}
        {user?.role === 'admin' && (
          (loadingStats || loadingLeads) ? (
            <section aria-label="Key metrics" className="mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[0, 1, 2, 3].map(i => <KpiCardSkeleton key={i} />)}
              </div>
            </section>
          ) : (
            <DashboardWidgets leads={leads} stats={stats} avgResponse={avgResponseHours} />
          )
        )}

        {/* ─── Pending Delegation Requests Widget ─────────────────────── */}
        {pendingDelegations.length > 0 && (
          <div className="mb-4 bg-card border border-border rounded-lg px-5 py-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-dim mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              Help Requested ({pendingDelegations.length})
            </h3>
            <ul className="space-y-2">
              {pendingDelegations.map(d => (
                <li key={d.id} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 text-muted">
                    <span className="font-medium text-text">{d.from_agent_name}</span> is asking you to help on{' '}
                    <Link href={`/leads/${d.lead_row}`} className="text-accent hover:underline">Lead #{d.lead_row}</Link>
                    {d.message ? <span className="text-dim text-xs ml-1">— {d.message}</span> : null}
                  </span>
                  <div className="flex gap-2 shrink-0">
                    <button
                      disabled={respondingDelegation === d.id}
                      onClick={async () => {
                        setRespondingDelegation(d.id)
                        try {
                          const res = await fetch(`/api/delegations/${d.id}/respond`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'accept' }),
                          })
                          const json = await res.json()
                          if (json.success) {
                            setPendingDelegations(prev => prev.filter(x => x.id !== d.id))
                            toast.success('Accepted - lead is now in your list')
                          } else {
                            setError(json.error || 'Failed')
                          }
                        } catch { setError('Failed to respond') }
                        setRespondingDelegation(null)
                      }}
                      className="text-xs px-3 py-1.5 rounded font-medium transition-colors disabled:opacity-50"
                      style={{ background: 'var(--color-accent)', color: '#1a1209' }}
                    >
                      Accept
                    </button>
                    <button
                      disabled={respondingDelegation === d.id}
                      onClick={async () => {
                        setRespondingDelegation(d.id)
                        try {
                          const res = await fetch(`/api/delegations/${d.id}/respond`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'decline' }),
                          })
                          const json = await res.json()
                          if (json.success) {
                            setPendingDelegations(prev => prev.filter(x => x.id !== d.id))
                            toast.info('Declined')
                          } else {
                            setError(json.error || 'Failed')
                          }
                        } catch { setError('Failed to respond') }
                        setRespondingDelegation(null)
                      }}
                      className="text-xs px-3 py-1.5 rounded border border-border text-muted hover:text-danger transition-colors disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ─── Payment Followups Widget ───────────────────────────────── */}
        {user?.role === 'admin' && Object.keys(pfAdminCounts).length > 0 && (
          <div className="mb-4 bg-card border border-border rounded-lg px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-dim flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} style={{ color: 'var(--color-accent)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                </svg>
                Payment Followups
              </h3>
              <Link href="/payment-followups" className="text-xs transition-colors" style={{ color: 'var(--color-accent)' }}>View all →</Link>
            </div>
            <div className="flex flex-wrap gap-3">
              {[
                { key: 'pending', label: 'Pending', color: 'var(--color-muted)' },
                { key: 'in_progress', label: 'In Progress', color: 'var(--color-accent)' },
                { key: 'partially_cleared', label: 'Partial', color: '#f59e0b' },
                { key: 'blocked', label: 'Blocked', color: 'var(--color-danger)' },
                { key: 'cleared', label: 'Cleared', color: 'var(--color-success)' },
              ].filter(s => pfAdminCounts[s.key]).map(s => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <span className="text-xl font-extrabold leading-none" style={{ color: s.color }}>{pfAdminCounts[s.key]}</span>
                  <span className="text-[10px]" style={{ color: 'var(--color-dim)' }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {user?.role !== 'admin' && paymentFollowups.length > 0 && (
          <div className="mb-4 bg-card border border-border rounded-lg px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-dim flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} style={{ color: 'var(--color-accent)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                </svg>
                My Payment Followups ({paymentFollowups.length})
              </h3>
              <Link href="/payment-followups" className="text-xs transition-colors" style={{ color: 'var(--color-accent)' }}>View all →</Link>
            </div>
            <ul className="space-y-2">
              {paymentFollowups.map(f => {
                const isOverdue = f.due_date && f.status !== 'cleared' && new Date(f.due_date) < new Date()
                return (
                  <li key={f.id} className="flex items-center justify-between text-sm gap-3">
                    <span className="font-medium truncate" style={{ color: 'var(--color-text)' }}>{f.franchise_name}</span>
                    <span className="shrink-0" style={{ color: 'var(--color-muted)' }}>{f.currency}{f.amount.toLocaleString('en-IN')}</span>
                    {f.due_date && (
                      <span className="text-xs shrink-0" style={{ color: isOverdue ? 'var(--color-danger)' : 'var(--color-dim)' }}>
                        {isOverdue ? '! ' : ''}{new Date(f.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* ─── Today's Tasks + Avg Response Time Row ──────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Today's Tasks Widget */}
          {loadingTasks ? (
            <div className="lg:col-span-2 bg-card border border-border rounded-lg px-5 py-4 animate-pulse">
              <div className="h-3 w-28 rounded bg-elevated mb-4" />
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-5 w-full rounded bg-elevated" />)}
              </div>
            </div>
          ) : (
          <div className={`lg:col-span-2 bg-card border border-border rounded-lg px-5 py-4${tasks.some(t => new Date(t.due_at).getTime() < Date.now()) ? ' glow-danger' : ''}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-eyebrow text-dim flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-accent" strokeWidth={1.5} />
                Today&apos;s Tasks
              </h3>
              {tasks.length > 5 && (
                <Link href="/tasks" className="text-xs text-accent hover:text-accent-hover">
                  View all ({tasks.length})
                </Link>
              )}
            </div>
            {tasks.length === 0 ? (
              <div className="flex items-center gap-3 py-3">
                <svg className="w-8 h-8 text-dim/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-muted text-sm font-medium">All clear for today</p>
                  <p className="text-dim text-xs mt-0.5">No pending tasks. Enjoy the breathing room.</p>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {tasks.slice(0, 5).map(task => {
                  const dueDate = new Date(task.due_at)
                  const isOverdue = dueDate.getTime() < Date.now()
                  const timeStr = dueDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
                  return (
                    <li key={task.id} className="flex items-center gap-3 group">
                      <button
                        onClick={() => completeTask(task.id)}
                        className="flex-shrink-0 w-5 h-5 rounded border border-border hover:border-accent/50 hover:bg-accent/10 transition-colors flex items-center justify-center group-hover:border-accent/30"
                        title="Mark complete"
                      >
                        <svg className="w-3 h-3 text-transparent group-hover:text-accent/50 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <span className={`text-sm flex-1 ${isOverdue ? 'text-danger' : 'text-text'}`}>
                        {task.title}
                      </span>
                      {task.contact_name && (
                        <span className="text-xs text-dim">{task.contact_name}</span>
                      )}
                      <span className={`text-xs font-mono ${isOverdue ? 'text-danger' : 'text-dim'}`}>
                        {isOverdue ? 'Overdue' : timeStr}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          )}

          {/* Avg Response Time Card */}
          {loadingLeads ? (
            <div className="bg-card border border-border rounded-lg px-5 py-4 animate-pulse">
              <div className="h-3 w-32 rounded bg-elevated mb-3" />
              <div className="h-9 w-16 rounded bg-elevated mb-2" />
              <div className="h-3 w-40 rounded bg-elevated" />
            </div>
          ) : (
          <div className="bg-card border border-border rounded-lg px-5 py-4 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1.5">
              <Clock className="w-4 h-4 text-dim" strokeWidth={1.5} />
              <p className="text-eyebrow text-dim">Avg Response Time</p>
            </div>
            <p className="text-display text-accent">{avgResponseHours}</p>
            <p className="text-caption text-dim mt-1">Based on lead age at first status change</p>
          </div>
          )}
        </div>

        {/* ─── Admin Header ─────────────────────────────────────────── */}
        {user?.role === 'admin' && (
          (loadingLeads || loadingAgents) ? (
            <div className="mb-6 animate-pulse space-y-3">
              {/* Featured stat cards skeleton */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                {[1,2,3,4].map(i => (
                  <div key={i} className="rounded-xl p-4 border border-border bg-card">
                    <div className="h-3 w-20 rounded bg-elevated mb-3" />
                    <div className="h-8 w-12 rounded bg-elevated mb-2" />
                    <div className="h-2 w-24 rounded bg-elevated" />
                  </div>
                ))}
              </div>
              {/* Recent Leads skeleton */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <div className="h-3 w-24 rounded bg-elevated" />
                </div>
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-border">
                    <div className="w-6 h-6 rounded-full bg-elevated shrink-0" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 w-32 rounded bg-elevated" />
                      <div className="h-2 w-20 rounded bg-elevated" />
                    </div>
                    <div className="h-4 w-16 rounded-full bg-elevated" />
                  </div>
                ))}
              </div>
              {/* Agent Performance skeleton */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                <div className="lg:col-span-3 rounded-xl p-4 border border-border bg-card space-y-3">
                  <div className="h-3 w-28 rounded bg-elevated" />
                  {[1,2,3].map(i => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-elevated shrink-0" />
                      <div className="flex-1 space-y-1">
                        <div className="h-3 w-24 rounded bg-elevated" />
                        <div className="h-1.5 w-full rounded-full bg-elevated" />
                      </div>
                      <div className="h-4 w-8 rounded bg-elevated" />
                    </div>
                  ))}
                </div>
                <div className="lg:col-span-2 rounded-xl p-4 border border-border bg-card space-y-2">
                  <div className="h-3 w-28 rounded bg-elevated" />
                  {[1,2,3].map(i => (
                    <div key={i} className="h-9 w-full rounded bg-elevated" />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <AdminHeader user={user} stats={stats} leads={leads} agents={agents} />
          )
        )}

        {/* ─── Stat Cards (clickable filters) ─────────────────────────── */}
        {loadingStats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="bg-card border border-border rounded-lg px-4 py-3 animate-pulse">
                <div className="h-3 w-12 rounded bg-elevated mb-3" />
                <div className="h-7 w-10 rounded bg-elevated" />
              </div>
            ))}
          </div>
        ) : statCards.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
            {statCards.map(card => {
              const filterValue = STAT_FILTER_MAP[card.label]
              const isActive = filterValue
                ? filterValue === '__ALL__'
                  ? statusFilter === ''
                  : statusFilter === filterValue
                : false
              return (
                <button
                  key={card.label}
                  onClick={() => handleStatClick(card.label)}
                  className="text-left rounded-lg px-4 py-3 border focus:outline-none"
                  style={{
                    background: isActive ? 'color-mix(in srgb, var(--color-accent) 10%, var(--color-card))' : 'var(--color-card)',
                    borderColor: isActive ? 'var(--color-accent)' : 'var(--color-border)',
                  }}
                >
                  <div className="text-eyebrow mb-1" style={{ color: 'var(--color-dim)' }}>
                    {card.label}
                  </div>
                  <div className={`text-display leading-none ${card.color}`}>
                    {card.value}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* ─── Filter Bar ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-eyebrow text-dim">Lead Pipeline</p>
          <div className="flex items-center gap-2">
            {user?.role === 'admin' && (
              <button
                onClick={async () => {
                  setBackfilling(true)
                  setBackfillResult(null)
                  try {
                    const res = await fetch('/api/leads/backfill-wa-status', { method: 'POST' })
                    const data = await res.json()
                    if (data.success) {
                      setBackfillResult(data.data)
                      toast.success(`Synced ${data.data.synced} leads, ${data.data.missing_count} missing WA message`)
                      fetchWaStats()
                    } else {
                      toast.error(data.error || 'Backfill failed')
                    }
                  } catch {
                    toast.error('Backfill request failed')
                  }
                  setBackfilling(false)
                }}
                disabled={backfilling}
                className="bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {backfilling ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                {backfilling ? 'Syncing...' : 'Sync WA Data'}
              </button>
            )}
            <button
              onClick={() => setShowAddLead(true)}
              className="bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Lead
            </button>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dim"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search name, phone, city, email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-elevated border border-border rounded-md pl-10 pr-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
            <option value="__UNASSIGNED__">Unassigned</option>
            <option value="__OVERDUE__">Overdue Follow-ups</option>
          </select>

          {/* Assigned Filter */}
          <select
            value={assignedFilter}
            onChange={e => setAssignedFilter(e.target.value)}
            className="bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
          >
            <option value="">All Agents</option>
            {assignedNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
          >
            <option value="score">Sort: Lead Score</option>
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
            <option value="followup">Sort: Follow-up Date</option>
          </select>

          {/* Clear Filters */}
          {(search || statusFilter || assignedFilter || sortBy !== 'score') && (
            <button
              onClick={clearFilters}
              className="text-sm text-dim hover:text-text transition-colors"
            >
              Clear filters
            </button>
          )}

          {/* Lead Count */}
          <span className="text-xs text-dim ml-auto">
            {leads.length} lead{leads.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ─── Lead Table ─────────────────────────────────────────────── */}
        {loadingLeads ? (
          <div className="bg-card border border-border rounded-lg overflow-hidden animate-pulse">
            <div className="px-4 py-3 border-b border-border bg-elevated/50">
              <div className="h-4 w-full rounded bg-elevated" />
            </div>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="px-4 py-3 border-b border-border flex gap-4">
                <div className="h-4 w-8 rounded bg-elevated" />
                <div className="h-4 w-24 rounded bg-elevated" />
                <div className="h-4 w-20 rounded bg-elevated" />
                <div className="h-4 flex-1 rounded bg-elevated" />
                <div className="h-4 w-16 rounded bg-elevated" />
                <div className="h-4 w-14 rounded bg-elevated" />
              </div>
            ))}
          </div>
        ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated/50">
                  {(user?.role === 'admin' || user?.can_assign) && (
                    <th className="px-3 py-3 text-left w-10">
                      <input
                        type="checkbox"
                        checked={leads.length > 0 && selected.size === leads.length}
                        onChange={toggleSelectAll}
                        className="rounded border-border accent-accent"
                      />
                    </th>
                  )}
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider w-10">#</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider w-14">Score</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Name</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Phone</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">City</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Status</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Priority</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider">Response</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider" title="n8n Auto-Message Delivery">WA</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Assigned</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Follow-up</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Added</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.length === 0 ? (
                  <tr>
                    <td
                      colSpan={user?.role === 'admin' || user?.can_assign ? 15 : 14}
                      className="px-3 py-16 text-center"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-10 h-10 text-dim/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        <div>
                          <p className="text-muted text-sm font-medium">
                            {search || statusFilter || assignedFilter
                              ? 'No leads match your filters'
                              : 'No leads yet'}
                          </p>
                          <p className="text-dim text-xs mt-1">
                            {search || statusFilter || assignedFilter
                              ? 'Try adjusting your search or clearing filters.'
                              : 'New leads will appear here as they come in.'}
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pagedLeads.map((lead, idx) => {
                    const statusColor = STATUS_COLORS[lead.lead_status] || { bg: 'var(--color-elevated)', text: 'var(--color-muted)', border: 'var(--color-border)' }
                    const priorityColor = PRIORITY_COLORS[lead.lead_priority] || { bg: 'var(--color-elevated)', text: 'var(--color-muted)', border: 'var(--color-border)' }
                    const followup = followupLabel(lead.next_followup)
                    const badge = responseTimeBadge(lead)
                    return (
                      <tr key={lead.row_number} className="lead-row table-row-hover">
                        {(user?.role === 'admin' || user?.can_assign) && (
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={selected.has(lead.row_number)}
                              onChange={() => toggleSelect(lead.row_number)}
                              className="rounded border-border accent-accent"
                            />
                          </td>
                        )}

                        {/* Serial Number */}
                        <td className="px-3 py-2.5 text-center text-xs text-dim font-mono">{dashPage * 50 + idx + 1}</td>

                        {/* Lead Score */}
                        <td className="px-3 py-2.5 text-center">
                          {lead.lead_score !== undefined && (
                            <span
                              className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-bold"
                              style={{
                                backgroundColor: scoreBg(lead.lead_score),
                                color: scoreColor(lead.lead_score),
                                border: `1px solid ${scoreBorder(lead.lead_score)}`,
                              }}
                              title={`Lead Score: ${lead.lead_score}/100`}
                            >
                              {lead.lead_score}
                            </span>
                          )}
                        </td>

                        {/* Name — clickable link */}
                        <td className="px-3 py-2.5">
                          <Link
                            href={`/leads/${lead.row_number}`}
                            className="text-accent hover:text-accent-hover font-medium transition-colors"
                          >
                            {lead.full_name || 'Unknown'}
                          </Link>
                        </td>

                        {/* Phone */}
                        <td className="px-3 py-2.5 text-body font-mono text-xs">{lead.phone}</td>

                        {/* City */}
                        <td className="px-3 py-2.5 text-body text-xs">
                          {lead.city}
                          {lead.state ? `, ${lead.state}` : ''}
                        </td>

                        {/* INLINE STATUS DROPDOWN */}
                        <td className="px-3 py-2.5">
                          <select
                            value={lead.lead_status}
                            onChange={(e) => updateLeadField(lead.row_number, 'lead_status', e.target.value)}
                            className="status-select"
                            style={{
                              backgroundColor: statusColor.bg,
                              color: statusColor.text,
                              borderColor: statusColor.border,
                            }}
                          >
                            {STATUS_OPTIONS.map(s => (
                              <option key={s} value={s} style={{ backgroundColor: 'var(--color-option-bg)', color: 'var(--color-option-text)' }}>
                                {s.replace('_', ' ')}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* INLINE PRIORITY DROPDOWN */}
                        <td className="px-3 py-2.5">
                          <select
                            value={lead.lead_priority || ''}
                            onChange={(e) => updateLeadField(lead.row_number, 'lead_priority', e.target.value)}
                            className="status-select"
                            style={{
                              backgroundColor: priorityColor.bg,
                              color: priorityColor.text,
                              borderColor: priorityColor.border,
                            }}
                          >
                            <option value="" style={{ backgroundColor: 'var(--color-option-bg)', color: 'var(--color-option-text)' }}>-</option>
                            {PRIORITY_OPTIONS.map(p => (
                              <option key={p} value={p} style={{ backgroundColor: 'var(--color-option-bg)', color: 'var(--color-option-text)' }}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Response Time Badge */}
                        <td className="px-3 py-2.5 text-center">
                          {badge ? (
                            <span className={`inline-block text-[10px] font-semibold px-2.5 py-1 rounded-lg border ${badge.colorClass}`}>
                              {badge.label}
                            </span>
                          ) : (
                            <span className="text-xs text-dim">-</span>
                          )}
                        </td>

                        {/* WA Auto-Message Status */}
                        <td className="px-3 py-2.5 text-center">
                          {(() => {
                            const phoneKey = lead.phone?.replace(/\D/g, '').slice(-10)
                            const waInfo = waStats[phoneKey]
                            // Check both: DB status and sheet wa_message_id
                            if (waInfo) {
                              const s = waInfo.status?.toLowerCase()
                              if (s === 'read') return <span className="text-blue-400 text-xs" title={`Read — ${waInfo.template_used}`}>&#10003;&#10003;</span>
                              if (s === 'delivered') return <span className="text-green-400 text-xs" title={`Delivered — ${waInfo.template_used}`}>&#10003;&#10003;</span>
                              if (s === 'sent') return <span className="text-zinc-400 text-xs" title={`Sent — ${waInfo.template_used}`}>&#10003;</span>
                              if (s === 'failed') return <span className="text-red-400 text-xs" title="Failed">&#10007;</span>
                              return <span className="text-zinc-500 text-xs" title="Status unknown">&#10003;</span>
                            }
                            if (lead.wa_message_id) {
                              // n8n sent it but we don't have status in DB
                              return <span className="text-zinc-500 text-xs" title="Sent by n8n (status pending)">&#10003;</span>
                            }
                            return <span className="text-dim text-[10px]" title="No auto-message sent">—</span>
                          })()}
                        </td>

                        {/* Assigned */}
                        <td className="px-3 py-2.5 text-body text-xs">
                          {lead.assigned_to || (
                            <span className="text-accent/50 italic">Unassigned</span>
                          )}
                        </td>

                        {/* Follow-up */}
                        <td className="px-3 py-2.5">
                          {followup.text !== '-' ? (
                            <span className={`text-xs font-medium ${followup.urgent ? 'text-danger' : 'text-muted'}`}>
                              {followup.text}
                            </span>
                          ) : (
                            <span className="text-xs text-dim">-</span>
                          )}
                        </td>

                        {/* Added date */}
                        <td className="px-3 py-2.5 text-dim text-xs">{timeAgo(lead.created_time)}</td>

                        {/* Actions: Chat + Win/Loss */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1 relative">
                            <Link
                              href={`/leads/${lead.row_number}`}
                              className="inline-flex items-center gap-1 text-xs text-dim hover:text-accent transition-colors px-1.5 py-1 rounded hover:bg-accent/10"
                              title="Chat"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                            </Link>

                            {/* View lead detail — convert/lost only from lead detail page */}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {!loadingLeads && dashPageCount > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4 text-sm">
            <button
              onClick={() => setDashPage(p => Math.max(0, p - 1))}
              disabled={dashPage === 0}
              className="px-3 py-1.5 rounded-md border border-border bg-card text-text disabled:opacity-40 disabled:cursor-not-allowed hover:bg-elevated transition-colors"
            >
              Prev
            </button>
            <span className="text-dim tabular-nums">
              Page {dashPage + 1} of {dashPageCount}
              <span className="hidden sm:inline"> · {leads.length} leads</span>
            </span>
            <button
              onClick={() => setDashPage(p => Math.min(dashPageCount - 1, p + 1))}
              disabled={dashPage >= dashPageCount - 1}
              className="px-3 py-1.5 rounded-md border border-border bg-card text-text disabled:opacity-40 disabled:cursor-not-allowed hover:bg-elevated transition-colors"
            >
              Next
            </button>
          </div>
        )}

        {/* ─── WA Backfill Results ───────────────────────────────────── */}
        {backfillResult && (
          <div className="mt-6 bg-card border border-green-500/20 rounded-lg overflow-hidden">
            <div className="px-5 py-3 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs font-semibold text-body">
                  WA Sync: {backfillResult.synced} new, {backfillResult.already_exists} existing, {backfillResult.missing_count} missing
                </span>
              </div>
              <button onClick={() => setBackfillResult(null)} className="text-dim hover:text-body text-xs">
                Dismiss
              </button>
            </div>
            {backfillResult.missing.length > 0 && (
              <div className="p-4">
                <p className="text-xs text-warning font-semibold mb-2">
                  These {backfillResult.missing.length} leads never got the automated WhatsApp message — sales guy should contact manually:
                </p>
                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-dim">
                        <th className="px-3 py-1.5 text-left">Name</th>
                        <th className="px-3 py-1.5 text-left">Phone</th>
                        <th className="px-3 py-1.5 text-left">City</th>
                        <th className="px-3 py-1.5 text-left">Status</th>
                        <th className="px-3 py-1.5 text-left">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backfillResult.missing.map(m => (
                        <tr key={m.row_number} className="border-b border-border/50 hover:bg-elevated/30">
                          <td className="px-3 py-1.5">
                            <Link href={`/leads/${m.row_number}`} className="text-accent hover:underline">
                              {m.full_name || 'Unknown'}
                            </Link>
                          </td>
                          <td className="px-3 py-1.5 text-dim">{m.phone}</td>
                          <td className="px-3 py-1.5 text-dim">{m.city || '-'}</td>
                          <td className="px-3 py-1.5">
                            <Badge tone={statusTone(m.lead_status)}>{m.lead_status}</Badge>
                          </td>
                          <td className="px-3 py-1.5 text-dim">{timeAgo(m.created_time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Stale Leads Section ────────────────────────────────────── */}
        {staleLeads.length > 0 && (
          <div className="mt-6 bg-card border border-warning/20 rounded-lg overflow-hidden">
            <button
              onClick={() => setStaleOpen(!staleOpen)}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-elevated/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <span className="text-sm font-semibold text-warning">
                  Stale Leads ({staleLeads.length})
                </span>
                <span className="text-xs text-dim">No activity for 14+ days</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-dim transition-transform ${staleOpen ? 'rotate-180' : ''}`}
                strokeWidth={2}
              />
            </button>

            {staleOpen && (
              <div className="border-t border-warning/10 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warning/5">
                      <th className="px-4 py-2 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Name</th>
                      <th className="px-4 py-2 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Phone</th>
                      <th className="px-4 py-2 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">City</th>
                      <th className="px-4 py-2 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Status</th>
                      <th className="px-4 py-2 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Days Stale</th>
                      <th className="px-4 py-2 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Assigned</th>
                      <th className="px-4 py-2 text-center text-[10px] font-semibold text-dim uppercase tracking-wider w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {staleLeads.map(lead => {
                      const days = Math.floor(hoursSinceCreation(lead.created_time) / 24)
                      return (
                        <tr key={lead.row_number} className="hover:bg-warning/5 transition-colors">
                          <td className="px-4 py-2 text-text text-xs font-medium">{lead.full_name || 'Unknown'}</td>
                          <td className="px-4 py-2 text-muted font-mono text-xs">{lead.phone}</td>
                          <td className="px-4 py-2 text-muted text-xs">{lead.city}</td>
                          <td className="px-4 py-2">
                            <Badge tone={statusTone(lead.lead_status)}>{lead.lead_status}</Badge>
                          </td>
                          <td className="px-4 py-2 text-warning text-xs font-semibold">{days}d</td>
                          <td className="px-4 py-2 text-muted text-xs">{lead.assigned_to || '-'}</td>
                          <td className="px-4 py-2 text-center">
                            <Link
                              href="/inbox"
                              className="text-[10px] font-semibold text-warning hover:text-yellow-300 transition-colors px-2 py-1 rounded border border-warning/20 hover:bg-warning/10"
                            >
                              Re-engage
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─── Floating Bulk Assign Bar ─────────────────────────────────── */}
      {selected.size > 0 && (user?.role === 'admin' || user?.can_assign) && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
            <div className="bg-elevated border border-border rounded-lg shadow-2xl shadow-black/50 px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-sm text-text">
                <span className="font-semibold text-accent">{selected.size}</span>{' '}
                lead{selected.size !== 1 ? 's' : ''} selected
              </span>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Bulk Assign */}
                <select
                  value={assignTo}
                  onChange={e => setAssignTo(e.target.value)}
                  className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50"
                >
                  <option value="">Assign to...</option>
                  {user?.role === 'admin'
                    ? agents.map(a => (
                        <option key={a.id} value={a.name}>{a.name}</option>
                      ))
                    : user && <option value={user.name}>{user.name}</option>
                  }
                </select>
                <button
                  onClick={bulkAssign}
                  disabled={!assignTo || assigning}
                  className="bg-accent hover:bg-accent-hover disabled:bg-accent/30 disabled:cursor-not-allowed text-[#1a1209] text-sm font-semibold px-4 py-1.5 rounded-md transition-colors"
                >
                  {assigning ? 'Working...' : 'Assign'}
                </button>

                <div className="w-px h-6 bg-border mx-1" />

                {/* Bulk Status Change */}
                <select
                  value={bulkStatus}
                  onChange={e => setBulkStatus(e.target.value)}
                  className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50"
                >
                  <option value="">Change status...</option>
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
                <button
                  onClick={bulkStatusChange}
                  disabled={!bulkStatus || assigning}
                  className="bg-accent hover:bg-accent-hover disabled:bg-accent/30 disabled:cursor-not-allowed text-[#1a1209] text-sm font-semibold px-4 py-1.5 rounded-md transition-colors"
                >
                  {assigning ? 'Working...' : 'Update'}
                </button>

                <div className="w-px h-6 bg-border mx-1" />

                <button
                  onClick={() => { setSelected(new Set()); setBulkStatus(''); setAssignTo('') }}
                  className="text-sm text-dim hover:text-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PoweredBy />

      {/* Add Lead Modal */}
      {showAddLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddLead(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-text">Add New Lead</h2>
              <button onClick={() => setShowAddLead(false)} className="text-dim hover:text-text transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs text-dim block mb-1">Full Name <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    value={addLeadForm.full_name}
                    onChange={e => setAddLeadForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="John Doe"
                    className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-dim block mb-1">Phone <span className="text-danger">*</span></label>
                  <input
                    type="tel"
                    value={addLeadForm.phone}
                    onChange={e => setAddLeadForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="9876543210"
                    className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-dim block mb-1">Email</label>
                  <input
                    type="email"
                    value={addLeadForm.email}
                    onChange={e => setAddLeadForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="john@example.com"
                    className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-dim block mb-1">City</label>
                  <input
                    type="text"
                    value={addLeadForm.city}
                    onChange={e => setAddLeadForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="Mumbai"
                    className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-dim block mb-1">State</label>
                  <input
                    type="text"
                    value={addLeadForm.state}
                    onChange={e => setAddLeadForm(f => ({ ...f, state: e.target.value }))}
                    placeholder="Maharashtra"
                    className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-dim block mb-1">Interest</label>
                  <input
                    type="text"
                    value={addLeadForm.model_interest}
                    onChange={e => setAddLeadForm(f => ({ ...f, model_interest: e.target.value }))}
                    placeholder="Kiosk / Shop"
                    className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-dim block mb-1">Priority</label>
                  <select
                    value={addLeadForm.lead_priority}
                    onChange={e => setAddLeadForm(f => ({ ...f, lead_priority: e.target.value }))}
                    className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
                  >
                    <option value="HOT">HOT</option>
                    <option value="WARM">WARM</option>
                    <option value="COLD">COLD</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-dim block mb-1">Source</label>
                  <input
                    type="text"
                    value={addLeadForm.source}
                    onChange={e => setAddLeadForm(f => ({ ...f, source: e.target.value }))}
                    placeholder="Referral / Walk-in / Phone Call"
                    className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-dim block mb-1">Notes</label>
                  <textarea
                    value={addLeadForm.notes}
                    onChange={e => setAddLeadForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Any notes about this lead..."
                    rows={2}
                    className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50 resize-none"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
              <button
                onClick={() => setShowAddLead(false)}
                className="px-4 py-2 text-sm text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddLead}
                disabled={addLeadSaving || !addLeadForm.full_name.trim() || !addLeadForm.phone.trim()}
                className="bg-accent hover:bg-accent-hover text-[#1a1209] px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {addLeadSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[#1a1209] border-t-transparent rounded-full animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Lead'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
    </div>
  )
}
