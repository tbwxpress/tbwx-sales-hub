'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Search, UserPlus, Download, Eye, MessageSquare, Pencil, X } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { STATUS_LABELS, STATUS_MIGRATION } from '@/config/client'
import Toast from '@/components/Toast'
import Badge, { statusTone, priorityTone } from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { timeAgo, followupLabel, istToday } from '@/lib/format'
import { scoreColor, scoreBg, scoreBorder } from '@/lib/score-colors'

// ─── Types ───────────────────────────────────────────────────────────────────

interface LastDiscussion {
  source: 'note' | 'call' | 'message_in' | 'message_out'
  text: string
  by: string
  at: string
}

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
  last_discussion?: LastDiscussion | null
  telecaller_user_id?: string
  telecaller_name?: string
  telecaller_assigned_at?: string
  is_delegated_to_me?: boolean
  active_delegation?: { from_agent_name: string; to_agent_name: string; expires_at: string | null; id: number } | null
}

interface SessionUser {
  name: string
  role: string
  can_assign: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeStatusVars(cssVar: string): { bg: string; text: string; border: string } {
  return {
    bg: `color-mix(in srgb, ${cssVar} 15%, transparent)`,
    text: cssVar,
    border: `color-mix(in srgb, ${cssVar} 30%, transparent)`,
  }
}

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


// ─── Page Component ──────────────────────────────────────────────────────────

function getInitialParam(key: string, fallback: string = ''): string {
  if (typeof window === 'undefined') return fallback
  return new URLSearchParams(window.location.search).get(key) || fallback
}

export default function LeadsPage() {
  const router = useRouter()

  const [user, setUser] = useState<SessionUser | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  // Quick notes
  const [quickNotePhone, setQuickNotePhone] = useState<string | null>(null)
  const [quickNoteText, setQuickNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  async function handleQuickNote(phone: string) {
    if (!quickNoteText.trim()) return
    setSavingNote(true)
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(phone)}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: quickNoteText.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setToast('Note added')
        setQuickNotePhone(null)
        setQuickNoteText('')
      }
    } catch { /* silent */ }
    setSavingNote(false)
  }

  // Filters — initialize from URL params to preserve state on back navigation
  const [search, setSearch] = useState(() => getInitialParam('q'))
  const [statusFilter, setStatusFilter] = useState(() => getInitialParam('status'))
  const [assignedFilter, setAssignedFilter] = useState(() => getInitialParam('assigned'))
  // Telecaller filter — '' = all, '__NONE__' = no telecaller assigned, else telecaller user_id
  const [telecallerFilter, setTelecallerFilter] = useState(() => getInitialParam('tc'))
  const [sortBy, setSortBy] = useState(() => getInitialParam('sort', 'score'))
  const [dateFrom, setDateFrom] = useState(() => getInitialParam('from'))
  const [dateTo, setDateTo] = useState(() => getInitialParam('to'))

  // Sync filters to URL (without full page reload)
  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (statusFilter) params.set('status', statusFilter)
    if (assignedFilter) params.set('assigned', assignedFilter)
    if (telecallerFilter) params.set('tc', telecallerFilter)
    if (sortBy && sortBy !== 'score') params.set('sort', sortBy)
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo) params.set('to', dateTo)
    const qs = params.toString()
    const newUrl = qs ? `/leads?${qs}` : '/leads'
    window.history.replaceState(null, '', newUrl)
  }, [search, statusFilter, assignedFilter, telecallerFilter, sortBy, dateFrom, dateTo])

  // Selection (admin/can_assign only)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [assignTo, setAssignTo] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [bulkStatus, setBulkStatus] = useState('')
  const [tcAssignToId, setTcAssignToId] = useState('')
  const [tcAssigning, setTcAssigning] = useState(false)
  const [agents, setAgents] = useState<{ id: string; name: string; active: boolean; is_telecaller?: boolean }[]>([])

  // Add Lead
  const [showAddLead, setShowAddLead] = useState(false)
  const [addLeadForm, setAddLeadForm] = useState({ full_name: '', phone: '', email: '', city: '', state: '', model_interest: '', lead_priority: 'WARM', notes: '', source: '' })
  const [addLeadSaving, setAddLeadSaving] = useState(false)
  const [addLeadTouched, setAddLeadTouched] = useState<Record<string, boolean>>({})

  // Quick filter pills
  const [quickFilter, setQuickFilter] = useState<'all' | 'mine' | 'hot' | 'unassigned' | 'due_today'>('all')

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      const data = await res.json()
      if (!data.success) { router.push('/login'); return null }
      setUser(data.data)
      return data.data as SessionUser
    } catch {
      router.push('/login')
      return null
    }
  }, [router])

  const fetchLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      const isSpecialFilter = statusFilter.startsWith('__')
      if (statusFilter && !isSpecialFilter) params.set('status', statusFilter)
      if (assignedFilter) params.set('assigned', assignedFilter)
      if (sortBy && sortBy !== 'score') params.set('sort', sortBy)

      const qs = params.toString()
      const res = await fetch(`/api/leads${qs ? `?${qs}` : ''}`)
      const data = await res.json()
      if (data.success) {
        let filtered = data.data
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
        if (telecallerFilter === '__NONE__') {
          filtered = filtered.filter((l: Lead) => !l.telecaller_user_id)
        } else if (telecallerFilter) {
          filtered = filtered.filter((l: Lead) => l.telecaller_user_id === telecallerFilter)
        }
        if (dateFrom) {
          const fromTs = new Date(dateFrom + 'T00:00:00').getTime()
          filtered = filtered.filter((l: Lead) => l.created_time && new Date(l.created_time).getTime() >= fromTs)
        }
        if (dateTo) {
          const toTs = new Date(dateTo + 'T23:59:59').getTime()
          filtered = filtered.filter((l: Lead) => l.created_time && new Date(l.created_time).getTime() <= toTs)
        }
        setLeads(filtered)
      } else {
        setError(data.error || 'Failed to load leads')
      }
    } catch {
      setError('Failed to load leads')
    }
  }, [search, statusFilter, assignedFilter, telecallerFilter, sortBy, dateFrom, dateTo])

  const fetchAgents = useCallback(async (_currentUser: SessionUser) => {
    // Every authed user fetches the active-user roster — non-admins need
    // it to see telecallers in the bulk-route dropdown. The /api/users
    // endpoint strips password_hash for all callers.
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      if (data.success) setAgents(data.data.filter((u: { active: boolean }) => u.active))
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      const currentUser = await fetchUser()
      if (currentUser) {
        await Promise.all([fetchLeads(), fetchAgents(currentUser)])
      }
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!user) return
    fetchLeads()
  }, [search, statusFilter, assignedFilter, telecallerFilter, sortBy, dateFrom, dateTo, fetchLeads, user])

  // ─── Keyboard Shortcuts ──────────────────────────────────────────────────

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      if (e.key === '/') {
        e.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="Search name"]')
        searchInput?.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // ─── Handlers ────────────────────────────────────────────────────────────

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
    setAssignedFilter('')
    setTelecallerFilter('')
    setSortBy('score')
    setDateFrom('')
    setDateTo('')
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
    if (selected.size === displayedLeads.length) setSelected(new Set())
    else setSelected(new Set(displayedLeads.map(l => l.row_number)))
  }

  async function updateLeadField(rowNum: number, field: string, value: string) {
    try {
      const res = await fetch(`/api/leads/${rowNum}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      const data = await res.json()
      if (data.success) {
        setLeads(prev => prev.map(l =>
          l.row_number === rowNum ? { ...l, [field]: value } : l
        ))
        setToast(`${field === 'lead_status' ? 'Status' : 'Priority'} updated to ${value}`)
      } else {
        setError(data.error || 'Update failed')
      }
    } catch {
      setError('Update failed')
    }
  }

  async function bulkStatusChange() {
    if (!bulkStatus || selected.size === 0) return
    setAssigning(true)
    try {
      await Promise.all(Array.from(selected).map(id =>
        fetch(`/api/leads/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_status: bulkStatus }),
        })
      ))
      setLeads(prev => prev.map(l =>
        selected.has(l.row_number) ? { ...l, lead_status: bulkStatus } : l
      ))
      setToast(`${selected.size} leads updated to ${bulkStatus.replace('_', ' ')}`)
      setSelected(new Set())
      setBulkStatus('')
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
        setToast(`${selected.size} leads assigned to ${assignTo}`)
        fetchLeads()
      } else {
        setError(data.error || 'Assignment failed')
      }
    } catch {
      setError('Assignment failed')
    }
    setAssigning(false)
  }

  async function bulkAssignTelecaller() {
    if (!tcAssignToId || selected.size === 0) return
    setTcAssigning(true)
    try {
      const res = await fetch('/api/leads/telecaller-bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_rows: Array.from(selected), telecaller_user_id: tcAssignToId }),
      })
      const data = await res.json()
      if (data.success) {
        setSelected(new Set())
        setTcAssignToId('')
        const tcName = agents.find(a => a.id === tcAssignToId)?.name || 'telecaller'
        setToast(`${data.data?.processed ?? selected.size} leads assigned to ${tcName}${data.data?.skipped ? ` (${data.data.skipped} skipped — not your leads)` : ''}`)
        fetchLeads()
      } else {
        setError(data.error || 'Telecaller assignment failed')
      }
    } catch {
      setError('Telecaller assignment failed')
    }
    setTcAssigning(false)
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
        setAddLeadTouched({})
        setToast('Lead added successfully')
        fetchLeads()
      } else {
        setError(data.error || 'Failed to add lead')
      }
    } catch {
      setError('Failed to add lead')
    }
    setAddLeadSaving(false)
  }

  // Quick filter pill counts — always computed from the full fetched leads list
  const today = istToday()
  const pillCounts = {
    all: leads.length,
    mine: leads.filter(l => l.assigned_to === user?.name).length,
    hot: leads.filter(l => l.lead_priority === 'HOT').length,
    unassigned: leads.filter(l => !l.assigned_to).length,
    due_today: leads.filter(l => l.next_followup?.startsWith(today)).length,
  }

  // Apply quick filter on top of the already-fetched leads
  const displayedLeads = quickFilter === 'all' ? leads
    : quickFilter === 'mine' ? leads.filter(l => l.assigned_to === user?.name)
    : quickFilter === 'hot' ? leads.filter(l => l.lead_priority === 'HOT')
    : quickFilter === 'unassigned' ? leads.filter(l => !l.assigned_to)
    : leads.filter(l => l.next_followup?.startsWith(today))

  const assignedNames = [...new Set(leads.map(l => l.assigned_to).filter(Boolean))]
  const canBulkAction = user?.role === 'admin' || user?.can_assign
  // Any active agent can bulk-route their OWN leads to a telecaller. The
  // server-side endpoint enforces ownership for non-managers, so we just
  // need to expose the checkbox + telecaller dropdown to all logged-in users.
  const hasTelecallers = agents.some(a => a.is_telecaller)
  const canBulkTelecaller = !!user && hasTelecallers
  const showCheckboxColumn = canBulkAction || canBulkTelecaller

  // ─── Loading State ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fade-in">
          <div className="bg-card border border-border rounded-lg px-4 py-3 mb-4">
            <div className="skeleton h-9 w-full" />
          </div>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-elevated/50">
              <div className="skeleton h-4 w-full" />
            </div>
            {[1,2,3,4,5,6,7,8].map(i => (
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
            <button onClick={() => setError('')} className="text-danger hover:text-red-300 ml-4">Dismiss</button>
          </div>
        )}

        {/* Page Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-heading font-bold" style={{ color: 'var(--color-text)' }}>
              {user?.role === 'agent' ? 'My Leads' : 'All Leads'}
            </h1>
            <p className="text-caption mt-0.5" style={{ color: 'var(--color-muted)' }}>
              {displayedLeads.length} lead{displayedLeads.length !== 1 ? 's' : ''}
              {statusFilter && ` matching "${statusFilter.replace('_', ' ')}"`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const headers = ['Name', 'Phone', 'Email', 'City', 'State', 'Status', 'Priority', 'Assigned', 'Score', 'Created', 'Follow-up']
                const rows = displayedLeads.map(l => [
                  l.full_name, l.phone, l.email, l.city, l.state,
                  l.lead_status, l.lead_priority, l.assigned_to,
                  l.lead_score !== undefined ? String(l.lead_score) : '',
                  l.created_time, l.next_followup
                ])
                const csv = [headers, ...rows].map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n')
                const blob = new Blob([csv], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `tbwx-leads-${new Date().toISOString().split('T')[0]}.csv`
                a.click()
                URL.revokeObjectURL(url)
              }}
              className="bg-elevated hover:bg-border text-muted text-caption font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
              title="Download filtered leads as CSV"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={2} />
              CSV
            </button>
            <button
              onClick={() => setShowAddLead(true)}
              className="bg-accent/10 hover:bg-accent/20 text-accent text-caption font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2} />
              Add Lead
            </button>
            <Link
              href="/dashboard"
              className="text-caption font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--color-muted)', background: 'var(--color-elevated)' }}
            >
              &larr; Dashboard
            </Link>
          </div>
        </div>

        {/* ─── Quick Filter Pills ───────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {(
            [
              { key: 'all', label: 'All' },
              ...(user?.role !== 'admin' ? [{ key: 'mine', label: 'My Leads' }] : []),
              { key: 'hot', label: 'HOT' },
              { key: 'unassigned', label: 'Unassigned' },
              { key: 'due_today', label: 'Due Today' },
            ] as { key: typeof quickFilter; label: string }[]
          ).map(({ key, label }) => {
            const active = quickFilter === key
            return (
              <button
                key={key}
                onClick={() => setQuickFilter(active ? 'all' : key)}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-caption font-semibold uppercase tracking-wide transition-colors"
                style={
                  active
                    ? {
                        backgroundColor: 'color-mix(in srgb, var(--color-accent) 18%, transparent)',
                        color: 'var(--color-accent)',
                        border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
                      }
                    : { backgroundColor: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }
                }
              >
                {label}
                <span
                  className="inline-flex items-center justify-center min-w-[1.375rem] h-[1.125rem] px-1.5 rounded-full text-[12px] font-bold leading-none"
                  style={
                    active
                      ? {
                          backgroundColor: 'color-mix(in srgb, var(--color-accent) 28%, transparent)',
                          color: 'var(--color-accent)',
                        }
                      : { backgroundColor: 'var(--color-elevated)', color: 'var(--color-dim)' }
                  }
                >
                  {pillCounts[key]}
                </span>
              </button>
            )
          })}
        </div>

        {/* ─── Filter Bar ───────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dim pointer-events-none"
              strokeWidth={2}
            />
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
              <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
            ))}
            <option value="__UNASSIGNED__">Unassigned</option>
            <option value="__OVERDUE__">Overdue Follow-ups</option>
          </select>

          {/* Assigned Filter (admin only) */}
          {user?.role === 'admin' && (
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
          )}

          {/* Telecaller Filter (admin only) — see who's working what */}
          {user?.role === 'admin' && agents.some(a => a.is_telecaller) && (
            <select
              value={telecallerFilter}
              onChange={e => setTelecallerFilter(e.target.value)}
              className="bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
              title="Filter by telecaller"
            >
              <option value="">All Telecallers</option>
              <option value="__NONE__">— No telecaller —</option>
              {agents.filter(a => a.is_telecaller).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}

          {/* Created date range */}
          <div className="flex items-center gap-1.5 text-caption text-dim">
            <span className="hidden sm:inline">Created:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              max={dateTo || undefined}
              title="From date (inclusive)"
              className="bg-elevated border border-border rounded-md px-2 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50"
            />
            <span>→</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              title="To date (inclusive)"
              className="bg-elevated border border-border rounded-md px-2 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50"
            />
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
          >
            <option value="score">Sort: Lead Score</option>
            <option value="newest">Sort: Newest Created First</option>
            <option value="oldest">Sort: Oldest Created First</option>
            <option value="followup">Sort: Follow-up Date</option>
          </select>

          {/* Clear Filters */}
          {(search || statusFilter || assignedFilter || telecallerFilter || sortBy !== 'score' || dateFrom || dateTo) && (
            <button onClick={clearFilters} className="text-sm text-dim hover:text-text transition-colors">
              Clear filters
            </button>
          )}

          {/* Lead Count */}
          <span className="text-caption text-dim ml-auto">
            {displayedLeads.length} lead{displayedLeads.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ─── Mobile Card List (<md) ─────────────────────────────────── */}
        <div className="md:hidden space-y-2">
          {displayedLeads.length === 0 ? (
            <div className="bg-card border border-border rounded-lg">
              <EmptyState
                icon={<UserPlus className="w-10 h-10" strokeWidth={1.25} />}
                title={
                  search || statusFilter || assignedFilter || telecallerFilter || quickFilter !== 'all'
                    ? 'No leads match these filters'
                    : 'No leads yet'
                }
                hint={
                  search || statusFilter || assignedFilter || telecallerFilter || quickFilter !== 'all'
                    ? 'Try clearing filters or add a new lead.'
                    : 'New leads will appear here as they come in.'
                }
              />
            </div>
          ) : (
            displayedLeads.map((lead) => {
              const statusColor = STATUS_COLORS[lead.lead_status] || { bg: 'var(--color-elevated)', text: 'var(--color-muted)', border: 'var(--color-border)' }
              const followup = followupLabel(lead.next_followup)
              const isChecked = selected.has(lead.row_number)
              return (
                <div
                  key={lead.row_number}
                  onClick={() => router.push(`/leads/${lead.row_number}`)}
                  className="bg-card border rounded-lg p-3 active:bg-elevated/50 transition-colors cursor-pointer relative"
                  style={{ borderColor: statusColor.border }}
                >
                  {/* Checkbox top-right */}
                  {showCheckboxColumn && (
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(lead.row_number)}
                        className="rounded border-border accent-accent w-4 h-4"
                      />
                    </label>
                  )}

                  {/* Top row: Name + score */}
                  <div className={`flex items-start gap-2 ${showCheckboxColumn ? 'pr-9' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/leads/${lead.row_number}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-accent hover:text-accent-hover font-medium text-body block truncate"
                      >
                        {lead.full_name || 'Unknown'}
                      </Link>
                      <p className="text-caption text-dim mt-0.5 truncate">
                        <span className="font-mono">{lead.phone}</span>
                        {lead.city && <> · {lead.city}{lead.state ? `, ${lead.state}` : ''}</>}
                      </p>
                    </div>
                    {lead.lead_score !== undefined && (
                      <span
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-caption font-bold flex-shrink-0"
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
                  </div>

                  {/* Status pill row */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <Badge tone={statusTone(lead.lead_status)}>
                      {STATUS_LABELS[lead.lead_status] || lead.lead_status}
                    </Badge>
                    {lead.lead_priority && (
                      <Badge tone={priorityTone(lead.lead_priority)}>
                        {lead.lead_priority}
                      </Badge>
                    )}
                    {followup.text !== '-' && (
                      <span className={`text-caption font-medium ${followup.urgent ? 'text-danger' : 'text-muted'}`}>
                        {followup.text}
                      </span>
                    )}
                  </div>

                  {/* Last discussion preview */}
                  {lead.last_discussion && (() => {
                    const ld = lead.last_discussion
                    const icon = ld.source === 'note' ? '📝'
                      : ld.source === 'call' ? '📞'
                      : ld.source === 'message_in' ? '💬←'
                      : '💬→'
                    const snippet = ld.text.length > 90 ? ld.text.slice(0, 87) + '…' : ld.text
                    return (
                      <p className="text-caption text-dim mt-2 italic line-clamp-2">
                        <span className="not-italic mr-1">{icon}</span>
                        {snippet}
                      </p>
                    )
                  })()}

                  {/* Assigned + telecaller footer */}
                  <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/40">
                    <span className="text-eyebrow text-dim truncate flex items-center gap-1.5 flex-wrap">
                      {lead.assigned_to ? (
                        <span>Assigned: <span className="text-muted">{lead.assigned_to}</span></span>
                      ) : (
                        <span className="text-accent/50 italic">Unassigned</span>
                      )}
                      {lead.is_delegated_to_me && (
                        <Badge tone="active">Supporting</Badge>
                      )}
                      {lead.telecaller_name && (
                        <Badge tone="hot">📞 {lead.telecaller_name}</Badge>
                      )}
                    </span>
                    {lead.phone && (
                      <Link
                        href={`/inbox?phone=${lead.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-eyebrow text-dim hover:text-green-400 transition-colors px-2 py-1 rounded hover:bg-green-400/10 flex-shrink-0"
                        title="Open in Inbox"
                      >
                        <MessageSquare className="w-3 h-3" strokeWidth={1.5} />
                        Inbox
                      </Link>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ─── Lead Table (≥md) ───────────────────────────────────────── */}
        <div className="hidden md:block bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated/50">
                  {showCheckboxColumn && (
                    <th className="px-3 py-3 text-left w-10">
                      <input
                        type="checkbox"
                        checked={displayedLeads.length > 0 && selected.size === displayedLeads.length}
                        onChange={toggleSelectAll}
                        className="rounded border-border accent-accent"
                      />
                    </th>
                  )}
                  <th className="px-3 py-3 text-center text-eyebrow font-semibold text-dim uppercase tracking-wider w-10">#</th>
                  <th className="px-3 py-3 text-center text-eyebrow font-semibold text-dim uppercase tracking-wider w-14">Score</th>
                  <th className="px-3 py-3 text-left text-eyebrow font-semibold text-dim uppercase tracking-wider">Name</th>
                  <th className="px-3 py-3 text-left text-eyebrow font-semibold text-dim uppercase tracking-wider">Phone</th>
                  <th className="px-3 py-3 text-left text-eyebrow font-semibold text-dim uppercase tracking-wider">City</th>
                  <th className="px-3 py-3 text-left text-eyebrow font-semibold text-dim uppercase tracking-wider">Status</th>
                  <th className="px-3 py-3 text-left text-eyebrow font-semibold text-dim uppercase tracking-wider">Priority</th>
                  <th className="px-3 py-3 text-left text-eyebrow font-semibold text-dim uppercase tracking-wider">Assigned</th>
                  {user?.role === 'admin' && (
                    <th className="px-3 py-3 text-left text-eyebrow font-semibold text-dim uppercase tracking-wider">Telecaller</th>
                  )}
                  <th className="px-3 py-3 text-left text-eyebrow font-semibold text-dim uppercase tracking-wider">Follow-up</th>
                  <th
                    className="px-3 py-3 text-left text-eyebrow font-semibold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-accent"
                    style={{ color: sortBy === 'newest' || sortBy === 'oldest' ? 'var(--color-accent)' : 'var(--color-dim)' }}
                    onClick={() => setSortBy(sortBy === 'newest' ? 'oldest' : sortBy === 'oldest' ? 'score' : 'newest')}
                    title="Click to sort by create date"
                  >
                    Created {sortBy === 'newest' ? '↓' : sortBy === 'oldest' ? '↑' : ''}
                  </th>
                  <th className="px-3 py-3 text-center text-eyebrow font-semibold text-dim uppercase tracking-wider w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayedLeads.length === 0 ? (
                  <tr>
                    <td
                      colSpan={(showCheckboxColumn ? 12 : 11) + (user?.role === 'admin' ? 1 : 0)}
                      className="px-3"
                    >
                      <EmptyState
                        icon={<UserPlus className="w-10 h-10" strokeWidth={1.25} />}
                        title={
                          search || statusFilter || assignedFilter || telecallerFilter || quickFilter !== 'all'
                            ? 'No leads match these filters'
                            : 'No leads yet'
                        }
                        hint={
                          search || statusFilter || assignedFilter || telecallerFilter || quickFilter !== 'all'
                            ? 'Try clearing filters or add a new lead.'
                            : 'New leads will appear here as they come in.'
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  displayedLeads.map((lead, idx) => {
                    const statusColor = STATUS_COLORS[lead.lead_status] || { bg: 'var(--color-elevated)', text: 'var(--color-muted)', border: 'var(--color-border)' }
                    const priorityColor = PRIORITY_COLORS[lead.lead_priority] || { bg: 'var(--color-elevated)', text: 'var(--color-muted)', border: 'var(--color-border)' }
                    const followup = followupLabel(lead.next_followup)
                    return (
                      <React.Fragment key={lead.row_number}>
                      <tr className="lead-row table-row-hover">
                        {showCheckboxColumn && (
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
                        <td className="px-3 py-2.5 text-center text-caption text-dim font-mono">{idx + 1}</td>

                        {/* Lead Score */}
                        <td className="px-3 py-2.5 text-center">
                          {lead.lead_score !== undefined && (
                            <span
                              className="inline-flex items-center justify-center w-8 h-8 rounded-full text-caption font-bold"
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

                        {/* Name */}
                        <td className="px-3 py-2.5">
                          <Link
                            href={`/leads/${lead.row_number}`}
                            className="text-accent hover:text-accent-hover font-medium transition-colors"
                          >
                            {lead.full_name || 'Unknown'}
                          </Link>
                          {lead.last_discussion && (() => {
                            const ld = lead.last_discussion
                            const icon = ld.source === 'note' ? '📝'
                              : ld.source === 'call' ? '📞'
                              : ld.source === 'message_in' ? '💬←'
                              : '💬→'
                            const ms = Date.now() - new Date(ld.at.replace(' ', 'T') + (ld.at.includes('Z') ? '' : 'Z')).getTime()
                            const m = Math.max(0, Math.floor(ms / 60000))
                            const ago = m < 60 ? `${m || 0}m` : m < 1440 ? `${Math.floor(m/60)}h` : `${Math.floor(m/1440)}d`
                            const snippet = ld.text.length > 70 ? ld.text.slice(0, 67) + '…' : ld.text
                            const tooltip = `${ld.source.replace('_', ' ')} · ${ld.by || 'system'} · ${ld.at}\n\n${ld.text}`
                            return (
                              <p className="text-caption text-dim mt-0.5 italic truncate max-w-[28ch] sm:max-w-[42ch]" title={tooltip}>
                                <span className="not-italic mr-1">{icon}</span>
                                {snippet}
                                <span className="not-italic text-eyebrow ml-1 opacity-70">— {ld.by || 'system'}, {ago}</span>
                              </p>
                            )
                          })()}
                        </td>

                        {/* Phone */}
                        <td className="px-3 py-2.5 text-body font-mono">{lead.phone}</td>

                        {/* City */}
                        <td className="px-3 py-2.5 text-body">
                          {lead.city}
                          {lead.state ? `, ${lead.state}` : ''}
                        </td>

                        {/* Status Dropdown */}
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
                                {STATUS_LABELS[s] || s}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Priority Dropdown */}
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

                        {/* Assigned */}
                        <td className="px-3 py-2.5 text-body">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{lead.assigned_to || <span className="text-accent/50 italic">Unassigned</span>}</span>
                            {lead.is_delegated_to_me && (
                              <Badge tone="active">Supporting</Badge>
                            )}
                          </div>
                        </td>

                        {/* Telecaller (admin only) */}
                        {user?.role === 'admin' && (
                          <td className="px-3 py-2.5 text-body">
                            {lead.telecaller_name ? (
                              <Badge tone="hot" className="!normal-case !tracking-normal">
                                📞 {lead.telecaller_name}
                              </Badge>
                            ) : (
                              <span className="text-dim text-caption">—</span>
                            )}
                          </td>
                        )}

                        {/* Follow-up */}
                        <td className="px-3 py-2.5">
                          {followup.text !== '-' ? (
                            <span className={`text-caption font-medium ${followup.urgent ? 'text-danger' : 'text-muted'}`}>
                              {followup.text}
                            </span>
                          ) : (
                            <span className="text-caption text-dim">-</span>
                          )}
                        </td>

                        {/* Added */}
                        <td className="px-3 py-2.5 text-dim text-caption">{timeAgo(lead.created_time)}</td>

                        {/* Actions */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            {/* Quick note button */}
                            <button
                              onClick={() => {
                                if (quickNotePhone === lead.phone) {
                                  setQuickNotePhone(null)
                                  setQuickNoteText('')
                                } else {
                                  setQuickNotePhone(lead.phone)
                                  setQuickNoteText('')
                                }
                              }}
                              className={`inline-flex items-center text-xs px-1.5 py-1 rounded transition-colors ${
                                quickNotePhone === lead.phone
                                  ? 'text-accent bg-accent/10'
                                  : 'text-dim hover:text-accent hover:bg-accent/10'
                              }`}
                              title="Quick note"
                            >
                              <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                            <Link
                              href={`/leads/${lead.row_number}`}
                              className="inline-flex items-center gap-1 text-caption text-dim hover:text-accent transition-colors px-1.5 py-1 rounded hover:bg-accent/10"
                              title="View details"
                            >
                              <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </Link>
                            {lead.phone && (
                              <Link
                                href={`/inbox?phone=${lead.phone}`}
                                className="inline-flex items-center gap-1 text-caption text-dim hover:text-green-400 transition-colors px-1.5 py-1 rounded hover:bg-green-400/10"
                                title="Open in Inbox"
                              >
                                <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.5} />
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Inline quick note input */}
                      {quickNotePhone === lead.phone && (
                        <tr className="bg-accent/5">
                          <td colSpan={(showCheckboxColumn ? 12 : 11) + (user?.role === 'admin' ? 1 : 0)} className="px-3 py-2">
                            <div className="flex items-center gap-2 max-w-2xl">
                              <span className="text-xs text-muted flex-shrink-0">Note for {lead.full_name}:</span>
                              <input
                                type="text"
                                value={quickNoteText}
                                onChange={e => setQuickNoteText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleQuickNote(lead.phone); if (e.key === 'Escape') { setQuickNotePhone(null); setQuickNoteText('') } }}
                                placeholder="Type a note and press Enter..."
                                autoFocus
                                className="flex-1 bg-elevated border border-border rounded-md px-3 py-1.5 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50"
                              />
                              <button
                                onClick={() => handleQuickNote(lead.phone)}
                                disabled={savingNote || !quickNoteText.trim()}
                                className="text-xs bg-accent/20 hover:bg-accent/30 text-accent px-3 py-1.5 rounded-md transition-colors font-medium disabled:opacity-50"
                              >
                                {savingNote ? '...' : 'Save'}
                              </button>
                              <button
                                onClick={() => { setQuickNotePhone(null); setQuickNoteText('') }}
                                className="text-xs text-dim hover:text-text px-2 py-1.5 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ─── Floating Bulk Action Bar ─────────────────────────────────── */}
      {selected.size > 0 && (canBulkAction || canBulkTelecaller) && (
        <div className="fixed bottom-0 left-0 right-0 z-50 safe-bottom">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
            <div className="bg-elevated border border-border rounded-lg shadow-2xl shadow-black/50 px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-sm text-text">
                <span className="font-semibold text-accent">{selected.size}</span>{' '}
                lead{selected.size !== 1 ? 's' : ''} selected
                {!canBulkAction && (
                  <span className="text-caption text-dim ml-2">(your leads only)</span>
                )}
              </span>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Bulk Assign — admin only */}
                {user?.role === 'admin' && (
                  <>
                    <select
                      value={assignTo}
                      onChange={e => setAssignTo(e.target.value)}
                      className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50"
                    >
                      <option value="">Assign to...</option>
                      {agents.map(a => (
                        <option key={a.id} value={a.name}>{a.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={bulkAssign}
                      disabled={!assignTo || assigning}
                      className="bg-accent hover:bg-accent-hover disabled:bg-accent/30 disabled:cursor-not-allowed text-[#1a1209] text-sm font-semibold px-4 py-1.5 rounded-md transition-colors"
                    >
                      {assigning ? 'Working...' : 'Assign'}
                    </button>
                    <div className="w-px h-6 bg-border mx-1" />
                  </>
                )}

                {/* Bulk Telecaller Assign */}
                {agents.some(a => a.is_telecaller) && (
                  <>
                    <select
                      value={tcAssignToId}
                      onChange={e => setTcAssignToId(e.target.value)}
                      className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50"
                    >
                      <option value="">Telecaller...</option>
                      {agents.filter(a => a.is_telecaller).map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={bulkAssignTelecaller}
                      disabled={!tcAssignToId || tcAssigning}
                      className="bg-accent hover:bg-accent-hover disabled:bg-accent/30 disabled:cursor-not-allowed text-[#1a1209] text-sm font-semibold px-4 py-1.5 rounded-md transition-colors"
                    >
                      {tcAssigning ? 'Working...' : 'Telecall'}
                    </button>
                    <div className="w-px h-6 bg-border mx-1" />
                  </>
                )}

                {/* Bulk Status */}
                <select
                  value={bulkStatus}
                  onChange={e => setBulkStatus(e.target.value)}
                  className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50"
                >
                  <option value="">Change status...</option>
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
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
                  onClick={() => setSelected(new Set())}
                  className="text-sm text-dim hover:text-text transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Lead Modal */}
      {showAddLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => { setShowAddLead(false); setAddLeadTouched({}) }}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-heading font-semibold text-text">Add New Lead</h2>
              <button onClick={() => { setShowAddLead(false); setAddLeadTouched({}) }} className="text-dim hover:text-text transition-colors">
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {(() => {
                const nameInvalid = addLeadTouched.full_name && !addLeadForm.full_name.trim()
                const phoneDigits = addLeadForm.phone.replace(/\D/g, '')
                const phoneInvalid = addLeadTouched.phone && (addLeadForm.phone.trim() === '' || phoneDigits.length < 10)
                const phoneBadFormat = addLeadTouched.phone && addLeadForm.phone.trim() !== '' && phoneDigits.length < 10
                return (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label htmlFor="add-lead-name" className="text-caption text-dim block mb-1">Full Name <span className="text-danger">*</span></label>
                  <input
                    id="add-lead-name"
                    type="text"
                    value={addLeadForm.full_name}
                    onChange={e => setAddLeadForm(f => ({ ...f, full_name: e.target.value }))}
                    onBlur={() => setAddLeadTouched(t => ({ ...t, full_name: true }))}
                    placeholder="John Doe"
                    aria-required="true"
                    aria-invalid={nameInvalid}
                    aria-describedby={nameInvalid ? 'add-lead-name-err' : undefined}
                    className={`w-full bg-elevated border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50 ${nameInvalid ? 'border-danger' : 'border-border'}`}
                    autoFocus
                  />
                  {nameInvalid && (
                    <p id="add-lead-name-err" className="text-danger text-caption mt-1">Full name is required</p>
                  )}
                </div>
                <div>
                  <label htmlFor="add-lead-phone" className="text-caption text-dim block mb-1">Phone <span className="text-danger">*</span></label>
                  <input
                    id="add-lead-phone"
                    type="tel"
                    value={addLeadForm.phone}
                    onChange={e => setAddLeadForm(f => ({ ...f, phone: e.target.value }))}
                    onBlur={() => setAddLeadTouched(t => ({ ...t, phone: true }))}
                    placeholder="9876543210"
                    aria-required="true"
                    aria-invalid={phoneInvalid}
                    aria-describedby={phoneInvalid ? 'add-lead-phone-err' : undefined}
                    className={`w-full bg-elevated border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50 ${phoneInvalid ? 'border-danger' : 'border-border'}`}
                  />
                  {phoneInvalid && (
                    <p id="add-lead-phone-err" className="text-danger text-caption mt-1">
                      {phoneBadFormat ? 'Enter a valid 10-digit phone' : 'Phone is required'}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-caption text-dim block mb-1">Email</label>
                  <input type="email" value={addLeadForm.email} onChange={e => setAddLeadForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50" />
                </div>
                <div>
                  <label className="text-caption text-dim block mb-1">City</label>
                  <input type="text" value={addLeadForm.city} onChange={e => setAddLeadForm(f => ({ ...f, city: e.target.value }))} placeholder="Mumbai" className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50" />
                </div>
                <div>
                  <label className="text-caption text-dim block mb-1">State</label>
                  <input type="text" value={addLeadForm.state} onChange={e => setAddLeadForm(f => ({ ...f, state: e.target.value }))} placeholder="Maharashtra" className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50" />
                </div>
                <div>
                  <label className="text-caption text-dim block mb-1">Interest</label>
                  <input type="text" value={addLeadForm.model_interest} onChange={e => setAddLeadForm(f => ({ ...f, model_interest: e.target.value }))} placeholder="Kiosk / Shop" className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50" />
                </div>
                <div>
                  <label className="text-caption text-dim block mb-1">Priority</label>
                  <select value={addLeadForm.lead_priority} onChange={e => setAddLeadForm(f => ({ ...f, lead_priority: e.target.value }))} className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50">
                    <option value="HOT">HOT</option>
                    <option value="WARM">WARM</option>
                    <option value="COLD">COLD</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-caption text-dim block mb-1">Source</label>
                  <input type="text" value={addLeadForm.source} onChange={e => setAddLeadForm(f => ({ ...f, source: e.target.value }))} placeholder="Referral / Walk-in / Phone Call" className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50" />
                </div>
                <div className="col-span-2">
                  <label className="text-caption text-dim block mb-1">Notes</label>
                  <textarea value={addLeadForm.notes} onChange={e => setAddLeadForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes about this lead..." rows={2} className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50 resize-none" />
                </div>
              </div>
                )
              })()}
            </div>
            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
              <button onClick={() => { setShowAddLead(false); setAddLeadTouched({}) }} className="px-4 py-2 text-body text-muted hover:text-text transition-colors">Cancel</button>
              <button
                onClick={handleAddLead}
                disabled={addLeadSaving || !addLeadForm.full_name.trim() || !addLeadForm.phone.trim() || addLeadForm.phone.replace(/\D/g, '').length < 10}
                className="bg-accent hover:bg-accent-hover text-[#1a1209] px-5 py-2 rounded-lg text-body font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {addLeadSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[#1a1209] border-t-transparent rounded-full animate-spin" />
                    Adding...
                  </>
                ) : 'Add Lead'}
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
