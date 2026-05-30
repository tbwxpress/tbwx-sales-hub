'use client'

import { useEffect, useState, useCallback } from 'react'

// Opportunity Check — forces the conversation. Appears on a lead's detail page
// when there's been talking (>=2 calls or >=2 notes) but the status hasn't
// moved past the "still figuring it out" middle. Pushes the agent/telecaller
// to make a real call: is there a franchise opportunity here or not?
//
// The three buttons capture the answer as a strongly-worded, attributed note
// so the lead owner can act on it. We deliberately do NOT change status here:
// status moves are owner-only (see F2/F5 in the UX audit). The note becomes
// the input to the owner's review.
//
// Once an Opportunity Check note has been saved within the last 5 days, the
// component hides itself — the prompt has done its job and won't pester.

interface OpportunityCheckPromptProps {
  phone: string
  leadStatus: string
  leadName?: string
  onActed?: () => void
}

// Statuses where the question makes sense — the lead has engaged enough that
// "yes/no/keep working" is a real choice. Pre-engagement statuses (NEW, DECK_SENT)
// don't qualify; terminal statuses don't either.
const ELIGIBLE_STATUSES = new Set([
  'REPLIED', 'NO_RESPONSE', 'CALL_DONE_INTERESTED', 'HOT', 'FINAL_NEGOTIATION', 'DELAYED',
])

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000
const NOTE_MARKER = '[OPPORTUNITY-CHECK]'

interface CallLog { id: number; created_at: string }
interface Note { id: number; note: string; created_by: string; created_at: string }

export default function OpportunityCheckPrompt({ phone, leadStatus, leadName, onActed }: OpportunityCheckPromptProps) {
  const [eligible, setEligible] = useState(false)
  const [recentAnswer, setRecentAnswer] = useState<Note | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const evaluate = useCallback(async () => {
    if (!ELIGIBLE_STATUSES.has(leadStatus)) {
      setEligible(false)
      return
    }
    try {
      const [callsRes, notesRes] = await Promise.all([
        fetch(`/api/inbox/${encodeURIComponent(phone)}/calls`),
        fetch(`/api/inbox/${encodeURIComponent(phone)}/notes`),
      ])
      const calls = (await callsRes.json()).data as CallLog[] | undefined
      const notes = (await notesRes.json()).data as Note[] | undefined
      const callCount = calls?.length ?? 0
      const noteCount = notes?.length ?? 0

      // Engagement threshold — at least two real activity events
      const engagementThreshold = callCount >= 2 || noteCount >= 2

      // If there's a recent Opportunity Check note, suppress until it ages out
      const recent = (notes || []).find(n =>
        n.note.startsWith(NOTE_MARKER) &&
        Date.parse(n.created_at) > Date.now() - FIVE_DAYS_MS,
      )
      setRecentAnswer(recent || null)
      setEligible(engagementThreshold && !recent)
    } catch {
      setEligible(false)
    }
  }, [phone, leadStatus])

  useEffect(() => { evaluate() }, [evaluate])

  async function saveAnswer(label: 'yes' | 'no' | 'working', body: string) {
    setSaving(true)
    setError('')
    try {
      const note = `${NOTE_MARKER} ${label.toUpperCase()} — ${body}`
      const res = await fetch(`/api/inbox/${encodeURIComponent(phone)}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Save failed')
      await evaluate()
      onActed?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setSaving(false)
  }

  if (recentAnswer) {
    return (
      <div
        className="rounded-lg p-3"
        style={{
          background: 'color-mix(in srgb, var(--color-accent) 6%, var(--color-card))',
          border: '1px solid color-mix(in srgb, var(--color-accent) 22%, transparent)',
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent)' }}>
          Last opportunity check
        </p>
        <p className="text-xs mt-1.5" style={{ color: 'var(--color-text)' }}>
          {recentAnswer.note.replace(NOTE_MARKER, '').trim()}
        </p>
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-dim)' }}>
          by {recentAnswer.created_by || 'unknown'} · {new Date(recentAnswer.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
        </p>
      </div>
    )
  }

  if (!eligible) return null

  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: 'color-mix(in srgb, var(--color-warning) 8%, var(--color-card))',
        border: '1px solid color-mix(in srgb, var(--color-warning) 32%, transparent)',
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-warning)' }}>
        Opportunity check
      </p>
      <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text)' }}>
        Is there a real opportunity to close a franchise with {leadName || 'this lead'}?
      </p>
      <p className="text-[11px] mb-3 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
        Two or more calls/notes have happened but the status hasn&apos;t moved. Call them and decide — every &quot;maybe&quot; is a slow loss.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            const detail = window.prompt('What did they say? (1-2 line summary, becomes a note)') || ''
            if (!detail.trim()) return
            saveAnswer('yes', `Real opportunity to close. ${detail.trim()} — recommend moving to HOT.`)
          }}
          className="text-xs font-semibold py-2 px-3 rounded-md transition-colors disabled:opacity-50"
          style={{ background: 'color-mix(in srgb, var(--color-success) 18%, transparent)', color: 'var(--color-success)' }}
        >
          Yes, real opportunity
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            const detail = window.prompt('Why is this not closing? (becomes a note)') || ''
            if (!detail.trim()) return
            saveAnswer('no', `No real opportunity. ${detail.trim()} — recommend moving to LOST.`)
          }}
          className="text-xs font-semibold py-2 px-3 rounded-md transition-colors disabled:opacity-50"
          style={{ background: 'color-mix(in srgb, var(--color-danger) 18%, transparent)', color: 'var(--color-danger)' }}
        >
          No, mark as lost
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            const detail = window.prompt('What\'s the specific next step? (becomes a note)') || ''
            if (!detail.trim()) return
            saveAnswer('working', `Still working it. Next step: ${detail.trim()}`)
          }}
          className="text-xs font-semibold py-2 px-3 rounded-md transition-colors disabled:opacity-50"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)', color: 'var(--color-accent)' }}
        >
          Still working it
        </button>
      </div>
      {error && <p className="text-[11px] mt-2" style={{ color: 'var(--color-danger)' }}>{error}</p>}
    </div>
  )
}
