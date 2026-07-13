'use client'

import { useEffect, useState } from 'react'
import { LOST_REASONS } from '@/config/client'

/**
 * Shared "reason required" dialog for marking a lead LOST from surfaces that
 * don't embed StatusEditPopover's inline picker (inbox status pill / details
 * select / one-click Mark as Lost, pipeline board drag + move dropdown).
 * The server rejects lost transitions without a reason (422
 * LOST_REASON_REQUIRED); callers open this dialog on that response and
 * re-submit with the picked reason.
 */
export default function LostReasonDialog({
  open,
  stageLabel = 'Lost',
  saving = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  stageLabel?: string
  saving?: boolean
  onConfirm: (reason: string, note: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  // Clear picks whenever the dialog closes so a later open starts fresh.
  useEffect(() => {
    if (!open) {
      setReason('')
      setNote('')
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onClick={() => { if (!saving) onCancel() }}
    >
      <div
        className="w-full max-w-sm bg-card border border-border rounded-lg p-4 space-y-3 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div>
          <p className="text-sm font-semibold text-text mb-0.5">Mark as {stageLabel}</p>
          <p className="text-[11px] text-dim">Select a reason (required)</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {Object.entries(LOST_REASONS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setReason(key)}
              className={`text-[11px] px-2 py-1 rounded-full border transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                reason === key
                  ? 'bg-danger/20 border-danger/60 text-danger font-semibold'
                  : 'bg-elevated border-border text-muted hover:border-danger/40 hover:text-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional note..."
          maxLength={200}
          className="w-full bg-elevated border border-border rounded-md px-2.5 py-1.5 text-xs text-text placeholder-dim focus:outline-none focus:border-accent/50"
          onKeyDown={e => {
            if (e.key === 'Enter' && reason && !saving) onConfirm(reason, note.trim())
            if (e.key === 'Escape' && !saving) onCancel()
          }}
        />

        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => onConfirm(reason, note.trim())}
            disabled={!reason || saving}
            className="flex-1 text-xs font-semibold bg-danger/80 hover:bg-danger disabled:bg-danger/30 disabled:cursor-not-allowed text-white rounded-md px-3 py-1.5 transition-colors"
          >
            {saving ? 'Saving...' : `Confirm ${stageLabel}`}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-xs text-dim hover:text-text transition-colors px-2 py-1.5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
