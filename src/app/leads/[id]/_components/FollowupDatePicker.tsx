'use client'

import { useState } from 'react'
import { CalendarIcon, X } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { followupLabel } from '@/lib/format'

interface FollowupDatePickerProps {
  /** Current value as YYYY-MM-DD (or '') */
  value: string
  /** Called with YYYY-MM-DD (or '' for clear). Parent posts to API. */
  onChange: (next: string) => void
  /** Disable while parent is saving */
  disabled?: boolean
}

// react-day-picker speaks Date objects. We persist YYYY-MM-DD strings (the
// existing API contract). Use date-only construction to dodge timezone drift.
function parseYmd(value: string): Date | undefined {
  if (!value) return undefined
  // Accept either YYYY-MM-DD or full ISO — strip to first 10 chars.
  const ymd = value.slice(0, 10)
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return undefined
  // Construct in LOCAL timezone — the calendar renders local-day cells, so we
  // want the selected cell to match what the user picked irrespective of TZ.
  return new Date(y, m - 1, d)
}

function formatYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function FollowupDatePicker({
  value,
  onChange,
  disabled = false,
}: FollowupDatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = parseYmd(value)
  const label = value ? followupLabel(value) : null

  function handleSelect(date: Date | undefined) {
    if (!date) return
    onChange(formatYmd(date))
    setOpen(false)
  }

  function handleClear() {
    onChange('')
    setOpen(false)
  }

  // Pretty-print the selected date for the trigger button.
  const displayDate = selected
    ? selected.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50 disabled:opacity-50 flex items-center justify-between gap-2 hover:border-accent/30 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <CalendarIcon className="w-4 h-4 text-dim shrink-0" />
          {displayDate ? (
            <span className="truncate">{displayDate}</span>
          ) : (
            <span className="text-dim">Pick a date</span>
          )}
        </span>
        {label && (
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
              label.urgent
                ? 'bg-danger/15 text-danger'
                : 'bg-elevated text-muted border border-border/60'
            }`}
          >
            {label.text}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          autoFocus
        />
        {value && (
          <div className="flex justify-end border-t border-border/40 p-2">
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-dim hover:text-danger flex items-center gap-1 px-2 py-1 rounded transition-colors"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
