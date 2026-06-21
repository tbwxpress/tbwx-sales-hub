'use client'

/**
 * LeadSidePanel — a right-side slide-over (shadcn Sheet, side="right") that
 * shows a lead 360° without navigating away from the list. The most-edited
 * fields are inline-editable here (status / priority / assignee / follow-up /
 * notes) and save via the existing PATCH /api/leads/[row] endpoint with
 * optimistic UI + sonner toast + rollback on error.
 *
 * Layout adapted from a 21st.dev record-drawer pattern (avatar-initial header +
 * label/control field rhythm), fully re-themed to TBWX dark-luxe tokens —
 * no generated styling shipped.
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Phone,
  MessageCircle,
  ArrowUpRight,
  MapPin,
  Tag,
  Clock,
  User,
  StickyNote,
  History,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import Badge, { statusTone, priorityTone } from '@/components/ui/Badge'
import StatusEditPopover from '@/app/leads/_components/StatusEditPopover'
import FollowupDatePicker from '@/app/leads/[id]/_components/FollowupDatePicker'
import InlineSelect from './InlineSelect'
import FavoriteStar from './FavoriteStar'
import { PRIORITY_CHIP, PRIORITY_OPTIONS, patchLead } from './shared'
import { STATUS_LABELS } from '@/config/client'
import { timeAgo } from '@/lib/format'

// Mirror of the page-level Lead shape (kept structural to avoid a cross-file
// type import; only the fields the panel reads are required).
export interface PanelLead {
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
  next_followup: string
  notes?: string
  model_interest?: string
  telecaller_name?: string
  lead_score?: number
  last_discussion?: {
    source: 'note' | 'call' | 'message_in' | 'message_out'
    text: string
    by: string
    at: string
  } | null
}

interface ActivityItem {
  kind: 'status' | 'assignment' | 'edit'
  label: string
  by: string
  at: string
}

interface LeadSidePanelProps {
  lead: PanelLead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Agent names for the assignee picker (already filtered to active users) */
  assignees: string[]
  /** Whether the current user may reassign (admin or can_assign) */
  canAssign: boolean
  /** Patch the page's local lead list optimistically */
  onPatch: (rowNumber: number, patch: Partial<PanelLead>) => void
  /** Whether this lead is pinned (from useFavorites().isFavorite) */
  isFavorite?: boolean
  /** Optimistic pin toggle for this lead (from useFavorites().toggle) */
  onToggleFavorite?: () => void | Promise<void>
}

function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function waLink(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '')
  return `https://wa.me/${digits}`
}

function FieldRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex items-center gap-2 w-28 shrink-0 pt-1 text-dim">
        <span className="shrink-0">{icon}</span>
        <span className="text-eyebrow uppercase tracking-wider">{label}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export default function LeadSidePanel({
  lead,
  open,
  onOpenChange,
  assignees,
  canAssign,
  onPatch,
  isFavorite = false,
  onToggleFavorite,
}: LeadSidePanelProps) {
  const [notesDraft, setNotesDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

  // Reset the notes draft whenever a different lead is opened.
  useEffect(() => {
    setNotesDraft(lead?.notes ?? '')
  }, [lead?.row_number, lead?.notes])

  // Fetch a compact recent-activity slice when the panel opens for a lead.
  useEffect(() => {
    if (!open || !lead) {
      setActivity([])
      return
    }
    let cancelled = false
    setActivityLoading(true)
    fetch(`/api/leads/${lead.row_number}/activity`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.success) return
        const items: ActivityItem[] = []
        for (const s of data.data?.status_changes ?? []) {
          items.push({
            kind: 'status',
            label: `Status → ${STATUS_LABELS[s.new_status] || s.new_status}`,
            by: s.changed_by || 'system',
            at: s.created_at || s.changed_at || '',
          })
        }
        for (const a of data.data?.assignments ?? []) {
          items.push({
            kind: 'assignment',
            label: a.to_agent ? `Assigned to ${a.to_agent}` : 'Unassigned',
            by: a.assigned_by || 'system',
            at: a.created_at || a.assigned_at || '',
          })
        }
        for (const e of data.data?.edits ?? []) {
          items.push({
            kind: 'edit',
            label: `${e.field_name?.replace(/_/g, ' ') || 'Field'} updated`,
            by: e.changed_by || 'system',
            at: e.created_at || e.changed_at || '',
          })
        }
        items.sort((x, y) => (y.at || '').localeCompare(x.at || ''))
        setActivity(items.slice(0, 8))
      })
      .catch(() => { /* activity is non-critical */ })
      .finally(() => { if (!cancelled) setActivityLoading(false) })
    return () => { cancelled = true }
  }, [open, lead])

  // ─── Optimistic field savers ─────────────────────────────────────────────

  const savePriority = useCallback(async (next: string) => {
    if (!lead) return
    const prev = lead.lead_priority
    onPatch(lead.row_number, { lead_priority: next })
    const res = await patchLead(lead.row_number, { lead_priority: next })
    if (res.ok) toast.success(`Priority set to ${next || '—'}`)
    else { onPatch(lead.row_number, { lead_priority: prev }); toast.error(res.error || 'Update failed') }
  }, [lead, onPatch])

  const saveAssignee = useCallback(async (next: string) => {
    if (!lead) return
    const prev = lead.assigned_to
    onPatch(lead.row_number, { assigned_to: next })
    const res = await patchLead(lead.row_number, { assigned_to: next })
    if (res.ok) toast.success(next ? `Assigned to ${next}` : 'Unassigned')
    else { onPatch(lead.row_number, { assigned_to: prev }); toast.error(res.error || 'Update failed') }
  }, [lead, onPatch])

  const saveFollowup = useCallback(async (next: string) => {
    if (!lead) return
    const prev = lead.next_followup
    onPatch(lead.row_number, { next_followup: next })
    const res = await patchLead(lead.row_number, { next_followup: next })
    if (res.ok) toast.success(next ? 'Follow-up updated' : 'Follow-up cleared')
    else { onPatch(lead.row_number, { next_followup: prev }); toast.error(res.error || 'Update failed') }
  }, [lead, onPatch])

  const saveNotes = useCallback(async () => {
    if (!lead) return
    const prev = lead.notes ?? ''
    const next = notesDraft
    if (next === prev) { toast.info('No changes to notes'); return }
    setSavingNotes(true)
    onPatch(lead.row_number, { notes: next })
    const res = await patchLead(lead.row_number, { notes: next })
    setSavingNotes(false)
    if (res.ok) toast.success('Notes saved')
    else { onPatch(lead.row_number, { notes: prev }); setNotesDraft(prev); toast.error(res.error || 'Save failed') }
  }, [lead, notesDraft, onPatch])

  const assigneeOptions = assignees.map((n) => ({ value: n, label: n }))
  const priorityChip = lead ? (PRIORITY_CHIP[lead.lead_priority] ?? undefined) : undefined

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full bg-card text-text border-l border-border p-0 sm:max-w-[520px]"
      >
        {!lead ? null : (
          <>
            {/* ── Header band ───────────────────────────────────────────── */}
            <SheetHeader className="px-5 pt-5 pb-4 border-b border-border bg-elevated/40">
              <div className="flex items-start gap-3 pr-8">
                <span
                  aria-hidden
                  className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-full text-body font-bold"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
                    color: 'var(--color-accent)',
                    border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
                  }}
                >
                  {initials(lead.full_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-1.5">
                    <SheetTitle className="text-heading font-bold text-text truncate min-w-0">
                      {lead.full_name || 'Unknown lead'}
                    </SheetTitle>
                    {onToggleFavorite && (
                      <FavoriteStar
                        active={isFavorite}
                        onToggle={onToggleFavorite}
                        label={lead.full_name || 'lead'}
                        size="md"
                        className="shrink-0 -mt-0.5"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge tone={statusTone(lead.lead_status)}>
                      {STATUS_LABELS[lead.lead_status] || lead.lead_status}
                    </Badge>
                    {lead.lead_priority && (
                      <Badge tone={priorityTone(lead.lead_priority)}>{lead.lead_priority}</Badge>
                    )}
                    {lead.lead_score !== undefined && (
                      <span className="text-caption text-dim">Score {lead.lead_score}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick actions */}
              <div className="flex items-center gap-2 mt-4">
                <a
                  href={waLink(lead.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Message ${lead.full_name} on WhatsApp`}
                  className="inline-flex items-center gap-1.5 text-caption font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-green-400 hover:bg-green-400/10 border border-green-400/30 focus-ring"
                >
                  <MessageCircle className="w-3.5 h-3.5" strokeWidth={2} />
                  WhatsApp
                </a>
                <a
                  href={`tel:${(lead.phone || '').replace(/\D/g, '')}`}
                  aria-label={`Call ${lead.full_name}`}
                  className="inline-flex items-center gap-1.5 text-caption font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-accent hover:bg-accent/10 border border-accent/30 focus-ring"
                >
                  <Phone className="w-3.5 h-3.5" strokeWidth={2} />
                  Call
                </a>
                <Link
                  href={`/leads/${lead.row_number}`}
                  className="ml-auto inline-flex items-center gap-1 text-caption font-medium text-dim hover:text-accent transition-colors cursor-pointer focus-ring rounded px-1"
                >
                  Open full page
                  <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={2} />
                </Link>
              </div>
              <p className="text-caption text-dim mt-2 font-mono">{lead.phone}</p>
            </SheetHeader>

            {/* ── Scrollable body ───────────────────────────────────────── */}
            <ScrollArea className="h-[calc(100vh-188px)]">
              <div className="px-5 py-3 divide-y divide-border/50">
                {/* Inline-editable: status */}
                <FieldRow icon={<Tag className="w-3.5 h-3.5" />} label="Status">
                  <StatusEditPopover
                    leadId={lead.row_number}
                    value={lead.lead_status}
                    onChange={(next) => onPatch(lead.row_number, { lead_status: next })}
                    size="sm"
                  />
                </FieldRow>

                {/* Inline-editable: priority */}
                <FieldRow icon={<Tag className="w-3.5 h-3.5" />} label="Priority">
                  <InlineSelect
                    value={lead.lead_priority}
                    options={PRIORITY_OPTIONS}
                    onChange={savePriority}
                    colors={priorityChip}
                    ariaLabel="Edit priority"
                  />
                </FieldRow>

                {/* Inline-editable: assignee */}
                <FieldRow icon={<User className="w-3.5 h-3.5" />} label="Assignee">
                  {canAssign ? (
                    <InlineSelect
                      value={lead.assigned_to}
                      options={assigneeOptions}
                      onChange={saveAssignee}
                      placeholder="Unassigned"
                      ariaLabel="Edit assignee"
                    />
                  ) : (
                    <span className="text-body">
                      {lead.assigned_to || <span className="text-accent/50 italic">Unassigned</span>}
                    </span>
                  )}
                </FieldRow>

                {/* Inline-editable: next follow-up */}
                <FieldRow icon={<Clock className="w-3.5 h-3.5" />} label="Follow-up">
                  <FollowupDatePicker value={lead.next_followup} onChange={saveFollowup} />
                </FieldRow>

                {/* Read-only context */}
                <FieldRow icon={<MapPin className="w-3.5 h-3.5" />} label="Location">
                  <span className="text-body">
                    {lead.city || lead.state ? (
                      <>{lead.city}{lead.city && lead.state ? ', ' : ''}{lead.state}</>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </span>
                </FieldRow>

                <FieldRow icon={<Tag className="w-3.5 h-3.5" />} label="Interest">
                  <span className="text-body">
                    {lead.model_interest || <span className="text-dim">—</span>}
                  </span>
                </FieldRow>

                <FieldRow icon={<Clock className="w-3.5 h-3.5" />} label="Created">
                  <span className="text-body">{timeAgo(lead.created_time)}</span>
                </FieldRow>

                {/* Notes — textarea + explicit Save */}
                <div className="py-3">
                  <div className="flex items-center gap-2 text-dim mb-2">
                    <StickyNote className="w-3.5 h-3.5" />
                    <span className="text-eyebrow uppercase tracking-wider">Notes</span>
                  </div>
                  <Textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Add context, objections, next steps…"
                    rows={4}
                    className="resize-none bg-elevated"
                  />
                  <div className="flex items-center justify-end gap-2 mt-2">
                    {notesDraft !== (lead.notes ?? '') && (
                      <button
                        type="button"
                        onClick={() => setNotesDraft(lead.notes ?? '')}
                        className="text-caption text-dim hover:text-text transition-colors cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={saveNotes}
                      disabled={savingNotes || notesDraft === (lead.notes ?? '')}
                      className="inline-flex items-center gap-1.5 text-caption font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-colors bg-accent/10 hover:bg-accent/20 text-accent disabled:opacity-40 disabled:cursor-not-allowed focus-ring"
                    >
                      {savingNotes && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Save notes
                    </button>
                  </div>
                </div>

                {/* Recent activity */}
                <div className="py-3">
                  <div className="flex items-center gap-2 text-dim mb-2">
                    <History className="w-3.5 h-3.5" />
                    <span className="text-eyebrow uppercase tracking-wider">Recent activity</span>
                  </div>
                  {activityLoading ? (
                    <div className="space-y-2">
                      {[0, 1, 2].map((i) => <div key={i} className="skeleton h-4 w-full" />)}
                    </div>
                  ) : activity.length === 0 ? (
                    <p className="text-caption text-dim">
                      {lead.last_discussion?.text
                        ? lead.last_discussion.text
                        : 'No recent activity recorded.'}
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {activity.map((a, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span
                            aria-hidden
                            className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: 'var(--color-accent)' }}
                          />
                          <div className="min-w-0">
                            <p className="text-caption text-body">{a.label}</p>
                            <p className="text-eyebrow text-dim">
                              {a.by}{a.at ? ` · ${timeAgo(a.at)}` : ''}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
