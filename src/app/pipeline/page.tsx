'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Copy, Check, Inbox, EyeOff } from 'lucide-react'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'
import { toast } from 'sonner'
import Badge, { statusTone } from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { timeAgo } from '@/lib/format'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { getStageMeta, type Stage } from '@/lib/stages'
import LostReasonDialog from '@/components/leads/LostReasonDialog'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Lead {
  row_number: number
  full_name: string
  phone: string
  city: string
  lead_status: string
  lead_priority: string
  assigned_to: string
  created_time: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

import { STATUS_MIGRATION } from '@/config/client'

const PRIORITY_BORDER: Record<string, string> = {
  HOT: '#fb923c',
  WARM: '#fbbf24',
  COLD: '#60a5fa',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPhone(phone: string): string {
  if (!phone) return '-'
  const digits = phone.replace(/\D/g, '')
  // Indian mobile: last 10 digits formatted as XXXXX XXXXX
  if (digits.length >= 10) {
    const d10 = digits.slice(-10)
    return d10.slice(0, 5) + ' ' + d10.slice(5)
  }
  return phone
}

// ─── Lead Card ───────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  stages,
  onMove,
}: {
  lead: Lead
  stages: Stage[]
  onMove: (rowNum: number, newStatus: string) => void
}) {
  const [showMove, setShowMove] = useState(false)
  const [copied, setCopied] = useState(false)
  const borderColor = PRIORITY_BORDER[lead.lead_priority] || '#444'
  const isHot = lead.lead_priority === 'HOT'

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    const digits = lead.phone.replace(/\D/g, '')
    navigator.clipboard.writeText(digits).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {/* clipboard unavailable */})
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ rowNum: lead.row_number, fromStage: lead.lead_status }))
        e.dataTransfer.effectAllowed = 'move'
        // Add a slight delay for the drag ghost opacity
        const el = e.currentTarget as HTMLElement
        requestAnimationFrame(() => el.style.opacity = '0.4')
      }}
      onDragEnd={(e) => {
        (e.currentTarget as HTMLElement).style.opacity = '1'
      }}
      className="card-hover bg-card rounded-lg p-3.5 cursor-grab active:cursor-grabbing relative"
      style={{
        borderLeft: `3px solid ${borderColor}`,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)',
      }}
      onClick={() => setShowMove(!showMove)}
    >
      {/* HOT badge — top-right */}
      {isHot && (
        <div className="absolute top-2 right-2">
          <Badge tone="hot">🔥 HOT</Badge>
        </div>
      )}

      {/* Name */}
      <Link
        href={`/leads/${lead.row_number}`}
        className={`text-body text-text hover:text-accent transition-colors block truncate ${isHot ? 'pr-16' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {lead.full_name || 'Unknown'}
      </Link>

      {/* City + Phone + Copy */}
      <div className="flex items-center justify-between mt-2 gap-1">
        <span className="text-xs text-muted truncate">{lead.city || '-'}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-caption text-dim font-mono">{formatPhone(lead.phone)}</span>
          <button
            onClick={handleCopy}
            title="Copy phone"
            className="text-dim hover:text-accent transition-colors p-0.5 rounded"
          >
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Assigned + Time */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-dim truncate">
          {lead.assigned_to || <span className="italic text-accent/40">Unassigned</span>}
        </span>
        <span className="text-[10px] text-dim">{timeAgo(lead.created_time)}</span>
      </div>

      {/* Move dropdown (fallback for non-drag) */}
      {showMove && (
        <div className="mt-2.5 pt-2.5 border-t border-border animate-scale-in">
          <select
            value={lead.lead_status}
            onChange={(e) => {
              onMove(lead.row_number, e.target.value)
              setShowMove(false)
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full glass rounded-md px-2 py-1.5 text-xs text-text focus:outline-none focus:border-accent/50"
          >
            {/* Keep the lead's current status selectable even if it's no longer an active stage */}
            {!stages.some(s => s.key === lead.lead_status) && (
              <option value={lead.lead_status} style={{ backgroundColor: 'var(--color-option-bg)', color: 'var(--color-option-text)' }}>
                {getStageMeta(stages, lead.lead_status).label} (current)
              </option>
            )}
            {stages.map(s => (
              <option key={s.key} value={s.key} style={{ backgroundColor: 'var(--color-option-bg)', color: 'var(--color-option-text)' }}>
                {getStageMeta(stages, s.key).label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PipelinePage() {
  const router = useRouter()

  const { stages: allStages, loading: stagesLoading } = usePipelineStages()

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<{ name: string; role: string; can_assign: boolean } | null>(null)
  const [agents, setAgents] = useState<{ name: string }[]>([])
  const [agentFilter, setAgentFilter] = useState('')
  // Pending lost move — set when a status change to a lost stage needs a reason.
  const [pendingLost, setPendingLost] = useState<{ rowNum: number; status: string } | null>(null)
  const [savingLost, setSavingLost] = useState(false)

  // Active stages, ordered. Memoized so the columns array is stable.
  const activeStages = useMemo(
    () => [...allStages].sort((a, b) => a.sortOrder - b.sortOrder),
    [allStages],
  )

  // ─── Auth + Data ─────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      // Auth check
      const authRes = await fetch('/api/auth/me')
      const authData = await authRes.json()
      if (!authData.success) {
        router.push('/login')
        return
      }
      setCurrentUser(authData.data)

      // Fetch agents for admin filter
      if (authData.data.role === 'admin') {
        try {
          const usersRes = await fetch('/api/users')
          const usersData = await usersRes.json()
          if (usersData.success) {
            setAgents(usersData.data.filter((u: { active: boolean }) => u.active))
          }
        } catch { /* non-critical */ }
      }

      // Fetch leads (API already handles agent scoping)
      const leadsRes = await fetch('/api/leads')
      const leadsData = await leadsRes.json()
      if (leadsData.success) {
        // Migrate any old status values to new names
        const migrated = (leadsData.data as Lead[]).map(l => ({
          ...l,
          lead_status: STATUS_MIGRATION[l.lead_status] || l.lead_status,
        }))
        setLeads(migrated)
      } else {
        setError(leadsData.error || 'Failed to load leads')
      }
    } catch {
      setError('Failed to load data')
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── Move Lead ───────────────────────────────────────────────────────────

  async function moveLead(rowNum: number, newStatus: string, extra?: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch(`/api/leads/${rowNum}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_status: newStatus, ...(extra || {}) }),
      })
      const data = await res.json()
      if (data.success) {
        setLeads(prev =>
          prev.map(l => (l.row_number === rowNum ? { ...l, lead_status: newStatus } : l))
        )
        toast.success(`Moved to ${getStageMeta(allStages, newStatus).label || newStatus}`)
        return true
      } else if (res.status === 422 && data.code === 'LOST_REASON_REQUIRED') {
        // A lost stage needs a reason — open the picker; its confirm re-submits.
        setPendingLost({ rowNum, status: newStatus })
      } else if (res.status === 422 && data.code === 'MIN_ATTEMPTS_NOT_MET') {
        toast.error(data.error || 'Log more call attempts before No Response')
      } else {
        setError(data.error || 'Move failed')
      }
    } catch {
      setError('Move failed')
    }
    return false
  }

  async function confirmLostMove(reason: string, note: string) {
    if (!pendingLost) return
    setSavingLost(true)
    const ok = await moveLead(pendingLost.rowNum, pendingLost.status, {
      lost_reason: reason,
      lost_reason_note: note || undefined,
    })
    setSavingLost(false)
    if (ok) setPendingLost(null)
  }

  // ─── Group leads by stage ────────────────────────────────────────────────

  // Apply agent filter (admin only)
  const filteredLeads = agentFilter
    ? leads.filter(l => l.assigned_to === agentFilter)
    : leads

  // Columns = active stages, in order. Plus any "orphan" stages (a lead's
  // status that is no longer an active stage) appended as read-only columns so
  // those leads never disappear from the board.
  const { columns, leadsByStage } = useMemo(() => {
    const activeKeys = activeStages.map(s => s.key)
    const byStage: Record<string, Lead[]> = {}
    for (const k of activeKeys) byStage[k] = []

    // Discover orphan stages from the current lead set, preserving first-seen order.
    // An orphan is any lead_status not present in the active stage list — its
    // leads still need a home so they never disappear from the board.
    const orphanKeys: string[] = []
    for (const lead of filteredLeads) {
      const k = lead.lead_status
      if (!byStage[k]) { byStage[k] = []; orphanKeys.push(k) }
      byStage[k].push(lead)
    }

    const cols = [
      ...activeStages.map(s => ({ key: s.key, orphan: false })),
      ...orphanKeys.map(k => ({ key: k, orphan: true })),
    ]
    return { columns: cols, leadsByStage: byStage }
  }, [activeStages, filteredLeads])

  // ─── Stats ───────────────────────────────────────────────────────────────

  const totalLeads = filteredLeads.length
  const wonKeys = useMemo(() => new Set(allStages.filter(s => s.isWon).map(s => s.key)), [allStages])
  const convertedCount = filteredLeads.filter(l => wonKeys.has(l.lead_status) || l.lead_status === 'CONVERTED').length
  const conversionRate = totalLeads > 0 ? ((convertedCount / totalLeads) * 100).toFixed(1) : '0.0'

  // ─── Loading State ─────────────────────────────────────────────────────

  if (loading || stagesLoading) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-56px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-muted text-sm">Loading pipeline...</span>
          </div>
        </div>
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />

      <main className="px-4 sm:px-6 lg:px-8 py-6 animate-fade-in">
        {/* Error Banner */}
        {error && (
          <div className="max-w-7xl mx-auto mb-4 px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-danger hover:text-red-300 ml-4">
              Dismiss
            </button>
          </div>
        )}

        {/* Header with stats */}
        <div className="max-w-7xl mx-auto mb-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
                Sales Pipeline
                {agentFilter && <span className="text-accent ml-2 text-base font-medium">— {agentFilter}</span>}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>Drag cards between columns or click to move</p>
            </div>
            {currentUser?.role === 'admin' && agents.length > 0 && (
              <select
                value={agentFilter}
                onChange={e => setAgentFilter(e.target.value)}
                className="bg-elevated border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50"
              >
                <option value="">All Agents</option>
                {agents.map(a => (
                  <option key={a.name} value={a.name}>{a.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl p-4 border" style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
              <div className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>Total Leads</div>
              <div className="text-3xl font-extrabold leading-none" style={{ color: 'var(--color-accent)' }}>{totalLeads}</div>
            </div>
            <div className="rounded-xl p-4 border" style={{ background: 'var(--color-card)', borderColor: 'rgba(34,197,94,0.2)' }}>
              <div className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>Won</div>
              <div className="text-3xl font-extrabold leading-none" style={{ color: 'var(--color-success)' }}>{convertedCount}</div>
            </div>
            <div className="rounded-xl p-4 border" style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
              <div className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>Conversion Rate</div>
              <div className="text-3xl font-extrabold leading-none" style={{ color: 'var(--color-accent)' }}>{conversionRate}%</div>
            </div>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="overflow-x-auto pb-4 kanban-scroll">
          <div className="flex gap-3" style={{ minWidth: `${columns.length * 252}px` }}>
            {columns.map(({ key: stage, orphan }) => {
              const stageleads = leadsByStage[stage] || []
              const meta = getStageMeta(allStages, stage)
              const stageObj = allStages.find(s => s.key === stage)
              const isWon = stageObj?.isWon || stage === 'CONVERTED'
              const isLost = stageObj?.isLost || stage === 'LOST'
              const isDragOver = dragOverStage === stage

              return (
                <div
                  key={stage}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOverStage(stage)
                  }}
                  onDragLeave={(e) => {
                    // Only clear if leaving the column entirely (not entering a child)
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverStage(null)
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOverStage(null)
                    try {
                      const data = JSON.parse(e.dataTransfer.getData('text/plain'))
                      if (data.fromStage !== stage) {
                        moveLead(data.rowNum, stage)
                      }
                    } catch { /* invalid drag data */ }
                  }}
                  className={`min-w-[240px] w-[240px] flex-shrink-0 rounded-xl border flex flex-col max-h-[calc(100vh-180px)] transition-all duration-200 ${
                    isDragOver
                      ? 'border-accent/60 bg-accent/5 ring-1 ring-accent/30'
                      : orphan
                        ? 'bg-card/50 border-dashed border-border'
                        : isWon
                          ? 'bg-card border-success/30'
                          : isLost
                            ? 'bg-card/60 border-danger/20'
                            : 'bg-card border-border'
                  }`}
                >
                  {/* Column Header */}
                  <div
                    className={`sticky top-0 z-10 px-3 py-2.5 border-b rounded-t-xl flex items-center justify-between ${
                      orphan
                        ? 'bg-card/50 border-border'
                        : isWon
                          ? 'bg-card border-success/20'
                          : isLost
                            ? 'bg-card/60 border-danger/15'
                            : 'bg-card border-border'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {/* Color dot from the stage meta when it's a hex; falls back to tone badge */}
                      {/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(meta.color) ? (
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                          <span className="text-[11px] font-semibold uppercase tracking-wide truncate text-body">{meta.label}</span>
                        </span>
                      ) : (
                        <Badge tone={statusTone(stage)}>{meta.label}</Badge>
                      )}
                      {orphan && (
                        <span title="Retired stage — existing leads kept here. Drag them to an active column." className="shrink-0">
                          <EyeOff className="w-3 h-3 text-dim" />
                        </span>
                      )}
                    </div>
                    <span className="text-caption text-dim">
                      {stageleads.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className={`flex-1 overflow-y-auto max-h-[calc(100vh-280px)] p-2 space-y-2 ${isLost || orphan ? 'opacity-70' : ''}`}>
                    {stageleads.length === 0 ? (
                      <div className="[&>div]:py-6">
                        <EmptyState
                          icon={<Inbox className="w-5 h-5" />}
                          title="No leads"
                          hint={orphan ? 'Retired stage' : 'Drop someone in this stage'}
                        />
                      </div>
                    ) : (
                      stageleads.map(lead => (
                        <LeadCard
                          key={lead.row_number}
                          lead={lead}
                          stages={activeStages}
                          onMove={moveLead}
                        />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {/* Lost-reason dialog — board moves (drag + dropdown) can't embed the
          inline picker, so a lost move bounces with LOST_REASON_REQUIRED and
          opens this instead. */}
      <LostReasonDialog
        open={!!pendingLost}
        stageLabel={pendingLost ? getStageMeta(allStages, pendingLost.status).label : 'Lost'}
        saving={savingLost}
        onConfirm={confirmLostMove}
        onCancel={() => setPendingLost(null)}
      />

      <PoweredBy />
    </div>
  )
}
