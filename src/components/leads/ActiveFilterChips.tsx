'use client'

/**
 * ActiveFilterChips — the row of small, removable "applied filter" chips that
 * renders directly above the leads table whenever ANY filter is active.
 *
 * Each chip reads `label · value` with a trailing ✕ that clears just that one
 * filter; a single "Clear all" at the end resets EVERYTHING (search, status,
 * assignee, telecaller, dates, sort→default, quick-pill→all, and favorites-only).
 *
 * Pure presentational + callback component — it owns no state. The page builds
 * the `chips` array from its own filter state and passes `onClearAll`. The chip
 * anatomy (label · thin divider · bolder value · ✕) is adapted from a 21st.dev
 * Filter-Badge, fully re-themed to TBWX dark-luxe tokens (no generated CSS).
 *
 * It also carries the SINGLE "Showing N of M leads" count, so the page can drop
 * its duplicate count renders.
 */

import { X } from 'lucide-react'

export interface ActiveChip {
  /** Stable id used as the React key (e.g. 'status', 'quick'). */
  id: string
  /** The dimension name shown muted, e.g. "Status". */
  label: string
  /** The chosen value shown emphasised, e.g. "HOT". */
  value: string
  /** Clears just this one filter. */
  onRemove: () => void
}

interface ActiveFilterChipsProps {
  chips: ActiveChip[]
  /** Count after all filters — the single source of the match count. */
  shown: number
  /** Total leads currently fetched (pre quick-pill / favorites narrowing). */
  total: number
  /** Resets EVERY filter back to default. */
  onClearAll: () => void
}

export default function ActiveFilterChips({
  chips,
  shown,
  total,
  onClearAll,
}: ActiveFilterChipsProps) {
  const hasFilters = chips.length > 0

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4 animate-fade-in">
      {/* Single match count — the only place "N of M leads" is shown */}
      <span className="text-caption text-muted tabular-nums shrink-0">
        Showing <span className="font-semibold text-body">{shown}</span>
        {shown !== total && <> of {total}</>} lead{total !== 1 ? 's' : ''}
      </span>

      {hasFilters && (
        <>
          <span
            className="w-px h-4 self-center hidden sm:block"
            style={{ backgroundColor: 'var(--color-border)' }}
            aria-hidden
          />

          <ul className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
            {chips.map((chip) => (
              <li key={chip.id}>
                <span
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-caption whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--color-elevated)',
                    color: 'var(--color-dim)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <span className="opacity-90">{chip.label}</span>
                  <span
                    className="w-px h-3 self-center"
                    style={{ backgroundColor: 'var(--color-border)' }}
                    aria-hidden
                  />
                  <span className="font-semibold text-body">{chip.value}</span>
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    aria-label={`Remove ${chip.label} filter`}
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full text-dim hover:text-accent hover:bg-accent/15 transition-colors cursor-pointer focus-ring"
                  >
                    <X className="w-3 h-3" strokeWidth={2.5} aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={onClearAll}
            className="text-caption font-semibold text-dim hover:text-accent transition-colors cursor-pointer focus-ring rounded px-1.5 py-0.5 shrink-0"
          >
            Clear all
          </button>
        </>
      )}
    </div>
  )
}
