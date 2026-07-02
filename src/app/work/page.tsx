'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, RefreshCw, PartyPopper, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNow } from '@/components/inbox/useNow'
import CadenceHeader from '@/components/work/CadenceHeader'
import WorkCard from '@/components/work/WorkCard'
import OutcomeBar from '@/components/work/OutcomeBar'
import WonCelebration from '@/components/work/WonCelebration'
import type { Card, WorkStats } from '@/components/work/types'

/**
 * /work — the Guided Work Mode conveyor (the "work rail").
 *
 * An immersive, single-card cockpit. Flow:
 *   GET /api/work/queue?limit=1  → render ONE WorkCard
 *   → agent acts (call / WhatsApp / template)
 *   → picks an outcome  → POST /api/work/outcome
 *   → animate the card OUT + a crisp "+1"  → render the returned `next`
 *   → repeat until `next` is null → "you're caught up 🎉".
 *
 * Minimal chrome on purpose: the rail IS the screen (the global nav is stripped
 * for guided agents elsewhere). Only the pinned CadenceHeader sits above the
 * card so momentum (cleared / left / target / streak) is felt continuously.
 *
 * Motion budget: 150–250ms transitions, all transform/opacity. The confetti
 * keyframes WonCelebration relies on are injected once here. Everything degrades
 * gracefully under prefers-reduced-motion (handled in-component + the global
 * media query that lands transitions instantly).
 */

const DEFAULT_STATS: WorkStats = {
  attempts_today: 0,
  attempts_target: 200,
  conversations_today: 0,
  conversations_target: 50,
  streak: 0,
  queue_depth: 0,
}

type Phase = 'loading' | 'card' | 'caught-up' | 'error'

export default function WorkPage() {
  const now = useNow(45000)

  const [phase, setPhase] = useState<Phase>('loading')
  const [card, setCard] = useState<Card | null>(null)
  const [stats, setStats] = useState<WorkStats>(DEFAULT_STATS)
  const [submitting, setSubmitting] = useState(false)

  // Channel the agent actually acted on for THIS card (call/whatsapp/template).
  // Defaults to the card's primary action so the outcome is attributed sensibly
  // even if the agent advances without an explicit channel tap.
  const channelRef = useRef<'call' | 'whatsapp' | 'template' | 'system'>('system')

  // ── Animation state ───────────────────────────────────────────────────
  // `exiting` slides the current card out; `plusOne` flashes the "+1"; both are
  // transform/opacity-only and short (≤220ms) so they feel crisp, not laggy.
  const [exiting, setExiting] = useState(false)
  const [plusOne, setPlusOne] = useState(0)
  // Won overlay — only shown for the `won` outcome, before the next card.
  const [wonName, setWonName] = useState<string | null>(null)
  // The next card we've already fetched but are holding behind the animation.
  const pendingNext = useRef<{ next: Card | null } | null>(null)
  // Synchronous double-submit guard — the `submitting` STATE updates a frame
  // later, so two taps in the same frame both pass that check and double-POST.
  const inflightRef = useRef(false)

  // Initial queue load.
  const loadQueue = useCallback(async () => {
    setPhase('loading')
    try {
      const res = await fetch('/api/work/queue?limit=1')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const first: Card | null = data.cards?.[0] ?? null
      if (data.stats) setStats(data.stats)
      if (first) {
        channelRef.current = first.primary_action
        setCard(first)
        setPhase('card')
      } else {
        setCard(null)
        setPhase('caught-up')
      }
    } catch {
      setPhase('error')
    }
  }, [])

  useEffect(() => {
    loadQueue()
  }, [loadQueue])

  // Swap to the next card once the slide-out + (optional) celebration finished.
  const commitNext = useCallback(() => {
    const payload = pendingNext.current
    pendingNext.current = null
    setExiting(false)
    if (payload?.next) {
      channelRef.current = payload.next.primary_action
      setCard(payload.next)
      setPhase('card')
    } else {
      setCard(null)
      setPhase('caught-up')
    }
  }, [])

  // Submit an outcome → POST → animate out + "+1" → render the returned next.
  const handleOutcome = useCallback(
    async (args: {
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
    }) => {
      const { outcome } = args
      if (!card || submitting) return false
      if (inflightRef.current) return false
      inflightRef.current = true
      setSubmitting(true)
      const isWon = outcome.toLowerCase() === 'won'
      const clearedName = card.name || 'lead'
      try {
        const res = await fetch('/api/work/outcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadRow: card.lead_row,
            channel: channelRef.current,
            ...args,
          }),
        })
        const data = await res.json()
        if (!res.ok || data.ok === false || data.success === false) {
          toast.error(data.error || 'Could not log that outcome — try again')
          inflightRef.current = false
          setSubmitting(false)
          return false
        }

        if (data.stats) setStats(data.stats)
        if (data.routedTo) toast.success(`Routed to ${data.routedTo}`)
        if (data.suggest_whatsapp) toast('Phone nahi uthaya — WhatsApp bhej do, window khul jayegi 💬')

        // Trigger the crisp "+1" and the card slide-out together.
        pendingNext.current = { next: data.next ?? null }
        setPlusOne((n) => n + 1)
        setExiting(true)

        if (isWon) {
          // Won celebration takes over; it calls onDone → commitNext.
          setWonName(clearedName)
        } else {
          // Let the slide-out play (~220ms) then swap in the next card.
          window.setTimeout(commitNext, 220)
        }
        return true
      } catch {
        toast.error('Network error — your outcome was not saved')
        return false
      } finally {
        inflightRef.current = false
        setSubmitting(false)
      }
    },
    [card, submitting, commitNext],
  )

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-bg noise">
      {/* Confetti keyframes for WonCelebration (kept here so the component stays
          drop-in). transform/opacity only; suppressed under reduced-motion. */}
      <style>{CONFETTI_CSS}</style>

      {/* Pinned cadence header — always-visible momentum. */}
      <CadenceHeader stats={stats} />

      {/* "+1" flash — fixed, centered above the card, fires on each cleared lead. */}
      {plusOne > 0 && (
        <span
          key={plusOne}
          className="work-plus-one pointer-events-none fixed left-1/2 top-[18%] z-50 -translate-x-1/2 text-3xl font-black"
          style={{ color: 'var(--color-success)' }}
          aria-hidden
        >
          +1
        </span>
      )}

      <main className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4">
        {phase === 'loading' && <LoadingSkeleton />}

        {phase === 'error' && (
          <ErrorState onRetry={loadQueue} />
        )}

        {phase === 'caught-up' && (
          <CaughtUp cleared={stats.attempts_today} onRefresh={loadQueue} />
        )}

        {phase === 'card' && card && (
          <div className={exiting ? 'work-card-exit' : 'work-card-enter'}>
            <WorkCard
              card={card}
              now={now}
              onChannelUsed={(ch) => { channelRef.current = ch }}
            />
            <div className="mt-4">
              <OutcomeBar
                card={card}
                submitting={submitting}
                onSubmit={handleOutcome}
              />
            </div>

            {/* Quiet "remaining" hint — reinforces forward motion without nagging. */}
            {card.remaining > 0 && (
              <p className="mt-4 text-center text-caption text-dim">
                {card.remaining} more {card.remaining === 1 ? 'lead' : 'leads'} waiting after this
              </p>
            )}
          </div>
        )}
      </main>

      {/* Won celebration overlay — only on a `won` outcome. */}
      {wonName && (
        <WonCelebration
          name={wonName}
          onDone={() => {
            setWonName(null)
            commitNext()
          }}
        />
      )}
    </div>
  )
}

// ── Loading skeleton ────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="animate-fade-in space-y-4" aria-busy="true" aria-label="Loading your next lead">
      <div className="overflow-hidden rounded-2xl border border-border bg-card p-5">
        <div className="skeleton h-4 w-2/3" />
        <div className="mt-4 skeleton h-7 w-1/2" />
        <div className="mt-2 skeleton h-4 w-3/4" />
        <div className="mt-4 skeleton h-16 w-full rounded-xl" />
        <div className="mt-4 skeleton h-28 w-full rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-12 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

// ── Caught-up end state ─────────────────────────────────────────────────
function CaughtUp({ cleared, onRefresh }: { cleared: number; onRefresh: () => void }) {
  return (
    <div className="animate-scale-in flex flex-1 flex-col items-center justify-center text-center">
      <div
        className="mb-5 flex h-20 w-20 items-center justify-center rounded-full glow-success"
        style={{ background: 'color-mix(in srgb, var(--color-success) 14%, transparent)' }}
      >
        <PartyPopper className="h-9 w-9" style={{ color: 'var(--color-success)' }} strokeWidth={1.8} />
      </div>
      <h1 className="text-display text-gradient-gold">You&apos;re caught up</h1>
      <p className="mt-2 max-w-xs text-body text-muted">
        {cleared > 0
          ? `Nice work — you cleared ${cleared} ${cleared === 1 ? 'lead' : 'leads'} today. The rail is empty for now.`
          : 'No leads waiting on the rail right now. New ones will appear here automatically.'}
      </p>
      <Button
        variant="outline"
        onClick={onRefresh}
        className="mt-6 gap-2"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-body)' }}
      >
        <RefreshCw className="h-4 w-4" />
        Check again
      </Button>
    </div>
  )
}

// ── Error state ─────────────────────────────────────────────────────────
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="animate-fade-in flex flex-1 flex-col items-center justify-center text-center">
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)' }}
      >
        <Loader2 className="h-7 w-7" style={{ color: 'var(--color-danger)' }} strokeWidth={1.8} />
      </div>
      <h1 className="text-heading font-bold text-text">Couldn&apos;t load your rail</h1>
      <p className="mt-1.5 max-w-xs text-body text-muted">
        Something went wrong fetching your next lead. Check your connection and try again.
      </p>
      <Button
        onClick={onRetry}
        className="mt-5 gap-2 font-semibold"
        style={{ background: 'var(--color-accent)', color: '#1a1209' }}
      >
        <RefreshCw className="h-4 w-4" />
        Retry
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

// CSS-only confetti + the card slide/“+1” motion. All transform/opacity, short,
// and fully suppressed under prefers-reduced-motion.
const CONFETTI_CSS = `
@keyframes work-card-exit {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to   { opacity: 0; transform: translateY(-14px) scale(0.97); }
}
@keyframes work-card-enter {
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes work-plus-one {
  0%   { opacity: 0; transform: translate(-50%, 6px) scale(0.7); }
  25%  { opacity: 1; transform: translate(-50%, -4px) scale(1.1); }
  100% { opacity: 0; transform: translate(-50%, -32px) scale(1); }
}
@keyframes work-confetti-fall {
  0%   { opacity: 1; transform: translateY(0) translateX(0) rotate(var(--cf-rot)); }
  100% { opacity: 0; transform: translateY(105vh) translateX(var(--cf-drift)) rotate(calc(var(--cf-rot) + 360deg)); }
}
@keyframes work-won-pop {
  0%   { opacity: 0; transform: scale(0.85); }
  60%  { opacity: 1; transform: scale(1.04); }
  100% { opacity: 1; transform: scale(1); }
}
.work-card-exit  { animation: work-card-exit 0.22s cubic-bezier(0.4,0,1,1) forwards; }
.work-card-enter { animation: work-card-enter 0.24s cubic-bezier(0,0,0.2,1) forwards; }
.work-plus-one   { animation: work-plus-one 0.9s ease-out forwards; }
.work-confetti   { animation: work-confetti-fall var(--cf-dur) var(--cf-delay) ease-in forwards; }
.work-won-pop    { animation: work-won-pop 0.4s cubic-bezier(0,0,0.2,1) forwards; }
@media (prefers-reduced-motion: reduce) {
  .work-card-exit, .work-card-enter, .work-plus-one, .work-confetti, .work-won-pop {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
  .work-confetti { display: none !important; }
}
`
