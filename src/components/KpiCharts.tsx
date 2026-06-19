'use client'

/**
 * KpiCharts — the recharts mini-charts used inside KpiCard.
 *
 * This whole module is imported via next/dynamic(..., { ssr: false }) from
 * DashboardWidgets, so recharts (a heavy dep) is code-split out of the initial
 * dashboard bundle and only fetched when the admin dashboard actually mounts.
 *
 * Every colour comes from the TBWX chart theme vars:
 *   --chart-1 #f5c518 (gold) · --chart-2 #cdb898 · --chart-3 #a09078
 *   --chart-4 #3d2e1a · --chart-5 #2e2214
 */

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  ResponsiveContainer,
} from 'recharts'

const W = 64
const H = 36

// ── Sparkline (trend over time) ────────────────────────────────────────────
export function Sparkline({
  data,
  color = 'var(--chart-1)',
}: {
  data: number[]
  color?: string
}) {
  const points = data.map((v, i) => ({ i, v }))
  // Degenerate guard: a flat/empty series still renders a faint baseline.
  if (points.length < 2) {
    return (
      <div
        style={{ width: W, height: H }}
        className="rounded"
        aria-hidden
      />
    )
  }
  return (
    <div style={{ width: W, height: H }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Mini bar (small categorical comparison) ────────────────────────────────
export function MiniBars({
  data,
}: {
  data: { label: string; value: number; color?: string }[]
}) {
  const rows = data.map((d, i) => ({
    ...d,
    color: d.color ?? `var(--chart-${(i % 5) + 1})`,
  }))
  return (
    <div style={{ width: W, height: H }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={2}>
          <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {rows.map((r, i) => (
              <Cell key={i} fill={r.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Mini donut (part-to-whole, e.g. conversion) ────────────────────────────
export function MiniDonut({
  value,
  total,
  color = 'var(--chart-1)',
  trackColor = 'var(--chart-4)',
}: {
  value: number
  total: number
  color?: string
  trackColor?: string
}) {
  const safeTotal = Math.max(total, 1)
  const remainder = Math.max(safeTotal - value, 0)
  const data = [
    { name: 'value', v: value, fill: color },
    { name: 'rest', v: remainder, fill: trackColor },
  ]
  return (
    <div style={{ width: H, height: H }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="v"
            innerRadius={11}
            outerRadius={17}
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
