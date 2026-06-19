'use client'

/**
 * PipelineStageEditor — admin-only editor for the sales pipeline stages.
 *
 * Vertical list of draggable rows (native HTML5 drag, matching /pipeline's
 * pattern — no dnd dependency). Each row exposes an inline-editable label,
 * a color swatch + native color picker (with a brand preset palette), an
 * "active" toggle, and a read-only Won/Lost badge for system stages.
 *
 * The `key` is IMMUTABLE — only label / color / active / order are editable,
 * so existing leads keep their stored status.
 *
 * APIs (all return bare JSON, not the {success,data} envelope):
 *   GET   /api/pipeline-stages?all=1            → { stages: Stage[] }
 *   POST  /api/pipeline-stages {label,color}    → { stage }
 *   PATCH /api/pipeline-stages/[key] {label?,color?,isActive?} → { stage }
 *   POST  /api/pipeline-stages/reorder {order}  → { ok: true }
 */

import * as React from 'react'
import { toast } from 'sonner'
import {
  GripVertical,
  Plus,
  Check,
  X,
  Pencil,
  Trophy,
  Ban,
  Lock,
  Loader2,
} from 'lucide-react'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import type { Stage } from '@/lib/stages'

// Brand-aligned preset palette — warm/gold-forward with a few cool accents so
// stages stay legible against the dark-luxe board while reading as one family.
const PRESET_COLORS = [
  '#f5c518', // accent gold
  '#fb923c', // hot orange
  '#fbbf24', // warm amber
  '#34d399', // won green
  '#2dd4bf', // teal
  '#60a5fa', // cool blue
  '#a78bfa', // violet
  '#f472b6', // pink
  '#f87171', // lost red
  '#b8a088', // muted sand
]

function swatchColor(stage: Stage): string {
  // Stored colors may be a hex or a tailwind class fallback (e.g. text-blue-400);
  // only hex values are valid for the swatch / color input.
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(stage.color) ? stage.color : '#b8a088'
}

function StageRow({
  stage,
  index,
  count,
  dragIndex,
  overIndex,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onPatch,
  busy,
}: {
  stage: Stage
  index: number
  count: number
  dragIndex: number | null
  overIndex: number | null
  onDragStart: (i: number) => void
  onDragEnter: (i: number) => void
  onDragEnd: () => void
  onPatch: (key: string, patch: { label?: string; color?: string; isActive?: boolean }) => Promise<void>
  busy: boolean
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(stage.label)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const colorRef = React.useRef<HTMLInputElement>(null)
  const [paletteOpen, setPaletteOpen] = React.useState(false)

  React.useEffect(() => { setDraft(stage.label) }, [stage.label])
  React.useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const isDragging = dragIndex === index
  const isOver = overIndex === index && dragIndex !== null && dragIndex !== index
  const color = swatchColor(stage)
  const system = stage.isWon || stage.isLost

  function commitLabel() {
    const next = draft.trim()
    setEditing(false)
    if (next && next !== stage.label) onPatch(stage.key, { label: next })
    else setDraft(stage.label)
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(index))
        onDragStart(index)
      }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDrop={(e) => { e.preventDefault(); onDragEnd() }}
      className={`group flex items-center gap-3 rounded-xl border bg-elevated px-3 py-2.5 transition-all duration-200 ${
        isDragging
          ? 'opacity-40 border-accent/60'
          : isOver
            ? 'border-accent/60 ring-1 ring-accent/30 -translate-y-px'
            : 'border-border hover:border-border-light'
      } ${!stage.isActive ? 'opacity-60' : ''}`}
      aria-label={`Stage ${stage.label}, position ${index + 1} of ${count}`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-dim hover:text-accent transition-colors focus-ring rounded-md p-0.5 -ml-0.5 touch-none"
        aria-label={`Reorder ${stage.label} — drag to move`}
        tabIndex={-1}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Color swatch → native color input */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setPaletteOpen((v) => !v)}
          disabled={busy}
          className="w-6 h-6 rounded-full border-2 border-border-light cursor-pointer transition-transform hover:scale-110 focus-ring disabled:opacity-50"
          style={{ backgroundColor: color }}
          aria-label={`Change color for ${stage.label}, currently ${color}`}
          title="Change color"
        />
        {paletteOpen && (
          <>
            {/* click-away */}
            <div className="fixed inset-0 z-40" onClick={() => setPaletteOpen(false)} aria-hidden />
            <div
              className="absolute left-0 top-8 z-50 w-44 rounded-xl border border-border bg-card p-2.5 shadow-2xl animate-scale-in"
              role="dialog"
              aria-label={`Color picker for ${stage.label}`}
            >
              <div className="grid grid-cols-5 gap-1.5 mb-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { onPatch(stage.key, { color: c }); setPaletteOpen(false) }}
                    className="w-6 h-6 rounded-full border border-border-light transition-transform hover:scale-110 focus-ring relative"
                    style={{ backgroundColor: c }}
                    aria-label={`Set color ${c}`}
                  >
                    {c.toLowerCase() === color.toLowerCase() && (
                      <Check className="w-3.5 h-3.5 absolute inset-0 m-auto text-[#1a1209]" strokeWidth={3} />
                    )}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => colorRef.current?.click()}
                className="w-full text-[11px] text-muted hover:text-accent transition-colors flex items-center justify-center gap-1.5 py-1 rounded-md hover:bg-elevated"
              >
                <Pencil className="w-3 h-3" /> Custom hex…
              </button>
              <input
                ref={colorRef}
                type="color"
                value={color}
                onChange={(e) => onPatch(stage.key, { color: e.target.value })}
                className="sr-only"
                tabIndex={-1}
                aria-label={`Custom color for ${stage.label}`}
              />
            </div>
          </>
        )}
      </div>

      {/* Label — inline editable */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitLabel()
              if (e.key === 'Escape') { setDraft(stage.label); setEditing(false) }
            }}
            maxLength={40}
            className="w-full bg-bg border border-accent/50 rounded-md px-2 py-1 text-sm text-text focus:outline-none"
            aria-label={`Edit label for ${stage.label}`}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="group/lbl flex items-center gap-1.5 text-left max-w-full"
          >
            <span className="text-sm font-medium text-text truncate">{stage.label}</span>
            <Pencil className="w-3 h-3 text-dim opacity-0 group-hover/lbl:opacity-100 transition-opacity shrink-0" />
          </button>
        )}
        <span className="block text-[10px] font-mono text-dim mt-0.5 truncate">{stage.key}</span>
      </div>

      {/* System Won/Lost badge (read-only) */}
      {stage.isWon && (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0"
          style={{ background: 'color-mix(in srgb, var(--color-status-won) 16%, transparent)', color: 'var(--color-status-won)' }}
          title="System stage — marks a lead as won"
        >
          <Trophy className="w-3 h-3" /> Won
        </span>
      )}
      {stage.isLost && (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0"
          style={{ background: 'color-mix(in srgb, var(--color-status-lost) 16%, transparent)', color: 'var(--color-status-lost)' }}
          title="System stage — marks a lead as lost"
        >
          <Ban className="w-3 h-3" /> Lost
        </span>
      )}

      {/* Active toggle */}
      <label
        className="flex items-center gap-2 text-[11px] text-dim cursor-pointer shrink-0 select-none"
        title={stage.isActive ? 'Showing on the board' : 'Hidden from the board (existing leads keep this status)'}
      >
        <span className="hidden sm:inline">Active</span>
        <button
          type="button"
          role="switch"
          aria-checked={stage.isActive}
          aria-label={`Toggle ${stage.label} active`}
          onClick={() => onPatch(stage.key, { isActive: !stage.isActive })}
          disabled={busy}
          className={`relative w-9 h-5 rounded-full transition-colors duration-200 focus-ring disabled:opacity-50 ${
            stage.isActive ? 'bg-success' : 'bg-border'
          }`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${stage.isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </label>

      {system && (
        <Lock className="w-3.5 h-3.5 text-dim shrink-0" aria-label="Key locked — system stage" />
      )}
    </div>
  )
}

export default function PipelineStageEditor() {
  const { stages, loading, refresh } = usePipelineStages({ all: true })
  const [order, setOrder] = React.useState<Stage[]>([])
  const [dragIndex, setDragIndex] = React.useState<number | null>(null)
  const [overIndex, setOverIndex] = React.useState<number | null>(null)
  const [busyKey, setBusyKey] = React.useState<string | null>(null)
  const [savingOrder, setSavingOrder] = React.useState(false)

  // Add-stage form
  const [adding, setAdding] = React.useState(false)
  const [newLabel, setNewLabel] = React.useState('')
  const [newColor, setNewColor] = React.useState(PRESET_COLORS[0])
  const [creating, setCreating] = React.useState(false)

  React.useEffect(() => {
    setOrder([...stages].sort((a, b) => a.sortOrder - b.sortOrder))
  }, [stages])

  async function patchStage(key: string, patch: { label?: string; color?: string; isActive?: boolean }) {
    setBusyKey(key)
    // optimistic
    setOrder((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
    try {
      const res = await fetch(`/api/pipeline-stages/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Update failed')
      const field = Object.keys(patch)[0]
      toast.success(
        field === 'isActive'
          ? `${data.stage?.label || key} ${patch.isActive ? 'shown on board' : 'hidden from board'}`
          : `Saved ${data.stage?.label || key}`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
      refresh() // roll back to server truth
    } finally {
      setBusyKey(null)
    }
  }

  function handleDragEnter(i: number) {
    if (dragIndex === null || dragIndex === i) { setOverIndex(i); return }
    setOverIndex(i)
    setOrder((prev) => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(i, 0, moved)
      return next
    })
    setDragIndex(i)
  }

  async function commitOrder() {
    const keys = order.map((s) => s.key)
    setDragIndex(null)
    setOverIndex(null)
    // Only persist if order actually changed vs server sort.
    const serverKeys = [...stages].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.key)
    if (keys.join('|') === serverKeys.join('|')) return
    setSavingOrder(true)
    try {
      const res = await fetch('/api/pipeline-stages/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: keys }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Reorder failed')
      toast.success('Pipeline order saved')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reorder failed')
      refresh()
    } finally {
      setSavingOrder(false)
    }
  }

  async function createStage(e: React.FormEvent) {
    e.preventDefault()
    const label = newLabel.trim()
    if (!label) return
    setCreating(true)
    try {
      const res = await fetch('/api/pipeline-stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, color: newColor }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Create failed')
      toast.success(`Stage “${data.stage?.label || label}” added`)
      setNewLabel('')
      setNewColor(PRESET_COLORS[0])
      setAdding(false)
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-12 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Immutability note */}
      <div className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--color-accent-soft)', border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)' }}>
        <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent" />
        <p className="text-[11px] leading-relaxed text-muted">
          A stage&apos;s internal key never changes — only its label, color, visibility, and order do.
          <span className="text-body"> Existing leads keep their status</span> even if you hide a stage.
        </p>
      </div>

      {/* Reorder hint / saving indicator */}
      <div className="flex items-center justify-between min-h-[18px]">
        <span className="text-[11px] text-dim">Drag the handle to reorder. {order.length} stage{order.length === 1 ? '' : 's'}.</span>
        {savingOrder && (
          <span className="text-[11px] text-accent inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving order…
          </span>
        )}
      </div>

      {/* Stage list */}
      <div className="space-y-2" onDragEnd={commitOrder}>
        {order.map((stage, i) => (
          <StageRow
            key={stage.key}
            stage={stage}
            index={i}
            count={order.length}
            dragIndex={dragIndex}
            overIndex={overIndex}
            onDragStart={setDragIndex}
            onDragEnter={handleDragEnter}
            onDragEnd={commitOrder}
            onPatch={patchStage}
            busy={busyKey === stage.key}
          />
        ))}
      </div>

      {/* Add stage */}
      {adding ? (
        <form onSubmit={createStage} className="rounded-xl border border-accent/30 bg-card p-4 space-y-3 animate-fade-in">
          <div className="flex items-center gap-3">
            {/* color picker for new stage */}
            <div className="flex items-center gap-1.5 shrink-0" role="radiogroup" aria-label="New stage color">
              {PRESET_COLORS.slice(0, 6).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={newColor === c}
                  aria-label={`Color ${c}`}
                  onClick={() => setNewColor(c)}
                  className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 focus-ring ${newColor === c ? 'border-text scale-110' : 'border-border-light'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              autoFocus
              maxLength={40}
              placeholder="Stage name, e.g. “Site Visit Booked”"
              className="flex-1 bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent/50"
              aria-label="New stage label"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setAdding(false); setNewLabel('') }}
              className="text-sm text-dim hover:text-text px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
            <button
              type="submit"
              disabled={!newLabel.trim() || creating}
              className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-4 py-1.5 rounded-md transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {creating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding…</> : <><Check className="w-3.5 h-3.5" /> Add stage</>}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-xl border border-dashed border-border hover:border-accent/50 text-muted hover:text-accent py-3 text-sm font-medium transition-colors inline-flex items-center justify-center gap-2 group"
        >
          <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-200" /> Add a stage
        </button>
      )}
    </div>
  )
}
