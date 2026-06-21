'use client'

/**
 * DashboardWidgets — the polished KPI metric-widgets row for /dashboard (admin).
 *
 * Computes its metrics ENTIRELY from data the dashboard already has in client
 * state (`leads` + `stats`), so it adds ZERO extra network round-trips — this
 * app has had perf issues, so we deliberately reuse the existing fetches
 * (/api/leads, /api/leads?stats=true) rather than adding a /api/dashboard/metrics
 * endpoint.
 *
 * Deltas are computed honestly from each lead's created_time (this 7-day window
 * vs the prior 7-day window). Where no honest historical comparison exists
 * (point-in-time counts, avg response time with no stored series) we OMIT the
 * delta and show a descriptive caption instead — we never fabricate a number.
 *
 * recharts mini-charts are pulled in via next/dynamic so the chart lib is
 * code-split out of the initial bundle.
 */

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import KpiCard, { type KpiDelta } from './KpiCard'

// ── Lazy chart wrappers (recharts kept out of the initial bundle) ──────────
const ChartFallback = ({ w = 64, h = 36 }: { w?: number; h?: number }) => (
  <div className="skeleton rounded" style={{ width: w, height: h }} />
)

const Sparkline = dynamic(() => import('./KpiCharts').then(m => m.Sparkline), {
  ssr: false,
  loading: () => <ChartFallback />,
})
const MiniBars = dynamic(() => import('./KpiCharts').then(m => m.MiniBars), {
  ssr: false,
  loading: () => <ChartFallback />,
})
const MiniDonut = dynamic(() => import('./KpiCharts').then(m => m.MiniDonut), {
  ssr: false,
  loading: () => <ChartFallback w={36} h={36} />,
})

// ── Shapes (kept compatible with dashboard/page.tsx) ───────────────────────
interface Lead {
  row_number: number
  lead_status: string
  lead_priority: string
  created_time: string
  next_followup: string
}

interface Stats {
  total: number
  new: number
  replied: number
  hot: number
  converted: number
  lost: number
}

interface DashboardWidgetsProps {
  leads: Lead[]
  stats: Stats | null
  /** Avg first-response, already formatted by the dashboard (e.g. "6h", "<1h"). */
  avgResponse: string
}

const DAY_MS = 24 * 60 * 60 * 1000

function startOfTodayIST(): number {
  // IST day boundary (UTC+5:30) so "today" matches the rest of the app.
  const now = new Date()
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const istMidnight = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate())
  return istMidnight - 5.5 * 60 * 60 * 1000
}

function pctChange(current: number, previous: number): KpiDelta | undefined {
  // No prior-period signal → no honest delta to show.
  if (previous <= 0) return undefined
  const raw = ((current - previous) / previous) * 100
  const pct = Math.round(Math.abs(raw))
  if (pct === 0) return { pct: 0, direction: 'flat', label: 'vs last week' }
  return {
    pct,
    direction: raw > 0 ? 'up' : 'down',
    label: 'vs last week',
  }
}

export default function DashboardWidgets({ leads, stats, avgResponse }: DashboardWidgetsProps) {
  const metrics = useMemo(() => {
    const todayStart = startOfTodayIST()
    const weekAgo = todayStart - 6 * DAY_MS // inclusive 7-day window (today + 6)
    const twoWeeksAgo = weekAgo - 7 * DAY_MS

    const ts = (s: string) => {
      if (!s) return NaN
      const t = new Date(s).getTime()
      return Number.isNaN(t) ? NaN : t
    }

    // 7-day daily new-leads series (oldest → newest) for the sparkline.
    const dailyNew = Array<number>(7).fill(0)
    let thisWeekNew = 0
    let prevWeekNew = 0

    for (const l of leads) {
      const t = ts(l.created_time)
      if (Number.isNaN(t)) continue

      if (t >= weekAgo) {
        thisWeekNew++
        const dayIdx = Math.min(6, Math.max(0, Math.floor((t - weekAgo) / DAY_MS)))
        dailyNew[dayIdx]++
      } else if (t >= twoWeeksAgo) {
        prevWeekNew++
      }
    }

    // New today (IST).
    const newToday = leads.filter(l => {
      const t = ts(l.created_time)
      return !Number.isNaN(t) && t >= todayStart
    }).length

    // Conversion rate (overall, real).
    const total = stats?.total ?? leads.length
    const converted = stats?.converted ?? leads.filter(l => l.lead_status === 'CONVERTED').length
    const conversionRate = total > 0 ? Math.round((converted / total) * 1000) / 10 : 0

    // NOTE: no conversion-rate week-over-week delta — there's no conversion
    // timestamp (we bin by created_time but read CURRENT status), so this-week
    // cohorts are structurally too new to compare. A delta here would mislead.

    // Active HOT leads (priority HOT, not closed).
    const hotActive = leads.filter(
      l => l.lead_priority === 'HOT' && !['CONVERTED', 'LOST'].includes(l.lead_status),
    ).length

    // Priority split for the hot-leads mini-bar.
    const prioritySplit = [
      { label: 'HOT', value: leads.filter(l => l.lead_priority === 'HOT').length, color: 'var(--chart-1)' },
      { label: 'WARM', value: leads.filter(l => l.lead_priority === 'WARM').length, color: 'var(--chart-2)' },
      { label: 'COLD', value: leads.filter(l => l.lead_priority === 'COLD').length, color: 'var(--chart-3)' },
    ]

    // Overdue follow-ups → drives the SLA card's caption.
    const now = Date.now()
    const overdue = leads.filter(
      l =>
        l.next_followup &&
        !['CONVERTED', 'LOST'].includes(l.lead_status) &&
        new Date(l.next_followup).getTime() < now,
    ).length

    // Total-leads delta is a week-over-week change in NEW leads, not in the
    // all-time total — label it so it doesn't read as "the total grew X%".
    const totalDelta = pctChange(thisWeekNew, prevWeekNew)
    if (totalDelta) totalDelta.label = 'new vs last week'

    return {
      total,
      newToday,
      dailyNew,
      totalDelta,
      conversionRate,
      converted,
      hotActive,
      prioritySplit,
      overdue,
    }
  }, [leads, stats])

  return (
    <section aria-label="Key metrics" className="mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1 — Total Leads + 7-day trend */}
        <KpiCard
          index={0}
          label="Total Leads"
          value={metrics.total}
          delta={metrics.totalDelta}
          caption={`${metrics.newToday} new today`}
          valueColor="var(--color-accent)"
          chart={<Sparkline data={metrics.dailyNew} color="var(--chart-1)" />}
        />

        {/* 2 — Conversion rate + donut (no W/W delta: no conversion timestamp) */}
        <KpiCard
          index={1}
          label="Conversion Rate"
          value={`${metrics.conversionRate}%`}
          caption={`${metrics.converted} converted`}
          valueColor="var(--color-success)"
          chart={
            <MiniDonut
              value={metrics.converted}
              total={metrics.total}
              color="var(--chart-1)"
              trackColor="var(--chart-4)"
            />
          }
        />

        {/* 3 — Active hot leads + priority mini-bars (point-in-time, no delta) */}
        <KpiCard
          index={2}
          label="Hot Leads"
          value={metrics.hotActive}
          caption="need action now"
          valueColor="var(--color-hot)"
          chart={<MiniBars data={metrics.prioritySplit} />}
        />

        {/* 4 — Avg first response (SLA). No chart: the only per-day series we
            have is lead VOLUME (dailyNew), which is unrelated to response time —
            reusing it here would imply a response-time trend that doesn't exist. */}
        <KpiCard
          index={3}
          label="Avg First Response"
          value={avgResponse}
          caption={
            metrics.overdue > 0
              ? `${metrics.overdue} follow-up${metrics.overdue === 1 ? '' : 's'} overdue`
              : 'follow-ups on track'
          }
          valueColor="var(--color-text)"
        />
      </div>
    </section>
  )
}
