'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { STATUS_LABELS, STATUS_MIGRATION } from '@/config/client'
import Toast from '@/components/Toast'
import { timeAgo, followupLabel } from '@/lib/format'
import { scoreColor, scoreBg, scoreBorder } from '@/lib/score-colors'

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

const STATUS_OPTIONS = ['NEW', 'DECK_SENT', 'REPLIED', 'NO_RESPONSE', 'CALL_DONE_INTERESTED', 'HOT', 'FINAL_NEGOTIATION', 'CONVERTED', 'DELAYED', 'LOST']
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
  const [sortBy, setSortBy] = useState(() => getInitialParam('sort', 'score'))

  // Sync filters to URL (without full page reload)
  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (statusFilter) params.set('status', statusFilter)
    if (assignedFilter) params.set('assigned', assignedFilter)
    if (sortBy && sortBy !== 'score') params.set('sort', sortBy)
    const qs = params.toString()
    const newUrl = qs ? `/leads?${qs}` : '/leads'
    window.history.replaceState(null, '', newUrl)
  }, [search, statusFilter, assignedFilter, sortBy])

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
        setLeads(filtered)
      } else {
        setError(data.error || 'Failed to load leads')
      }
    } catch {
      setError('Failed to load leads')
    }
  }, [search, statusFilter, assignedFilter, sortBy])

  const fetchAgents = useCallback(async (currentUser: SessionUser) => {
    if (currentUser.role === 'admin') {
      try {
        const res = await fetch('/api/users')
        const data = await res.json()
        if (data.success) setAgents(data.data.filter((u: { active: boolean }) => u.active))
      } catch { /* non-critical */ }
    }
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
  }, [search, statusFilter, assignedFilter, sortBy, fetchLeads, user])

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
    setSortBy('score')
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
    if (selected.size === leads.length) setSelected(new Set())
    else setSelected(new Set(leads.map(l => l.row_number)))
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

  const assignedNames = [...new Set(leads.map(l => l.assigned_to).filter(Boolean))]
  const canBulkAction = user?.role === 'admin' || user?.can_assign

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
            <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
              {user?.role === 'agent' ? 'My Leads' : 'All Leads'}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              {leads.length} lead{leads.length !== 1 ? 's' : ''}
              {statusFilter && ` matching "${statusFilter.replace('_', ' ')}"`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const headers = ['Name', 'Phone', 'Email', 'City', 'State', 'Status', 'Priority', 'Assigned', 'Score', 'Created', 'Follow-up']
                const rows = leads.map(l => [
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
              className="bg-elevated hover:bg-border text-muted text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
              title="Download filtered leads as CSV"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              CSV
            </button>
            <button
              onClick={() => setShowAddLead(true)}
              className="bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Lead
            </button>
            <Link
              href="/dashboard"
              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--color-muted)', background: 'var(--color-elevated)' }}
            >
              &larr; Dashboard
            </Link>
          </div>
        </div>

        {/* ─── Filter Bar ───────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dim"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
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
            <button onClick={clearFilters} className="text-sm text-dim hover:text-text transition-colors">
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
                  {canBulkAction && (
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
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Assigned</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Follow-up</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-dim uppercase tracking-wider">Added</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-dim uppercase tracking-wider w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canBulkAction ? 12 : 11}
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
                    const statusColor = STATUS_COLORS[lead.lead_status] || { bg: 'var(--color-elevated)', text: 'var(--color-muted)', border: 'var(--color-border)' }
                    const priorityColor = PRIORITY_COLORS[lead.lead_priority] || { bg: 'var(--color-elevated)', text: 'var(--color-muted)', border: 'var(--color-border)' }
                    const followup = followupLabel(lead.next_followup)
                    return (
                      <React.Fragment key={lead.row_number}>
                      <tr className="lead-row table-row-hover">
                        {canBulkAction && (
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

                        {/* Name */}
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

                        {/* Added */}
                        <td className="px-3 py-2.5 text-dim text-xs">{timeAgo(lead.created_time)}</td>

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
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                              </svg>
                            </button>
                            <Link
                              href={`/leads/${lead.row_number}`}
                              className="inline-flex items-center gap-1 text-xs text-dim hover:text-accent transition-colors px-1.5 py-1 rounded hover:bg-accent/10"
                              title="View details"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                            </Link>
                            {lead.phone && (
                              <Link
                                href={`/inbox?phone=${lead.phone}`}
                                className="inline-flex items-center gap-1 text-xs text-dim hover:text-green-400 transition-colors px-1.5 py-1 rounded hover:bg-green-400/10"
                                title="Open in Inbox"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                </svg>
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Inline quick note input */}
                      {quickNotePhone === lead.phone && (
                        <tr className="bg-accent/5">
                          <td colSpan={canBulkAction ? 12 : 11} className="px-3 py-2">
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
      {selected.size > 0 && canBulkAction && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
            <div className="bg-elevated border border-border rounded-lg shadow-2xl shadow-black/50 px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-sm text-text">
                <span className="font-semibold text-accent">{selected.size}</span>{' '}
                lead{selected.size !== 1 ? 's' : ''} selected
              </span>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Bulk Assign */}
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
                  <input type="text" value={addLeadForm.full_name} onChange={e => setAddLeadForm(f => ({ ...f, full_name: e.target.value }))} placeholder="John Doe" className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50" autoFocus />
                </div>
                <div>
                  <label className="text-xs text-dim block mb-1">Phone <span className="text-danger">*</span></label>
                  <input type="tel" value={addLeadForm.phone} onChange={e => setAddLeadForm(f => ({ ...f, phone: e.target.value }))} placeholder="9876543210" className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50" />
                </div>
                <div>
                  <label className="text-xs text-dim block mb-1">Email</label>
                  <input type="email" value={addLeadForm.email} onChange={e => setAddLeadForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50" />
                </div>
                <div>
                  <label className="text-xs text-dim block mb-1">City</label>
                  <input type="text" value={addLeadForm.city} onChange={e => setAddLeadForm(f => ({ ...f, city: e.target.value }))} placeholder="Mumbai" className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50" />
                </div>
                <div>
                  <label className="text-xs text-dim block mb-1">State</label>
                  <input type="text" value={addLeadForm.state} onChange={e => setAddLeadForm(f => ({ ...f, state: e.target.value }))} placeholder="Maharashtra" className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50" />
                </div>
                <div>
                  <label className="text-xs text-dim block mb-1">Interest</label>
                  <input type="text" value={addLeadForm.model_interest} onChange={e => setAddLeadForm(f => ({ ...f, model_interest: e.target.value }))} placeholder="Kiosk / Shop" className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50" />
                </div>
                <div>
                  <label className="text-xs text-dim block mb-1">Priority</label>
                  <select value={addLeadForm.lead_priority} onChange={e => setAddLeadForm(f => ({ ...f, lead_priority: e.target.value }))} className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50">
                    <option value="HOT">HOT</option>
                    <option value="WARM">WARM</option>
                    <option value="COLD">COLD</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-dim block mb-1">Source</label>
                  <input type="text" value={addLeadForm.source} onChange={e => setAddLeadForm(f => ({ ...f, source: e.target.value }))} placeholder="Referral / Walk-in / Phone Call" className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-dim block mb-1">Notes</label>
                  <textarea value={addLeadForm.notes} onChange={e => setAddLeadForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes about this lead..." rows={2} className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50 resize-none" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
              <button onClick={() => setShowAddLead(false)} className="px-4 py-2 text-sm text-muted hover:text-text transition-colors">Cancel</button>
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
