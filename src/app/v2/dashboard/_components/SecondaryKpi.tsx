import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Quiet secondary KPI tile.
 * - Cream paper bg
 * - 2px ink border-bottom only (no full border, no shadow)
 * - Click → /v2/leads filtered view
 */
export default function SecondaryKpi({
  label,
  value,
  subtitle,
  href,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  subtitle?: string
  href: string
  tone?: 'default' | 'alert'
}) {
  const isAlert = tone === 'alert'
  return (
    <Link
      href={href}
      className="group block px-4 py-4 transition-colors"
      style={{
        backgroundColor: 'var(--color-card)',
        borderBottom: '2px solid var(--color-border)',
      }}
    >
      <div
        className="text-eyebrow"
        style={{ color: isAlert ? 'var(--color-danger)' : 'var(--color-muted)' }}
      >
        {label}
      </div>
      <div
        className="text-display display mt-1 tabular-nums"
        style={{
          color: isAlert ? 'var(--color-danger)' : 'var(--color-text)',
          fontFamily: 'var(--font-bricolage), Georgia, serif',
          fontWeight: 700,
        }}
      >
        {value}
      </div>
      {subtitle ? (
        <div className="text-caption mt-1" style={{ color: 'var(--color-muted)' }}>
          {subtitle}
        </div>
      ) : null}
    </Link>
  )
}
