'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  SENTIMENT_CHIPS,
  CAPITAL_CHIPS,
  OBJECTION_CHIPS,
  DECISION_MAKER_CHIPS,
  PERSONA_CHIPS,
  labelFor,
  type Chip,
} from '@/config/sales-signals'
import type { LeadSignal } from '@/lib/db'

interface AiScore {
  score: number
  reasons: string[]
  temperature: 'warming' | 'flat' | 'cooling'
}

interface Nba {
  action: string
  label: string
  reason: string
}

// The signal fields a Free-mode rep can set/correct here, mapped to their chip
// taxonomy. next_step / connected_ever are captured elsewhere (Guided/Calls).
const GROUPS: { field: keyof LeadSignal; label: string; chips: Chip[] }[] = [
  { field: 'sentiment', label: 'Temperature', chips: SENTIMENT_CHIPS },
  { field: 'capital_readiness', label: 'Capital', chips: CAPITAL_CHIPS },
  { field: 'objection', label: 'Objection', chips: OBJECTION_CHIPS },
  { field: 'decision_maker', label: 'Decision maker', chips: DECISION_MAKER_CHIPS },
  { field: 'buyer_persona', label: 'Persona', chips: PERSONA_CHIPS },
]

function tempColor(t: AiScore['temperature']): string {
  return t === 'warming' ? 'var(--color-success)' : t === 'cooling' ? 'var(--color-danger)' : 'var(--color-dim)'
}

/**
 * Sales Signals card for the Free-mode lead detail. READS the captured signals +
 * the signal-aware AI score from the shared brain, and lets an experienced rep
 * set/correct each signal with one tap (Hinglish chips). Writes persist via
 * POST /api/leads/[id]/signals — the same store Guided Mode feeds.
 */
export default function LeadSignalsCard({ leadRow }: { leadRow: number }) {
  const [signals, setSignals] = useState<LeadSignal | null>(null)
  const [ai, setAi] = useState<AiScore | null>(null)
  const [nba, setNba] = useState<Nba | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${leadRow}/signals`)
      const data = await res.json()
      if (data.success) {
        setSignals(data.signals ?? null)
        setAi(data.ai ?? null)
        setNba(data.nba ?? null)
      }
    } catch { /* non-critical */ }
  }, [leadRow])

  useEffect(() => { load() }, [load])

  // One-tap set / correct / clear. Tapping the active chip toggles it OFF by
  // POSTing null; the signals route treats an explicit null as a clear (junk is
  // still dropped), so the field actually unsets in the shared brain.
  const setField = useCallback(async (field: keyof LeadSignal, key: string) => {
    const current = (signals?.[field] as string | null) ?? null
    const next = current === key ? null : key
    // Optimistic
    setSignals(prev => ({ ...(prev ?? ({ lead_row: leadRow } as LeadSignal)), [field]: next } as LeadSignal))
    setSaving(field)
    try {
      const res = await fetch(`/api/leads/${leadRow}/signals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
      })
      const data = await res.json()
      if (data.ok || data.success) {
        if (data.signals) setSignals(data.signals)
        // Re-pull the AI score so the reasons/temperature reflect the change.
        load()
      } else {
        toast.error(data.error || 'Could not save')
        load()
      }
    } catch {
      toast.error('Could not save')
      load()
    }
    setSaving(null)
  }, [signals, leadRow, load])

  // The captured signals as a read strip (skip blanks).
  const readChips: { label: string; value: string }[] = []
  if (signals) {
    if (signals.sentiment) readChips.push({ label: 'Temp', value: labelFor(SENTIMENT_CHIPS, signals.sentiment) })
    if (signals.capital_readiness) readChips.push({ label: 'Capital', value: labelFor(CAPITAL_CHIPS, signals.capital_readiness) })
    if (signals.objection) readChips.push({ label: 'Objection', value: labelFor(OBJECTION_CHIPS, signals.objection) })
    if (signals.buyer_persona) readChips.push({ label: 'Persona', value: labelFor(PERSONA_CHIPS, signals.buyer_persona) })
    if (signals.decision_maker) readChips.push({ label: 'Decider', value: labelFor(DECISION_MAKER_CHIPS, signals.decision_maker) })
  }

  return (
    <div className="bg-card rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-dim uppercase tracking-wide">Sales Signals</h2>
        {ai && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium" style={{ color: tempColor(ai.temperature) }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tempColor(ai.temperature) }} />
            {ai.temperature} · AI {ai.score}
          </span>
        )}
      </div>

      {/* AI reasons — the "why" behind the signal-aware score */}
      {ai && ai.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ai.reasons.map((r, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-elevated text-muted border border-border">
              {r}
            </span>
          ))}
        </div>
      )}

      {/* Recommended next move (NBA) — same brain Guided Mode uses */}
      {nba && (
        <div className="rounded-md border border-success/30 bg-success/5 px-2.5 py-1.5">
          <p className="text-[10px] uppercase tracking-wider text-success/80 mb-0.5">Aage kya karein</p>
          <p className="text-[12px] font-semibold text-text leading-snug">{nba.label}</p>
          <p className="text-[11px] text-muted leading-snug">{nba.reason}</p>
        </div>
      )}

      {/* Captured signals — read strip (skip blanks) */}
      {readChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pb-1">
          {readChips.map((c, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
              <span className="text-dim mr-1">{c.label}:</span>{c.value}
            </span>
          ))}
        </div>
      )}

      {/* Capture — one selectable chip per group */}
      <div className="space-y-2.5 pt-1 border-t border-border/60">
        {GROUPS.map(group => {
          const active = (signals?.[group.field] as string | null) ?? null
          return (
            <div key={group.field as string}>
              <p className="text-[10px] text-dim uppercase tracking-wider mb-1 flex items-center gap-1.5">
                {group.label}
                {saving === group.field && <span className="text-accent">saving…</span>}
              </p>
              <div className="flex flex-wrap gap-1">
                {group.chips.map(chip => {
                  const isActive = active === chip.key
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => setField(group.field, chip.key)}
                      className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                        isActive
                          ? 'bg-accent/20 text-accent border-accent/40'
                          : 'bg-elevated text-muted border-border hover:text-text hover:border-border'
                      }`}
                    >
                      {chip.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
