'use client'

/**
 * LeadsFilterBar — the primary, one-line filter row for /leads.
 *
 * Layout (wraps gracefully; on phones the pills scroll horizontally):
 *   ┌ Search box (keeps the "/"-to-focus shortcut — input placeholder is matched
 *   │  by the page's global key handler) ┐
 *   ├ Quick-segment pills — the SINGLE quick-filter mechanism:
 *   │   All · (My Leads, hidden for admins) · HOT · Unassigned · Due Today · ★ Favorites
 *   └ "Filters" button (count badge) → Popover with the less-frequent controls:
 *       Status (real statuses only) · Assignee (admin) · Telecaller (admin+hasTelecallers)
 *       · Created from/to · Sort · "Reset these"
 *
 * The popover auto-applies on change (no Apply button needed — every control is
 * a controlled input writing straight to page state); a "Reset these" link
 * clears only the popover's advanced filters. All controls read/write the page's
 * existing filter state — no new data model. Re-themed to TBWX dark-luxe; the
 * popover-trigger + count-badge pattern mirrors ColumnCustomizer for consistency.
 */

import { Search, SlidersHorizontal, Star, RotateCcw } from 'lucide-react'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'

// ─── Quick-segment pills ───────────────────────────────────────────────────

export type QuickFilter = 'all' | 'mine' | 'hot' | 'unassigned' | 'due_today'

const ACTIVE_PILL: React.CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--color-accent) 18%, transparent)',
  color: 'var(--color-accent)',
  border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
}
const IDLE_PILL: React.CSSProperties = {
  backgroundColor: 'transparent',
  color: 'var(--color-muted)',
  border: '1px solid var(--color-border)',
}

interface SelectOption {
  value: string
  label: string
}

interface LeadsFilterBarProps {
  // Search
  search: string
  onSearch: (v: string) => void

  // Quick pills
  quickFilter: QuickFilter
  onQuickFilter: (v: QuickFilter) => void
  pillCounts: Record<QuickFilter, number>
  showMine: boolean

  // ★ Favorites (folded into the pill group)
  favoritesOnly: boolean
  onFavoritesOnly: (v: boolean) => void

  // Advanced — Status (real statuses only)
  statusFilter: string
  onStatusFilter: (v: string) => void
  statusOptions: readonly string[]
  statusLabels: Record<string, string>

  // Advanced — Assignee (admin)
  isAdmin: boolean
  assignedFilter: string
  onAssignedFilter: (v: string) => void
  assignedNames: string[]

  // Advanced — Telecaller (admin + hasTelecallers)
  hasTelecallers: boolean
  telecallerFilter: string
  onTelecallerFilter: (v: string) => void
  telecallerAgents: { id: string; name: string }[]

  // Advanced — Created date range
  dateFrom: string
  onDateFrom: (v: string) => void
  dateTo: string
  onDateTo: (v: string) => void

  // Advanced — Sort (single source of truth)
  sort: string
  onSort: (v: string) => void
  sortOptions: SelectOption[]

  /** Number of advanced filters currently active → count badge on Filters btn. */
  advancedCount: number
  /** Resets only the popover's advanced controls (status/assignee/tc/dates/sort). */
  onResetAdvanced: () => void
}

const SELECT_CLASS =
  'status-select w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50 cursor-pointer'

export default function LeadsFilterBar(props: LeadsFilterBarProps) {
  const {
    search, onSearch,
    quickFilter, onQuickFilter, pillCounts, showMine,
    favoritesOnly, onFavoritesOnly,
    statusFilter, onStatusFilter, statusOptions, statusLabels,
    isAdmin, assignedFilter, onAssignedFilter, assignedNames,
    hasTelecallers, telecallerFilter, onTelecallerFilter, telecallerAgents,
    dateFrom, onDateFrom, dateTo, onDateTo,
    sort, onSort, sortOptions,
    advancedCount, onResetAdvanced,
  } = props

  const pills: { key: QuickFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    ...(showMine ? [{ key: 'mine' as QuickFilter, label: 'My Leads' }] : []),
    { key: 'hot', label: 'HOT' },
    { key: 'unassigned', label: 'Unassigned' },
    { key: 'due_today', label: 'Due Today' },
  ]

  return (
    <div className="flex flex-col gap-2.5 mb-3 sm:flex-row sm:flex-wrap sm:items-center">
      {/* ── Search ─────────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-w-[180px] sm:max-w-xs">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dim pointer-events-none"
          strokeWidth={2}
          aria-hidden
        />
        <input
          type="text"
          placeholder="Search name, phone, city, email…"
          aria-label="Search leads"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full bg-elevated border border-border rounded-md pl-10 pr-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
        />
      </div>

      {/* ── Quick-segment pills (single mechanism, ★ Favorites folded in) ── */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1 sm:mx-0 sm:px-0 sm:flex-wrap"
        role="group"
        aria-label="Quick filters"
      >
        {pills.map(({ key, label }) => {
          const active = quickFilter === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                onQuickFilter(active ? 'all' : key)
              }}
              aria-pressed={active}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-semibold uppercase tracking-wide transition-colors cursor-pointer focus-ring whitespace-nowrap"
              style={active ? ACTIVE_PILL : IDLE_PILL}
            >
              {label}
              <span
                className="inline-flex items-center justify-center min-w-[1.25rem] h-[1.0625rem] px-1.5 rounded-full text-[11px] font-bold leading-none"
                style={
                  active
                    ? {
                        backgroundColor: 'color-mix(in srgb, var(--color-accent) 28%, transparent)',
                        color: 'var(--color-accent)',
                      }
                    : { backgroundColor: 'var(--color-elevated)', color: 'var(--color-dim)' }
                }
              >
                {pillCounts[key]}
              </span>
            </button>
          )
        })}

        {/* ★ Favorites — same pill family, no separate divider widget */}
        <button
          type="button"
          onClick={() => onFavoritesOnly(!favoritesOnly)}
          aria-pressed={favoritesOnly}
          title={favoritesOnly ? 'Showing pinned leads only' : 'Show only pinned leads'}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-semibold uppercase tracking-wide transition-colors cursor-pointer focus-ring whitespace-nowrap"
          style={favoritesOnly ? ACTIVE_PILL : IDLE_PILL}
        >
          <Star
            className="w-3.5 h-3.5"
            fill={favoritesOnly ? 'currentColor' : 'none'}
            strokeWidth={favoritesOnly ? 0 : 2}
            aria-hidden
          />
          Favorites
        </button>
      </div>

      {/* ── Filters popover (advanced, less-frequent controls) ──────────── */}
      <div className="sm:ml-auto">
        <Popover>
          <PopoverTrigger
            className="inline-flex items-center gap-1.5 bg-elevated hover:bg-border text-muted hover:text-text text-caption font-semibold px-3 py-2 rounded-md transition-colors cursor-pointer focus-ring whitespace-nowrap aria-expanded:text-accent aria-expanded:border-accent/40 border border-border"
            aria-label="Advanced filters"
            title="Status, assignee, telecaller, date range and sort"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
            Filters
            {advancedCount > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 rounded-full text-[10px] font-bold leading-none"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-accent) 22%, transparent)',
                  color: 'var(--color-accent)',
                }}
                aria-label={`${advancedCount} active`}
              >
                {advancedCount}
              </span>
            )}
          </PopoverTrigger>

          <PopoverContent
            align="end"
            className="w-80 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto bg-card border border-border p-0 ring-0 shadow-2xl shadow-black/50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
              <div className="min-w-0">
                <p className="text-eyebrow uppercase tracking-wider text-dim">Advanced filters</p>
                <p className="text-caption text-muted mt-0.5">Refine beyond the quick pills</p>
              </div>
              {advancedCount > 0 && (
                <button
                  type="button"
                  onClick={onResetAdvanced}
                  className="inline-flex items-center gap-1 text-eyebrow text-dim hover:text-accent transition-colors cursor-pointer focus-ring rounded px-1.5 py-1 shrink-0"
                  title="Reset these advanced filters"
                >
                  <RotateCcw className="w-3 h-3" strokeWidth={2} aria-hidden />
                  Reset these
                </button>
              )}
            </div>

            <div className="px-3.5 py-3 space-y-3.5">
              {/* Status — real statuses only (pills cover unassigned/overdue) */}
              <label className="block">
                <span className="text-eyebrow uppercase tracking-wider text-dim">Status</span>
                <select
                  value={statusFilter}
                  onChange={(e) => onStatusFilter(e.target.value)}
                  className={`${SELECT_CLASS} mt-1`}
                  aria-label="Filter by status"
                >
                  {statusFilter === '__UNASSIGNED__' && (
                    <option value="__UNASSIGNED__" disabled>Unassigned (active)</option>
                  )}
                  {statusFilter === '__OVERDUE__' && (
                    <option value="__OVERDUE__" disabled>Overdue follow-ups (active)</option>
                  )}
                  <option value="">All statuses</option>
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>{statusLabels[s] || s}</option>
                  ))}
                </select>
              </label>

              {/* Assignee — admin only */}
              {isAdmin && (
                <label className="block">
                  <span className="text-eyebrow uppercase tracking-wider text-dim">Assigned agent</span>
                  <select
                    value={assignedFilter}
                    onChange={(e) => onAssignedFilter(e.target.value)}
                    className={`${SELECT_CLASS} mt-1`}
                    aria-label="Filter by assigned agent"
                  >
                    <option value="">All agents</option>
                    {assignedNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </label>
              )}

              {/* Telecaller — admin + hasTelecallers */}
              {isAdmin && hasTelecallers && (
                <label className="block">
                  <span className="text-eyebrow uppercase tracking-wider text-dim">Telecaller</span>
                  <select
                    value={telecallerFilter}
                    onChange={(e) => onTelecallerFilter(e.target.value)}
                    className={`${SELECT_CLASS} mt-1`}
                    aria-label="Filter by telecaller"
                  >
                    <option value="">All telecallers</option>
                    <option value="__NONE__">— No telecaller —</option>
                    {telecallerAgents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {/* Created date range — clearly labeled, even on mobile */}
              <div>
                <span className="text-eyebrow uppercase tracking-wider text-dim">Created date</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-eyebrow text-dim/80">From</span>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => onDateFrom(e.target.value)}
                      max={dateTo || undefined}
                      aria-label="Created from date (inclusive)"
                      className="mt-0.5 w-full bg-elevated border border-border rounded-md px-2 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50 cursor-pointer"
                    />
                  </label>
                  <label className="block">
                    <span className="text-eyebrow text-dim/80">To</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => onDateTo(e.target.value)}
                      min={dateFrom || undefined}
                      aria-label="Created to date (inclusive)"
                      className="mt-0.5 w-full bg-elevated border border-border rounded-md px-2 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Sort — single source of truth (also reflected by header clicks) */}
              <label className="block">
                <span className="text-eyebrow uppercase tracking-wider text-dim">Sort by</span>
                <select
                  value={sort}
                  onChange={(e) => onSort(e.target.value)}
                  className={`${SELECT_CLASS} mt-1`}
                  aria-label="Sort leads"
                >
                  {sortOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
