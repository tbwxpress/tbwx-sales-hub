'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Flag, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FEEDBACK_REASONS } from '@/config/sales-signals'

/**
 * CardFeedback — the quiet "🚩 Shouldn't be here?" control on a Guided WorkCard.
 *
 * The agent disputes the engine surfacing THIS card at THIS point (priority
 * mismatch / something the system missed). On Send it SILENTLY records the
 * feedback + the system's case for showing it (queue_reason + score +
 * lead_status) — then a small toast confirms, the panel collapses and clears.
 * It NEVER advances the card, changes the lead, or logs an outcome.
 *
 * Tap-only reason chips (reusing the OutcomeBar chip style) + an optional note.
 */
export default function CardFeedback({
  leadRow,
  queueReason,
  score,
  leadStatus,
}: {
  leadRow: number
  queueReason: string
  score: number
  leadStatus: string
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  function reset() {
    setOpen(false)
    setReason(null)
    setNote('')
  }

  async function send() {
    if (!reason || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/work/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_row: leadRow,
          reason_code: reason,
          note: note.trim() || undefined,
          queue_reason: queueReason || undefined,
          score,
          lead_status: leadStatus || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Thanks — noted for the owner')
        reset()
      } else {
        toast.error(data.error || 'Could not send feedback')
      }
    } catch {
      toast.error('Network error — try again')
    }
    setSending(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-1.5 text-caption font-medium text-dim transition-colors hover:text-muted"
      >
        <Flag className="h-3 w-3" strokeWidth={2.2} aria-hidden />
        Shouldn&apos;t be here?
      </button>
    )
  }

  return (
    <div className="animate-fade-in space-y-2.5">
      <div className="text-eyebrow text-dim">Kyun? (tap one)</div>
      <div className="flex flex-wrap gap-1.5">
        {FEEDBACK_REASONS.map((c) => {
          const active = reason === c.key
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setReason(active ? null : c.key)}
              aria-pressed={active}
              className="focus-ring inline-flex items-center rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors"
              style={
                active
                  ? { borderColor: 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)', color: 'var(--color-text)' }
                  : { borderColor: 'var(--color-border)', color: 'var(--color-muted)' }
              }
            >
              {c.label}
            </button>
          )
        })}
      </div>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)…"
        className="text-sm"
        style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        maxLength={140}
        aria-label="Optional feedback note"
      />
      <div className="flex items-center gap-2">
        <Button
          onClick={send}
          disabled={!reason || sending}
          size="sm"
          className="font-semibold focus-ring disabled:opacity-50"
          style={{ background: 'var(--color-accent)', color: '#1a1209' }}
        >
          <Send className="h-3.5 w-3.5" />
          {sending ? 'Sending…' : 'Send'}
        </Button>
        <button
          type="button"
          onClick={reset}
          className="focus-ring rounded-lg px-2.5 py-1.5 text-caption font-medium text-dim transition-colors hover:text-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
