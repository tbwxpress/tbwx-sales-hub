'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Crown,
  Loader2,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  Sparkles,
  User2,
} from 'lucide-react'
import Badge, { statusTone } from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ── API contract (raw shapes — these endpoints do NOT wrap in {success,data}) ──
interface DuplicateLead {
  row_number: number
  full_name: string
  phone: string
  city: string
  lead_status: string
  assigned_to: string
  created_time: string
  message_count: number
}
interface DuplicateGroup {
  phone: string
  leads: DuplicateLead[]
}
interface MergeResult {
  merged: number
  targetRow: number
  moved: Record<string, number>
}

// "Richest" lead = most messages; tie-break = oldest created_time.
function pickDefaultTarget(leads: DuplicateLead[]): number {
  return [...leads].sort((a, b) => {
    if (b.message_count !== a.message_count) return b.message_count - a.message_count
    const ta = Date.parse(a.created_time) || Number.POSITIVE_INFINITY
    const tb = Date.parse(b.created_time) || Number.POSITIVE_INFINITY
    return ta - tb
  })[0].row_number
}

function formatDate(raw: string): string {
  const t = Date.parse(raw)
  if (Number.isNaN(t)) return raw || '—'
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function prettyPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '')
  const last10 = digits.slice(-10)
  if (last10.length !== 10) return phone || '—'
  const cc = digits.slice(0, -10)
  return `${cc ? `+${cc} ` : ''}${last10.slice(0, 5)} ${last10.slice(5)}`
}

// ── Per-group selection: chosen target + the set of source rows to merge in ──
interface GroupSelection {
  target: number
  sources: Set<number>
}

export default function DuplicateMergeTool() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selection, setSelection] = useState<Record<string, GroupSelection>>({})
  const [confirmPhone, setConfirmPhone] = useState<string | null>(null)
  const [merging, setMerging] = useState<string | null>(null)

  const buildSelection = useCallback((gs: DuplicateGroup[]): Record<string, GroupSelection> => {
    const next: Record<string, GroupSelection> = {}
    for (const g of gs) {
      const target = pickDefaultTarget(g.leads)
      next[g.phone] = {
        target,
        sources: new Set(g.leads.map(l => l.row_number).filter(r => r !== target)),
      }
    }
    return next
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/leads/duplicates')
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to load duplicates')
      const gs: DuplicateGroup[] = Array.isArray(data?.groups) ? data.groups : []
      setGroups(gs)
      setSelection(buildSelection(gs))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load duplicates')
    } finally {
      setLoading(false)
    }
  }, [buildSelection])

  useEffect(() => {
    load()
  }, [load])

  // Choosing a new target: that row leaves the source set, the previous target joins it.
  function chooseTarget(phone: string, row: number) {
    setSelection(prev => {
      const cur = prev[phone]
      if (!cur || cur.target === row) return prev
      const sources = new Set(cur.sources)
      sources.delete(row)
      sources.add(cur.target)
      return { ...prev, [phone]: { target: row, sources } }
    })
  }

  function toggleSource(phone: string, row: number) {
    setSelection(prev => {
      const cur = prev[phone]
      if (!cur || cur.target === row) return prev
      const sources = new Set(cur.sources)
      if (sources.has(row)) sources.delete(row)
      else sources.add(row)
      return { ...prev, [phone]: { ...cur, sources } }
    })
  }

  const confirmGroup = useMemo(
    () => groups.find(g => g.phone === confirmPhone) || null,
    [groups, confirmPhone],
  )
  const confirmSel = confirmPhone ? selection[confirmPhone] : undefined
  const confirmTargetLead = confirmGroup?.leads.find(l => l.row_number === confirmSel?.target)

  async function runMerge(phone: string) {
    const sel = selection[phone]
    if (!sel || sel.sources.size === 0) return
    setMerging(phone)
    try {
      const res = await fetch('/api/leads/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRow: sel.target, sourceRows: Array.from(sel.sources) }),
      })
      const data: MergeResult & { error?: string } = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Merge failed')
      const movedTotal = Object.values(data.moved || {}).reduce((a, b) => a + b, 0)
      toast.success(
        `Merged ${data.merged} lead${data.merged === 1 ? '' : 's'} into #${data.targetRow}`,
        { description: `${movedTotal} record${movedTotal === 1 ? '' : 's'} of history moved over. Sources archived — fully reversible.` },
      )
      // Drop the resolved group from the list + its selection.
      setGroups(prev => prev.filter(g => g.phone !== phone))
      setSelection(prev => {
        const next = { ...prev }
        delete next[phone]
        return next
      })
      setConfirmPhone(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Merge failed')
    } finally {
      setMerging(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Explainer header + refresh ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-accent-soft)' }}>
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-text">Find &amp; merge duplicate leads</h2>
            <p className="text-sm text-dim mt-0.5 leading-relaxed max-w-xl">
              Leads that share the same phone number are grouped below. Pick the one to keep
              (the <span className="text-body font-medium">target</span>) — the rest are folded into it.
              Merging is <span className="text-accent font-medium">reversible</span>: sources are archived and
              their history is moved over, never deleted.
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="self-start inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-border bg-elevated hover:bg-border text-muted hover:text-text transition-colors disabled:opacity-50 cursor-pointer focus-ring shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── States: loading → error → empty → groups ── */}
      {loading ? (
        <GroupSkeletons />
      ) : error ? (
        <div
          className="rounded-xl p-4 flex items-start gap-3 animate-fade-in"
          style={{
            background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)',
          }}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--color-danger)' }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text">Couldn&apos;t load duplicates</p>
            <p className="text-xs text-dim mt-0.5">{error}</p>
          </div>
          <button onClick={load} className="text-xs font-medium text-accent hover:text-accent-hover transition-colors cursor-pointer shrink-0">
            Try again
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-card border border-border rounded-xl animate-fade-in">
          <EmptyState
            icon={<CheckCircle2 className="w-12 h-12" style={{ color: 'var(--color-success)' }} />}
            title="No duplicate leads found ✅"
            hint="Everything looks clean — no two leads are sharing a phone number right now."
          />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-dim">
            {groups.length} duplicate group{groups.length === 1 ? '' : 's'} ·{' '}
            {groups.reduce((n, g) => n + g.leads.length, 0)} leads involved
          </p>
          {groups.map(group => {
            const sel = selection[group.phone]
            if (!sel) return null
            const sourceCount = sel.sources.size
            const isMerging = merging === group.phone
            // Keep the richest-first reading order stable within a group.
            const ordered = [...group.leads].sort((a, b) => {
              if (b.message_count !== a.message_count) return b.message_count - a.message_count
              return (Date.parse(a.created_time) || 0) - (Date.parse(b.created_time) || 0)
            })
            return (
              <div
                key={group.phone}
                className="card-hover bg-card border border-border rounded-xl overflow-hidden animate-fade-in"
              >
                {/* Group header — shared phone */}
                <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border bg-elevated/40">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-accent-soft)' }}>
                      <Phone className="w-4 h-4 text-accent" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-text font-mono tracking-tight truncate">{prettyPhone(group.phone)}</p>
                      <p className="text-[11px] text-dim">{group.leads.length} leads share this number</p>
                    </div>
                  </div>
                  <Badge tone="hot">{group.leads.length}×</Badge>
                </div>

                {/* Selectable lead rows */}
                <div className="divide-y divide-border/60" role="radiogroup" aria-label={`Choose lead to keep for ${prettyPhone(group.phone)}`}>
                  {ordered.map(lead => {
                    const isTarget = sel.target === lead.row_number
                    const isSource = sel.sources.has(lead.row_number)
                    return (
                      <div
                        key={lead.row_number}
                        className={`flex flex-col gap-3 px-4 sm:px-5 py-3 transition-colors sm:flex-row sm:items-center ${
                          isTarget ? 'bg-accent/[0.06]' : isSource ? '' : 'opacity-60'
                        }`}
                        style={isTarget ? { boxShadow: 'inset 3px 0 0 var(--color-accent)' } : undefined}
                      >
                        {/* Keep / target radio */}
                        <label className="flex items-center gap-2.5 cursor-pointer shrink-0">
                          <input
                            type="radio"
                            name={`target-${group.phone}`}
                            checked={isTarget}
                            onChange={() => chooseTarget(group.phone, lead.row_number)}
                            className="w-4 h-4 accent-accent cursor-pointer focus-ring rounded-full"
                            aria-label={`Keep ${lead.full_name || `lead #${lead.row_number}`} as the target`}
                          />
                          {isTarget ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-accent">
                              <Crown className="w-3 h-3" /> Keep
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-dim">Merge in</span>
                          )}
                        </label>

                        {/* Identity + meta */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-text truncate">
                              {lead.full_name || <span className="text-dim italic">Unnamed</span>}
                            </span>
                            <span className="text-[11px] text-dim font-mono">#{lead.row_number}</span>
                            <Badge tone={statusTone(lead.lead_status)}>{lead.lead_status || 'NEW'}</Badge>
                          </div>
                          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1 text-[11px] text-dim">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {lead.city || '—'}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <User2 className="w-3 h-3" /> {lead.assigned_to || 'Unassigned'}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" />
                              <span className={lead.message_count > 0 ? 'text-body font-medium' : ''}>
                                {lead.message_count} msg{lead.message_count === 1 ? '' : 's'}
                              </span>
                            </span>
                            <span>{formatDate(lead.created_time)}</span>
                          </div>
                        </div>

                        {/* Per-source exclude toggle (targets aren't toggleable) */}
                        {!isTarget && (
                          <label className="flex items-center gap-2 cursor-pointer shrink-0 self-start sm:self-center">
                            <input
                              type="checkbox"
                              checked={isSource}
                              onChange={() => toggleSource(group.phone, lead.row_number)}
                              className="w-4 h-4 accent-accent cursor-pointer focus-ring rounded"
                              aria-label={`Include ${lead.full_name || `lead #${lead.row_number}`} in the merge`}
                            />
                            <span className="text-[11px] text-dim">{isSource ? 'Included' : 'Excluded'}</span>
                          </label>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Action bar */}
                <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-border bg-elevated/40">
                  <p className="text-[11px] text-dim min-w-0">
                    {sourceCount === 0
                      ? 'Select at least one lead to merge in.'
                      : <>Merging <span className="text-body font-medium">{sourceCount}</span> into{' '}
                          <span className="text-accent font-medium">#{sel.target}</span></>}
                  </p>
                  <button
                    onClick={() => setConfirmPhone(group.phone)}
                    disabled={sourceCount === 0 || isMerging}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-[#1a1209] transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer focus-ring shrink-0"
                  >
                    {isMerging ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Merging…</>
                    ) : (
                      <>Merge {sourceCount || ''} into target <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Confirm dialog ── */}
      <Dialog open={confirmPhone !== null} onOpenChange={open => { if (!open && !merging) setConfirmPhone(null) }}>
        <DialogContent showCloseButton={false} className="border border-border" style={{ background: 'var(--color-card)' }}>
          <DialogHeader>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-1" style={{ background: 'var(--color-accent-soft)' }}>
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <DialogTitle className="text-text">Merge {confirmSel?.sources.size ?? 0} lead{(confirmSel?.sources.size ?? 0) === 1 ? '' : 's'} into the target?</DialogTitle>
            <DialogDescription className="text-dim">
              {confirmTargetLead
                ? <>Everything will be folded into <span className="text-accent font-medium">{confirmTargetLead.full_name || `lead #${confirmTargetLead.row_number}`}</span> (#{confirmTargetLead.row_number}) on{' '}
                    <span className="font-mono">{prettyPhone(confirmGroup?.phone || '')}</span>.</>
                : 'Confirm the merge.'}
            </DialogDescription>
          </DialogHeader>

          {/* Reversibility reassurance */}
          <div
            className="rounded-lg p-3 flex items-start gap-2.5"
            style={{ background: 'color-mix(in srgb, var(--color-success) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-success) 22%, transparent)' }}
          >
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--color-success)' }} />
            <p className="text-xs leading-relaxed text-body">
              This is <span className="font-semibold" style={{ color: 'var(--color-success)' }}>reversible</span>. The source leads are
              <span className="font-medium"> archived</span> (not deleted) and all their messages, tasks and history are moved onto the target.
            </p>
          </div>

          <DialogFooter>
            <DialogClose
              disabled={merging !== null}
              className="text-sm font-medium px-4 py-2 rounded-lg border border-border bg-elevated hover:bg-border text-muted hover:text-text transition-colors disabled:opacity-50 cursor-pointer focus-ring"
            >
              Cancel
            </DialogClose>
            <button
              onClick={() => confirmPhone && runMerge(confirmPhone)}
              disabled={merging !== null || !confirmSel || confirmSel.sources.size === 0}
              className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-[#1a1209] transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer focus-ring"
            >
              {merging !== null ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Merging…</>
              ) : (
                <>Confirm merge <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Loading skeletons — mirror the group-card silhouette ──
function GroupSkeletons() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading duplicate leads">
      {[0, 1].map(i => (
        <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-elevated/40">
            <div className="flex items-center gap-2.5">
              <div className="skeleton w-8 h-8 rounded-lg" />
              <div className="space-y-1.5">
                <div className="skeleton h-3.5 w-32 rounded" />
                <div className="skeleton h-2.5 w-24 rounded" />
              </div>
            </div>
            <div className="skeleton h-5 w-8 rounded-full" />
          </div>
          {[0, 1].map(j => (
            <div key={j} className="flex items-center gap-3 px-5 py-3.5 border-b border-border/60 last:border-0">
              <div className="skeleton w-4 h-4 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3.5 w-40 rounded" />
                <div className="skeleton h-2.5 w-56 rounded" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
