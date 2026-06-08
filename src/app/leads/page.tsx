'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Search, UserPlus, Download, Eye, MessageSquare, Pencil, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { STATUS_LABELS, LEAD_STATUSES } from '@/config/client'
import { toast } from 'sonner'
import Badge, { statusTone, priorityTone } from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { timeAgo, followupLabel, istToday } from '@/lib/format'
import { scoreColor, scoreBg, scoreBorder } from '@/lib/score-colors'
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import StatusEditPopover from './_components/StatusEditPopover'

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

const PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  HOT:  makeStatusVars('var(--color-priority-hot)'),
  WARM: makeStatusVars('var(--color-priority-warm)'),
  COLD: makeStatusVars('var(--color-priority-cold)'),
}

const STATUS_OPTIONS: readonly string[] = LEAD_STATUSES
const PRIORITY_OPTIONS = ['HOT', 'WARM', 'COLD'] as const

// ─── Add Lead Schema ─────────────────────────────────────────────────────────

const addLeadSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  phone: z
    .string()
    .min(1, 'Phone is required')
    .regex(/^\d{10,15}$/, 'Enter a valid phone (10–15 digits, numbers only)'),
  email: z
    .string()
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, 'Enter a valid email'),
  city: z.string().optional(),
  state: z.string().optional(),
  model_interest: z.string().optional(),
  notes: z.string().optional(),
  lead_priority: z.enum(['HOT', 'WARM', 'COLD']),
  source: z.string().optional(),
})

type AddLeadValues = z.infer<typeof addLeadSchema>

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

  // Quick notes
  const [quickNotePhone, setQuickNotePhone] = useState<string | null>(null)
  const [quickNoteText, setQuickNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const handleQuickNote = useCallback(async (phone: string) => {
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
        toast.success('Note added')
        setQuickNotePhone(null)
        setQuickNoteText('')
      }
    } catch { /* silent */ }
    setSavingNote(false)
  }, [quickNoteText])

  // Filters — initialize from URL params to preserve state on back navigation
  const [search, setSearch] = useState(() => getInitialParam('q'))
  const [statusFilter, setStatusFilter] = useState(() => getInitialParam('status'))
  const [assignedFilter, setAssignedFilter] = useState(() => getInitialParam('assigned'))
  // Telecaller filter — '' = all, '__NONE__' = no telecaller assigned, else telecaller user_id
  const [telecallerFilter, setTelecallerFilter] = useState(() => getInitialParam('tc'))
  const [sortByQuery, setSortByQuery] = useState(() => getInitialParam('sort', 'score'))
  const [dateFrom, setDateFrom] = useState(() => getInitialParam('from'))
  const [dateTo, setDateTo] = useState(() => getInitialParam('to'))

  // Sync filters to URL (without full page reload)
  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (statusFilter) params.set('status', statusFilter)
    if (assignedFilter) params.set('assigned', assignedFilter)
    if (telecallerFilter) params.set('tc', telecallerFilter)
    if (sortByQuery && sortByQuery !== 'score') params.set('sort', sortByQuery)
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo) params.set('to', dateTo)
    const qs = params.toString()
    const newUrl = qs ? `/leads?${qs}` : '/leads'
    window.history.replaceState(null, '', newUrl)
  }, [search, statusFilter, assignedFilter, telecallerFilter, sortByQuery, dateFrom, dateTo])

  // Bulk action state
  const [assignTo, setAssignTo] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [bulkStatus, setBulkStatus] = useState('')
  const [tcAssignToId, setTcAssignToId] = useState('')
  const [tcAssigning, setTcAssigning] = useState(false)
  const [agents, setAgents] = useState<{ id: string; name: string; active: boolean; is_telecaller?: boolean }[]>([])

  // Add Lead modal state
  const [showAddLead, setShowAddLead] = useState(false)
  const [addLeadSaving, setAddLeadSaving] = useState(false)

  const addLeadForm = useForm<AddLeadValues>({
    resolver: zodResolver(addLeadSchema),
    defaultValues: {
      full_name: '',
      phone: '',
      email: '',
      city: '',
      state: '',
      model_interest: '',
      notes: '',
      lead_priority: 'WARM',
      source: '',
    },
    mode: 'onBlur',
  })

  // Quick filter pills
  const [quickFilter, setQuickFilter] = useState<'all' | 'mine' | 'hot' | 'unassigned' | 'due_today'>('all')

  // TanStack table state
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

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
      if (sortByQuery && sortByQuery !== 'score') params.set('sort', sortByQuery)

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
  }, [search, statusFilter, assignedFilter, telecallerFilter, sortByQuery, dateFrom, dateTo])

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      if (data.success) setAgents(data.data.filter((u: { active: boolean }) => u.active))
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      // Fire auth + leads + agents in PARALLEL. fetchLeads/fetchAgents don't depend
      // on the user object (the API does its own session check), so gating them on
      // fetchUser() was a wasted sequential round-trip before any data could paint.
      await Promise.all([fetchUser(), fetchLeads(), fetchAgents()])
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!user) return
    fetchLeads()
  }, [search, statusFilter, assignedFilter, telecallerFilter, sortByQuery, dateFrom, dateTo, fetchLeads, user])

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
    setSortByQuery('score')
    setDateFrom('')
    setDateTo('')
  }

  // Optimistic status update used by the StatusEditPopover. The popover handles
  // the PATCH + toast + rollback itself; we just patch local state here.
  const applyLocalStatus = useCallback((rowNum: number, value: string) => {
    setLeads(prev => prev.map(l => (l.row_number === rowNum ? { ...l, lead_status: value } : l)))
  }, [])

  // Priority dropdown still uses inline select → fire-and-update.
  const updateLeadPriority = useCallback(async (rowNum: number, value: string) => {
    let previous: string | undefined
    setLeads(prev => prev.map(l => {
      if (l.row_number === rowNum) {
        previous = l.lead_priority
        return { ...l, lead_priority: value }
      }
      return l
    }))
    try {
      const res = await fetch(`/api/leads/${rowNum}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_priority: value }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Priority updated to ${value}`)
      } else {
        setLeads(prev => prev.map(l => (l.row_number === rowNum ? { ...l, lead_priority: previous || '' } : l)))
        toast.error(data.error || 'Update failed')
      }
    } catch {
      setLeads(prev => prev.map(l => (l.row_number === rowNum ? { ...l, lead_priority: previous || '' } : l)))
      toast.error('Update failed')
    }
  }, [])

  async function bulkStatusChange(selectedRows: number[]) {
    if (!bulkStatus || selectedRows.length === 0) return
    setAssigning(true)
    try {
      await Promise.all(selectedRows.map(id =>
        fetch(`/api/leads/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_status: bulkStatus }),
        })
      ))
      setLeads(prev => prev.map(l =>
        selectedRows.includes(l.row_number) ? { ...l, lead_status: bulkStatus } : l
      ))
      toast.success(`${selectedRows.length} leads updated to ${bulkStatus.replace('_', ' ')}`)
      setRowSelection({})
      setBulkStatus('')
    } catch {
      setError('Bulk status update failed')
    }
    setAssigning(false)
  }

  async function bulkAssign(selectedRows: number[]) {
    if (!assignTo || selectedRows.length === 0) return
    setAssigning(true)
    try {
      const res = await fetch('/api/leads/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: selectedRows, assigned_to: assignTo }),
      })
      const data = await res.json()
      if (data.success) {
        setRowSelection({})
        setAssignTo('')
        toast.success(`${selectedRows.length} leads assigned to ${assignTo}`)
        fetchLeads()
      } else {
        setError(data.error || 'Assignment failed')
      }
    } catch {
      setError('Assignment failed')
    }
    setAssigning(false)
  }

  async function bulkAssignTelecaller(selectedRows: number[]) {
    if (!tcAssignToId || selectedRows.length === 0) return
    setTcAssigning(true)
    try {
      const res = await fetch('/api/leads/telecaller-bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_rows: selectedRows, telecaller_user_id: tcAssignToId }),
      })
      const data = await res.json()
      if (data.success) {
        setRowSelection({})
        setTcAssignToId('')
        const tcName = agents.find(a => a.id === tcAssignToId)?.name || 'telecaller'
        toast.success(`${data.data?.processed ?? selectedRows.length} leads assigned to ${tcName}${data.data?.skipped ? ` (${data.data.skipped} skipped — not your leads)` : ''}`)
        fetchLeads()
      } else {
        setError(data.error || 'Telecaller assignment failed')
      }
    } catch {
      setError('Telecaller assignment failed')
    }
    setTcAssigning(false)
  }

  async function onAddLeadSubmit(values: AddLeadValues) {
    setAddLeadSaving(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (data.success) {
        setShowAddLead(false)
        addLeadForm.reset()
        toast.success('Lead added successfully')
        fetchLeads()
      } else {
        toast.error(data.error || 'Failed to add lead')
      }
    } catch {
      toast.error('Failed to add lead')
    }
    setAddLeadSaving(false)
  }

  // Quick filter pill counts — always computed from the full fetched leads list.
  // Memoized so typing in the search box (which updates other state) doesn't
  // force 5 fresh O(n) filter passes per keystroke.
  const today = useMemo(() => istToday(), [])
  const pillCounts = useMemo(() => {
    let mine = 0
    let hot = 0
    let unassigned = 0
    let dueToday = 0
    const userName = user?.name
    for (const l of leads) {
      if (l.assigned_to === userName) mine++
      if (l.lead_priority === 'HOT') hot++
      if (!l.assigned_to) unassigned++
      if (l.next_followup?.startsWith(today)) dueToday++
    }
    return {
      all: leads.length,
      mine,
      hot,
      unassigned,
      due_today: dueToday,
    }
  }, [leads, user?.name, today])

  // Apply quick filter on top of the already-fetched leads
  const displayedLeads = useMemo(() => {
    if (quickFilter === 'all') return leads
    if (quickFilter === 'mine') return leads.filter(l => l.assigned_to === user?.name)
    if (quickFilter === 'hot') return leads.filter(l => l.lead_priority === 'HOT')
    if (quickFilter === 'unassigned') return leads.filter(l => !l.assigned_to)
    return leads.filter(l => l.next_followup?.startsWith(today))
  }, [leads, quickFilter, user?.name, today])

  // Mirror the latest displayedLeads into a ref so handleExportCsv stays
  // stable but still exports the currently-visible set.
  const displayedLeadsRef = useRef(displayedLeads)
  useEffect(() => {
    displayedLeadsRef.current = displayedLeads
  }, [displayedLeads])

  // CSV export — stabilized so the header button doesn't churn on every render.
  const handleExportCsv = useCallback(() => {
    const headers = ['Name', 'Phone', 'Email', 'City', 'State', 'Status', 'Priority', 'Assigned', 'Score', 'Created', 'Follow-up']
    const rows = displayedLeadsRef.current.map(l => [
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
  }, [])

  const assignedNames = useMemo(
    () => [...new Set(leads.map(l => l.assigned_to).filter(Boolean))],
    [leads]
  )
  const hasTelecallers = useMemo(() => agents.some(a => a.is_telecaller), [agents])
  const telecallerAgents = useMemo(
    () => agents.filter(a => a.is_telecaller),
    [agents]
  )
  const canBulkAction = user?.role === 'admin' || user?.can_assign
  const canBulkTelecaller = !!user && hasTelecallers
  const showCheckboxColumn = !!(canBulkAction || canBulkTelecaller)
  const isAdmin = user?.role === 'admin'

  // ─── TanStack columns ────────────────────────────────────────────────────

  const columns = useMemo<ColumnDef<Lead>[]>(() => {
    const cols: ColumnDef<Lead>[] = []

    if (showCheckboxColumn) {
      cols.push({
        id: 'select',
        enableSorting: false,
        size: 36,
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllRowsSelected() || table.getIsSomeRowsSelected()}
            onCheckedChange={(checked) => table.toggleAllRowsSelected(!!checked)}
            aria-label="Select all"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(!!checked)}
            aria-label="Select row"
            onClick={(e) => e.stopPropagation()}
          />
        ),
      })
    }

    cols.push({
      id: 'index',
      enableSorting: false,
      header: () => <span className="text-eyebrow uppercase tracking-wider">#</span>,
      cell: ({ row, table }) => {
        const idx = table.getSortedRowModel().rows.findIndex(r => r.id === row.id)
        return <span className="text-caption text-dim font-mono">{idx + 1}</span>
      },
      size: 40,
    })

    cols.push({
      id: 'lead_score',
      accessorKey: 'lead_score',
      header: () => <span className="text-eyebrow uppercase tracking-wider">Score</span>,
      cell: ({ row }) => {
        const score = row.original.lead_score
        if (score === undefined) return null
        return (
          <span
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-caption font-bold"
            style={{
              backgroundColor: scoreBg(score),
              color: scoreColor(score),
              border: `1px solid ${scoreBorder(score)}`,
            }}
            title={`Lead Score: ${score}/100`}
          >
            {score}
          </span>
        )
      },
      sortingFn: (a, b) => (a.original.lead_score ?? -1) - (b.original.lead_score ?? -1),
      size: 64,
    })

    cols.push({
      id: 'full_name',
      accessorKey: 'full_name',
      header: () => <span className="text-eyebrow uppercase tracking-wider">Name</span>,
      cell: ({ row }) => {
        const lead = row.original
        return (
          <div className="min-w-0">
            <Link
              href={`/leads/${lead.row_number}`}
              onClick={(e) => e.stopPropagation()}
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
              const ago = m < 60 ? `${m || 0}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`
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
          </div>
        )
      },
    })

    cols.push({
      id: 'phone',
      accessorKey: 'phone',
      header: () => <span className="text-eyebrow uppercase tracking-wider">Phone</span>,
      cell: ({ row }) => <span className="text-body font-mono">{row.original.phone}</span>,
    })

    cols.push({
      id: 'city',
      accessorKey: 'city',
      header: () => <span className="text-eyebrow uppercase tracking-wider">City</span>,
      cell: ({ row }) => (
        <span className="text-body">
          {row.original.city}
          {row.original.state ? `, ${row.original.state}` : ''}
        </span>
      ),
    })

    cols.push({
      id: 'lead_status',
      accessorKey: 'lead_status',
      header: () => <span className="text-eyebrow uppercase tracking-wider">Status</span>,
      cell: ({ row }) => (
        <StatusEditPopover
          leadId={row.original.row_number}
          value={row.original.lead_status}
          onChange={(next) => applyLocalStatus(row.original.row_number, next)}
          size="sm"
          stopPropagation
        />
      ),
    })

    cols.push({
      id: 'lead_priority',
      accessorKey: 'lead_priority',
      header: () => <span className="text-eyebrow uppercase tracking-wider">Priority</span>,
      cell: ({ row }) => {
        const lead = row.original
        const priorityColor = PRIORITY_COLORS[lead.lead_priority] || { bg: 'var(--color-elevated)', text: 'var(--color-muted)', border: 'var(--color-border)' }
        return (
          <select
            value={lead.lead_priority || ''}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); updateLeadPriority(lead.row_number, e.target.value) }}
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
        )
      },
    })

    cols.push({
      id: 'assigned_to',
      accessorKey: 'assigned_to',
      header: () => <span className="text-eyebrow uppercase tracking-wider">Assigned</span>,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 flex-wrap text-body">
          <span>{row.original.assigned_to || <span className="text-accent/50 italic">Unassigned</span>}</span>
          {row.original.is_delegated_to_me && <Badge tone="active">Supporting</Badge>}
        </div>
      ),
    })

    if (isAdmin) {
      cols.push({
        id: 'telecaller',
        accessorKey: 'telecaller_name',
        header: () => <span className="text-eyebrow uppercase tracking-wider">Telecaller</span>,
        cell: ({ row }) => (
          row.original.telecaller_name ? (
            <Badge tone="hot" className="!normal-case !tracking-normal">
              📞 {row.original.telecaller_name}
            </Badge>
          ) : (
            <span className="text-dim text-caption">—</span>
          )
        ),
      })
    }

    cols.push({
      id: 'next_followup',
      accessorKey: 'next_followup',
      header: () => <span className="text-eyebrow uppercase tracking-wider">Follow-up</span>,
      cell: ({ row }) => {
        const followup = followupLabel(row.original.next_followup)
        return followup.text !== '-' ? (
          <span className={`text-caption font-medium ${followup.urgent ? 'text-danger' : 'text-muted'}`}>
            {followup.text}
          </span>
        ) : (
          <span className="text-caption text-dim">-</span>
        )
      },
      sortingFn: (a, b) => {
        const aT = a.original.next_followup ? new Date(a.original.next_followup).getTime() : Number.MAX_SAFE_INTEGER
        const bT = b.original.next_followup ? new Date(b.original.next_followup).getTime() : Number.MAX_SAFE_INTEGER
        return aT - bT
      },
    })

    cols.push({
      id: 'created_time',
      accessorKey: 'created_time',
      header: () => <span className="text-eyebrow uppercase tracking-wider">Created</span>,
      cell: ({ row }) => <span className="text-dim text-caption">{timeAgo(row.original.created_time)}</span>,
      sortingFn: (a, b) => {
        const aT = a.original.created_time ? new Date(a.original.created_time).getTime() : 0
        const bT = b.original.created_time ? new Date(b.original.created_time).getTime() : 0
        return aT - bT
      },
    })

    cols.push({
      id: 'actions',
      enableSorting: false,
      header: () => <span className="text-eyebrow uppercase tracking-wider">Actions</span>,
      cell: ({ row }) => {
        const lead = row.original
        return (
          <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
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
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-caption text-dim hover:text-accent transition-colors px-1.5 py-1 rounded hover:bg-accent/10"
              title="View details"
            >
              <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
            </Link>
            {lead.phone && (
              <Link
                href={`/inbox?phone=${lead.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-caption text-dim hover:text-green-400 transition-colors px-1.5 py-1 rounded hover:bg-green-400/10"
                title="Open in Inbox"
              >
                <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.5} />
              </Link>
            )}
          </div>
        )
      },
      size: 100,
    })

    return cols
  }, [showCheckboxColumn, isAdmin, applyLocalStatus, updateLeadPriority, quickNotePhone])

  const table = useReactTable({
    data: displayedLeads,
    columns,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
    getRowId: (row) => String(row.row_number),
    enableRowSelection: showCheckboxColumn,
  })

  const selectedRowNumbers = useMemo(
    () => Object.keys(rowSelection).filter(k => rowSelection[k]).map(k => Number(k)),
    [rowSelection]
  )
  const selectedCount = selectedRowNumbers.length

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
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
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
              onClick={handleExportCsv}
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

          {user?.role === 'admin' && hasTelecallers && (
            <select
              value={telecallerFilter}
              onChange={e => setTelecallerFilter(e.target.value)}
              className="bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
              title="Filter by telecaller"
            >
              <option value="">All Telecallers</option>
              <option value="__NONE__">— No telecaller —</option>
              {telecallerAgents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}

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

          <select
            value={sortByQuery}
            onChange={e => setSortByQuery(e.target.value)}
            className="bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
          >
            <option value="score">Sort: Lead Score</option>
            <option value="newest">Sort: Newest Created First</option>
            <option value="oldest">Sort: Oldest Created First</option>
            <option value="followup">Sort: Follow-up Date</option>
          </select>

          {(search || statusFilter || assignedFilter || telecallerFilter || sortByQuery !== 'score' || dateFrom || dateTo) && (
            <button onClick={clearFilters} className="text-sm text-dim hover:text-text transition-colors">
              Clear filters
            </button>
          )}

          <span className="text-caption text-dim ml-auto">
            {displayedLeads.length} lead{displayedLeads.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ─── Mobile Card List (<md) ─────────────────────────────────── */}
        <div className="md:hidden space-y-2">
          {table.getRowModel().rows.length === 0 ? (
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
            table.getRowModel().rows.map((row) => {
              const lead = row.original
              const followup = followupLabel(lead.next_followup)
              const isChecked = !!rowSelection[String(lead.row_number)]
              return (
                <div
                  key={lead.row_number}
                  onClick={() => router.push(`/leads/${lead.row_number}`)}
                  className="bg-card border border-border rounded-lg p-3 active:bg-elevated/50 transition-colors cursor-pointer relative"
                >
                  {showCheckboxColumn && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center cursor-pointer"
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) =>
                          setRowSelection(prev => ({ ...prev, [String(lead.row_number)]: !!checked }))
                        }
                        aria-label="Select row"
                      />
                    </div>
                  )}

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

                  <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/40">
                    <span className="text-eyebrow text-dim truncate flex items-center gap-1.5 flex-wrap">
                      {lead.assigned_to ? (
                        <span>Assigned: <span className="text-muted">{lead.assigned_to}</span></span>
                      ) : (
                        <span className="text-accent/50 italic">Unassigned</span>
                      )}
                      {lead.is_delegated_to_me && <Badge tone="active">Supporting</Badge>}
                      {lead.telecaller_name && <Badge tone="hot">📞 {lead.telecaller_name}</Badge>}
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

        {/* ─── Lead Table (≥md) — TanStack + shadcn ───────────────────── */}
        <div className="hidden md:block bg-card border border-border rounded-lg overflow-hidden">
          <div className="max-h-[calc(100vh-280px)] overflow-auto">
            <Table className="text-sm">
              <TableHeader className="sticky top-0 z-10 bg-elevated/95 backdrop-blur-sm">
                {table.getHeaderGroups().map(headerGroup => (
                  <TableRow key={headerGroup.id} className="border-b border-border hover:bg-transparent">
                    {headerGroup.headers.map(header => {
                      const canSort = header.column.getCanSort()
                      const sortDir = header.column.getIsSorted()
                      return (
                        <TableHead
                          key={header.id}
                          className={`px-3 py-2.5 text-left font-semibold text-dim whitespace-nowrap ${canSort ? 'cursor-pointer select-none hover:text-accent transition-colors' : ''}`}
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                          style={{ width: header.getSize() ? `${header.getSize()}px` : undefined }}
                        >
                          <span className="inline-flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {canSort && (
                              sortDir === 'asc' ? <ArrowUp className="w-3 h-3" />
                              : sortDir === 'desc' ? <ArrowDown className="w-3 h-3" />
                              : <ChevronsUpDown className="w-3 h-3 opacity-40" />
                            )}
                          </span>
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="px-3">
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
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map(row => {
                    const lead = row.original
                    return (
                      <React.Fragment key={row.id}>
                        <TableRow
                          data-state={row.getIsSelected() ? 'selected' : undefined}
                          onClick={() => router.push(`/leads/${lead.row_number}`)}
                          className="cursor-pointer h-9 hover:bg-elevated/40 transition-colors"
                        >
                          {row.getVisibleCells().map(cell => (
                            <TableCell key={cell.id} className="px-3 py-1.5 align-middle">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                        {quickNotePhone === lead.phone && (
                          <TableRow className="bg-accent/5 hover:bg-accent/5">
                            <TableCell colSpan={row.getVisibleCells().length} className="px-3 py-2">
                              <div className="flex items-center gap-2 max-w-2xl" onClick={(e) => e.stopPropagation()}>
                                <span className="text-xs text-muted flex-shrink-0">Note for {lead.full_name}:</span>
                                <input
                                  type="text"
                                  value={quickNoteText}
                                  onChange={e => setQuickNoteText(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleQuickNote(lead.phone)
                                    if (e.key === 'Escape') { setQuickNotePhone(null); setQuickNoteText('') }
                                  }}
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
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ─── Pagination (renders ~50 rows/page instead of the whole list) ─── */}
        {table.getPageCount() > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4 text-sm">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1.5 rounded-md border border-border bg-card text-text disabled:opacity-40 disabled:cursor-not-allowed hover:bg-elevated transition-colors"
            >
              Prev
            </button>
            <span className="text-dim tabular-nums">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
              <span className="hidden sm:inline"> · {displayedLeads.length} leads</span>
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1.5 rounded-md border border-border bg-card text-text disabled:opacity-40 disabled:cursor-not-allowed hover:bg-elevated transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </main>

      {/* ─── Floating Bulk Action Bar ─────────────────────────────────── */}
      {selectedCount > 0 && (canBulkAction || canBulkTelecaller) && (
        <div className="fixed bottom-0 left-0 right-0 z-50 safe-bottom">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
            <div className="bg-elevated border border-border rounded-lg shadow-2xl shadow-black/50 px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-sm text-text">
                <span className="font-semibold text-accent">{selectedCount}</span>{' '}
                lead{selectedCount !== 1 ? 's' : ''} selected
                {!canBulkAction && (
                  <span className="text-caption text-dim ml-2">(your leads only)</span>
                )}
              </span>

              <div className="flex items-center gap-2 flex-wrap">
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
                      onClick={() => bulkAssign(selectedRowNumbers)}
                      disabled={!assignTo || assigning}
                      className="bg-accent hover:bg-accent-hover disabled:bg-accent/30 disabled:cursor-not-allowed text-[#1a1209] text-sm font-semibold px-4 py-1.5 rounded-md transition-colors"
                    >
                      {assigning ? 'Working...' : 'Assign'}
                    </button>
                    <div className="w-px h-6 bg-border mx-1" />
                  </>
                )}

                {hasTelecallers && (
                  <>
                    <select
                      value={tcAssignToId}
                      onChange={e => setTcAssignToId(e.target.value)}
                      className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50"
                    >
                      <option value="">Telecaller...</option>
                      {telecallerAgents.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => bulkAssignTelecaller(selectedRowNumbers)}
                      disabled={!tcAssignToId || tcAssigning}
                      className="bg-accent hover:bg-accent-hover disabled:bg-accent/30 disabled:cursor-not-allowed text-[#1a1209] text-sm font-semibold px-4 py-1.5 rounded-md transition-colors"
                    >
                      {tcAssigning ? 'Working...' : 'Telecall'}
                    </button>
                    <div className="w-px h-6 bg-border mx-1" />
                  </>
                )}

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
                  onClick={() => bulkStatusChange(selectedRowNumbers)}
                  disabled={!bulkStatus || assigning}
                  className="bg-accent hover:bg-accent-hover disabled:bg-accent/30 disabled:cursor-not-allowed text-[#1a1209] text-sm font-semibold px-4 py-1.5 rounded-md transition-colors"
                >
                  {assigning ? 'Working...' : 'Update'}
                </button>

                <div className="w-px h-6 bg-border mx-1" />

                <button
                  onClick={() => setRowSelection({})}
                  className="text-sm text-dim hover:text-text transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Add Lead Modal — RHF + zod ───────────────────────────────── */}
      <Dialog
        open={showAddLead}
        onOpenChange={(o) => {
          setShowAddLead(o)
          if (!o) addLeadForm.reset()
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Lead</DialogTitle>
          </DialogHeader>

          <Form {...addLeadForm}>
            <form
              onSubmit={addLeadForm.handleSubmit(onAddLeadSubmit)}
              className="space-y-4"
              id="add-lead-form"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={addLeadForm.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>
                        Full Name <span className="text-danger">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" autoFocus {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={addLeadForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Phone <span className="text-danger">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder="9876543210"
                          inputMode="numeric"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={addLeadForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={addLeadForm.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder="Mumbai" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={addLeadForm.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <Input placeholder="Maharashtra" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={addLeadForm.control}
                  name="model_interest"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interest</FormLabel>
                      <FormControl>
                        <Input placeholder="Kiosk / Shop" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={addLeadForm.control}
                  name="lead_priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="HOT">HOT</SelectItem>
                          <SelectItem value="WARM">WARM</SelectItem>
                          <SelectItem value="COLD">COLD</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={addLeadForm.control}
                  name="source"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Source</FormLabel>
                      <FormControl>
                        <Input placeholder="Referral / Walk-in / Phone Call" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={addLeadForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any notes about this lead..."
                          rows={2}
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </form>
          </Form>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setShowAddLead(false); addLeadForm.reset() }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="add-lead-form"
              disabled={addLeadSaving}
            >
              {addLeadSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Adding...
                </>
              ) : 'Add Lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
