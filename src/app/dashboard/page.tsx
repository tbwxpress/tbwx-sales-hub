'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'

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
}

interface Stats {
  total: number
  new: number
  contacted: number
  replied: number
  hot: number
  converted: number
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
  NEW:        { bg: '#3b82f620', text: '#60a5fa', border: '#3b82f630' },
  DECK_SENT:  { bg: '#8b5cf620', text: '#a78bfa', border: '#8b5cf630' },
  CONTACTED:  { bg: '#f5c51820', text: '#f5c518', border: '#f5c51830' },
  REPLIED:    { bg: '#22c55e20', text: '#4ade80', border: '#22c55e30' },
  INTERESTED: { bg: '#06b6d420', text: '#22d3ee', border: '#06b6d430' },
  HOT:        { bg: '#f9731620', text: '#fb923c', border: '#f9731630' },
  CONVERTED:  { bg: '#10b98120', text: '#34d399', border: '#10b98130' },
  LOST:       { bg: '#ef444420', text: '#f87171', border: '#ef444430' },
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  HOT:  { bg: 'rgba(249,115,22,0.15)', text: '#fb923c', border: 'rgba(249,115,22,0.3)' },
  WARM: { bg: 'rgba(234,179,8,0.15)', text: '#facc15', border: 'rgba(234,179,8,0.3)' },
  COLD: { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
}

const STATUS_OPTIONS = ['NEW', 'DECK_SENT', 'CONTACTED', 'REPLIED', 'INTERESTED', 'HOT', 'CONVERTED', 'LOST']
const PRIORITY_OPTIONS = ['HOT', 'WARM', 'COLD']


// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function followupLabel(dateStr: string): { text: string; urgent: boolean } {
  if (!dateStr) return { text: '-', urgent: false }
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return { text: dateStr, urgent: false }
  const now = new Date()
  const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, urgent: true }
  if (diffDays === 0) return { text: 'Today', urgent: true }
  if (diffDays === 1) return { text: 'Tomorrow', urgent: false }
  return { text: `${diffDays}d`, urgent: false }
}

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
  if (['CONTACTED', 'DECK_SENT', 'REPLIED', 'INTERESTED', 'HOT', 'CONVERTED', 'LOST'].includes(lead.lead_status)) {
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

// ─── Toast Component ─────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] toast-enter">
      <div className="bg-accent text-[#1a1209] px-5 py-2.5 rounded-lg shadow-xl shadow-black/30 text-sm font-medium flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        {message}
      </div>
    </div>
  )
}

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
  const [toast, setToast] = useState('')

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([])

  // Auto-message (n8n) delivery status per phone
  const [waStats, setWaStats] = useState<Record<string, { status: string; template_used: string; timestamp: string }>>({})

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [assignedFilter, setAssignedFilter] = useState('')

  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [assignTo, setAssignTo] = useState('')
  const [assigning, setAssigning] = useState(false)

  // Win/Loss

  // Add Lead Modal
  const [showAddLead, setShowAddLead] = useState(false)
  const [addLeadForm, setAddLeadForm] = useState({ full_name: '', phone: '', email: '', city: '', state: '', model_interest: '', lead_priority: 'WARM', notes: '', source: '' })
  const [addLeadSaving, setAddLeadSaving] = useState(false)

  // Stale Leads
  const [staleOpen, setStaleOpen] = useState(false)

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
    try {
      const res = await fetch('/api/leads?stats=true')
      const data = await res.json()
      if (data.success) setStats(data.data)
    } catch {
      // stats are non-critical
    }
  }, [])

  const fetchLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      if (assignedFilter) params.set('assigned', assignedFilter)

      const qs = params.toString()
      const res = await fetch(`/api/leads${qs ? `?${qs}` : ''}`)
      const data = await res.json()
      if (data.success) {
        setLeads(data.data)
      } else {
        setError(data.error || 'Failed to load leads')
      }
    } catch {
      setError('Failed to load leads')
    }
  }, [search, statusFilter, assignedFilter])

  const fetchAgents = useCallback(async (currentUser: SessionUser) => {
    if (currentUser.role === 'admin') {
      try {
        const res = await fetch('/api/users')
        const data = await res.json()
        if (data.success) setAgents(data.data.filter((u: AgentUser) => u.active))
      } catch {
        // non-critical
      }
    }
  }, [])

  const fetchTasks = useCallback(async () => {
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
    }
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
      const currentUser = await fetchUser()
      if (currentUser) {
        await Promise.all([fetchStats(), fetchLeads(), fetchAgents(currentUser), fetchTasks(), fetchWaStats()])
      }
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Refetch leads when filters change ───────────────────────────────────

  useEffect(() => {
    if (!user) return
    fetchLeads()
  }, [search, statusFilter, assignedFilter, fetchLeads, user])

  // ─── Handlers ────────────────────────────────────────────────────────────

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
    setAssignedFilter('')
  }

  function toggleSelect(rowNum: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(rowNum)) next.delete(rowNum)
      else next.add(rowNum)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === leads.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(leads.map(l => l.row_number)))
    }
  }

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
        setToast(`${field === 'lead_status' ? 'Status' : 'Priority'} updated to ${value}`)
        // Refresh stats in background
        fetchStats()
      } else {
        setError(data.error || 'Update failed')
      }
    } catch {
      setError('Update failed')
    }
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
        setToast(`${selected.size} leads assigned to ${assignTo}`)
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
        setToast('Lead added successfully')
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
      setToast('Task completed')
    } catch {
      setError('Failed to complete task')
    }
  }


  // ─── Unique assigned names for filter dropdown ───────────────────────────

  const assignedNames = [...new Set(leads.map(l => l.assigned_to).filter(Boolean))]

  // ─── Stale Leads ─────────────────────────────────────────────────────────

  const staleLeads = leads.filter(l => {
    if (['CONVERTED', 'LOST', 'REPLIED', 'HOT'].includes(l.lead_status)) return false
    if (!l.created_time) return false
    const daysSince = hoursSinceCreation(l.created_time) / 24
    return daysSince > 14
  })

  // ─── Stat Cards Config ───────────────────────────────────────────────────

  // Map stat card labels to status filter values
  const STAT_FILTER_MAP: Record<string, string> = {
    'New': 'NEW',
    'Replied': 'REPLIED',
    'Hot': 'HOT',
    'Converted': 'CONVERTED',
    'Lost': 'LOST',
  }

  function handleStatClick(label: string) {
    const filterValue = STAT_FILTER_MAP[label]
    if (filterValue) {
      // Toggle: if already filtering by this, clear it
      setStatusFilter(prev => prev === filterValue ? '' : filterValue)
    }
  }

  const statCards = stats
    ? [
        { label: 'Total', value: stats.total, color: 'text-text', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
        { label: 'New', value: stats.new, color: 'text-blue-400', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
        { label: 'Replied', value: stats.replied, color: 'text-green-400', icon: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6' },
        { label: 'Hot', value: stats.hot, color: 'text-orange-400', icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z' },
        { label: 'Converted', value: stats.converted, color: 'text-emerald-400', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
        { label: 'Lost', value: stats.lost, color: 'text-red-400', icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' },
        { label: 'Unassigned', value: stats.unassigned, color: 'text-accent', icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' },
        { label: 'Overdue', value: stats.overdue_followups, color: 'text-red-400', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
      ]
    : []

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
        {/* Error Banner */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-danger hover:text-red-300 ml-4">
              Dismiss
            </button>
          </div>
        )}

        {/* ─── Today's Tasks + Avg Response Time Row ──────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Today's Tasks Widget */}
          <div className={`lg:col-span-2 bg-card border border-border rounded-lg px-5 py-4${tasks.some(t => new Date(t.due_at).getTime() < Date.now()) ? ' glow-danger' : ''}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-dim flex items-center gap-2">
                <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Today&apos;s Tasks
              </h3>
              {tasks.length > 5 && (
                <Link href="/tasks" className="text-xs text-accent hover:text-accent-hover transition-colors">
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
                  const timeStr = dueDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
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

          {/* Avg Response Time Card */}
          <div className="bg-card border border-border rounded-lg px-5 py-4 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1.5">
              <svg className="w-4 h-4 text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[10px] text-dim uppercase tracking-wider font-medium">Avg Response Time</p>
            </div>
            <p className="text-3xl font-bold text-accent">{computeAvgResponseHours(leads)}</p>
            <p className="text-xs text-dim mt-1">Based on lead age at first status change</p>
          </div>
        </div>

        {/* ─── Stats Cards ────────────────────────────────────────────── */}
        <p className="text-[10px] font-semibold uppercase tracking-wider text-dim mb-2">Pipeline Overview</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6 stagger-children">
          {statCards.map(card => {
            const isClickable = card.label in STAT_FILTER_MAP
            const isActive = statusFilter === STAT_FILTER_MAP[card.label]
            return (
              <button
                key={card.label}
                onClick={() => isClickable && handleStatClick(card.label)}
                className={`stat-card card-hover bg-card border rounded-lg px-4 py-3 transition-colors group text-left ${
                  isActive
                    ? 'border-accent/50 ring-1 ring-accent/20'
                    : 'border-border hover:border-border-light'
                } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-dim uppercase tracking-wider font-medium">{card.label}</p>
                  <svg className="w-3.5 h-3.5 text-dim group-hover:text-muted transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
                  </svg>
                </div>
                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              </button>
            )
          })}
        </div>

        {/* ─── Filter Bar ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-dim">Lead Pipeline</p>
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

          {/* Clear Filters */}
          {(search || statusFilter || assignedFilter) && (
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
                      colSpan={user?.role === 'admin' || user?.can_assign ? 14 : 13}
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
                  leads.map((lead, idx) => {
                    const statusColor = STATUS_COLORS[lead.lead_status] || { bg: '#2e221420', text: '#a89274', border: '#3d2e1a' }
                    const priorityColor = PRIORITY_COLORS[lead.lead_priority] || { bg: '#2e221420', text: '#a89274', border: '#3d2e1a' }
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
                        <td className="px-3 py-2.5 text-center text-xs text-dim font-mono">{idx + 1}</td>

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
                        <td className="px-3 py-2.5 text-muted font-mono text-xs">{lead.phone}</td>

                        {/* City */}
                        <td className="px-3 py-2.5 text-muted text-xs">
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
                              <option key={s} value={s} style={{ backgroundColor: '#241a0e', color: '#faf5eb' }}>
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
                            <option value="" style={{ backgroundColor: '#241a0e', color: '#faf5eb' }}>-</option>
                            {PRIORITY_OPTIONS.map(p => (
                              <option key={p} value={p} style={{ backgroundColor: '#241a0e', color: '#faf5eb' }}>
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
                        <td className="px-3 py-2.5 text-muted text-xs">
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
              <svg
                className={`w-4 h-4 text-dim transition-transform ${staleOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
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
                            <span
                              className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                              style={{
                                backgroundColor: (STATUS_COLORS[lead.lead_status] || {}).bg || '#2e221420',
                                color: (STATUS_COLORS[lead.lead_status] || {}).text || '#a89274',
                                borderColor: (STATUS_COLORS[lead.lead_status] || {}).border || '#3d2e1a',
                              }}
                            >
                              {lead.lead_status}
                            </span>
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

              <div className="flex items-center gap-3">
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
                  {assigning ? 'Assigning...' : 'Assign'}
                </button>

                <button
                  onClick={() => setSelected(new Set())}
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
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}
