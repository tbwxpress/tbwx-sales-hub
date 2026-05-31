'use client'

/**
 * Hand-rolled SVG line chart — intentional choice.
 * shadcn's chart wrapper requires `recharts` which is not installed in this repo,
 * and adding a chart dep for a preview page is overkill. This stays editorial:
 * ink axis, yellow stroke, no gradients, no tooltip chrome.
 *
 * Mock data will be replaced by /api/analytics later — see TODO in parent page.
 */

type Point = { label: string; value: number }

export default function TrendChart({ data, height = 200 }: { data: Point[]; height?: number }) {
  if (data.length === 0) return null

  const width = 800 // viewBox is responsive via preserveAspectRatio
  const padLeft = 36
  const padRight = 12
  const padTop = 16
  const padBottom = 28

  const innerW = width - padLeft - padRight
  const innerH = height - padTop - padBottom

  const max = Math.max(...data.map((d) => d.value), 1)
  const min = 0

  const xFor = (i: number) =>
    padLeft + (innerW * i) / Math.max(data.length - 1, 1)
  const yFor = (v: number) =>
    padTop + innerH - ((v - min) / (max - min || 1)) * innerH

  const path = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(d.value).toFixed(1)}`)
    .join(' ')

  // Y axis ticks — 4 evenly-spaced rounded values
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(min + (max - min) * t))

  return (
    <svg
      role="img"
      aria-label="Lead flow last 14 days"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
    >
      {/* horizontal gridlines */}
      {ticks.map((t, i) => {
        const y = yFor(t)
        return (
          <g key={i}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={y}
              y2={y}
              stroke="var(--color-border-light)"
              strokeWidth={1}
            />
            <text
              x={padLeft - 8}
              y={y + 3}
              textAnchor="end"
              fontSize={10}
              fill="var(--color-muted)"
              fontFamily="var(--font-geist), sans-serif"
            >
              {t}
            </text>
          </g>
        )
      })}

      {/* baseline (ink) */}
      <line
        x1={padLeft}
        x2={width - padRight}
        y1={padTop + innerH}
        y2={padTop + innerH}
        stroke="var(--color-border)"
        strokeWidth={2}
      />

      {/* the line itself */}
      <path
        d={path}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* data points */}
      {data.map((d, i) => (
        <circle
          key={i}
          cx={xFor(i)}
          cy={yFor(d.value)}
          r={3.5}
          fill="var(--color-bg)"
          stroke="var(--color-border)"
          strokeWidth={1.5}
        />
      ))}

      {/* x-axis labels — every other one to avoid clutter */}
      {data.map((d, i) =>
        i % 2 === 0 ? (
          <text
            key={`x-${i}`}
            x={xFor(i)}
            y={height - 8}
            textAnchor="middle"
            fontSize={10}
            fill="var(--color-muted)"
            fontFamily="var(--font-geist), sans-serif"
          >
            {d.label}
          </text>
        ) : null,
      )}
    </svg>
  )
}
