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
import { LEAD_STATUSES, STATUS_LABELS } from '@/config/client'
import type { LeadStatus } from '@/lib/types'

interface StatusEditPopoverProps {
  /** Lead id (database row pk used in /api/leads/[id]) */
  leadId: string
  /** Current status value */
  value: LeadStatus
  /** Called after the PATCH succeeds so the parent can update its `lead` state */
  onChange: (next: LeadStatus) => void
  /** Visual size for the trigger badge — sticky header uses compact */
  size?: 'sm' | 'md'
  /** Optional className for the trigger wrapper */
  className?: string
  /** Disable interaction (e.g. while another field is saving) */
  disabled?: boolean
}

/**
 * Inline status editor. Click the badge → searchable Command list → optimistic
 * update + PATCH /api/leads/[id]. Rolls back on failure.
 *
 * Lives locally under [id]/_components/ — if the leads-list agent extracts a
 * shared `src/app/leads/_components/StatusEditPopover.tsx`, prefer that one
 * and delete this file.
 */
export default function StatusEditPopover({
  leadId,
  value,
  onChange,
  size = 'md',
  className = '',
  disabled = false,
}: StatusEditPopoverProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const currentLabel = STATUS_LABELS[value] || value
  const currentTone: BadgeTone = statusTone(value)

  async function handleSelect(next: LeadStatus) {
    if (next === value) {
      setOpen(false)
      return
    }
    const prev = value
    // Optimistic — parent updates immediately, we revert on failure.
    onChange(next)
    setOpen(false)
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_status: next }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success(`Status → ${STATUS_LABELS[next] || next}`)
      } else {
        onChange(prev)
        toast.error(json.error || 'Failed to update status')
      }
    } catch {
      onChange(prev)
      toast.error('Network error — status not changed')
    }
    setSaving(false)
  }

  const padding = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled || saving}
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
        className="w-60 p-0 overflow-hidden"
      >
        <Command>
          <CommandInput placeholder="Search status..." />
          <CommandList>
            <CommandEmpty>No status found.</CommandEmpty>
            {LEAD_STATUSES.map((s) => {
              const label = STATUS_LABELS[s] || s
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
      </PopoverContent>
    </Popover>
  )
}
