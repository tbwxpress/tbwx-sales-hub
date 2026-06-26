'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Flame,
  Phone,
  Send,
  Sparkles,
  MessageSquare,
  FileText,
  ChevronRight,
  Quote,
  Target,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import Badge, { statusTone } from '@/components/ui/Badge'
import WindowCountdown from '@/components/inbox/WindowCountdown'
import { STATUS_LABELS } from '@/config/client'
import { labelFor, SENTIMENT_CHIPS, CAPITAL_CHIPS, OBJECTION_CHIPS, DECISION_MAKER_CHIPS, PERSONA_CHIPS } from '@/config/sales-signals'
import LifecycleStrip from './LifecycleStrip'
import CardFeedback from './CardFeedback'
import type { Card } from './types'

/**
 * WorkCard — the heart of the guided rail. One lead, full focus.
 *
 * Top→bottom hierarchy (mobile-first, single column, big tap targets):
 *   1. Lifecycle strip — the lead's story without leaving the rail.
 *   2. WHO — name · city · status pill · 🔥 if HOT.
 *   3. Qualification one-liner — model · timeline · experience.
 *   4. WHY NOW — the engine's reason + last-inbound quote.
 *   5. Window-aware primary action:
 *        · window open / primary='whatsapp' → WhatsApp reply box with a
 *          lazy-loaded AI draft, Send, a live 24h countdown; secondary =
 *          template picker + a Call link.
 *        · else → big click-to-dial Call + 3 talking-point bullets;
 *          secondary = send deck/template.
 *
 * Channel emphasis is driven by `card.primary_action` + `card.window.open`.
 * The OutcomeBar (separate, the only way to advance) renders below this card on
 * the page. WorkCard reports which channel the agent actually used via
 * `onChannelUsed` so the outcome POST attributes the work correctly.
 *
 * Reuses the inbox endpoints verbatim: AI-suggest (POST /api/inbox/ai-suggest
 * {phone}), WhatsApp send (POST /api/inbox/send), templates (GET /api/templates,
 * sent via /api/inbox/send). And the shared WindowCountdown + ticking clock.
 */

interface WaTemplate {
  name: string
  label: string
  param_count: number
  category: string
}

// Indian phone → E.164 + a readable display. Leads are stored inconsistently:
// bare 10-digit ("7876543210"), with country code ("917876543210"), or with a
// leading 0. A naive `tel:+<digits>` on a bare 10-digit number starting with 7
// dials KAZAKHSTAN (+7…), so always normalise Indian mobiles to +91.
function normalizeIndiaPhone(raw: string): { e164: string; display: string } {
  let d = String(raw || '').replace(/\D/g, '')
  if (!d) return { e164: '', display: '' }
  if (d.startsWith('00')) d = d.slice(2) // drop an international "00" prefix
  if (d.length > 10 && d.startsWith('0')) d = d.replace(/^0+/, '')
  if (d.length === 10 && /^[6-9]/.test(d)) d = '91' + d // bare Indian mobile (starts 6–9)
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1)
  const e164 = '+' + d
  let display = e164
  if (d.length === 12 && d.startsWith('91')) {
    const local = d.slice(2)
    display = `+91 ${local.slice(0, 5)} ${local.slice(5)}`
  }
  return { e164, display }
}

// Sales-AI score → colour band, and temperature → colour/label.
function scoreColor(s: number): string {
  if (s >= 75) return 'var(--color-success)'
  if (s >= 50) return 'var(--color-accent)'
  if (s >= 30) return '#f59e0b'
  return 'var(--color-danger)'
}
function tempColor(t: string): string {
  return t === 'warming' ? 'var(--color-success)' : t === 'cooling' ? 'var(--color-danger)' : 'var(--color-dim)'
}
function tempLabel(t: string): string {
  return t === 'warming' ? 'Warming' : t === 'cooling' ? 'Cooling' : 'Steady'
}

// Format an age in minutes into a short, readable string: "<60" → "{n}m",
// 60–119 → "1h 5m" / "1h", ≥120 → "{h}h". Keeps the urgency strip terse.
function formatAge(mins: number): string {
  const m = Math.max(0, Math.round(mins))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h < 2) return rem > 0 ? `${h}h ${rem}m` : `${h}h`
  return `${h}h`
}

// Speed-to-lead urgency strip — non-null ONLY for fresh NEW leads. Renders a
// compact, bold, on-brand pill near the top of the card (just below the
// lifecycle strip). Drives reps to call fresh leads fast.
function UrgencyStrip({ urgency, ageMinutes }: { urgency: 'now' | 'soon' | 'aging'; ageMinutes: number | null }) {
  const mins = ageMinutes ?? 0
  let text: string
  let color: string
  if (urgency === 'now') {
    color = 'var(--color-danger)'
    text = `🔴 Abhi aaya · ${formatAge(mins)} — turant call karo!`
  } else if (urgency === 'soon') {
    color = '#f59e0b'
    text = `🟠 Naya lead · ${formatAge(mins)} — jaldi call karo`
  } else {
    color = 'var(--color-dim)'
    const hrs = Math.max(1, Math.round(mins / 60))
    text = `Naya lead · ${hrs}h pehle aaya — call karo`
  }
  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-bold leading-snug"
      style={{
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
      }}
      role="status"
    >
      {text}
    </div>
  )
}

// Three short talking-point prompts for novice telecallers on a cold call.
// Tailored from the qualification fields the engine already attaches.
function talkingPoints(card: Card): string[] {
  const pts: string[] = []
  const first = (card.name || 'there').split(' ')[0]
  pts.push(`Open warm: "Hi ${first}, calling from The Belgian Waffle Xpress about your franchise enquiry."`)
  if (card.model_interest) {
    pts.push(`Anchor on their interest: the ${card.model_interest} model — confirm budget + city fit.`)
  } else {
    pts.push(`Qualify the basics: budget range, preferred city, and how soon they want to start.`)
  }
  if (card.timeline) {
    pts.push(`They said "${card.timeline}" — ask what's driving that timeline, then book the next step.`)
  } else {
    pts.push(`Always end with a next step: book a deck walkthrough or a callback time.`)
  }
  return pts.slice(0, 3)
}

export default function WorkCard({
  card,
  now,
  onChannelUsed,
}: {
  card: Card
  /** Shared ticking clock (useNow) so the 24h countdown stays live cheaply. */
  now: number
  /** Tell the page which channel the agent acted on, for the outcome POST. */
  onChannelUsed: (channel: 'call' | 'whatsapp' | 'template') => void
}) {
  const isHot = (card.lead_priority || '').toUpperCase() === 'HOT'
  const windowOpen = card.window?.open === true
  // The rail leads with WhatsApp when the window is open AND the engine prefers
  // it; otherwise it's a call-first card (cold / window closed).
  const whatsappFirst = windowOpen && card.primary_action === 'whatsapp'

  // ── WhatsApp reply state ──────────────────────────────────────────────
  const [draft, setDraft] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const aiTriedRef = useRef(false)

  // ── AI brief (POST /api/work/reason) ──────────────────────────────────
  // A richer, lead-specific brief than the static talking points: a one-line
  // summary, bespoke talking points, an objection rebuttal, and an opener.
  // Always returns something useful (deterministic Hinglish fallback when the
  // Gemini key isn't set). Loaded once per card, silent on failure.
  const [brief, setBrief] = useState<{ summary: string; talking_points: string[]; rebuttal: string | null; opener: string; model: string } | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const briefTriedRef = useRef(false)

  const loadBrief = useCallback(async () => {
    if (briefTriedRef.current) return
    briefTriedRef.current = true
    setBriefLoading(true)
    try {
      const res = await fetch('/api/work/reason', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadRow: card.lead_row, windowOpen: card.window?.open === true }),
      })
      const data = await res.json()
      if (data.success && data.data) setBrief(data.data)
    } catch {
      /* silent — the static talking points remain */
    }
    setBriefLoading(false)
  }, [card.lead_row])

  // Lazy-load the AI draft the first time a WhatsApp-first card mounts — saves a
  // model call on call-first cards, and never re-fires for the same card.
  const loadAiDraft = useCallback(async (force = false) => {
    if (aiTriedRef.current || aiLoading || (!force && draft.trim())) return
    aiTriedRef.current = true
    setAiLoading(true)
    try {
      const res = await fetch('/api/inbox/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: card.phone }),
      })
      const data = await res.json()
      if (data.success && data.data?.suggestion) setDraft(data.data.suggestion)
    } catch {
      /* silent — the agent can still type a reply */
    }
    setAiLoading(false)
  }, [aiLoading, draft, card.phone])

  // Reset per-card state + auto-fetch the draft when a WhatsApp-first card opens.
  useEffect(() => {
    setDraft('')
    setSent(false)
    aiTriedRef.current = false
    setBrief(null)
    briefTriedRef.current = false
    // Debounce the brief so power-skipping the queue doesn't fire a Gemini call
    // for every card glanced at for <1s — only leads the rep dwells on get one.
    const briefTimer = window.setTimeout(() => loadBrief(), 700)
    if (whatsappFirst) loadAiDraft(true)
    return () => window.clearTimeout(briefTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.lead_row])

  async function handleSend() {
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: card.phone, message: draft, contact_name: card.name || '' }),
      })
      const data = await res.json()
      if (data.success) {
        setSent(true)
        onChannelUsed('whatsapp')
        toast.success('Reply sent — now log the outcome')
      } else if (data.needs_template) {
        toast.info('Window just closed — use a template below')
        setShowTemplates(true)
      } else {
        toast.error(data.error || 'Send failed')
      }
    } catch {
      toast.error('Network error — try again')
    }
    setSending(false)
  }

  // ── Templates (the "send deck / info" secondary action) ───────────────
  const [templates, setTemplates] = useState<WaTemplate[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [tplSending, setTplSending] = useState(false)
  const [tplState, setTplState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')

  function loadTemplates() {
    if (tplState === 'loading' || tplState === 'loaded') return
    setTplState('loading')
    // Only the two templates actually IN USE — the opt-in message + the deck
    // carrier ("marketing_first") configured in Admin → Settings — not every
    // approved template. Fall back to the server defaults if unset.
    Promise.all([
      fetch('/api/templates').then((r) => r.json()).catch(() => null),
      fetch('/api/settings/templates').then((r) => r.json()).catch(() => null),
    ])
      .then(([tpl, settings]) => {
        if (!tpl?.success || !Array.isArray(tpl.data)) { setTplState('error'); return }
        const s = settings?.data || settings || {}
        const optIn = String(s.opt_in || s.defaults?.opt_in || '').trim()
        const deck = String(s.marketing_first || s.defaults?.marketing_first || '').trim()
        const allow: Record<string, string> = {}
        if (optIn) allow[optIn] = 'Opt-in message'
        if (deck) allow[deck] = 'Franchise deck'
        setTemplates(
          (tpl.data as Array<{ status: string; name: string; param_count: number; category: string }>)
            .filter((t) => t.status === 'APPROVED' && allow[t.name])
            .map((t) => ({
              name: t.name,
              label: allow[t.name],
              param_count: t.param_count,
              category: t.category,
            })),
        )
        setTplState('loaded')
      })
      .catch(() => setTplState('error'))
  }

  async function sendTemplate(name: string, paramCount: number) {
    if (tplSending) return
    setTplSending(true)
    try {
      let templateParams: { type: string; text: string }[] | undefined
      if (paramCount > 0) {
        const firstName = (card.name || 'there').split(' ')[0]
        templateParams = [{ type: 'text', text: firstName }]
        for (let i = 1; i < paramCount; i++) {
          templateParams.push({ type: 'text', text: `TBWX-${card.phone.slice(-4) || '0000'}` })
        }
      }
      const res = await fetch('/api/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: card.phone, template_name: name, template_params: templateParams, contact_name: card.name || '' }),
      })
      const data = await res.json()
      if (data.success) {
        setShowTemplates(false)
        onChannelUsed('template')
        toast.success('Template sent — now log the outcome')
      } else {
        toast.error(data.error || 'Template send failed')
      }
    } catch {
      toast.error('Network error — try again')
    }
    setTplSending(false)
  }

  const { e164: telE164, display: phoneDisplay } = normalizeIndiaPhone(card.phone)
  const telHref = telE164 ? `tel:${telE164}` : '#'

  return (
    <article className="animate-fade-in-up overflow-hidden rounded-2xl border border-border bg-card glow-accent-sm">
      <div className="space-y-4 p-4 sm:p-5">
        {/* 1 · Lifecycle strip */}
        <LifecycleStrip lifecycle={card.lifecycle} />

        {/* Speed-to-lead urgency — fresh NEW leads only (non-null only then) */}
        {card.speed_urgency && (
          <UrgencyStrip urgency={card.speed_urgency} ageMinutes={card.age_minutes} />
        )}

        {/* 2 · WHO */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="flex min-w-0 items-center gap-2 text-[26px] font-bold leading-tight tracking-tight text-text">
              <span className="truncate">{card.name || 'Unknown lead'}</span>
              {isHot && (
                <Flame
                  className="h-5 w-5 shrink-0"
                  strokeWidth={2.4}
                  style={{ color: 'var(--color-status-hot)' }}
                  aria-label="HOT priority"
                />
              )}
            </h1>
            {card.lead_status && (
              <Badge tone={statusTone(card.lead_status)} className="mt-1 shrink-0">
                {STATUS_LABELS[card.lead_status] || card.lead_status}
              </Badge>
            )}
          </div>

          {/* Phone — always visible + tappable to dial (normalised to +91). */}
          {phoneDisplay && (
            <a
              href={telHref}
              onClick={() => onChannelUsed('call')}
              className="focus-ring mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-elevated px-2.5 py-1 text-[15px] font-semibold tabular-nums text-accent transition-colors hover:border-accent/50"
              aria-label={`Call ${phoneDisplay}`}
            >
              <Phone className="h-3.5 w-3.5" strokeWidth={2.4} />
              {phoneDisplay}
            </a>
          )}

          {/* Qualification one-liner — city · model · timeline · experience */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-muted">
            {[card.city, card.model_interest, card.timeline, card.experience]
              .filter(Boolean)
              .map((bit, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-dim/60" aria-hidden>·</span>}
                  <span className={i === 0 ? 'font-medium text-body' : undefined}>{bit}</span>
                </span>
              ))}
          </div>
        </div>

        {/* AI score + the captured "why" — explainable, shared with Free mode. */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[13px] font-bold tabular-nums"
              style={{ borderColor: scoreColor(card.score), color: scoreColor(card.score), background: `color-mix(in srgb, ${scoreColor(card.score)} 12%, transparent)` }}
              title="AI lead score (0–100)"
            >
              <Sparkles className="h-3 w-3" strokeWidth={2.4} />
              {card.score}
              <span className="text-[10px] font-semibold opacity-70">/100</span>
            </span>
            <span className="inline-flex items-center gap-1 text-caption" style={{ color: tempColor(card.temperature) }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: tempColor(card.temperature) }} aria-hidden />
              {tempLabel(card.temperature)}
            </span>
            <span
              className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted"
              title="Contact attempts (target 7)"
            >
              Try {card.attempt_count}/{card.attempt_target}
            </span>
            {card.score_reasons.slice(0, 3).map((r, i) => (
              <span key={i} className="rounded-full px-2 py-0.5 text-[11px] text-dim" style={{ background: 'var(--color-elevated)' }}>
                {r}
              </span>
            ))}
          </div>
          {card.signals && (
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                labelFor(SENTIMENT_CHIPS, card.signals.sentiment),
                labelFor(CAPITAL_CHIPS, card.signals.capital_readiness),
                labelFor(OBJECTION_CHIPS, card.signals.objection),
                labelFor(PERSONA_CHIPS, card.signals.buyer_persona),
                labelFor(DECISION_MAKER_CHIPS, card.signals.decision_maker),
              ]
                .filter(Boolean)
                .map((lbl, i) => (
                  <span key={i} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                    {lbl}
                  </span>
                ))}
            </div>
          )}
        </div>

        {/* 3 · WHY NOW — the reason the engine surfaced this lead now. */}
        <div
          className="rounded-xl border px-3.5 py-3"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-accent) 22%, transparent)',
            background: 'color-mix(in srgb, var(--color-accent) 7%, transparent)',
          }}
        >
          <div className="text-eyebrow mb-1 flex items-center gap-1.5 text-accent">
            <Sparkles className="h-3 w-3" strokeWidth={2.4} />
            Why now
          </div>
          <p className="text-[15px] font-semibold leading-snug text-text">{card.why_now}</p>
          {card.queue_reason && card.queue_reason !== card.why_now && (
            <p className="mt-1 flex items-start gap-1.5 text-caption text-muted">
              <Quote className="mt-0.5 h-3 w-3 shrink-0 text-dim" strokeWidth={2} aria-hidden />
              <span className="italic">{card.queue_reason}</span>
            </p>
          )}
          {/* Quiet "Shouldn't be here?" — dispute the engine surfacing this card.
              Records feedback only; never advances the card or touches the lead. */}
          <div className="mt-2">
            <CardFeedback
              leadRow={card.lead_row}
              queueReason={card.queue_reason}
              score={card.score}
              leadStatus={card.lead_status}
            />
          </div>
        </div>

        {/* Next move — the headline "do this now" (NBA). Success-tinted callout. */}
        <div
          className="rounded-xl border px-3.5 py-3"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-success) 30%, transparent)',
            background: 'color-mix(in srgb, var(--color-success) 9%, transparent)',
          }}
        >
          <div className="text-eyebrow mb-1 flex items-center gap-1.5" style={{ color: 'var(--color-success)' }}>
            <Target className="h-3 w-3" strokeWidth={2.4} />
            Abhi kya karein
          </div>
          <p className="text-[15px] font-bold leading-snug text-text">{card.nba.label}</p>
          <p className="mt-0.5 text-caption text-muted">{card.nba.reason}</p>
        </div>

        {/* 4 · Window-aware primary action */}
        {whatsappFirst ? (
          /* ── WhatsApp reply (window open) ────────────────────────────── */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-eyebrow flex items-center gap-1.5 text-[#25d366]">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                </svg>
                Reply on WhatsApp
              </span>
              <WindowCountdown lastReceivedIso={card.window.last_received_at} now={now} />
            </div>

            <div className="relative">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={aiLoading ? 'Drafting a reply…' : 'Type your reply…'}
                rows={4}
                disabled={sending || sent}
                className="resize-none pr-10 text-[15px] leading-relaxed"
                style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                aria-label="WhatsApp reply"
              />
              {aiLoading && (
                <span className="absolute right-3 top-3 inline-flex items-center gap-1 text-caption text-accent">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* AI re-draft (lets the agent regenerate / fill if empty) */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  aiTriedRef.current = false
                  setDraft('')
                  loadAiDraft(true)
                }}
                disabled={aiLoading || sending || sent}
                className="shrink-0 text-dim hover:text-accent"
                title="AI-suggest a reply"
              >
                <Sparkles className="h-4 w-4" />
                {draft.trim() ? 'Redraft' : 'AI draft'}
              </Button>

              {/* Primary: Send — gold, the one obvious action */}
              <Button
                onClick={handleSend}
                disabled={!draft.trim() || sending || sent}
                className="h-12 flex-1 text-[15px] font-bold focus-ring disabled:opacity-50"
                style={{ background: 'var(--color-accent)', color: '#1a1209' }}
              >
                <Send className="h-4 w-4" />
                {sent ? 'Sent ✓' : sending ? 'Sending…' : 'Send reply'}
              </Button>
            </div>

            {/* Secondary: template picker + a call fallback */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <TemplateMenu
                templates={templates}
                state={tplState}
                onRetry={loadTemplates}
                open={showTemplates}
                onOpenChange={(v) => { setShowTemplates(v); if (v) loadTemplates() }}
                sending={tplSending}
                onSend={sendTemplate}
              />
              <a
                href={telHref}
                onClick={() => onChannelUsed('call')}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-caption font-medium text-muted transition-colors hover:text-text"
              >
                <Phone className="h-3.5 w-3.5" />
                Call instead
              </a>
            </div>

            {/* Objection rebuttal — the highest-value line, accent/success-tinted */}
            {brief?.rebuttal && (
              <div
                className="rounded-xl border px-3.5 py-3"
                style={{
                  borderColor: 'color-mix(in srgb, var(--color-success) 30%, transparent)',
                  background: 'color-mix(in srgb, var(--color-success) 9%, transparent)',
                }}
              >
                <div className="text-eyebrow mb-1 flex items-center gap-1.5" style={{ color: 'var(--color-success)' }}>
                  <Sparkles className="h-3 w-3" strokeWidth={2.4} aria-hidden />
                  Agar objection aaye, ye bolo:
                </div>
                <p className="text-[14px] font-medium leading-snug text-text">{brief.rebuttal}</p>
              </div>
            )}
          </div>
        ) : (
          /* ── Call-first (window closed / cold) ───────────────────────── */
          <div className="space-y-3">
            {!windowOpen && card.window.last_received_at && (
              <div className="flex justify-end">
                <WindowCountdown lastReceivedIso={card.window.last_received_at} now={now} />
              </div>
            )}

            {/* Primary: big click-to-dial Call */}
            <a
              href={telHref}
              onClick={() => onChannelUsed('call')}
              className="focus-ring flex h-14 w-full items-center justify-center gap-2.5 rounded-xl text-lg font-bold transition-all active:translate-y-px"
              style={{ background: 'var(--color-accent)', color: '#1a1209' }}
              aria-label={`Call ${card.name || card.phone}`}
            >
              <Phone className="h-5 w-5" strokeWidth={2.4} />
              Call {card.name ? card.name.split(' ')[0] : 'now'}
            </a>

            {/* Best-time-to-call hint (when the engine inferred a pattern) */}
            {card.best_call_hint && (
              <p className="flex items-center justify-center gap-1.5 text-center text-caption text-accent">
                <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden />
                <span>{card.best_call_hint}</span>
              </p>
            )}

            {/* 3 talking-point prompts for novices — AI brief when loaded, else static */}
            <div className="rounded-xl border border-border bg-elevated/50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-eyebrow text-dim">Talking points</span>
                {briefLoading && !brief && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-accent">
                    <Sparkles className="h-3 w-3 animate-pulse" strokeWidth={2.4} aria-hidden />
                    AI brief bana raha hai…
                  </span>
                )}
              </div>
              {brief?.summary && (
                <p className="mb-2 text-[12px] leading-snug text-muted">{brief.summary}</p>
              )}
              <ul className="space-y-2">
                {(brief?.talking_points?.length ? brief.talking_points : talkingPoints(card)).map((pt, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-snug text-body">
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2.4} aria-hidden />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Objection rebuttal — the highest-value line, accent/success-tinted */}
            {brief?.rebuttal && (
              <div
                className="rounded-xl border px-3.5 py-3"
                style={{
                  borderColor: 'color-mix(in srgb, var(--color-success) 30%, transparent)',
                  background: 'color-mix(in srgb, var(--color-success) 9%, transparent)',
                }}
              >
                <div className="text-eyebrow mb-1 flex items-center gap-1.5" style={{ color: 'var(--color-success)' }}>
                  <Sparkles className="h-3 w-3" strokeWidth={2.4} aria-hidden />
                  Agar objection aaye, ye bolo:
                </div>
                <p className="text-[14px] font-medium leading-snug text-text">{brief.rebuttal}</p>
              </div>
            )}

            {/* Secondary: send deck/info template */}
            <div className="flex justify-center pt-0.5">
              <TemplateMenu
                templates={templates}
                state={tplState}
                onRetry={loadTemplates}
                open={showTemplates}
                onOpenChange={(v) => { setShowTemplates(v); if (v) loadTemplates() }}
                sending={tplSending}
                onSend={sendTemplate}
                label="Send deck / info"
              />
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

/** Shared template picker popover — secondary "send deck/info" action. */
function TemplateMenu({
  templates,
  state,
  onRetry,
  open,
  onOpenChange,
  sending,
  onSend,
  label = 'Send template',
}: {
  templates: WaTemplate[]
  state: 'idle' | 'loading' | 'loaded' | 'error'
  onRetry: () => void
  open: boolean
  onOpenChange: (v: boolean) => void
  sending: boolean
  onSend: (name: string, paramCount: number) => void
  label?: string
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border bg-elevated px-3 py-2 text-caption font-medium text-body transition-colors hover:border-border-light hover:text-text"
      >
        <FileText className="h-3.5 w-3.5 text-dim" />
        {label}
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 max-w-[88vw] p-2">
        <div className="text-eyebrow mb-1.5 px-1 text-dim">Approved templates</div>
        {state === 'loading' ? (
          <p className="px-1 py-2 text-caption text-dim">Loading templates…</p>
        ) : state === 'error' ? (
          <button
            type="button"
            onClick={onRetry}
            className="focus-ring w-full rounded-lg px-1 py-2 text-left text-caption transition-colors hover:text-text"
            style={{ color: 'var(--color-danger)' }}
          >
            Couldn’t load templates — tap to retry
          </button>
        ) : templates.length === 0 ? (
          <p className="px-1 py-2 text-caption text-dim">No deck template set yet — configure it in Admin → Settings → Templates.</p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {templates.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => onSend(t.name, t.param_count)}
                disabled={sending}
                className="focus-ring flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-body transition-colors hover:bg-elevated disabled:opacity-50"
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-dim" />
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
