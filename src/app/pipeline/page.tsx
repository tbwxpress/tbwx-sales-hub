'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'

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

const PIPELINE_STAGES = [
  'NEW',
  'DECK_SENT',
  'REPLIED',
  'CALLING',
  'CALL_DONE',
  'INTERESTED',
  'NEGOTIATION',
  'CONVERTED',
  'DELAYED',
  'LOST',
] as const

type Stage = typeof PIPELINE_STAGES[number]

const STAGE_LABELS: Record<Stage, string> = {
  NEW: 'New',
  DECK_SENT: 'Deck Sent',
  REPLIED: 'Replied',
  CALLING: 'Calling',
  CALL_DONE: 'Call Done',
  INTERESTED: 'Interested',
  NEGOTIATION: 'Negotiation',
  CONVERTED: 'Converted',
  DELAYED: 'Delayed',
  LOST: 'Lost',
}

const PRIORITY_BORDER: Record<string, string> = {
  HOT: '#fb923c',
  WARM: '#fbbf24',
  COLD: '#60a5fa',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function maskPhone(phone: string): string {
  if (!phone) return '-'
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return phone
  return '****' + digits.slice(-4)
}

// ─── Toast Component ─────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] toast-enter">
      <div className="bg-accent text-[#1a1209] px-5 py-2.5 rounded-lg shadow-xl shadow-black/30 text-sm font-medium flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        {message}
      </div>
    </div>
  )
}

// ─── Lead Card ───────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  onMove,
}: {
  lead: Lead
  onMove: (rowNum: number, newStatus: string) => void
}) {
  const [showMove, setShowMove] = useState(false)
  const borderColor = PRIORITY_BORDER[lead.lead_priority] || '#444'

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
      className="card-hover bg-elevated rounded-lg p-3.5 cursor-grab active:cursor-grabbing relative"
      style={{
        borderLeft: `3px solid ${borderColor}`,
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.15)',
      }}
      onClick={() => setShowMove(!showMove)}
    >
      {/* Name */}
      <Link
        href={`/leads/${lead.row_number}`}
        className="text-sm font-medium text-accent hover:text-accent-hover transition-colors block truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {lead.full_name || 'Unknown'}
      </Link>

      {/* City + Phone */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-muted truncate">{lead.city || '-'}</span>
        <span className="text-[10px] text-dim font-mono">{maskPhone(lead.phone)}</span>
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
            {PIPELINE_STAGES.map(s => (
              <option key={s} value={s} style={{ backgroundColor: 'var(--color-option-bg)', color: 'var(--color-option-text)' }}>
                {STAGE_LABELS[s]}
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

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

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

      // Fetch leads
      const leadsRes = await fetch('/api/leads')
      const leadsData = await leadsRes.json()
      if (leadsData.success) {
        setLeads(leadsData.data)
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

  async function moveLead(rowNum: number, newStatus: string) {
    try {
      const res = await fetch(`/api/leads/${rowNum}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_status: newStatus }),
      })
      const data = await res.json()
      if (data.success) {
        setLeads(prev =>
          prev.map(l => (l.row_number === rowNum ? { ...l, lead_status: newStatus } : l))
        )
        setToast(`Moved to ${STAGE_LABELS[newStatus as Stage] || newStatus}`)
      } else {
        setError(data.error || 'Move failed')
      }
    } catch {
      setError('Move failed')
    }
  }

  // ─── Group leads by stage ────────────────────────────────────────────────

  const leadsByStage: Record<string, Lead[]> = {}
  for (const stage of PIPELINE_STAGES) {
    leadsByStage[stage] = []
  }
  for (const lead of leads) {
    const stage = lead.lead_status
    if (leadsByStage[stage]) {
      leadsByStage[stage].push(lead)
    } else {
      // If status doesn't match any pipeline stage, put in NEW
      leadsByStage['NEW'].push(lead)
    }
  }

  // ─── Stats ───────────────────────────────────────────────────────────────

  const totalLeads = leads.length
  const convertedCount = leadsByStage['CONVERTED'].length
  const conversionRate = totalLeads > 0 ? ((convertedCount / totalLeads) * 100).toFixed(1) : '0.0'

  // ─── Loading State ─────────────────────────────────────────────────────

  if (loading) {
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
        <div className="max-w-7xl mx-auto mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-text">Sales Pipeline</h1>
            <p className="text-xs text-muted mt-0.5">Drag cards between columns or click to move</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="stat-card bg-card border border-border rounded-lg px-4 py-2 flex items-center gap-3">
              <div className="text-center">
                <p className="text-lg font-bold text-text">{totalLeads}</p>
                <p className="text-[10px] text-dim uppercase tracking-wider">Total</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="text-center">
                <p className="text-lg font-bold text-success">{convertedCount}</p>
                <p className="text-[10px] text-dim uppercase tracking-wider">Won</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="text-center">
                <p className="text-lg font-bold text-accent">{conversionRate}%</p>
                <p className="text-[10px] text-dim uppercase tracking-wider">Rate</p>
              </div>
            </div>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="overflow-x-auto pb-4 kanban-scroll">
          <div className="flex gap-3" style={{ minWidth: `${PIPELINE_STAGES.length * 252}px` }}>
            {PIPELINE_STAGES.map(stage => {
              const stageleads = leadsByStage[stage]
              const isConverted = stage === 'CONVERTED'
              const isLost = stage === 'LOST'
              const isDelayed = stage === 'DELAYED'

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
                      : isConverted
                        ? 'bg-card border-success/30'
                        : isDelayed
                          ? 'bg-card/60 border-amber-500/20'
                          : isLost
                            ? 'bg-card/60 border-danger/20'
                            : 'bg-card border-border'
                  }`}
                >
                  {/* Column Header */}
                  <div
                    className={`sticky top-0 z-10 px-3 py-2.5 border-b rounded-t-xl flex items-center justify-between ${
                      isConverted
                        ? 'bg-card border-success/20'
                        : isDelayed
                          ? 'bg-card/60 border-amber-500/15'
                          : isLost
                            ? 'bg-card/60 border-danger/15'
                            : 'bg-card border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isConverted && (
                        <span className="w-2 h-2 rounded-full bg-success" />
                      )}
                      {isDelayed && (
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                      )}
                      {isLost && (
                        <span className="w-2 h-2 rounded-full bg-danger" />
                      )}
                      <h3
                        className={`text-xs font-semibold uppercase tracking-wider ${
                          isConverted
                            ? 'text-success'
                            : isDelayed
                              ? 'text-amber-500/70'
                              : isLost
                                ? 'text-danger/70'
                                : 'text-muted'
                        }`}
                      >
                        {STAGE_LABELS[stage]}
                      </h3>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        isConverted
                          ? 'bg-success/15 text-success'
                          : isDelayed
                            ? 'bg-amber-500/10 text-amber-500/60'
                            : isLost
                              ? 'bg-danger/10 text-danger/60'
                              : 'bg-elevated/60 text-dim backdrop-blur-sm border border-border/30'
                      }`}
                    >
                      {stageleads.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className={`flex-1 overflow-y-auto p-2 space-y-2 ${isLost || isDelayed ? 'opacity-60' : ''}`}>
                    {stageleads.length === 0 ? (
                      <div className="text-center py-8 border border-dashed border-border/50 rounded-lg mx-1 my-1">
                        <svg className="w-5 h-5 mx-auto text-dim/50 mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        <p className="text-[10px] text-dim/60">No leads</p>
                      </div>
                    ) : (
                      stageleads.map(lead => (
                        <LeadCard
                          key={lead.row_number}
                          lead={lead}
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

      <PoweredBy />

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}
