'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { toast } from 'sonner'
import type { PaymentFollowup, PaymentFollowupUpdate, PaymentFollowupStatus } from '@/lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusLabel(s: PaymentFollowupStatus): string {
  return {
    pending: 'Pending',
    in_progress: 'In Progress',
    partially_cleared: 'Partial',
    cleared: 'Cleared',
    blocked: 'Blocked',
  }[s] ?? s
}

function statusColors(s: PaymentFollowupStatus): { bg: string; text: string; border: string } {
  const map: Record<PaymentFollowupStatus, { bg: string; text: string; border: string }> = {
    pending:            { bg: 'color-mix(in srgb, var(--color-muted) 12%, transparent)',   text: 'var(--color-muted)',   border: 'color-mix(in srgb, var(--color-muted) 25%, transparent)' },
    in_progress:        { bg: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',  text: 'var(--color-accent)',  border: 'color-mix(in srgb, var(--color-accent) 25%, transparent)' },
    partially_cleared:  { bg: 'color-mix(in srgb, #f59e0b 12%, transparent)',              text: '#f59e0b',             border: 'color-mix(in srgb, #f59e0b 25%, transparent)' },
    cleared:            { bg: 'color-mix(in srgb, var(--color-success) 12%, transparent)', text: 'var(--color-success)', border: 'color-mix(in srgb, var(--color-success) 25%, transparent)' },
    blocked:            { bg: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',  text: 'var(--color-danger)',  border: 'color-mix(in srgb, var(--color-danger) 25%, transparent)' },
  }
  return map[s] ?? map.pending
}

function rowAccent(s: PaymentFollowupStatus): string {
  return {
    pending:           'transparent',
    in_progress:       'var(--color-accent)',
    partially_cleared: '#f59e0b',
    cleared:           'var(--color-success)',
    blocked:           'var(--color-danger)',
  }[s] ?? 'transparent'
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return d }
}

function formatAmount(amount: number, currency: string): string {
  return `${currency}${amount.toLocaleString('en-IN')}`
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PaymentFollowupStatus }) {
  const c = statusColors(status)
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border"
      style={{ background: c.bg, color: c.text, borderColor: c.border }}
    >
      {statusLabel(status)}
    </span>
  )
}

// ─── New Followup Modal ───────────────────────────────────────────────────────

interface Agent { id: string; name: string; role: string; active: boolean }

function NewFollowupModal({
  agents,
  onClose,
  onCreated,
}: {
  agents: Agent[]
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    franchise_name: '',
    amount: '',
    due_date: '',
    assigned_to_id: '',
    notes: '',
    phone: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const activeAgents = agents.filter(a => a.active)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.franchise_name.trim() || !form.assigned_to_id) {
      setError('Franchise name and assigned agent are required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/payment-followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          franchise_name: form.franchise_name.trim(),
          amount: form.amount ? parseFloat(form.amount) : 0,
          due_date: form.due_date || null,
          assigned_to_id: form.assigned_to_id,
          notes: form.notes,
          phone: form.phone,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed')
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    }
    setSaving(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6"
        style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>New Payment Followup</h2>
          <button onClick={onClose} style={{ color: 'var(--color-dim)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)', color: 'var(--color-danger)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>
              Franchise Name *
            </label>
            <input
              type="text"
              required
              value={form.franchise_name}
              onChange={e => setForm(f => ({ ...f, franchise_name: e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm border"
              style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              placeholder="e.g. Sector 22 Chandigarh"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>
                Amount (₹)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>
                Due Date
              </label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>
              Assign To *
            </label>
            <select
              required
              value={form.assigned_to_id}
              onChange={e => setForm(f => ({ ...f, assigned_to_id: e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm border"
              style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: form.assigned_to_id ? 'var(--color-text)' : 'var(--color-muted)' }}
            >
              <option value="">Select agent...</option>
              {activeAgents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>
              Phone (optional)
            </label>
            <input
              type="text"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm border"
              style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              placeholder="Franchise owner phone"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full rounded-lg px-3 py-2 text-sm border resize-none"
              style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              placeholder="Context for the agent..."
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-sm border transition-colors"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ background: 'var(--color-accent)', color: '#1a1209' }}
            >
              {saving ? 'Creating...' : 'Create Followup'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

const ALL_STATUSES: PaymentFollowupStatus[] = ['pending', 'in_progress', 'partially_cleared', 'cleared', 'blocked']

function DetailDrawer({
  followup,
  isAdmin,
  agents,
  onClose,
  onSaved,
  onDeleted,
}: {
  followup: PaymentFollowup
  isAdmin: boolean
  agents: Agent[]
  onClose: () => void
  onSaved: (updated: PaymentFollowup) => void
  onDeleted: (id: number) => void
}) {
  const [form, setForm] = useState({
    status: followup.status,
    reason: followup.reason,
    cleared_amount: String(followup.cleared_amount || ''),
    notes: followup.notes,
    franchise_name: followup.franchise_name,
    amount: String(followup.amount || ''),
    due_date: followup.due_date || '',
    assigned_to_id: followup.assigned_to_id,
  })
  const [history, setHistory] = useState<PaymentFollowupUpdate[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/payment-followups/${followup.id}/history`)
      .then(r => r.json())
      .then(d => { if (d.success) setHistory(d.data) })
      .catch(() => {})
  }, [followup.id])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        status: form.status,
        reason: form.reason,
        notes: form.notes,
      }
      if (form.cleared_amount !== '') body.cleared_amount = parseFloat(form.cleared_amount)
      if (isAdmin) {
        body.franchise_name = form.franchise_name
        body.amount = form.amount !== '' ? parseFloat(form.amount) : 0
        body.due_date = form.due_date || null
        if (form.assigned_to_id !== followup.assigned_to_id) {
          body.assigned_to_id = form.assigned_to_id
        }
      }
      const res = await fetch(`/api/payment-followups/${followup.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed')
      onSaved(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
    setSaving(false)
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/payment-followups/${followup.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed')
      onDeleted(followup.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
    }
  }

  const inputStyle = {
    background: 'var(--color-elevated)',
    borderColor: 'var(--color-border)',
    color: 'var(--color-text)',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="h-full w-full max-w-lg overflow-y-auto border-l flex flex-col"
        style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10" style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}>
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{followup.franchise_name}</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-muted)' }}>Followup #{followup.id}</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--color-dim)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5">
          {error && (
            <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)', color: 'var(--color-danger)' }}>
              {error}
            </div>
          )}

          {/* Meta info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>Amount</span>
              <span style={{ color: 'var(--color-text)' }}>{formatAmount(followup.amount, followup.currency)}</span>
            </div>
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>Due Date</span>
              <span style={{ color: 'var(--color-text)' }}>{formatDate(followup.due_date)}</span>
            </div>
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>Assigned To</span>
              <span style={{ color: 'var(--color-text)' }}>{followup.assigned_to_name}</span>
            </div>
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>Created By</span>
              <span style={{ color: 'var(--color-text)' }}>{followup.created_by_name}</span>
            </div>
            {followup.phone && (
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>Phone</span>
                <span style={{ color: 'var(--color-text)' }}>{followup.phone}</span>
              </div>
            )}
            {followup.lead_row && (
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-muted)' }}>Lead</span>
                <Link href={`/leads/${followup.lead_row}`} className="hover:underline" style={{ color: 'var(--color-accent)' }}>#{followup.lead_row}</Link>
              </div>
            )}
          </div>

          <div className="border-t" style={{ borderColor: 'var(--color-border)' }} />

          {/* Edit form */}
          <div className="space-y-4">
            {isAdmin && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>Franchise Name</label>
                  <input type="text" value={form.franchise_name} onChange={e => setForm(f => ({ ...f, franchise_name: e.target.value }))} className="w-full rounded-lg px-3 py-2 text-sm border" style={inputStyle} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>Amount (₹)</label>
                    <input type="number" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full rounded-lg px-3 py-2 text-sm border" style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>Due Date</label>
                    <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="w-full rounded-lg px-3 py-2 text-sm border" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>Assigned To</label>
                  <select value={form.assigned_to_id} onChange={e => setForm(f => ({ ...f, assigned_to_id: e.target.value }))} className="w-full rounded-lg px-3 py-2 text-sm border" style={inputStyle}>
                    {agents.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as PaymentFollowupStatus }))} className="w-full rounded-lg px-3 py-2 text-sm border" style={inputStyle}>
                {ALL_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
            </div>

            {(form.status === 'partially_cleared' || form.status === 'cleared') && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>Amount Cleared (₹)</label>
                <input type="number" min="0" value={form.cleared_amount} onChange={e => setForm(f => ({ ...f, cleared_amount: e.target.value }))} className="w-full rounded-lg px-3 py-2 text-sm border" style={inputStyle} />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>Reason / Update</label>
              <input type="text" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="w-full rounded-lg px-3 py-2 text-sm border" style={inputStyle} placeholder="What happened today?" />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-lg px-3 py-2 text-sm border resize-none" style={inputStyle} />
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div>
              <div className="border-t mb-4" style={{ borderColor: 'var(--color-border)' }} />
              <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-muted)' }}>History</h3>
              <div className="space-y-2">
                {history.map(h => {
                  const newC = statusColors(h.new_status as PaymentFollowupStatus)
                  return (
                    <div key={h.id} className="flex gap-2.5 items-start text-xs">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: newC.text }} />
                      <div className="flex-1 min-w-0">
                        <span style={{ color: 'var(--color-text)' }}>{h.updated_by_name}</span>
                        <span style={{ color: 'var(--color-dim)' }}> changed status to </span>
                        <span style={{ color: newC.text }}>{statusLabel(h.new_status as PaymentFollowupStatus)}</span>
                        {h.reason && <span style={{ color: 'var(--color-muted)' }}> — {h.reason}</span>}
                        {h.amount_change !== 0 && (
                          <span style={{ color: 'var(--color-success)' }}> (+{formatAmount(h.amount_change, '₹')})</span>
                        )}
                        <span className="block text-[10px] mt-0.5" style={{ color: 'var(--color-dim)' }}>{formatDate(h.created_at)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t space-y-3 sticky bottom-0" style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}>
          {confirmDelete ? (
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-lg text-xs border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--color-danger)', color: '#fff' }}>
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              {isAdmin && (
                <button onClick={() => setConfirmDelete(true)} className="py-2 px-4 rounded-lg text-xs border transition-colors" style={{ borderColor: 'color-mix(in srgb, var(--color-danger) 40%, transparent)', color: 'var(--color-danger)' }}>
                  Delete
                </button>
              )}
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50" style={{ background: 'var(--color-accent)', color: '#1a1209' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'partially_cleared', label: 'Partial' },
  { value: 'cleared', label: 'Cleared' },
  { value: 'blocked', label: 'Blocked' },
]

interface SessionUser { id: string; name: string; role: string }

export default function PaymentFollowupsPage() {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [followups, setFollowups] = useState<PaymentFollowup[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [agentFilter, setAgentFilter] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<PaymentFollowup | null>(null)

  const fetchUser = useCallback(async () => {
    const res = await fetch('/api/auth/me')
    const data = await res.json()
    if (!data.success) { router.push('/login'); return null }
    // Admin guard — this page is owner-private. Bounce non-admins to /dashboard.
    if (data.data.role !== 'admin') { router.push('/dashboard'); return null }
    setUser(data.data)
    return data.data as SessionUser
  }, [router])

  const fetchFollowups = useCallback(async () => {
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (agentFilter) params.set('assigned_to_id', agentFilter)
    const qs = params.toString()
    const res = await fetch(`/api/payment-followups${qs ? `?${qs}` : ''}`)
    const data = await res.json()
    if (data.success) setFollowups(data.data)
  }, [statusFilter, agentFilter])

  const fetchAgents = useCallback(async () => {
    const res = await fetch('/api/users')
    const data = await res.json()
    if (data.success) setAgents(data.data)
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      const currentUser = await fetchUser()
      if (currentUser) {
        await Promise.all([fetchFollowups(), currentUser.role === 'admin' ? fetchAgents() : Promise.resolve()])
      }
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (user) fetchFollowups()
  }, [statusFilter, agentFilter, fetchFollowups, user])

  const isAdmin = user?.role === 'admin'

  // Render nothing until the admin role is confirmed — non-admins are bounced
  // to /dashboard by fetchUser; this prevents a flash of owner-private data.
  if (!user || user.role !== 'admin') return null

  function handleSaved(updated: PaymentFollowup) {
    setFollowups(prev => prev.map(f => f.id === updated.id ? updated : f))
    setSelected(updated)
    toast.success('Saved')
  }

  function handleDeleted(id: number) {
    setFollowups(prev => prev.filter(f => f.id !== id))
    setSelected(null)
    toast.success('Deleted')
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Payment Followups</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>Track franchise payments until cleared</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: 'var(--color-accent)', color: '#1a1209' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Followup
            </button>
          )}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {/* Status pill group */}
          <div className="flex items-center gap-1 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                style={statusFilter === f.value
                  ? { background: 'var(--color-accent)', color: '#1a1209', borderColor: 'var(--color-accent)' }
                  : { background: 'transparent', color: 'var(--color-muted)', borderColor: 'var(--color-border)' }
                }
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Agent dropdown — admin only */}
          {isAdmin && agents.length > 0 && (
            <select
              value={agentFilter}
              onChange={e => setAgentFilter(e.target.value)}
              className="ml-auto rounded-lg px-3 py-1.5 text-xs border"
              style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: agentFilter ? 'var(--color-text)' : 'var(--color-muted)' }}
            >
              <option value="">All agents</option>
              {agents.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
          {/* Table header */}
          <div
            className="grid gap-3 px-4 py-2.5 border-b"
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-elevated)',
              gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr) auto',
            }}
          >
            {['Franchise', 'Amount', 'Due', 'Assigned To', 'Status', 'Last Update', ''].map((h, i) => (
              <span key={i} className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>{h}</span>
            ))}
          </div>

          {loading ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-dim)' }}>Loading...</div>
          ) : followups.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm" style={{ color: 'var(--color-dim)' }}>No followups found</p>
              {isAdmin && (
                <button onClick={() => setShowNew(true)} className="mt-3 text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--color-accent)', color: '#1a1209' }}>
                  Create first followup
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {followups.map(f => {
                const c = statusColors(f.status)
                const accent = rowAccent(f.status)
                const isOverdue = f.due_date && f.status !== 'cleared' && new Date(f.due_date) < new Date()
                return (
                  <div
                    key={f.id}
                    onClick={() => setSelected(f)}
                    className="grid gap-3 px-4 py-3 cursor-pointer transition-colors duration-100 items-center"
                    style={{
                      gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr) auto',
                      borderLeft: `3px solid ${accent}`,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-elevated)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{f.franchise_name}</p>
                      {f.phone && <p className="text-[10px] truncate" style={{ color: 'var(--color-dim)' }}>{f.phone}</p>}
                    </div>
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{formatAmount(f.amount, f.currency)}</span>
                    <span className="text-xs" style={{ color: isOverdue ? 'var(--color-danger)' : 'var(--color-muted)' }}>
                      {isOverdue && '! '}{formatDate(f.due_date)}
                    </span>
                    <span className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>{f.assigned_to_name}</span>
                    <StatusBadge status={f.status} />
                    <span className="text-[10px]" style={{ color: 'var(--color-dim)' }}>{timeAgo(f.updated_at)}</span>
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} style={{ color: 'var(--color-dim)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* New followup modal */}
      {showNew && isAdmin && (
        <NewFollowupModal
          agents={agents}
          onClose={() => setShowNew(false)}
          onCreated={() => { fetchFollowups(); toast.success('Followup created') }}
        />
      )}

      {/* Detail drawer */}
      {selected && user && (
        <DetailDrawer
          followup={selected}
          isAdmin={isAdmin}
          agents={agents}
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

    </div>
  )
}
