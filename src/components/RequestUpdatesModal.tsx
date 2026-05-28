'use client'
import { useEffect, useMemo, useState } from 'react'

interface Lead {
  row_number: number
  full_name: string
  city: string
  lead_status: string
  lead_priority: string
  next_followup: string
}

interface Props {
  open: boolean
  onClose: () => void
  agentId: string
  agentName: string
  onSent?: (count: number) => void
}

const STATUS_OPTIONS = ['NEW', 'DECK_SENT', 'REPLIED', 'NO_RESPONSE', 'CALL_DONE_INTERESTED', 'HOT'] as const
const DEFAULT_VISIBLE_STATUSES = new Set<string>(['HOT', 'CALL_DONE_INTERESTED', 'NEW'])

function defaultDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  return d.toISOString().slice(0, 10)
}

export default function RequestUpdatesModal({ open, onClose, agentId, agentName, onSent }: Props) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [visibleStatuses, setVisibleStatuses] = useState<Set<string>>(new Set(DEFAULT_VISIBLE_STATUSES))
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [dueDate, setDueDate] = useState<string>(defaultDueDate())
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setSelected(new Set())
    setReason('')
    setError('')
    fetch(`/api/leads?assigned=${encodeURIComponent(agentName)}`)
      .then(r => r.json())
      .then(d => { if (d.success) setLeads(d.data) })
      .catch(() => setError('Failed to load roster'))
      .finally(() => setLoading(false))
  }, [open, agentName])

  const visibleLeads = useMemo(() => {
    return leads
      .filter(l => visibleStatuses.has(l.lead_status))
      .sort((a, b) => (a.next_followup || '').localeCompare(b.next_followup || ''))
  }, [leads, visibleStatuses])

  function toggleStatus(s: string) {
    const next = new Set(visibleStatuses)
    if (next.has(s)) next.delete(s); else next.add(s)
    setVisibleStatuses(next)
  }

  function toggleLead(row: number) {
    const next = new Set(selected)
    if (next.has(row)) next.delete(row); else next.add(row)
    setSelected(next)
  }

  function selectAllVisible() {
    setSelected(new Set(visibleLeads.map(l => l.row_number)))
  }

  async function submit() {
    if (selected.size === 0) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/update-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          lead_rows: Array.from(selected),
          due_date: dueDate,
          reason,
        }),
      })
      const data = await res.json()
      if (data.success) {
        onSent?.(data.data.count)
        onClose()
      } else {
        setError(data.error || 'Failed to send')
      }
    } catch {
      setError('Network error')
    }
    setSending(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Request updates from {agentName}</h2>
          <button onClick={onClose} className="text-dim hover:text-text text-lg leading-none">×</button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {/* Filters */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`text-[10px] px-2 py-1 rounded border ${
                  visibleStatuses.has(s)
                    ? 'bg-accent/20 border-accent/40 text-accent'
                    : 'border-border text-dim hover:text-text'
                }`}
              >
                {s.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          {/* Roster */}
          <div className="border border-border rounded-md max-h-72 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-xs text-dim text-center">Loading roster…</div>
            ) : visibleLeads.length === 0 ? (
              <div className="p-4 text-xs text-dim text-center">No leads in this agent's roster match the selected statuses.</div>
            ) : (
              <>
                <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between text-[10px] text-dim">
                  <span>{visibleLeads.length} leads · {selected.size} selected</span>
                  <button onClick={selectAllVisible} className="text-accent hover:underline">Select all visible</button>
                </div>
                {visibleLeads.map(lead => (
                  <label key={lead.row_number} className="flex items-center gap-3 px-3 py-2 hover:bg-elevated cursor-pointer border-b border-border/30 last:border-b-0">
                    <input
                      type="checkbox"
                      checked={selected.has(lead.row_number)}
                      onChange={() => toggleLead(lead.row_number)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-text truncate">{lead.full_name}</div>
                      <div className="text-[10px] text-dim">{lead.lead_status} · {lead.city || '—'}</div>
                    </div>
                  </label>
                ))}
              </>
            )}
          </div>

          {/* Due date */}
          <div>
            <label className="text-[10px] text-dim block mb-1">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="bg-elevated border border-border rounded-md px-2 py-1.5 text-xs text-text"
            />
          </div>

          {/* Reason */}
          <div>
            <label className="text-[10px] text-dim block mb-1">Reason (optional, ≤ 200 chars)</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 200))}
              rows={2}
              placeholder="e.g. haven't heard back in 2 weeks"
              className="w-full bg-elevated border border-border rounded-md px-2 py-1.5 text-xs text-text resize-none"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-xs bg-elevated border border-border rounded-md px-3 py-1.5 text-muted hover:text-text">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={selected.size === 0 || sending}
            className="text-xs bg-accent text-bg rounded-md px-3 py-1.5 font-medium disabled:opacity-50"
          >
            {sending ? 'Sending…' : `Send (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}
