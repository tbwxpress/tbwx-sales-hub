'use client'

import { AlertTriangle, X } from 'lucide-react'

/**
 * In-context "this looks like a negative reply" prompt. Shown inside the active
 * thread when the contact's last inbound message trips the negative-reply
 * detector (or the server's negative_hint). One click marks the lead LOST via
 * the page's existing updateLeadFromInbox; dismissible so a false positive
 * doesn't nag. The server already alerts the owner — this is the agent's
 * one-click action.
 */
export default function NegativeReplyBanner({
  onMarkLost,
  onDismiss,
  busy = false,
}: {
  onMarkLost: () => void
  onDismiss: () => void
  busy?: boolean
}) {
  return (
    <div
      className="animate-fade-in border-b px-4 py-2.5 flex items-center gap-3"
      style={{
        background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
        borderColor: 'color-mix(in srgb, var(--color-danger) 30%, transparent)',
      }}
      role="alert"
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0" strokeWidth={2.2} style={{ color: 'var(--color-danger)' }} />
      <p className="text-[12px] flex-1 min-w-0" style={{ color: 'var(--color-body)' }}>
        <span className="font-semibold" style={{ color: 'var(--color-danger)' }}>Looks like a negative reply.</span>{' '}
        <span className="hidden sm:inline">Mark this lead as Lost?</span>
      </p>
      <button
        type="button"
        onClick={onMarkLost}
        disabled={busy}
        className="text-[11px] font-semibold px-2.5 py-1 rounded-md whitespace-nowrap cursor-pointer transition-colors duration-150 disabled:opacity-50 flex-shrink-0"
        style={{ background: 'var(--color-danger)', color: '#fff' }}
      >
        {busy ? 'Marking…' : 'Mark as Lost'}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="text-dim hover:text-text transition-colors flex-shrink-0 cursor-pointer"
        aria-label="Dismiss negative-reply prompt"
      >
        <X className="w-4 h-4" strokeWidth={2} />
      </button>
    </div>
  )
}
