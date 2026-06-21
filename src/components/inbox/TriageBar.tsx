'use client'

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getStageMeta, type Stage } from '@/lib/stages'
import { ChevronDown, ArrowDownWideNarrow, Check, Filter, Clock, Flame, UserCheck, UserMinus, Inbox, Bell } from 'lucide-react'

export type TriageFilter = 'all' | 'mine' | 'unassigned' | 'hot' | 'awaiting' | 'unread'
export type TriageSort = 'recent' | 'waiting' | 'priority'

export interface TriageCounts {
  all: number
  mine: number
  unassigned: number
  hot: number
  awaiting: number
  unread: number
}

const SORT_LABELS: Record<TriageSort, string> = {
  recent: 'Recent',
  waiting: 'Longest waiting',
  priority: 'Priority',
}

const SORT_HINTS: Record<TriageSort, string> = {
  recent: 'Newest activity first',
  waiting: 'Conversations awaiting our reply, oldest first',
  priority: 'HOT → WARM → COLD',
}

const ICON: Record<TriageFilter, typeof Inbox> = {
  all: Inbox,
  mine: UserCheck,
  unassigned: UserMinus,
  hot: Flame,
  awaiting: Clock,
  unread: Bell,
}

const SEGMENTS: { key: TriageFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Mine' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'hot', label: 'HOT' },
  { key: 'awaiting', label: 'Awaiting' },
  { key: 'unread', label: 'Unread' },
]

/**
 * Triage toolbar above the conversation list. Segmented quick-filter chips with
 * live counts, a status filter (pipeline-stage aware), and a sort control.
 * Entirely client-side over the already-loaded enriched contacts — each agent
 * works their own queue, hottest / longest-waiting first.
 *
 * 21st.dev-inspired segmented chip group + Linear/Attio-style popovers
 * (reusing the app's own StatusEditPopover idiom), re-themed to TBWX dark-luxe.
 */
export default function TriageBar({
  filter,
  onFilter,
  sort,
  onSort,
  statusFilter,
  onStatusFilter,
  counts,
  stages,
  statusKeys,
}: {
  filter: TriageFilter
  onFilter: (f: TriageFilter) => void
  sort: TriageSort
  onSort: (s: TriageSort) => void
  statusFilter: string // '' = all statuses
  onStatusFilter: (s: string) => void
  counts: TriageCounts
  stages: Stage[]
  statusKeys: string[]
}) {
  const statusLabel = statusFilter ? getStageMeta(stages, statusFilter).label : 'All statuses'
  // Controlled popovers so picking an option closes the menu (Linear/Attio idiom).
  const [statusOpen, setStatusOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)

  return (
    <div className="space-y-2">
      {/* Segmented quick-filter chips */}
      <div
        className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-0.5 px-0.5 pb-0.5"
        role="tablist"
        aria-label="Triage filters"
      >
        {SEGMENTS.map(({ key, label }) => {
          const active = filter === key
          const count = counts[key]
          const Icon = ICON[key]
          // Awaiting + HOT carry urgency tones even when inactive, so the agent
          // sees where the work is without selecting them first.
          const urgent = !active && count > 0 && (key === 'awaiting' || key === 'hot')
          const urgentColor = key === 'awaiting' ? 'var(--color-warning)' : 'var(--color-status-hot)'
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onFilter(key)}
              className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap flex-shrink-0 cursor-pointer transition-all duration-150 focus-ring"
              style={{
                background: active
                  ? 'color-mix(in srgb, var(--color-accent) 18%, transparent)'
                  : 'color-mix(in srgb, var(--color-elevated) 55%, transparent)',
                color: active
                  ? 'var(--color-accent)'
                  : urgent
                    ? urgentColor
                    : 'var(--color-dim)',
                border: `1px solid ${
                  active
                    ? 'color-mix(in srgb, var(--color-accent) 50%, transparent)'
                    : 'var(--color-border)'
                }`,
              }}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={2} />
              {label}
              {count > 0 && (
                <span
                  className="px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none tabular-nums"
                  style={{
                    background: active
                      ? 'var(--color-accent)'
                      : urgent
                        ? `color-mix(in srgb, ${urgentColor} 25%, transparent)`
                        : 'color-mix(in srgb, var(--color-dim) 18%, transparent)',
                    color: active ? 'var(--color-bg)' : urgent ? urgentColor : 'var(--color-muted)',
                  }}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Status filter + Sort control */}
      <div className="flex items-center gap-2">
        {/* Status filter */}
        <Popover open={statusOpen} onOpenChange={setStatusOpen}>
          <PopoverTrigger
            className="flex-1 min-w-0 flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-colors duration-150 focus-ring"
            style={{
              background: statusFilter
                ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
                : 'color-mix(in srgb, var(--color-elevated) 55%, transparent)',
              color: statusFilter ? 'var(--color-accent)' : 'var(--color-dim)',
              border: `1px solid ${statusFilter ? 'color-mix(in srgb, var(--color-accent) 40%, transparent)' : 'var(--color-border)'}`,
            }}
            aria-label={`Filter by status: ${statusLabel}`}
          >
            <span className="flex items-center gap-1.5 truncate">
              <Filter className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
              <span className="truncate">{statusLabel}</span>
            </span>
            <ChevronDown className="w-3 h-3 opacity-60 flex-shrink-0" />
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={6} className="w-56 p-1 max-h-72 overflow-y-auto">
            <StatusOption label="All statuses" selected={!statusFilter} onClick={() => { onStatusFilter(''); setStatusOpen(false) }} />
            <div className="my-1 h-px" style={{ background: 'var(--color-border)' }} />
            {statusKeys.map(key => {
              const meta = getStageMeta(stages, key)
              return (
                <StatusOption
                  key={key}
                  label={meta.label}
                  selected={statusFilter === key}
                  onClick={() => { onStatusFilter(key); setStatusOpen(false) }}
                />
              )
            })}
          </PopoverContent>
        </Popover>

        {/* Sort control */}
        <Popover open={sortOpen} onOpenChange={setSortOpen}>
          <PopoverTrigger
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors duration-150 focus-ring"
            style={{
              background: 'color-mix(in srgb, var(--color-elevated) 55%, transparent)',
              color: sort === 'recent' ? 'var(--color-dim)' : 'var(--color-accent)',
              border: `1px solid ${sort === 'recent' ? 'var(--color-border)' : 'color-mix(in srgb, var(--color-accent) 40%, transparent)'}`,
            }}
            aria-label={`Sort: ${SORT_LABELS[sort]}`}
          >
            <ArrowDownWideNarrow className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">{SORT_LABELS[sort]}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="w-52 p-1">
            {(Object.keys(SORT_LABELS) as TriageSort[]).map(key => (
              <button
                key={key}
                type="button"
                onClick={() => { onSort(key); setSortOpen(false) }}
                className="w-full flex items-start gap-2 px-2.5 py-1.5 rounded-md text-left cursor-pointer transition-colors duration-150"
                style={{
                  background: sort === key ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
                }}
                onMouseEnter={e => { if (sort !== key) e.currentTarget.style.background = 'color-mix(in srgb, var(--color-elevated) 70%, transparent)' }}
                onMouseLeave={e => { if (sort !== key) e.currentTarget.style.background = 'transparent' }}
              >
                <Check
                  className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                  strokeWidth={2.5}
                  style={{ color: sort === key ? 'var(--color-accent)' : 'transparent' }}
                />
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold" style={{ color: sort === key ? 'var(--color-accent)' : 'var(--color-text)' }}>
                    {SORT_LABELS[key]}
                  </span>
                  <span className="block text-[10px]" style={{ color: 'var(--color-dim)' }}>{SORT_HINTS[key]}</span>
                </span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

function StatusOption({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-left cursor-pointer transition-colors duration-150"
      style={{ background: selected ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent' }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'color-mix(in srgb, var(--color-elevated) 70%, transparent)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <span className="text-[11px] font-medium truncate" style={{ color: selected ? 'var(--color-accent)' : 'var(--color-text)' }}>
        {label}
      </span>
      {selected && <Check className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.5} style={{ color: 'var(--color-accent)' }} />}
    </button>
  )
}
