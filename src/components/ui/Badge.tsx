import { ReactNode } from 'react'

export type BadgeTone = 'active' | 'hot' | 'waiting' | 'won' | 'lost' | 'neutral'

const TONE: Record<BadgeTone, { bg: string; text: string }> = {
  active:  { bg: 'color-mix(in srgb, var(--color-status-active) 16%, transparent)',  text: 'var(--color-status-active)' },
  hot:     { bg: 'color-mix(in srgb, var(--color-status-hot) 16%, transparent)',     text: 'var(--color-status-hot)' },
  waiting: { bg: 'color-mix(in srgb, var(--color-status-waiting) 16%, transparent)', text: 'var(--color-status-waiting)' },
  won:     { bg: 'color-mix(in srgb, var(--color-status-won) 16%, transparent)',     text: 'var(--color-status-won)' },
  lost:    { bg: 'color-mix(in srgb, var(--color-status-lost) 16%, transparent)',    text: 'var(--color-status-lost)' },
  neutral: { bg: 'var(--color-elevated)', text: 'var(--color-muted)' },
}

export default function Badge({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  const s = TONE[tone]
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${className}`}
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {children}
    </span>
  )
}

export function statusTone(status: string | null | undefined): BadgeTone {
  const upper = (status || '').toUpperCase()
  if (['HOT', 'FINAL_NEGOTIATION'].includes(upper)) return 'hot'
  if (['NO_RESPONSE', 'DELAYED', 'CALL_DONE_INTERESTED', 'CALLING', 'CALL_DONE', 'NEGOTIATION', 'INTERESTED'].includes(upper)) return 'waiting'
  if (upper === 'CONVERTED') return 'won'
  if (upper === 'LOST') return 'lost'
  return 'active'
}

export function priorityTone(priority: string | null | undefined): BadgeTone {
  const upper = (priority || '').toUpperCase()
  if (upper === 'HOT') return 'hot'
  if (upper === 'WARM') return 'waiting'
  if (upper === 'COLD') return 'active'
  return 'neutral'
}
