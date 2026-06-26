'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RankingFeedbackPanel — "Ranking feedback" (admin).
//
// Read-only board fed by GET /api/work/feedback (ADMIN). Surfaces the cards
// agents flagged as "Shouldn't be here?" on the Guided rail — each with the
// system's case for showing it (queue_reason) so the owner sees the exact
// mismatch. A reason-code rollup makes systemic ranking errors pop.
//
// Self-contained: owns its own one-shot fetch. The parent (dashboard) gates it
// admin-only. Additive — touches nothing existing. Near-empty until agents flag.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { Flag, AlertTriangle, Inbox } from 'lucide-react'
import { labelFor, FEEDBACK_REASONS } from '@/config/sales-signals'
import { timeAgo } from '@/lib/format'

// ─── Types (mirror the backend contract) ─────────────────────────────────────

interface FeedbackRow {
  id: number
  user_name: string
  lead_row: number | null
  reason_code: string
  note: string
  queue_reason: string
  score: number | null
  lead_status: string
  created_at: string
  full_name: string | null
  city: string | null
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RankingFeedbackPanel() {
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/work/feedback')
        const json = await res.json()
        if (!alive) return
        if (!res.ok || !json?.success) {
          setError(json?.error || `Server error (${res.status})`)
          return
        }
        setRows((json.feedback as FeedbackRow[]) || [])
        setError('')
      } catch {
        if (alive) setError('Failed to load feedback')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // ─── Loading skeleton (matches dashboard's animate-pulse style) ──────────
  if (loading) {
    return (
      <section aria-label="Ranking feedback" className="mb-6">
        <div className="rounded-xl border border-border bg-card overflow-hidden animate-pulse">
          <div className="px-4 py-3 border-b border-border">
            <div className="h-3 w-40 rounded bg-elevated" />
          </div>
          <div className="px-4 py-4 space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-3 w-full rounded bg-elevated" />
            ))}
          </div>
        </div>
      </section>
    )
  }

  // Count by reason_code so systemic patterns pop, ordered by the taxonomy.
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.reason_code, (counts.get(r.reason_code) || 0) + 1)
  const grouped = FEEDBACK_REASONS
    .map(c => ({ key: c.key, label: c.label, n: counts.get(c.key) || 0 }))
    .filter(g => g.n > 0)

  return (
    <section aria-label="Ranking feedback" className="mb-6 animate-fade-in">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)' }}
        >
          <Flag className="w-4 h-4" style={{ color: 'var(--color-accent)' }} strokeWidth={2} />
        </span>
        <h2 className="text-heading" style={{ color: 'var(--color-text)' }}>
          Ranking feedback{' '}
          <span className="text-caption font-normal" style={{ color: 'var(--color-dim)' }}>
            · &ldquo;Shouldn&apos;t be here?&rdquo; flags
          </span>
        </h2>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
      >
        {error ? (
          <div
            className="px-4 py-3 text-sm flex items-center gap-2"
            style={{ color: 'var(--color-danger)' }}
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : rows.length === 0 ? (
          // ─── Expected early state ─────────────────────────────────────
          <div className="px-6 py-8 flex flex-col items-center text-center gap-2">
            <span
              className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-1"
              style={{ background: 'var(--color-elevated)' }}
            >
              <Inbox className="w-6 h-6" style={{ color: 'var(--color-dim)' }} strokeWidth={1.5} />
            </span>
            <p className="text-sm max-w-xs" style={{ color: 'var(--color-body)' }}>
              No ranking feedback yet — flags appear when agents tap &ldquo;Shouldn&apos;t be here?&rdquo;.
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Reason rollup — systemic patterns first */}
            <div className="flex flex-wrap gap-1.5">
              {grouped.map(g => (
                <span
                  key={g.key}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-body)' }}
                >
                  {g.label}
                  <span className="tabular-nums font-bold" style={{ color: 'var(--color-accent)' }}>{g.n}</span>
                </span>
              ))}
            </div>

            {/* Recent list */}
            <ul className="space-y-2">
              {rows.map(r => (
                <li
                  key={r.id}
                  className="rounded-lg border px-3 py-2.5"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-elevated)' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                      {r.full_name || (r.lead_row != null ? `Lead #${r.lead_row}` : 'Unknown lead')}
                      {r.city && (
                        <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--color-dim)' }}>
                          {r.city}
                        </span>
                      )}
                    </span>
                    <span
                      className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                      style={{ borderColor: 'color-mix(in srgb, var(--color-accent) 45%, transparent)', color: 'var(--color-accent)' }}
                    >
                      {labelFor(FEEDBACK_REASONS, r.reason_code)}
                    </span>
                  </div>
                  {r.queue_reason && (
                    <p className="mt-1 text-xs italic" style={{ color: 'var(--color-muted)' }}>
                      Shown for: {r.queue_reason}
                    </p>
                  )}
                  {r.note && (
                    <p className="mt-1 text-xs" style={{ color: 'var(--color-body)' }}>
                      &ldquo;{r.note}&rdquo;
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-dim)' }}>
                    <span>{r.user_name || 'Agent'}</span>
                    <span aria-hidden>·</span>
                    <span>{timeAgo(r.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
