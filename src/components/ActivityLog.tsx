'use client'

import { useState, useEffect, useCallback } from 'react'
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

interface AssignmentEntry {
  id: number
  lead_row: number
  phone: string
  from_agent: string
  to_agent: string
  assigned_by: string
  created_at: string
}

type ActivityKind = 'edit' | 'status' | 'assignment'

interface ActivityItem {
  id: string
  kind: ActivityKind
  created_at: string
  actor: string
  description: string
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
}

function mergeActivity(
  edits: LeadEdit[],
  statusChanges: StatusChange[],
  assignments: AssignmentEntry[]
): ActivityItem[] {
  const items: ActivityItem[] = []

  for (const e of edits) {
    const label = FIELD_LABELS[e.field_name] || e.field_name
    const oldDisplay = e.old_value || '(empty)'
    const newDisplay = e.new_value || '(empty)'
    items.push({
      id: `edit-${e.id}`,
      kind: 'edit',
      created_at: e.created_at,
      actor: e.changed_by,
      description: `${e.changed_by} changed ${label} from "${oldDisplay}" to "${newDisplay}"`,
    })
  }

  for (const s of statusChanges) {
    const oldDisplay = s.old_status || 'none'
    items.push({
      id: `status-${s.id}`,
      kind: 'status',
      created_at: s.created_at,
      actor: s.changed_by,
      description: `${s.changed_by} set Status to ${s.new_status}${s.old_status ? ` (was ${oldDisplay})` : ''}`,
    })
  }

  for (const a of assignments) {
    const from = a.from_agent || 'Unassigned'
    const to = a.to_agent || 'Unassigned'
    items.push({
      id: `assignment-${a.id}`,
      kind: 'assignment',
      created_at: a.created_at,
      actor: a.assigned_by,
      description: `${a.assigned_by} reassigned from ${from} to ${to}`,
    })
  }

  // Newest first
  items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  return items
}

// ─── Icon per kind ────────────────────────────────────────────────────────────

function KindIcon({ kind }: { kind: ActivityKind }) {
  if (kind === 'status') {
    return (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }
  if (kind === 'assignment') {
    return (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    )
  }
  // edit
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
    </svg>
  )
}

function iconColor(kind: ActivityKind): string {
  if (kind === 'status') return 'text-accent'
  if (kind === 'assignment') return 'text-blue-400'
  return 'text-dim'
}

// ─── Component ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

export default function ActivityLog({ lead_row }: { lead_row: number; phone: string }) {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [shown, setShown] = useState(PAGE_SIZE)

  const fetchActivity = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/leads/${lead_row}/activity`)
      const json = await res.json()
      if (json.success && json.data) {
        const merged = mergeActivity(
          json.data.edits ?? [],
          json.data.status_changes ?? [],
          json.data.assignments ?? []
        )
        setItems(merged)
      }
    } catch { /* silent */ }
    setLoading(false)
  }, [lead_row])

  useEffect(() => { fetchActivity() }, [fetchActivity])

  const visible = items.slice(0, shown)
  const hasMore = shown < items.length

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-dim uppercase tracking-wide">Activity Log</h2>
        <button
          onClick={fetchActivity}
          className="text-[10px] text-dim hover:text-accent transition-colors"
          title="Refresh"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-dim">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-[10px] text-dim">No activity recorded yet</p>
      ) : (
        <>
          <div className="space-y-2">
            {visible.map(item => (
              <div key={item.id} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 ${iconColor(item.kind)}`}>
                  <KindIcon kind={item.kind} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-text leading-snug break-words">{item.description}</p>
                </div>
                <span className="text-dim whitespace-nowrap text-[10px] shrink-0 mt-0.5">
                  {timeAgo(item.created_at)}
                </span>
              </div>
            ))}
          </div>
          {hasMore && (
            <button
              onClick={() => setShown(s => s + PAGE_SIZE)}
              className="mt-3 text-[10px] text-dim hover:text-accent transition-colors"
            >
              Load more ({items.length - shown} remaining)
            </button>
          )}
        </>
      )}
    </div>
  )
}
