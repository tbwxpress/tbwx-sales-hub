'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { timeAgo } from '@/lib/format'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadEdit {
  id: number
  lead_row: number
  phone: string
  field_name: string
  old_value: string
  new_value: string
  changed_by: string
  changed_by_id: string
  created_at: string
}

interface StatusChange {
  id: number
  lead_row: number
  phone: string
  old_status: string
  new_status: string
  changed_by: string
  changed_by_id: string
  source: string
  created_at: string
}

interface Assignment {
  id: number
  lead_row: number
  phone: string
  from_agent: string
  to_agent: string
  assigned_by: string
  created_at: string
}

interface ActivityRow {
  id: string
  kind: 'edit' | 'status' | 'assignment'
  lead_row: number
  phone: string
  description: string
  actor: string
  actor_id: string
  field: string
  old_value: string
  new_value: string
  created_at: string
}

interface User {
  id: string
  name: string
  role: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  full_name: 'Name',
  email: 'Email',
  city: 'City',
  state: 'State',
  model_interest: 'Model Interest',
  lead_priority: 'Priority',
  next_followup: 'Next Follow-up',
  attempted_contact: 'Attempted Contact',
  first_call_date: 'First Call Date',
  wa_message_id: 'WA Message ID',
  notes: 'Notes',
  lead_status: 'Status',
  assigned_to: 'Assignment',
}

function mergeAll(
  edits: LeadEdit[],
  statusChanges: StatusChange[],
  assignments: Assignment[]
): ActivityRow[] {
  const rows: ActivityRow[] = []

  for (const e of edits) {
    const label = FIELD_LABELS[e.field_name] || e.field_name
    rows.push({
      id: `edit-${e.id}`,
      kind: 'edit',
      lead_row: e.lead_row,
      phone: e.phone,
      description: `Changed ${label}: "${e.old_value || '(empty)'}" → "${e.new_value || '(empty)'}"`,
      actor: e.changed_by,
      actor_id: e.changed_by_id,
      field: e.field_name,
      old_value: e.old_value,
      new_value: e.new_value,
      created_at: e.created_at,
    })
  }

  for (const s of statusChanges) {
    rows.push({
      id: `status-${s.id}`,
      kind: 'status',
      lead_row: s.lead_row,
      phone: s.phone,
      description: `Status: ${s.old_status || 'none'} → ${s.new_status}`,
      actor: s.changed_by,
      actor_id: s.changed_by_id,
      field: 'lead_status',
      old_value: s.old_status,
      new_value: s.new_status,
      created_at: s.created_at,
    })
  }

  for (const a of assignments) {
    rows.push({
      id: `assignment-${a.id}`,
      kind: 'assignment',
      lead_row: a.lead_row,
      phone: a.phone,
      description: `Reassigned: ${a.from_agent || 'Unassigned'} → ${a.to_agent || 'Unassigned'}`,
      actor: a.assigned_by,
      actor_id: '',
      field: 'assigned_to',
      old_value: a.from_agent,
      new_value: a.to_agent,
      created_at: a.created_at,
    })
  }

  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  return rows
}

const KIND_BADGE: Record<string, string> = {
  edit: 'bg-elevated text-muted border border-border',
  status: 'bg-accent/10 text-accent border border-accent/20',
  assignment: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
}

const FIELD_OPTIONS = [
  { value: '', label: 'All fields' },
  { value: 'lead_status', label: 'Status' },
  { value: 'lead_priority', label: 'Priority' },
  { value: 'full_name', label: 'Name' },
  { value: 'email', label: 'Email' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'model_interest', label: 'Model Interest' },
  { value: 'next_followup', label: 'Next Follow-up' },
  { value: 'notes', label: 'Notes' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminActivityPage() {
  const router = useRouter()

  const [rows, setRows] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<User[]>([])

  // Filters
  const [days, setDays] = useState(7)
  const [agentId, setAgentId] = useState('')
  const [field, setField] = useState('')
  const [suspicious, setSuspicious] = useState(false)

  const fetchActivity = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('days', String(days))
      if (agentId) params.set('agent_id', agentId)
      if (field) params.set('field', field)
      if (suspicious) params.set('suspicious', 'true')

      const res = await fetch(`/api/admin/activity?${params}`)
      const json = await res.json()
      if (!json.success) {
        if (res.status === 403) { router.push('/dashboard'); return }
        return
      }
      const { edits, status_changes, assignments } = json.data
      setRows(mergeAll(edits ?? [], status_changes ?? [], assignments ?? []))
    } catch { /* silent */ }
    setLoading(false)
  }, [days, agentId, field, suspicious, router])

  useEffect(() => { fetchActivity() }, [fetchActivity])

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(j => { if (j.success) setUsers(j.data ?? []) })
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-6 flex-1 w-full">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-text">Activity Log</h1>
            <p className="text-sm text-dim mt-0.5">Cross-lead audit trail — all field edits, status changes, reassignments</p>
            <a href="/admin" className="text-xs text-accent hover:text-accent-hover transition-colors mt-1 inline-flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Admin
            </a>
          </div>
          <button
            onClick={fetchActivity}
            className="text-xs bg-elevated border border-border text-muted hover:text-text px-3 py-1.5 rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-xl p-4 mb-5 flex flex-wrap gap-3 items-end">
          {/* Days */}
          <div>
            <label className="block text-xs text-dim mb-1">Period</label>
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="bg-elevated border border-border rounded-lg px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50"
            >
              <option value={1}>Last 24 h</option>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </div>

          {/* Agent */}
          <div>
            <label className="block text-xs text-dim mb-1">Agent</label>
            <select
              value={agentId}
              onChange={e => setAgentId(e.target.value)}
              className="bg-elevated border border-border rounded-lg px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50"
            >
              <option value="">All agents</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* Field */}
          <div>
            <label className="block text-xs text-dim mb-1">Field</label>
            <select
              value={field}
              onChange={e => setField(e.target.value)}
              className="bg-elevated border border-border rounded-lg px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50"
            >
              {FIELD_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Suspicious toggle */}
          <div className="flex items-center gap-2 pb-0.5">
            <button
              onClick={() => setSuspicious(s => !s)}
              className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
                suspicious ? 'bg-danger' : 'bg-elevated border border-border'
              }`}
              title="Show only suspicious changes"
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                suspicious ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
            <label className="text-xs text-dim cursor-pointer" onClick={() => setSuspicious(s => !s)}>
              Suspicious only
            </label>
          </div>

          <div className="text-xs text-dim self-end pb-1">
            {loading ? 'Loading...' : `${rows.length} entries`}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-dim">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mr-3" />
            Loading activity...
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-dim text-sm">
            No activity found for the selected filters
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-dim uppercase tracking-wide">Lead</th>
                    <th className="px-4 py-3 text-xs font-semibold text-dim uppercase tracking-wide">Type</th>
                    <th className="px-4 py-3 text-xs font-semibold text-dim uppercase tracking-wide">Change</th>
                    <th className="px-4 py-3 text-xs font-semibold text-dim uppercase tracking-wide">By</th>
                    <th className="px-4 py-3 text-xs font-semibold text-dim uppercase tracking-wide">When</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`border-b border-border/50 hover:bg-elevated/40 transition-colors ${i % 2 === 0 ? '' : 'bg-elevated/20'}`}
                    >
                      <td className="px-4 py-3">
                        <a
                          href={`/leads/${row.lead_row}`}
                          className="text-accent hover:text-accent-hover text-xs font-medium transition-colors"
                        >
                          #{row.lead_row}
                        </a>
                        {row.phone && (
                          <p className="text-[10px] text-dim font-mono mt-0.5">{row.phone}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${KIND_BADGE[row.kind]}`}>
                          {row.kind}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-text text-xs">{row.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted font-medium">{row.actor}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-[10px] text-dim">{timeAgo(row.created_at)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
