'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import Badge, { statusTone } from '@/components/ui/Badge'
import { AlertCircle } from 'lucide-react'
import TrendChart from './_components/TrendChart'
import SecondaryKpi from './_components/SecondaryKpi'

/**
 * /v2/dashboard — Editorial newsstand dashboard preview.
 *
 * Hierarchy:
 *   1. Masthead with ONE hero KPI (~96px on desktop)
 *   2. Quiet 4-up secondary KPIs (ink underline only, no shadow)
 *   3. 14-day lead-flow trend (mock data — TODO: wire to /api/analytics)
 *   4. Recent activity table (last 8) + Today's tasks side column
 *
 * Visual rules enforced inline:
 *   - No blue, no cool grey, no drop shadows, no rounded-2xl
 *   - Bricolage only on masthead KPI + section headers
 *   - One Caveat moment: "Just waffle through it"
 */

// ────────────────────────────────────────────────────────────────────────────
// Types — kept loose to match the /api/leads pass-through shape
// ────────────────────────────────────────────────────────────────────────────
type Lead = {
  row_number: number
  full_name: string
  phone: string
  city: string
  lead_status: string
  lead_priority?: string
  created_time: string
  next_followup?: string | null
  assigned_to?: string
}

type ApiResponse = { success: boolean; data?: Lead[]; error?: string }

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
const TODAY_LABEL = new Date().toLocaleDateString('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const DAY_MS = 24 * 60 * 60 * 1000
const ACTIVE_STATUSES = new Set(['NEW', 'REPLIED', 'HOT'])

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * DAY_MS)
}

// ────────────────────────────────────────────────────────────────────────────
// Mock data — to be replaced when /api/analytics ships
// ────────────────────────────────────────────────────────────────────────────
function buildMock14Day() {
  // Stable pseudo-random so the preview doesn't flash a different chart each render.
  const seed = [7, 12, 9, 15, 11, 18, 22, 14, 17, 23, 19, 26, 21, 28]
  return seed.map((v, i) => {
    const d = daysAgo(13 - i)
    const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return { label, value: v }
  })
}

const MOCK_TASKS = [
  { id: 1, name: 'Rohan Mehta', status: 'HOT' },
  { id: 2, name: 'Priya Sharma', status: 'REPLIED' },
  { id: 3, name: 'Aditya Singh', status: 'CALL_DONE_INTERESTED' },
  { id: 4, name: 'Neha Kapoor', status: 'NEW' },
  { id: 5, name: 'Vikram Joshi', status: 'NEGOTIATION' },
  { id: 6, name: 'Sneha Patel', status: 'HOT' },
] as const

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────
export default function DashboardPreview() {
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/leads')
      .then(async (r) => {
        const j: ApiResponse = await r.json()
        if (cancelled) return
        if (!j.success || !Array.isArray(j.data)) {
          setError(j.error || 'Failed to load leads')
          return
        }
        setLeads(j.data)
      })
      .catch((e) => !cancelled && setError(String(e?.message || e)))
    return () => {
      cancelled = true
    }
  }, [])

  const aggregates = useMemo(() => {
    if (!leads) return null
    const now = new Date()
    const todayStart = startOfDay(now)
    const weekAgo = daysAgo(7)
    const yesterdayStart = startOfDay(daysAgo(1))

    const isToday = (iso?: string | null) =>
      !!iso && new Date(iso) >= todayStart
    const isYesterday = (iso?: string | null) =>
      !!iso && new Date(iso) >= yesterdayStart && new Date(iso) < todayStart

    const active = leads.filter((l) => ACTIVE_STATUSES.has(l.lead_status))
    const activeToday = active.filter((l) => isToday(l.created_time)).length
    const activeYesterday = active.filter((l) =>
      isYesterday(l.created_time),
    ).length

    const newToday = leads.filter(
      (l) => l.lead_status === 'NEW' && isToday(l.created_time),
    ).length
    const newYesterday = leads.filter(
      (l) => l.lead_status === 'NEW' && isYesterday(l.created_time),
    ).length

    const overdue = leads.filter(
      (l) =>
        l.next_followup &&
        new Date(l.next_followup) < now &&
        l.lead_status !== 'CONVERTED' &&
        l.lead_status !== 'LOST',
    ).length
    const dueToday = leads.filter(
      (l) =>
        l.next_followup &&
        new Date(l.next_followup) >= todayStart &&
        new Date(l.next_followup) < new Date(todayStart.getTime() + DAY_MS),
    ).length

    const wonThisWeek = leads.filter(
      (l) =>
        l.lead_status === 'CONVERTED' && new Date(l.created_time) >= weekAgo,
    ).length

    // SLA breach — approximated by REPLIED status count (per spec)
    const slaBreach = leads.filter((l) => l.lead_status === 'REPLIED').length

    // Recent activity — last 8 by created_time desc
    const recent = [...leads]
      .sort(
        (a, b) =>
          new Date(b.created_time).getTime() -
          new Date(a.created_time).getTime(),
      )
      .slice(0, 8)

    return {
      heroValue: activeToday,
      heroVsYesterday: activeToday - activeYesterday,
      heroVsLastWeek:
        activeToday -
        active.filter(
          (l) =>
            new Date(l.created_time) >= weekAgo &&
            new Date(l.created_time) < new Date(weekAgo.getTime() + DAY_MS),
        ).length,
      newToday,
      newDelta: newToday - newYesterday,
      callsDue: overdue + dueToday,
      overdue,
      wonThisWeek,
      slaBreach,
      recent,
    }
  }, [leads])

  const trendData = useMemo(() => buildMock14Day(), [])

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-[1400px] space-y-10">
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 px-4 py-3"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
            borderBottom: '2px solid var(--color-danger)',
            color: 'var(--color-danger)',
          }}
        >
          <AlertCircle className="size-5 mt-0.5 shrink-0" strokeWidth={2} />
          <div>
            <div className="text-heading">Couldn’t load leads</div>
            <div className="text-body" style={{ color: 'var(--color-body)' }}>
              {error}
            </div>
          </div>
        </div>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════════
          MASTHEAD
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="editorial-border pb-8">
        <div className="text-eyebrow" style={{ color: 'var(--color-muted)' }}>
          TODAY · {TODAY_LABEL.toUpperCase()}
        </div>

        <div className="mt-3 flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1
              className="display"
              style={{
                fontSize: 24,
                lineHeight: 1.1,
                fontWeight: 700,
                letterSpacing: '-0.01em',
              }}
            >
              Active leads today
            </h1>
            <div
              className="display tabular-nums leading-none mt-2"
              style={{
                fontFamily: 'var(--font-bricolage), Georgia, serif',
                fontWeight: 800,
                letterSpacing: '-0.04em',
                color: 'var(--color-accent)',
                // mobile → desktop scale
                fontSize: 'clamp(56px, 12vw, 96px)',
              }}
            >
              {aggregates ? (
                aggregates.heroValue
              ) : (
                <Skeleton
                  className="inline-block align-bottom"
                  style={{
                    width: 'clamp(120px, 22vw, 220px)',
                    height: 'clamp(56px, 12vw, 96px)',
                    background: 'var(--color-elevated)',
                  }}
                />
              )}
            </div>
            <div
              className="text-body mt-3"
              style={{ color: 'var(--color-muted)' }}
            >
              {aggregates ? (
                <>
                  vs yesterday:{' '}
                  <span style={{ color: 'var(--color-text)' }}>
                    {aggregates.heroVsYesterday >= 0 ? '+' : ''}
                    {aggregates.heroVsYesterday}
                  </span>{' '}
                  · vs last week:{' '}
                  <span style={{ color: 'var(--color-text)' }}>
                    {aggregates.heroVsLastWeek >= 0 ? '+' : ''}
                    {aggregates.heroVsLastWeek}
                  </span>
                </>
              ) : (
                <Skeleton style={{ width: 240, height: 16, background: 'var(--color-elevated)' }} />
              )}
            </div>
          </div>

          <div className="hidden md:block text-right">
            <div
              className="handwritten"
              style={{
                fontFamily: 'var(--font-caveat), cursive',
                fontSize: 28,
                color: 'var(--color-muted)',
                lineHeight: 1,
              }}
            >
              the morning edition
            </div>
            <div
              className="text-eyebrow mt-1"
              style={{ color: 'var(--color-dim)' }}
            >
              issue · {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'numeric', day: 'numeric' })}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECONDARY KPIs
          ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {aggregates ? (
            <>
              <SecondaryKpi
                label="New leads"
                value={aggregates.newToday}
                subtitle={`${aggregates.newDelta >= 0 ? '+' : ''}${aggregates.newDelta} from yesterday`}
                href="/v2/leads?status=NEW"
              />
              <SecondaryKpi
                label="Calls due"
                value={aggregates.callsDue}
                subtitle={`${aggregates.overdue} overdue · rest today`}
                href="/v2/leads?filter=followup"
              />
              <SecondaryKpi
                label="Won this week"
                value={aggregates.wonThisWeek}
                subtitle="last 7 days"
                href="/v2/leads?status=CONVERTED"
              />
              <SecondaryKpi
                label="SLA breach"
                value={aggregates.slaBreach}
                subtitle={
                  aggregates.slaBreach > 0
                    ? 'replies waiting > 4hr'
                    : 'all caught up'
                }
                href="/v2/leads?status=REPLIED"
                tone={aggregates.slaBreach > 0 ? 'alert' : 'default'}
              />
            </>
          ) : (
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="px-4 py-4"
                style={{
                  backgroundColor: 'var(--color-card)',
                  borderBottom: '2px solid var(--color-border)',
                }}
              >
                <Skeleton style={{ width: 70, height: 10, background: 'var(--color-elevated)' }} />
                <Skeleton className="mt-3" style={{ width: 60, height: 28, background: 'var(--color-elevated)' }} />
                <Skeleton className="mt-2" style={{ width: 110, height: 11, background: 'var(--color-elevated)' }} />
              </div>
            ))
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          TREND CHART
          ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="flex items-baseline justify-between editorial-border pb-2 mb-4">
          <h2 className="text-heading display" style={{ fontWeight: 700 }}>
            Lead flow — last 14 days
          </h2>
          <span className="text-eyebrow" style={{ color: 'var(--color-muted)' }}>
            preview · mock data
          </span>
        </div>
        <div
          className="px-2 py-3"
          style={{ backgroundColor: 'var(--color-card)' }}
        >
          <TrendChart data={trendData} />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          RECENT ACTIVITY + TODAY'S TASKS  (2-column on desktop)
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ── Recent activity table ── */}
        <div className="lg:col-span-2">
          <div className="flex items-baseline justify-between editorial-border pb-2 mb-3">
            <h2 className="text-heading display" style={{ fontWeight: 700 }}>
              Recent activity
            </h2>
            <Link
              href="/v2/leads"
              className="text-eyebrow underline"
              style={{ color: 'var(--color-muted)' }}
            >
              view all
            </Link>
          </div>

          <div className="overflow-hidden" style={{ backgroundColor: 'var(--color-card)' }}>
            <table className="w-full text-left">
              <thead>
                <tr
                  className="text-eyebrow"
                  style={{
                    borderBottom: '2px solid var(--color-border)',
                    color: 'var(--color-muted)',
                  }}
                >
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold hidden sm:table-cell">City</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold hidden md:table-cell">Created</th>
                </tr>
              </thead>
              <tbody>
                {aggregates
                  ? aggregates.recent.map((l) => (
                      <tr
                        key={l.row_number}
                        className="cursor-pointer transition-colors"
                        style={{ borderBottom: '1px solid var(--color-border-light)' }}
                        onClick={() => {
                          window.location.href = '/v2/leads'
                        }}
                      >
                        <td className="px-3 py-2.5 text-body" style={{ color: 'var(--color-text)' }}>
                          {l.full_name || '—'}
                        </td>
                        <td
                          className="px-3 py-2.5 text-body hidden sm:table-cell"
                          style={{ color: 'var(--color-muted)' }}
                        >
                          {l.city || '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={statusTone(l.lead_status)}>
                            {l.lead_status.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td
                          className="px-3 py-2.5 text-caption hidden md:table-cell"
                          style={{ color: 'var(--color-muted)' }}
                        >
                          {new Date(l.created_time).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </td>
                      </tr>
                    ))
                  : Array.from({ length: 8 }).map((_, i) => (
                      <tr
                        key={i}
                        style={{ borderBottom: '1px solid var(--color-border-light)' }}
                      >
                        <td className="px-3 py-2.5">
                          <Skeleton style={{ width: 140, height: 14, background: 'var(--color-elevated)' }} />
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <Skeleton style={{ width: 80, height: 14, background: 'var(--color-elevated)' }} />
                        </td>
                        <td className="px-3 py-2.5">
                          <Skeleton style={{ width: 60, height: 16, background: 'var(--color-elevated)' }} />
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell">
                          <Skeleton style={{ width: 50, height: 12, background: 'var(--color-elevated)' }} />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Today's tasks side column ── */}
        <aside>
          <div className="editorial-border pb-2 mb-3">
            <h2 className="text-heading display" style={{ fontWeight: 700 }}>
              Today
            </h2>
            <div
              className="handwritten mt-0.5"
              style={{
                fontFamily: 'var(--font-caveat), cursive',
                fontSize: 20,
                color: 'var(--color-muted)',
                lineHeight: 1,
              }}
            >
              Just waffle through it
            </div>
          </div>

          <ul
            className="divide-y"
            style={{ backgroundColor: 'var(--color-card)' }}
          >
            {MOCK_TASKS.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 px-3 py-2.5"
                style={{ borderColor: 'var(--color-border-light)' }}
              >
                <Checkbox />
                <span
                  className="text-body flex-1 truncate"
                  style={{ color: 'var(--color-text)' }}
                >
                  {t.name}
                </span>
                <Badge tone={statusTone(t.status)}>
                  {t.status.replace(/_/g, ' ')}
                </Badge>
              </li>
            ))}
          </ul>

          <Button
            render={<Link href="/v2/leads">View full queue</Link>}
            className="w-full mt-4"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-text)',
              borderRadius: 6,
              height: 40,
              fontWeight: 600,
            }}
          />
        </aside>
      </section>
    </div>
  )
}
