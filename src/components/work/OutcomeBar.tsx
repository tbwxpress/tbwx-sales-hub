'use client'

import { useState } from 'react'
import { Check, CalendarClock, Trophy, X, MessageCircle, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import type { Card, Outcome } from './types'

/**
 * OutcomeBar — the forced-choice gate. The ONLY way to advance the rail.
 * Renders buttons straight from `card.outcomes` (never hardcoded). Picking an
 * outcome submits POST /api/work/outcome and pulls the next card.
 *
 * - callback / booked outcomes open a tiny date quick-pick (Tomorrow / +3 days /
 *   pick a date) and the chosen `YYYY-MM-DD` is sent as `note`.
 * - An optional one-line note applies to any outcome.
 * - A "✓ also messaged on WhatsApp" toggle records an off-system touch as a flag
 *   (alsoWhatsapp: true) without scoring it.
 */

// Outcomes that need a scheduled date captured as the note.
const DATE_OUTCOMES = new Set(['callback', 'booked'])

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return toYmd(d)
}

/** Tone + icon per outcome family — derived from the key so new keys still render. */
function outcomeStyle(key: string): { variant: 'win' | 'loss' | 'neutral'; icon: React.ReactNode } {
  const k = key.toLowerCase()
  if (k === 'won') return { variant: 'win', icon: <Trophy className="h-4 w-4" /> }
  if (k.includes('lost') || k.includes('not_interested')) return { variant: 'loss', icon: <X className="h-4 w-4" /> }
  if (DATE_OUTCOMES.has(k)) return { variant: 'neutral', icon: <CalendarClock className="h-4 w-4" /> }
  return { variant: 'neutral', icon: <Check className="h-4 w-4" /> }
}

export default function OutcomeBar({
  card,
  channel,
  submitting,
  onSubmit,
}: {
  card: Card
  /** The channel the agent actually used (whatsapp/call) for this card. */
  channel: 'call' | 'whatsapp' | 'template' | 'system'
  submitting: boolean
  onSubmit: (args: { outcome: string; note?: string; alsoWhatsapp?: boolean }) => void
}) {
  const [note, setNote] = useState('')
  const [alsoWa, setAlsoWa] = useState(false)
  const [showNote, setShowNote] = useState(false)
  // Which date-outcome popover is open (by key), and its picked date.
  const [dateFor, setDateFor] = useState<string | null>(null)
  const [pickedDate, setPickedDate] = useState('')

  function fire(outcome: string, dateNote?: string) {
    if (submitting) return
    const finalNote = dateNote || note.trim() || undefined
    onSubmit({ outcome, note: finalNote, alsoWhatsapp: alsoWa || undefined })
    setNote('')
    setAlsoWa(false)
    setShowNote(false)
    setDateFor(null)
    setPickedDate('')
  }

  function handleOutcomeClick(o: Outcome) {
    if (DATE_OUTCOMES.has(o.key.toLowerCase())) {
      setDateFor(dateFor === o.key ? null : o.key)
      return
    }
    fire(o.key)
  }

  return (
    <div className="space-y-2.5">
      {/* Optional note + also-WhatsApp toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowNote((s) => !s)}
          className="focus-ring inline-flex items-center gap-1 rounded-full px-2 py-1 text-caption text-dim transition-colors hover:text-muted"
          aria-pressed={showNote}
        >
          <PenLine className="h-3 w-3" />
          {showNote ? 'Hide note' : 'Add note'}
        </button>
        <button
          type="button"
          onClick={() => setAlsoWa((s) => !s)}
          className="focus-ring inline-flex items-center gap-1 rounded-full px-2 py-1 text-caption transition-colors"
          style={
            alsoWa
              ? { background: 'color-mix(in srgb, var(--color-success) 16%, transparent)', color: 'var(--color-success)' }
              : { color: 'var(--color-dim)' }
          }
          aria-pressed={alsoWa}
          title="Record an off-system WhatsApp touch (tracked as a flag, not scored)"
        >
          {alsoWa ? <Check className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
          also messaged on WhatsApp
        </button>
      </div>

      {showNote && (
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="One-line note (optional)…"
          className="animate-fade-in text-sm"
          style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          maxLength={140}
          aria-label="Optional note for this outcome"
        />
      )}

      {/* Outcome buttons — rendered straight from card.outcomes */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {card.outcomes.map((o) => {
          const s = outcomeStyle(o.key)
          const isDate = DATE_OUTCOMES.has(o.key.toLowerCase())
          const btn = (
            <button
              type="button"
              onClick={() => handleOutcomeClick(o)}
              disabled={submitting}
              className={[
                'focus-ring flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all active:translate-y-px disabled:opacity-50',
                s.variant === 'win' ? 'btn-win text-[var(--color-success)]' : '',
                s.variant === 'loss' ? 'btn-loss text-[var(--color-danger)]' : '',
                s.variant === 'neutral' ? 'border border-border bg-elevated text-body hover:border-border-light hover:bg-card' : '',
              ].join(' ')}
              aria-haspopup={isDate ? 'dialog' : undefined}
            >
              {s.icon}
              <span className="truncate">{o.label}</span>
            </button>
          )

          if (!isDate) return <div key={o.key}>{btn}</div>

          // Date outcomes wrap the button in a quick-pick popover.
          return (
            <Popover key={o.key} open={dateFor === o.key} onOpenChange={(v) => setDateFor(v ? o.key : null)}>
              <PopoverTrigger render={btn} />
              <PopoverContent align="center" className="w-56">
                <div className="text-eyebrow mb-1.5 text-dim">When?</div>
                <div className="grid grid-cols-1 gap-1.5">
                  <QuickDate label="Tomorrow" onPick={() => fire(o.key, addDays(1))} />
                  <QuickDate label="In 3 days" onPick={() => fire(o.key, addDays(3))} />
                  <div className="mt-1 flex items-center gap-1.5">
                    <Input
                      type="date"
                      value={pickedDate}
                      min={toYmd(new Date())}
                      onChange={(e) => setPickedDate(e.target.value)}
                      className="text-sm"
                      style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                      aria-label="Pick a date"
                    />
                    <Button
                      size="sm"
                      onClick={() => pickedDate && fire(o.key, pickedDate)}
                      disabled={!pickedDate}
                      style={{ background: 'var(--color-accent)', color: '#1a1209' }}
                    >
                      Set
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )
        })}
      </div>
    </div>
  )
}

function QuickDate({ label, onPick }: { label: string; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="focus-ring flex items-center justify-between rounded-lg border border-border bg-elevated px-3 py-2 text-sm font-medium text-body transition-colors hover:border-accent/50 hover:text-text"
    >
      <span>{label}</span>
      <CalendarClock className="h-3.5 w-3.5 text-dim" />
    </button>
  )
}
