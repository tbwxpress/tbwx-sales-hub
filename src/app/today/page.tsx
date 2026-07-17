'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { CheckCircle, ChevronDown } from 'lucide-react'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'
import NeedsAttentionBanner from '@/components/NeedsAttentionBanner'
import Badge, { statusTone } from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'

interface FeedItem {
  kind: 'hot_stale' | 'overdue_followup' | 'upcoming_followup' | 'telecaller_handoff' | 'unread_reply' | 'new_assignment'
  priority: number
  title: string
  subtitle: string
  ref_phone: string
  ref_lead_row: number
  status: string
  age_hours?: number
  assigned_to?: string
}

interface Automation {
  last_at: string | null
  new_count: number
  stale: boolean
}

const KIND_META: Record<string, { label: string; color: string }> = {
  hot_stale: { label: 'HOT · stale', color: 'var(--color-danger)' },
  unread_reply: { label: 'Replies waiting', color: 'var(--color-success)' },
  telecaller_handoff: { label: 'Hand-offs', color: 'var(--color-accent)' },
  overdue_followup: { label: 'Overdue', color: 'var(--color-warning)' },
  upcoming_followup: { label: 'Upcoming', color: 'var(--color-accent)' },
  new_assignment: { label: 'New', color: 'var(--color-accent)' },
}

const SECTION_ORDER: FeedItem['kind'][] = ['hot_stale', 'unread_reply', 'telecaller_handoff', 'overdue_followup', 'new_assignment', 'upcoming_followup']

// How many rows each section shows before "Show all". Urgent sections get more
// room; the long-tail sections (overdue/upcoming) start tight — their full
// weight is visible in the count tiles, not as a wall of cards.
const SECTION_PREVIEW: Record<string, number> = {
  hot_stale: 8,
  unread_reply: 8,
  telecaller_handoff: 5,
  overdue_followup: 5,
  new_assignment: 5,
  upcoming_followup: 3,
}

function timeAgoShort(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z')).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'just now'
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

// ── Owner-approved auto follow-ups ─────────────────────────────────────
// Daily per-lead ask: "want the system to send this DELAYED / interested lead
// a WhatsApp follow-up template?" Send fires immediately; Skip snoozes the ask
// 3 days. The list refreshes daily server-side (answered leads drop out).
interface NudgeItem {
  lead_row: number
  name: string
  phone: string
  status: string
  next_followup: string
  city: string
}

function FollowupApprovals() {
  const [items, setItems] = useState<NudgeItem[]>([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState<number | null>(null)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    fetch('/api/followup-nudges')
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setItems(json.data.items || [])
          setTotal(json.data.total_eligible || 0)
        }
      })
      .catch(() => {})
  }, [])

  async function decide(leadRow: number, action: 'send' | 'skip') {
    setBusy(leadRow)
    try {
      const res = await fetch('/api/followup-nudges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_row: leadRow, action }),
      })
      const json = await res.json()
      if (json.success) {
        setItems(prev => prev.filter(i => i.lead_row !== leadRow))
        setTotal(t => Math.max(0, t - 1))
      }
    } catch { /* leave the row; agent can retry */ }
    setBusy(null)
  }

  if (items.length === 0) return null

  return (
    <div className="mb-4 rounded-lg border" style={{ borderColor: 'color-mix(in srgb, var(--color-accent) 35%, transparent)', background: 'color-mix(in srgb, var(--color-accent) 5%, transparent)' }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-xs font-semibold text-text">
          📨 Auto follow-up — your call · {items.length}{total > items.length ? ` of ${total}` : ''}
        </span>
        <ChevronDown className={`w-4 h-4 text-dim transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[11px] text-dim -mt-1">Approve a WhatsApp follow-up template per lead, or skip (asks again in 3 days).</p>
          {items.map(it => (
            <div key={it.lead_row} className="flex items-center gap-2 rounded-md px-3 py-2" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
              <Link href={`/leads/${it.lead_row}`} className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text truncate">{it.name}</p>
                <p className="text-[11px] text-dim truncate">
                  {it.status.replace(/_/g, ' ')}{it.city ? ` · ${it.city}` : ''}{it.next_followup ? ` · due ${it.next_followup}` : ''}
                </p>
              </Link>
              <button
                onClick={() => decide(it.lead_row, 'send')}
                disabled={busy === it.lead_row}
                className="flex-shrink-0 text-[11px] font-semibold rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50"
                style={{ background: 'color-mix(in srgb, var(--color-success) 18%, transparent)', color: 'var(--color-success)', border: '1px solid color-mix(in srgb, var(--color-success) 40%, transparent)' }}
              >
                {busy === it.lead_row ? '…' : 'Send'}
              </button>
              <button
                onClick={() => decide(it.lead_row, 'skip')}
                disabled={busy === it.lead_row}
                className="flex-shrink-0 text-[11px] rounded-md px-2.5 py-1.5 text-dim hover:text-text transition-colors disabled:opacity-50"
                style={{ border: '1px solid var(--color-border)' }}
              >
                Skip
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TodayPage() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [automation, setAutomation] = useState<Automation | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  // Per-agent filter ('' = everyone). Only rendered when the feed spans 2+
  // owners (i.e., the admin view) — agents only ever see their own items.
  const [agentFilter, setAgentFilter] = useState('')
  // Sections the user expanded past their preview cap.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/today')
      const data = await res.json()
      if (data.success) {
        setItems(data.data.items || [])
        setAutomation(data.data.automation || null)
        setErr('')
      } else {
        setErr(data.error || 'Failed to load')
      }
    } catch (e) {
      setErr(String(e))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchFeed()
    const i = setInterval(fetchFeed, 60_000)
    return () => clearInterval(i)
  }, [fetchFeed])

  // Distinct owners in the feed → agent chips (admin view only, naturally).
  const owners = useMemo(() => {
    const s = new Set<string>()
    for (const it of items) if (it.assigned_to) s.add(it.assigned_to)
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [items])

  const filtered = useMemo(
    () => (agentFilter ? items.filter(it => (it.assigned_to || '') === agentFilter) : items),
    [items, agentFilter],
  )

  const grouped = useMemo(() => filtered.reduce<Record<string, FeedItem[]>>((acc, it) => {
    (acc[it.kind] = acc[it.kind] || []).push(it)
    return acc
  }, {}), [filtered])

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-6 flex-1 w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-heading text-text">Today</h1>
            <p className="text-body text-dim mt-0.5">{filtered.length === 0 ? 'You’re all caught up.' : `${filtered.length} action${filtered.length === 1 ? '' : 's'} to take`}</p>
          </div>
          <button onClick={fetchFeed} className="text-xs text-accent hover:underline">Refresh</button>
        </div>

        {/* Admin: deck-automation heartbeat. Green = draining; red = the July
            failure signature (backlog exists, nothing sending). Admin-only data
            — the API omits it for agents. */}
        {automation && (
          <div
            className="mb-4 flex items-center gap-2.5 rounded-lg border px-3 py-2"
            style={automation.stale
              ? { borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)', background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)' }
              : { borderColor: 'var(--color-border)', background: 'var(--color-card)' }}
          >
            <span
              className="h-2 w-2 rounded-full flex-shrink-0"
              style={{ background: automation.stale ? 'var(--color-danger)' : 'var(--color-success)' }}
              aria-hidden
            />
            <p className="text-caption" style={{ color: automation.stale ? 'var(--color-danger)' : 'var(--color-muted)' }}>
              {automation.stale
                ? `Deck automation looks STUCK — ${automation.new_count} NEW leads waiting, last send ${timeAgoShort(automation.last_at)}`
                : `Deck automation OK — last send ${timeAgoShort(automation.last_at)} · ${automation.new_count} NEW in queue`}
            </p>
          </div>
        )}

        {/* Owner-approved auto follow-ups (agents only — hidden when empty). */}
        <FollowupApprovals />

        {/* Forced followup loop — collapsed by default here; its expanded form
            duplicates the sections below. */}
        <NeedsAttentionBanner />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : err ? (
          <p className="text-sm text-danger">{err}</p>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<CheckCircle />}
            title="You're all caught up"
            hint="Nothing urgent right now. Open Leads to start outreach."
            action={<Link href="/leads" className="text-body text-accent">Go to Leads →</Link>}
          />
        ) : (
          <>
            {/* At-a-glance summary tiles — the counts ARE the overview; tap one
                to jump to that section. */}
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {SECTION_ORDER.map(kind => {
                const meta = KIND_META[kind]
                const n = (grouped[kind] || []).length
                return (
                  <a
                    key={kind}
                    href={n ? `#today-${kind}` : undefined}
                    className={`rounded-lg border px-2 py-2 text-center transition-colors ${n ? 'hover:bg-elevated' : 'opacity-40'}`}
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}
                  >
                    <p className="text-lg font-bold leading-tight" style={{ color: n ? meta.color : 'var(--color-dim)' }}>{n}</p>
                    <p className="text-[10px] text-dim leading-tight mt-0.5">{meta.label}</p>
                  </a>
                )
              })}
            </div>

            {/* Agent chips — only meaningful when the feed spans multiple owners
                (the admin view). Check one person's plate at a time. */}
            {owners.length > 1 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setAgentFilter('')}
                  className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
                  style={!agentFilter
                    ? { borderColor: 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)', color: 'var(--color-text)' }
                    : { borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
                >
                  Everyone
                </button>
                {owners.map(name => (
                  <button
                    key={name}
                    onClick={() => setAgentFilter(agentFilter === name ? '' : name)}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
                    style={agentFilter === name
                      ? { borderColor: 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)', color: 'var(--color-text)' }
                      : { borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-5 space-y-6">
              {SECTION_ORDER.map(kind => {
                const list = grouped[kind]
                if (!list || list.length === 0) return null
                const meta = KIND_META[kind] || { label: kind, color: 'var(--color-muted)' }
                const cap = SECTION_PREVIEW[kind] ?? 5
                const isOpen = !!expanded[kind]
                const shown = isOpen ? list : list.slice(0, cap)
                const hidden = list.length - shown.length
                return (
                  <section key={kind} id={`today-${kind}`} className="scroll-mt-20">
                    <h2 className="text-eyebrow mb-2" style={{ color: meta.color }}>
                      {meta.label} · {list.length}
                    </h2>
                    <div className="space-y-2">
                      {shown.map(item => (
                        <Link
                          key={`${item.kind}-${item.ref_lead_row}`}
                          href={`/leads/${item.ref_lead_row}`}
                          className="block rounded-lg p-3 hover:bg-elevated transition-colors"
                          style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-body font-medium text-text truncate">{item.title}</p>
                              <p className="text-caption text-dim mt-0.5 line-clamp-2">
                                {item.subtitle}
                                {owners.length > 1 && item.assigned_to ? ` · ${item.assigned_to}` : ''}
                              </p>
                            </div>
                            <Badge tone={statusTone(item.status)} className="shrink-0">
                              {item.status}
                            </Badge>
                          </div>
                        </Link>
                      ))}
                    </div>
                    {(hidden > 0 || isOpen) && (
                      <button
                        onClick={() => setExpanded(e => ({ ...e, [kind]: !isOpen }))}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        {isOpen ? 'Show less' : `Show all ${list.length}`}
                      </button>
                    )}
                  </section>
                )
              })}
            </div>
          </>
        )}
      </div>
      <PoweredBy />
    </div>
  )
}
