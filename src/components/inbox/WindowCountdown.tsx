'use client'

import { Clock, Lock } from 'lucide-react'

const WINDOW_MS = 24 * 60 * 60 * 1000
const AMBER_MS = 3 * 60 * 60 * 1000 // under 3h → warning
const RED_MS = 60 * 60 * 1000 // under 1h → danger

/**
 * Live 24-hour WhatsApp service-window countdown.
 *
 * WhatsApp lets you free-message a contact for 24h after their last *inbound*
 * message; after that only templates send. This replaces the old static
 * "24h open / Template only" pill with a ticking "{Xh Ym} left" that the
 * agent can trust at a glance — green with headroom, amber under 3h, red under
 * 1h, and a locked "Template only" once the window has closed.
 *
 * Purely presentational: server-side enforcement in /api/inbox/send is the
 * source of truth — this just surfaces urgency. Pass `now` from a shared
 * ticking clock (useNow) so the whole page ticks on one interval.
 */
export default function WindowCountdown({
  lastReceivedIso,
  now,
  className = '',
}: {
  lastReceivedIso: string | null
  now: number
  className?: string
}) {
  const remaining = lastReceivedIso
    ? WINDOW_MS - (now - new Date(lastReceivedIso).getTime())
    : -1

  const expired = remaining <= 0

  // Tone via theme tokens — success / warning / danger.
  const tone = expired
    ? 'var(--color-danger)'
    : remaining < RED_MS
      ? 'var(--color-danger)'
      : remaining < AMBER_MS
        ? 'var(--color-warning)'
        : 'var(--color-success)'

  let label: string
  if (expired) {
    label = 'Template only'
  } else {
    const totalMin = Math.floor(remaining / 60000)
    const hrs = Math.floor(totalMin / 60)
    const mins = totalMin % 60
    label = hrs > 0 ? `${hrs}h ${mins}m left` : `${mins}m left`
  }

  return (
    <span
      className={`text-[10px] px-2 py-1 rounded-full font-semibold inline-flex items-center gap-1 tabular-nums transition-colors duration-300 ${className}`}
      style={{
        color: tone,
        backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`,
      }}
      title={
        expired
          ? 'The 24-hour free-reply window has closed — only approved templates will send.'
          : 'Time left to send a free-form reply before only templates are allowed.'
      }
      aria-label={expired ? 'Outside 24 hour window, template only' : `${label} in the 24 hour reply window`}
    >
      {expired ? <Lock className="w-3 h-3" strokeWidth={2.2} /> : <Clock className="w-3 h-3" strokeWidth={2.2} />}
      {label}
    </span>
  )
}
