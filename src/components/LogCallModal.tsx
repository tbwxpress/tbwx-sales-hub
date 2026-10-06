'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { emitLeadUpdated } from '@/components/gamification/events'

interface LogCallModalProps {
  phone: string
  open: boolean
  onClose: () => void
  onLogged: () => void
}

// One tap per outcome (was a dropdown: open → scroll → pick). Same values as before.
const OUTCOMES: Array<{ value: string; label: string }> = [
  { value: 'no_answer', label: 'No answer' },
  { value: 'answered', label: 'Answered' },
  { value: 'busy', label: 'Busy' },
  { value: 'callback', label: 'Callback' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'wrong_number', label: 'Wrong number' },
]

export default function LogCallModal({ phone, open, onClose, onLogged }: LogCallModalProps) {
  const [callDuration, setCallDuration] = useState('')
  const [callOutcome, setCallOutcome] = useState('no_answer')
  const [callNotes, setCallNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(phone)}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration: callDuration,
          outcome: callOutcome,
          notes: callNotes,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setCallDuration('')
        setCallOutcome('no_answer')
        setCallNotes('')
        toast.success('Call logged')
        // Points chip + streak update (no-op for the owner / when switched off).
        emitLeadUpdated({ source: 'call', phone })
        onLogged()
        onClose()
      } else {
        setError(data.error || 'Failed to log call')
      }
    } catch {
      setError('Network error — the call was not saved')
    }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md" style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
        <DialogHeader>
          <DialogTitle className="text-sm" style={{ color: 'var(--color-text)' }}>Log Call</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <p className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-dim)' }} id="log-call-outcome">How did it go?</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="log-call-outcome">
              {OUTCOMES.map(o => {
                const active = callOutcome === o.value
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setCallOutcome(o.value)}
                    className="focus-ring rounded-full border px-3 py-1.5 text-[13px] font-medium"
                    style={active
                      ? { borderColor: 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)', color: 'var(--color-text)' }
                      : { borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label htmlFor="log-call-duration" className="block text-xs font-medium mb-1" style={{ color: 'var(--color-dim)' }}>Duration (optional)</label>
            <Input
              id="log-call-duration"
              value={callDuration}
              onChange={e => setCallDuration(e.target.value)}
              placeholder="e.g. 5 min"
              className="text-sm"
              style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
          <div>
            <label htmlFor="log-call-notes" className="block text-xs font-medium mb-1" style={{ color: 'var(--color-dim)' }}>Notes</label>
            <textarea
              id="log-call-notes"
              value={callNotes}
              onChange={e => setCallNotes(e.target.value)}
              rows={3}
              placeholder="Call summary, next steps..."
              className="w-full rounded-md px-3 py-2 text-sm resize-none focus:outline-none"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
          {error && <p className="text-xs" role="alert" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full font-semibold"
            style={{ background: 'var(--color-accent)', color: '#1a1209' }}
          >
            {saving ? 'Saving...' : 'Save Call Log'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
