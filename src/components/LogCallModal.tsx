'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface LogCallModalProps {
  phone: string
  open: boolean
  onClose: () => void
  onLogged: () => void
}

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
        onLogged()
        onClose()
      } else {
        setError(data.error || 'Failed to log call')
      }
    } catch {
      setError('Network error')
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-dim)' }}>Duration</label>
              <Input
                value={callDuration}
                onChange={e => setCallDuration(e.target.value)}
                placeholder="e.g. 5 min"
                className="text-sm"
                style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-dim)' }}>Outcome</label>
              <Select value={callOutcome} onValueChange={v => v && setCallOutcome(v)}>
                <SelectTrigger className="text-sm" style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                  <SelectItem value="no_answer">No Answer</SelectItem>
                  <SelectItem value="answered">Answered</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
                  <SelectItem value="callback">Callback Scheduled</SelectItem>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="not_interested">Not Interested</SelectItem>
                  <SelectItem value="wrong_number">Wrong Number</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-dim)' }}>Notes</label>
            <textarea
              value={callNotes}
              onChange={e => setCallNotes(e.target.value)}
              rows={3}
              placeholder="Call summary, next steps..."
              className="w-full rounded-md px-3 py-2 text-sm resize-none focus:outline-none"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
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
