'use client'

/**
 * ColumnCustomizer — the /leads table "Columns" control. A Popover (NOT a
 * dropdown-menu, so inner checkbox/drag clicks don't auto-close it) listing the
 * table's canonical columns. Each row has:
 *   • a native HTML5 drag handle (GripVertical) to reorder — same approach as
 *     the pipeline stage editor, no extra dependency, with up/down buttons as a
 *     keyboard- + touch-accessible fallback;
 *   • a Checkbox to toggle the column's visibility.
 *
 * Locked columns (e.g. the favorite-star rail, the row checkbox, Name, Actions)
 * are always present and can't be hidden or reordered — they render as fixed
 * anchors so the canonical catalog stays coherent.
 *
 * Pure controlled component: it owns no persisted state. The parent passes the
 * current `columns` order/visibility and gets `onChange(next)` on every edit
 * (the page debounces the PUT /api/table-prefs there). Re-themed to TBWX
 * dark-luxe tokens; layout pattern adapted from a 21st.dev column-visibility
 * manager (grip + checkbox row rhythm), fully restyled — no generated CSS.
 */

import { useState } from 'react'
import {
  Columns3,
  GripVertical,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Eye,
  EyeOff,
} from 'lucide-react'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'

export interface ColumnPref {
  key: string
  visible: boolean
}

/** A column the user can see/reorder, plus its display label. */
export interface ColumnMeta {
  key: string
  label: string
  /** Locked = always visible, never reorderable (structural columns). */
  locked?: boolean
}

interface ColumnCustomizerProps {
  /** Canonical catalog (label + locked flag) keyed by column id. */
  catalog: ColumnMeta[]
  /** Current order + visibility (the toggleable columns only). */
  columns: ColumnPref[]
  /** Emitted on every reorder / visibility change. */
  onChange: (next: ColumnPref[]) => void
  /** Reset to the default full-visible order. */
  onReset: () => void
}

export default function ColumnCustomizer({
  catalog,
  columns,
  onChange,
  onReset,
}: ColumnCustomizerProps) {
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)

  const labelOf = (key: string) => catalog.find(c => c.key === key)?.label ?? key
  const isLocked = (key: string) => !!catalog.find(c => c.key === key)?.locked

  // Only non-locked columns are reorderable/hideable in this list.
  const editable = columns.filter(c => !isLocked(c.key))
  const lockedCols = catalog.filter(c => c.locked)
  const hiddenCount = editable.filter(c => !c.visible).length

  function toggleVisible(key: string) {
    onChange(columns.map(c => (c.key === key ? { ...c, visible: !c.visible } : c)))
  }

  // Reorder `from` → before `to` within the editable subset, then splice back
  // into the full columns array preserving locked-column positions.
  function reorder(fromKey: string, toKey: string) {
    if (fromKey === toKey) return
    const order = editable.map(c => c.key)
    const fromIdx = order.indexOf(fromKey)
    const toIdx = order.indexOf(toKey)
    if (fromIdx === -1 || toIdx === -1) return
    order.splice(toIdx, 0, order.splice(fromIdx, 1)[0])
    const byKey = new Map(columns.map(c => [c.key, c]))
    // `editable` already excludes locked columns, so the emitted set is simply
    // the reordered editable prefs; the page merges any prefs it didn't manage.
    onChange(order.map(k => byKey.get(k)!).filter(Boolean))
  }

  function move(key: string, dir: -1 | 1) {
    const order = editable.map(c => c.key)
    const idx = order.indexOf(key)
    const next = idx + dir
    if (next < 0 || next >= order.length) return
    ;[order[idx], order[next]] = [order[next], order[idx]]
    const byKey = new Map(columns.map(c => [c.key, c]))
    onChange(order.map(k => byKey.get(k)!).filter(Boolean))
  }

  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex items-center gap-1.5 bg-elevated hover:bg-border text-muted hover:text-text text-caption font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer focus-ring whitespace-nowrap"
        aria-label="Customize table columns"
        title="Show, hide and reorder columns"
      >
        <Columns3 className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
        Columns
        {hiddenCount > 0 && (
          <span
            className="inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 rounded-full text-[10px] font-bold leading-none"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-accent) 22%, transparent)',
              color: 'var(--color-accent)',
            }}
            aria-label={`${hiddenCount} hidden`}
          >
            {hiddenCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-72 max-h-[70vh] overflow-y-auto bg-card border border-border p-0 ring-0 shadow-2xl shadow-black/50"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <div className="min-w-0">
            <p className="text-eyebrow uppercase tracking-wider text-dim">Table columns</p>
            <p className="text-caption text-muted mt-0.5">Drag to reorder · toggle to show/hide</p>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-eyebrow text-dim hover:text-accent transition-colors cursor-pointer focus-ring rounded px-1.5 py-1 shrink-0"
            title="Reset to default columns"
          >
            <RotateCcw className="w-3 h-3" strokeWidth={2} aria-hidden />
            Reset
          </button>
        </div>

        {/* Locked anchors — shown for context, not editable */}
        {lockedCols.length > 0 && (
          <ul className="px-1.5 pt-1.5" aria-label="Always-visible columns">
            {lockedCols.map(col => (
              <li
                key={col.key}
                className="flex items-center gap-2 px-1.5 py-1.5 rounded-md text-caption text-dim"
              >
                <span className="w-4 inline-flex justify-center opacity-40" aria-hidden>
                  <GripVertical className="w-3.5 h-3.5" />
                </span>
                <span className="flex-1 truncate">{col.label}</span>
                <span className="text-eyebrow uppercase tracking-wide opacity-70">Fixed</span>
              </li>
            ))}
            <li className="mx-1.5 my-1 border-t border-border/60" aria-hidden />
          </ul>
        )}

        {/* Editable, draggable list */}
        <ul className="px-1.5 pb-2" aria-label="Customizable columns">
          {editable.map((col, idx) => {
            const dragging = dragKey === col.key
            const isOver = overKey === col.key && dragKey !== col.key
            return (
              <li
                key={col.key}
                draggable
                onDragStart={(e) => {
                  setDragKey(col.key)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (overKey !== col.key) setOverKey(col.key)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragKey) reorder(dragKey, col.key)
                  setDragKey(null)
                  setOverKey(null)
                }}
                onDragEnd={() => { setDragKey(null); setOverKey(null) }}
                className={`group/col flex items-center gap-2 px-1.5 py-1.5 rounded-md transition-colors ${
                  dragging ? 'opacity-50' : ''
                } ${isOver ? 'bg-accent/10 ring-1 ring-accent/30' : 'hover:bg-elevated/60'}`}
              >
                {/* Drag handle */}
                <span
                  className="w-4 inline-flex justify-center text-dim cursor-grab active:cursor-grabbing group-hover/col:text-muted transition-colors"
                  title="Drag to reorder"
                  aria-hidden
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </span>

                {/* Visibility checkbox + label (whole label area toggles) */}
                <label className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={col.visible}
                    onCheckedChange={() => toggleVisible(col.key)}
                    aria-label={`${col.visible ? 'Hide' : 'Show'} ${labelOf(col.key)} column`}
                  />
                  <span
                    className={`text-caption truncate transition-colors ${
                      col.visible ? 'text-body' : 'text-dim line-through decoration-dim/50'
                    }`}
                  >
                    {labelOf(col.key)}
                  </span>
                  {col.visible
                    ? <Eye className="w-3 h-3 text-dim/60 shrink-0" aria-hidden />
                    : <EyeOff className="w-3 h-3 text-dim/60 shrink-0" aria-hidden />}
                </label>

                {/* Keyboard / touch reorder fallback */}
                <span className="flex items-center opacity-0 group-hover/col:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => move(col.key, -1)}
                    disabled={idx === 0}
                    aria-label={`Move ${labelOf(col.key)} up`}
                    className="inline-flex items-center justify-center w-5 h-5 rounded text-dim hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer focus-ring"
                  >
                    <ArrowUp className="w-3 h-3" strokeWidth={2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(col.key, 1)}
                    disabled={idx === editable.length - 1}
                    aria-label={`Move ${labelOf(col.key)} down`}
                    className="inline-flex items-center justify-center w-5 h-5 rounded text-dim hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer focus-ring"
                  >
                    <ArrowDown className="w-3 h-3" strokeWidth={2} aria-hidden />
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
