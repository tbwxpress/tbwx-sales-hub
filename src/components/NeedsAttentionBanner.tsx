'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

// Forced-followup banner. Polls /api/leads/needs-attention and renders a
// persistent banner with the leads the caller must touch right now. Closing
// the banner is intentionally NOT a dismiss — it only collapses the detail
// list. The banner stays mounted until the underlying leads have activity.
//
// Each lead row links straight to /leads/[id] where the existing call-log /
// notes / status flow takes over. There is deliberately no "snooze" button:
// the goal is to force the conversation, not let agents punt.

interface AttentionLead {
  row_number: number
  phone: string
  full_name: string
  city: string
  lead_status: string
  lead_priority: string
  assigned_to: string
  lead_score: number
  reason_code: 'overdue_followup' | 'stale_activity' | 'opportunity_check'
  reason_text: string
  hours_since_activity: number | null
  days_overdue: number | null
}

interface BannerData {
  count: number
  leads: AttentionLead[]
  by_reason: {
    overdue_followup: number
    stale_activity: number
    opportunity_check: number
  }
}

const REASON_LABEL: Record<AttentionLead['reason_code'], string> = {
  overdue_followup: 'Followup overdue',
  stale_activity: 'No recent activity',
  opportunity_check: 'Opportunity check',
}

const STATUS_TINT: Record<string, string> = {
  HOT: 'var(--color-status-hot)',
  FINAL_NEGOTIATION: 'var(--color-status-final-negotiation)',
  CALL_DONE_INTERESTED: 'var(--color-status-call-done-interested)',
  REPLIED: 'var(--color-status-replied)',
  DECK_SENT: 'var(--color-status-deck-sent)',
  NEW: 'var(--color-status-new)',
  NO_RESPONSE: 'var(--color-status-no-response)',
  DELAYED: 'var(--color-status-delayed)',
}

interface NeedsAttentionBannerProps {
  // When true, banner starts expanded. Default false (collapsed: just header).
  defaultExpanded?: boolean
  // Optional max leads to show in the expanded list — older are summarised.
  showMax?: number
}

export default function NeedsAttentionBanner({ defaultExpanded = false, showMax = 12 }: NeedsAttentionBannerProps) {
  const [data, setData] = useState<BannerData | null>(null)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/needs-attention')
      const json = await res.json()
      if (json.success) setData(json.data)
    } catch { /* silent */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    // Poll every 60s so the banner updates as agents close out leads
    const i = setInterval(fetchData, 60_000)
    return () => clearInterval(i)
  }, [fetchData])

  if (loading || !data || data.count === 0) return null

  const visible = data.leads.slice(0, showMax)
  const overflow = data.count - visible.length

  return (
    <section
      className="rounded-xl mb-5"
      style={{
        background: 'color-mix(in srgb, var(--color-warning) 8%, var(--color-card))',
        border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
      }}
    >
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
            style={{
              background: 'color-mix(in srgb, var(--color-warning) 22%, transparent)',
              color: 'var(--color-warning)',
            }}
          >
            !
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {data.count} lead{data.count === 1 ? '' : 's'} need your attention
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-muted)' }}>
              {data.by_reason.overdue_followup > 0 && (
                <span>{data.by_reason.overdue_followup} overdue followup{data.by_reason.overdue_followup === 1 ? '' : 's'}</span>
              )}
              {data.by_reason.overdue_followup > 0 && data.by_reason.stale_activity > 0 && <span> · </span>}
              {data.by_reason.stale_activity > 0 && (
                <span>{data.by_reason.stale_activity} stale</span>
              )}
              <span className="ml-2 italic">Log a call, add a note, or push the date.</span>
            </p>
          </div>
        </div>
        <span
          className="text-[11px] font-medium px-2.5 py-1 rounded-md shrink-0 flex items-center gap-1"
          style={{
            background: 'color-mix(in srgb, var(--color-warning) 15%, transparent)',
            color: 'var(--color-warning)',
          }}
        >
          {expanded ? 'Hide' : 'Review now'}
          <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {/* Detail list */}
      {expanded && (
        <div
          className="border-t px-2 py-2 space-y-1"
          style={{ borderColor: 'color-mix(in srgb, var(--color-warning) 22%, transparent)' }}
        >
          {visible.map(lead => {
            const tint = STATUS_TINT[lead.lead_status] || 'var(--color-muted)'
            return (
              <Link
                key={lead.row_number}
                href={`/leads/${lead.row_number}`}
                className="flex items-center gap-3 px-2.5 py-2 rounded-lg transition-colors hover:bg-elevated/50"
              >
                <span
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{ background: tint }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                      {lead.full_name || lead.phone}
                    </span>
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                      style={{
                        background: `color-mix(in srgb, ${tint} 15%, transparent)`,
                        color: tint,
                      }}
                    >
                      {lead.lead_status}
                    </span>
                    {lead.city && (
                      <span className="text-[10px]" style={{ color: 'var(--color-dim)' }}>
                        · {lead.city}
                      </span>
                    )}
                    {lead.assigned_to && (
                      <span className="text-[10px]" style={{ color: 'var(--color-dim)' }}>
                        · {lead.assigned_to}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-muted)' }}>
                    <span className="font-medium" style={{ color: 'var(--color-warning)' }}>
                      {REASON_LABEL[lead.reason_code]}:
                    </span>{' '}
                    {lead.reason_text}
                  </p>
                </div>
                <span
                  className="text-[10px] font-medium px-2 py-1 rounded shrink-0"
                  style={{
                    background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                    color: 'var(--color-accent)',
                  }}
                >
                  Open →
                </span>
              </Link>
            )
          })}
          {overflow > 0 && (
            <Link
              href="/leads?filter=needs-attention"
              className="block px-2.5 py-2 text-center text-[11px] font-medium rounded-lg hover:bg-elevated/50"
              style={{ color: 'var(--color-accent)' }}
            >
              + {overflow} more — view all
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
