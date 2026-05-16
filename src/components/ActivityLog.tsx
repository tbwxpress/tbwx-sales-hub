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

interface DelegationEntry {
  id: number
  lead_row: number
  from_agent_name: string
  to_agent_name: string
  status: string
  message: string
  expires_at: string | null
  created_at: string
  responded_at: string | null
  ended_at: string | null
  ended_by: string
}

type ActivityKind = 'edit' | 'status' | 'assignment' | 'delegation'

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

function mergeDelegations(delegations: DelegationEntry[]): ActivityItem[] {
  const items: ActivityItem[] = []
  for (const d of delegations) {
    // Request created
    items.push({
      id: `deleg-created-${d.id}`,
      kind: 'delegation',
      created_at: d.created_at,
      actor: d.from_agent_name,
      description: `${d.from_agent_name} requested support from ${d.to_agent_name}${d.expires_at ? ` until ${d.expires_at.slice(0, 10)}` : ''}`,
    })
    // Response
    if (d.responded_at && (d.status === 'active' || d.status === 'declined')) {
      items.push({
        id: `deleg-responded-${d.id}`,
        kind: 'delegation',
        created_at: d.responded_at,
        actor: d.to_agent_name,
        description: d.status === 'active'
          ? `${d.to_agent_name} accepted the support request`
          : `${d.to_agent_name} declined the support request`,
      })
    }
    // Ended
    if (d.ended_at && d.status === 'ended') {
      const endedByLabel = d.ended_by === 'system-cron' ? 'System' : d.ended_by
      items.push({
        id: `deleg-ended-${d.id}`,
        kind: 'delegation',
        created_at: d.ended_at,
        actor: endedByLabel,
        description: d.ended_by === 'system-cron'
          ? `Delegation auto-ended (expired ${d.expires_at ? d.expires_at.slice(0, 10) : ''})`
          : `${endedByLabel} ended the delegation`,
      })
    }
  }
  return items
}

function mergeActivity(
  edits: LeadEdit[],
  statusChanges: StatusChange[],
  assignments: AssignmentEntry[],
  delegations: DelegationEntry[] = []
): ActivityItem[] {
  const items: ActivityItem[] = []

  // Filter out delegation field edits — we render them via delegation entries instead
  const nonDelegEdits = edits.filter(e => e.field_name !== 'delegation')

  for (const e of nonDelegEdits) {
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

  // Add delegation timeline entries
  items.push(...mergeDelegations(delegations))

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
  if (kind === 'delegation') {
    return (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
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
  if (kind === 'delegation') return 'text-purple-400'
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
      const [actRes, delRes] = await Promise.all([
        fetch(`/api/leads/${lead_row}/activity`),
        fetch(`/api/leads/${lead_row}/delegations`),
      ])
      const actJson = await actRes.json()
      const delJson = await delRes.json()
      if (actJson.success && actJson.data) {
        const merged = mergeActivity(
          actJson.data.edits ?? [],
          actJson.data.status_changes ?? [],
          actJson.data.assignments ?? [],
          delJson.success ? (delJson.data ?? []) : []
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
