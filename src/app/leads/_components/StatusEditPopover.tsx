'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import Badge, { statusTone, type BadgeTone } from '@/components/ui/Badge'
import { LEAD_STATUSES, LOST_REASONS } from '@/config/client'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { getStageMeta } from '@/lib/stages'

type LeadStatus = string

interface StatusEditPopoverProps {
  /** Lead id (row_number used in /api/leads/[id]) */
  leadId: string | number
  /** Current status value */
  value: string
  /** Called after the PATCH succeeds so the parent can update its `lead` state */
  onChange: (next: string) => void
  /** Visual size for the trigger badge */
  size?: 'sm' | 'md'
  /** Optional className for the trigger wrapper */
  className?: string
  /** Disable interaction (e.g. while another field is saving) */
  disabled?: boolean
  /** Stop the click from bubbling to a clickable parent row */
  stopPropagation?: boolean
}

/**
 * Inline status editor — Linear/Attio style. Click the badge → searchable
 * Command list → optimistic update + PATCH /api/leads/[id]. Rolls back on
 * failure with a toast.
 *
 * When the selected stage is lost (isLost === true, or key === 'LOST' as
 * fallback), a compact reason-picker step is shown inline before the PATCH
 * is sent. Also handles a 422 LOST_REASON_REQUIRED response defensively.
 *
 * Shared between the leads list (row cell) and the lead detail page (header
 * and Manage card).
 */
export default function StatusEditPopover({
  leadId,
  value,
  onChange,
  size = 'md',
  className = '',
  disabled = false,
  stopPropagation = false,
}: StatusEditPopoverProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const { stages } = usePipelineStages()

  // Pending-lost state: set when the user picks a lost stage before confirming.
  const [pendingLostStatus, setPendingLostStatus] = useState<string | null>(null)
  const [lostReason, setLostReason] = useState<string>('')
  const [lostNote, setLostNote] = useState<string>('')

  // Prefer active pipeline stages (admin-ordered) when available; fall back to
  // the config LEAD_STATUSES so the editor never renders an empty list.
  const statusKeys: string[] = stages.length
    ? stages.filter(s => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map(s => s.key)
    : [...LEAD_STATUSES]

  const currentLabel = getStageMeta(stages, value).label
  const currentTone: BadgeTone = statusTone(value)

  function isLostStage(key: string): boolean {
    const stage = stages.find(s => s.key === key)
    if (stage) return stage.isLost
    // Fallback when pipeline stages not loaded yet
    return key === 'LOST'
  }

  function resetLostPicker() {
    setPendingLostStatus(null)
    setLostReason('')
    setLostNote('')
  }

  async function executePatch(next: LeadStatus, body: Record<string, unknown>) {
    const prev = value
    onChange(next)
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.success) {
        toast.success(`Status updated to ${getStageMeta(stages, next).label}`)
        resetLostPicker()
      } else if (res.status === 422 && json.code === 'LOST_REASON_REQUIRED') {
        // Server says reason required — revert and open picker
        onChange(prev)
        setPendingLostStatus(next)
      } else if (res.status === 422 && json.code === 'MIN_ATTEMPTS_NOT_MET') {
        onChange(prev)
        toast.error(json.error || 'Minimum call attempts not met')
        resetLostPicker()
      } else {
        onChange(prev)
        toast.error(json.error || 'Failed to update status')
        resetLostPicker()
      }
    } catch {
      onChange(prev)
      toast.error('Network error — status not changed')
      resetLostPicker()
    }
    setSaving(false)
  }

  async function handleSelect(next: LeadStatus) {
    if (next === value) {
      setOpen(false)
      return
    }
    setOpen(false)

    if (isLostStage(next)) {
      // Don't PATCH yet — show the reason picker step.
      setPendingLostStatus(next)
      setLostReason('')
      setLostNote('')
      return
    }

    await executePatch(next, { lead_status: next })
  }

  async function handleLostConfirm() {
    if (!pendingLostStatus || !lostReason) return
    await executePatch(pendingLostStatus, {
      lead_status: pendingLostStatus,
      lost_reason: lostReason,
      lost_reason_note: lostNote.trim() || undefined,
    })
  }

  const padding = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'

  return (
    <Popover open={open || !!pendingLostStatus} onOpenChange={(o) => {
      // Radix drives open/close through here. The rewrite that added the
      // lost-reason step only handled the close branch, so the trigger could
      // never open the popover (nothing ever set `open` true) — status was
      // unchangeable on every lead. Handle the open branch too.
      if (o) {
        setOpen(true)
      } else if (!saving) {
        setOpen(false)
        resetLostPicker()
      }
    }}>
      <PopoverTrigger
        disabled={disabled || saving}
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation()
        }}
        className={`inline-flex items-center gap-1 rounded-full transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${padding} ${className}`}
        aria-label={`Status: ${currentLabel}. Click to change.`}
      >
        <Badge tone={currentTone} className="!px-0 !py-0 !bg-transparent">
          {currentLabel}
        </Badge>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-64 p-0 overflow-hidden"
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation()
        }}
      >
        {pendingLostStatus ? (
          /* ── Lost reason picker ─────────────────────────────────── */
          <div className="p-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-text mb-0.5">
                Mark as {getStageMeta(stages, pendingLostStatus).label}
              </p>
              <p className="text-[11px] text-dim">Select a reason (required)</p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {Object.entries(LOST_REASONS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLostReason(key)}
                  className={`text-[11px] px-2 py-1 rounded-full border transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                    lostReason === key
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
              value={lostNote}
              onChange={e => setLostNote(e.target.value)}
              placeholder="Optional note..."
              maxLength={200}
              className="w-full bg-elevated border border-border rounded-md px-2.5 py-1.5 text-xs text-text placeholder-dim focus:outline-none focus:border-accent/50"
              onKeyDown={e => {
                if (e.key === 'Enter' && lostReason) handleLostConfirm()
                if (e.key === 'Escape') resetLostPicker()
              }}
            />

            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleLostConfirm}
                disabled={!lostReason || saving}
                className="flex-1 text-xs font-semibold bg-danger/80 hover:bg-danger disabled:bg-danger/30 disabled:cursor-not-allowed text-white rounded-md px-3 py-1.5 transition-colors"
              >
                {saving ? 'Saving...' : 'Confirm Lost'}
              </button>
              <button
                type="button"
                onClick={() => resetLostPicker()}
                disabled={saving}
                className="text-xs text-dim hover:text-text transition-colors px-2 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* ── Status list ────────────────────────────────────────── */
          <Command>
            <CommandInput placeholder="Search status..." />
            <CommandList>
              <CommandEmpty>No status found.</CommandEmpty>
              {statusKeys.map((s) => {
                const label = getStageMeta(stages, s).label
                const tone = statusTone(s)
                return (
                  <CommandItem
                    key={s}
                    value={`${s} ${label}`}
                    onSelect={() => handleSelect(s)}
                    data-checked={s === value}
                  >
                    <Badge tone={tone}>{label}</Badge>
                  </CommandItem>
                )
              })}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
