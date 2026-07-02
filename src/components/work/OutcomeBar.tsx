'use client'

import { useState } from 'react'
import { Check, CalendarClock, Trophy, X, MessageCircle, PenLine, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import {
  SENTIMENT_CHIPS,
  OBJECTION_CHIPS,
  CAPITAL_CHIPS,
  DECISION_MAKER_CHIPS,
  PERSONA_CHIPS,
  NEXT_STEP_CHIPS,
  type Chip,
} from '@/config/sales-signals'
import { LOST_REASONS } from '@/config/client'
import type { Card, Outcome } from './types'

/**
 * OutcomeBar — the forced-choice gate + the frictionless "why" capture.
 *
 * Flow per outcome:
 *  - A sentiment strip (Garam / Thoda / Thanda / Cold) sits above the buttons —
 *    one optional tap on EVERY outcome.
 *  - HONEST-NEGATIVE / non-connect (no_answer, no_response) fire on a SINGLE
 *    tap — truth is the lazy path. LOST outcomes (lost, not_interested) are the
 *    exception: they open a REQUIRED lost-reason chip panel (the server rejects
 *    a LOST transition without a reason).
 *  - OPTIMISTIC / stall outcomes open a tiny chip panel (tap-not-type): qualify
 *    (interested) → Paisa? / Decider? / Persona; soft-no (not_ready, going_cold)
 *    → objection; advance (deck_sent, advanced) → next step. A "Save & next" tap
 *    confirms (so an optimistic outcome costs one extra honest tap).
 *  - callback / booked keep the date quick-pick; the chosen YYYY-MM-DD is `note`.
 *  All chips are optional — skipping is allowed and never punished.
 */

const DATE_OUTCOMES = new Set(['callback', 'booked'])

type SignalKind = 'objection' | 'capital_readiness' | 'decision_maker' | 'buyer_persona' | 'next_step' | 'lost_reason'

// Build the lost-reason chip array from the config Record (key → label).
const LOST_REASON_CHIPS: Chip[] = Object.entries(LOST_REASONS).map(([key, label]) => ({ key, label }))
const LOST_REASON_KEYS = new Set(Object.keys(LOST_REASONS))

const CHIP_SETS: Record<SignalKind, { label: string; chips: Chip[] }> = {
  capital_readiness: { label: 'Paisa?', chips: CAPITAL_CHIPS },
  decision_maker: { label: 'Decision kaun lega?', chips: DECISION_MAKER_CHIPS },
  buyer_persona: { label: 'Kaisa buyer?', chips: PERSONA_CHIPS },
  objection: { label: 'Kya rok raha hai?', chips: OBJECTION_CHIPS },
  next_step: { label: 'Aage kya?', chips: NEXT_STEP_CHIPS },
  lost_reason: { label: 'Kyu lose hua?', chips: LOST_REASON_CHIPS },
}

// Outcomes that open the lost-reason panel (REQUIRED — confirm locked until chosen).
const LOST_OUTCOMES = new Set(['lost', 'not_interested'])

// Which chips to ask per outcome (only the moments that matter).
const OUTCOME_DETAIL: Record<string, SignalKind[]> = {
  interested: ['capital_readiness', 'decision_maker', 'buyer_persona'],
  not_ready: ['objection'],
  going_cold: ['objection'],
  deck_sent: ['next_step'],
  advanced: ['next_step'],
  lost: ['lost_reason'],
  not_interested: ['lost_reason'],
}

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return toYmd(d)
}

function outcomeStyle(key: string): { variant: 'win' | 'loss' | 'neutral'; icon: React.ReactNode } {
  const k = key.toLowerCase()
  if (k === 'won') return { variant: 'win', icon: <Trophy className="h-4 w-4" /> }
  if (k.includes('lost') || k.includes('not_interested')) return { variant: 'loss', icon: <X className="h-4 w-4" /> }
  if (DATE_OUTCOMES.has(k)) return { variant: 'neutral', icon: <CalendarClock className="h-4 w-4" /> }
  return { variant: 'neutral', icon: <Check className="h-4 w-4" /> }
}

export default function OutcomeBar({
  card,
  submitting,
  onSubmit,
}: {
  card: Card
  submitting: boolean
  onSubmit: (args: {
    outcome: string
    note?: string
    alsoWhatsapp?: boolean
    sentiment?: string
    objection?: string
    capital_readiness?: string
    decision_maker?: string
    buyer_persona?: string
    next_step?: string
    lost_reason?: string
    lost_reason_note?: string
  }) => Promise<boolean | void> | void
}) {
  const [note, setNote] = useState('')
  const [alsoWa, setAlsoWa] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [dateFor, setDateFor] = useState<string | null>(null)
  const [pickedDate, setPickedDate] = useState('')
  // The captured "why".
  const [sentiment, setSentiment] = useState<string | null>(null)
  const [detailFor, setDetailFor] = useState<string | null>(null)
  const [picked, setPicked] = useState<Partial<Record<SignalKind, string>>>({})
  // Lost-reason note (optional short note when the panel is a LOST outcome).
  const [lostNote, setLostNote] = useState('')

  function reset() {
    setNote('')
    setAlsoWa(false)
    setShowNote(false)
    setDateFor(null)
    setPickedDate('')
    setSentiment(null)
    setDetailFor(null)
    setPicked({})
    setLostNote('')
  }

  async function fire(outcome: string, opts: { dateNote?: string; signals?: Partial<Record<SignalKind, string>> } = {}) {
    if (submitting) return
    const sig = opts.signals || {}
    const ok = await onSubmit({
      outcome,
      note: opts.dateNote || note.trim() || undefined,
      alsoWhatsapp: alsoWa || undefined,
      sentiment: sentiment || undefined,
      objection: sig.objection,
      capital_readiness: sig.capital_readiness,
      decision_maker: sig.decision_maker,
      buyer_persona: sig.buyer_persona,
      next_step: sig.next_step,
      lost_reason: sig.lost_reason || undefined,
      lost_reason_note: (sig.lost_reason && lostNote.trim()) ? lostNote.trim() : undefined,
    })
    // Keep the rep's captured chips/note if the submit FAILED (handleOutcome
    // returns false on a non-ok/network error) — only reset on success.
    if (ok !== false) reset()
  }

  function handleOutcomeClick(o: Outcome) {
    const k = o.key.toLowerCase()
    if (DATE_OUTCOMES.has(k)) {
      setDetailFor(null) // one outcome at a time — close any open chip panel
      setDateFor(dateFor === o.key ? null : o.key)
      return
    }
    if (OUTCOME_DETAIL[o.key]) {
      // Open the chip panel (toggle). The "Save & next" inside it submits.
      setDateFor(null) // close any open date popover
      setDetailFor((cur) => (cur === o.key ? null : o.key))
      setPicked({})
      setLostNote('')
      return
    }
    // fast / honest-negative — single tap. Close any open panels first.
    setDateFor(null)
    setDetailFor(null)
    fire(o.key)
  }

  const detailKinds = detailFor ? OUTCOME_DETAIL[detailFor] : null

  return (
    <div className="space-y-3">
      {/* Sentiment — one optional tap on every outcome. */}
      <div>
        <div className="text-eyebrow mb-1.5 text-dim">Lead kaisa laga?</div>
        <div className="flex flex-wrap gap-1.5">
          {SENTIMENT_CHIPS.map((c) => (
            <ChipButton key={c.key} chip={c} active={sentiment === c.key} onClick={() => setSentiment(sentiment === c.key ? null : c.key)} />
          ))}
        </div>
      </div>

      {/* Note + "also contacted on WhatsApp". */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowNote((s) => !s)}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-caption font-medium transition-colors"
          style={
            showNote
              ? { borderColor: 'color-mix(in srgb, var(--color-accent) 45%, transparent)', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', color: 'var(--color-text)' }
              : { borderColor: 'var(--color-border)', color: 'var(--color-muted)' }
          }
          aria-pressed={showNote}
        >
          <PenLine className="h-3.5 w-3.5" />
          {showNote ? 'Hide note' : 'Add note'}
        </button>
        <button
          type="button"
          onClick={() => setAlsoWa((s) => !s)}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-caption font-medium transition-colors"
          style={
            alsoWa
              ? { borderColor: 'var(--color-success)', background: 'color-mix(in srgb, var(--color-success) 16%, transparent)', color: 'var(--color-success)' }
              : { borderColor: 'var(--color-border)', color: 'var(--color-muted)' }
          }
          aria-pressed={alsoWa}
          title="Record an off-system WhatsApp touch (tracked as a flag, not scored)"
        >
          {alsoWa ? <Check className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
          Also contacted on WhatsApp
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

      {/* The forced choice. */}
      <div className="flex items-center gap-2 pt-0.5">
        <span className="text-eyebrow text-dim">How did it go?</span>
        <span className="h-px flex-1" style={{ background: 'color-mix(in srgb, var(--color-border) 70%, transparent)' }} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {card.outcomes.map((o) => {
          const s = outcomeStyle(o.key)
          const isDate = DATE_OUTCOMES.has(o.key.toLowerCase())
          const isOpen = detailFor === o.key
          const btn = (
            <button
              type="button"
              onClick={() => handleOutcomeClick(o)}
              disabled={submitting}
              className={[
                'focus-ring flex min-h-[54px] w-full items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-[13.5px] font-semibold transition-all active:translate-y-px disabled:opacity-50',
                s.variant === 'win' ? 'btn-win text-[var(--color-success)]' : '',
                s.variant === 'loss' ? 'btn-loss text-[var(--color-danger)]' : '',
                s.variant === 'neutral' ? 'border bg-elevated text-body hover:bg-card' : '',
              ].join(' ')}
              style={s.variant === 'neutral' ? { borderColor: isOpen ? 'var(--color-accent)' : 'var(--color-border)' } : undefined}
              aria-haspopup={isDate || !!OUTCOME_DETAIL[o.key] ? 'dialog' : undefined}
              aria-expanded={isOpen || undefined}
            >
              {s.icon}
              <span className="truncate">{o.label}</span>
            </button>
          )

          if (!isDate) return <div key={o.key}>{btn}</div>

          return (
            <Popover key={o.key} open={dateFor === o.key} onOpenChange={(v) => setDateFor(v ? o.key : null)}>
              <PopoverTrigger render={btn} />
              <PopoverContent align="center" className="w-56">
                <div className="text-eyebrow mb-1.5 text-dim">When?</div>
                <div className="grid grid-cols-1 gap-1.5">
                  <QuickDate label="Tomorrow" onPick={() => fire(o.key, { dateNote: addDays(1) })} />
                  <QuickDate label="In 3 days" onPick={() => fire(o.key, { dateNote: addDays(3) })} />
                  <div className="mt-1 flex items-center gap-1.5">
                    <Input
                      type="date"
                      value={pickedDate}
                      min={addDays(1)}
                      onChange={(e) => setPickedDate(e.target.value)}
                      className="text-sm"
                      style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                      aria-label="Pick a date"
                    />
                    <Button
                      size="sm"
                      onClick={() => pickedDate && fire(o.key, { dateNote: pickedDate })}
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

      {/* Inline chip detail panel for optimistic / stall outcomes. */}
      {detailFor && detailKinds && (
        <div
          className="animate-fade-in space-y-3 rounded-xl border p-3"
          style={{ borderColor: 'color-mix(in srgb, var(--color-accent) 35%, transparent)', background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)' }}
        >
          {detailKinds.map((kind) => (
            <div key={kind}>
              <div className="text-eyebrow mb-1.5 flex items-center gap-1.5 text-dim">
                {CHIP_SETS[kind].label}
                {kind === 'lost_reason' && (
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: 'color-mix(in srgb, var(--color-danger) 18%, transparent)', color: 'var(--color-danger)' }}>
                    Required
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CHIP_SETS[kind].chips.map((c) => (
                  <ChipButton
                    key={c.key}
                    chip={c}
                    active={picked[kind] === c.key}
                    onClick={() => setPicked((p) => ({ ...p, [kind]: p[kind] === c.key ? undefined : c.key }))}
                  />
                ))}
              </div>
              {kind === 'lost_reason' && (
                <Input
                  value={lostNote}
                  onChange={(e) => setLostNote(e.target.value)}
                  placeholder="Short note (optional)…"
                  className="mt-2 text-sm"
                  style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  maxLength={140}
                  aria-label="Optional note for lost reason"
                />
              )}
            </div>
          ))}
          {(() => {
            const isLostOutcome = LOST_OUTCOMES.has(detailFor)
            const lostReasonPicked = isLostOutcome ? LOST_REASON_KEYS.has(picked.lost_reason || '') : true
            return (
              <div className="flex items-center gap-2 pt-0.5">
                <Button
                  onClick={() => fire(detailFor, { signals: picked })}
                  disabled={submitting || !lostReasonPicked}
                  className="h-11 flex-1 font-bold focus-ring"
                  style={{ background: 'var(--color-accent)', color: '#1a1209' }}
                  title={isLostOutcome && !lostReasonPicked ? 'Select a reason before confirming' : undefined}
                >
                  Save &amp; next
                  <ArrowRight className="h-4 w-4" />
                </Button>
                {!isLostOutcome && (
                  <button
                    type="button"
                    onClick={() => fire(detailFor)}
                    className="focus-ring rounded-lg px-3 py-2 text-caption font-medium text-dim transition-colors hover:text-muted"
                  >
                    Skip
                  </button>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

function ChipButton({ chip, active, onClick }: { chip: Chip; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="focus-ring inline-flex items-center rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors"
      style={
        active
          ? { borderColor: 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)', color: 'var(--color-text)' }
          : { borderColor: 'var(--color-border)', color: 'var(--color-muted)' }
      }
    >
      {chip.label}
    </button>
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
