'use client'

/**
 * SavedViewsBar — a horizontal strip of view "chips" above the leads table.
 * Always shows an "All Leads" default first, then the user's private + shared
 * views (shared ones carry a small Users icon). Clicking a chip applies its
 * saved filters to the table; "+ Save view" captures the CURRENT filter state.
 * Per-chip dropdown (owner or admin) → Rename / Toggle default / Delete.
 *
 * Backed by /api/saved-views (GET/POST/PATCH/DELETE). Re-themed to TBWX
 * dark-luxe tokens throughout.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Users, Lock, MoreHorizontal, Star, Pencil, Trash2, Check } from 'lucide-react'
import { toast } from 'sonner'
import type { SavedView, SavedViewFilters } from '@/lib/stages'
import { useFavorites } from '@/hooks/useFavorites'
import FavoriteStar from './FavoriteStar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'

interface SavedViewsBarProps {
  /** Current filter state from the page — captured when saving a new view */
  currentFilters: SavedViewFilters
  /** Apply a view's filters to the page ('' filters = the All Leads reset) */
  onApply: (filters: SavedViewFilters) => void
  /** Current user id + role for owner/admin gating of the per-chip menu */
  userId: string
  isAdmin: boolean
  /** Called once on first load with the default view's filters (if any) */
  onDefaultLoaded?: (filters: SavedViewFilters) => void
}

const ALL_LEADS_ID = -1

export default function SavedViewsBar({
  currentFilters,
  onApply,
  userId,
  isAdmin,
  onDefaultLoaded,
}: SavedViewsBarProps) {
  const [views, setViews] = useState<SavedView[]>([])
  const [activeId, setActiveId] = useState<number>(ALL_LEADS_ID)
  const [loading, setLoading] = useState(true)
  const defaultAppliedRef = useRef(false)

  // ★ Pin saved views (kind 'view') — optimistic, shared store with the leads
  // table's lead pins so the star state is always consistent app-wide.
  const { isFavorite, toggle: toggleFavorite } = useFavorites()

  // Save dialog state
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveShared, setSaveShared] = useState(false)
  const [saveDefault, setSaveDefault] = useState(false)
  const [saving, setSaving] = useState(false)

  // Rename dialog state
  const [renameView, setRenameView] = useState<SavedView | null>(null)
  const [renameName, setRenameName] = useState('')

  const loadViews = useCallback(async (applyDefault: boolean) => {
    try {
      const res = await fetch('/api/saved-views')
      const data = await res.json()
      const list: SavedView[] = Array.isArray(data?.views) ? data.views : []
      setViews(list)
      // Auto-apply the user's default view on first load only.
      if (applyDefault && !defaultAppliedRef.current) {
        const def = list.find((v) => v.isDefault && v.ownerUserId === userId)
        if (def) {
          setActiveId(def.id)
          onDefaultLoaded?.(def.filters)
        }
        defaultAppliedRef.current = true
      }
    } catch {
      /* non-critical — bar just shows All Leads */
    } finally {
      setLoading(false)
    }
  }, [userId, onDefaultLoaded])

  useEffect(() => {
    loadViews(true)
  }, [loadViews])

  // ─── Chip click → apply filters ──────────────────────────────────────────
  function applyView(view: SavedView | null) {
    if (!view) {
      setActiveId(ALL_LEADS_ID)
      onApply({})
      return
    }
    setActiveId(view.id)
    onApply(view.filters)
  }

  // ─── Save current filters as a new view ──────────────────────────────────
  async function handleSave() {
    const name = saveName.trim()
    if (!name) { toast.error('Give the view a name'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/saved-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          scope: saveShared ? 'shared' : 'private',
          filters: currentFilters,
          isDefault: saveDefault,
        }),
      })
      const data = await res.json()
      if (data?.view) {
        toast.success(`View "${name}" saved`)
        setSaveOpen(false)
        setSaveName(''); setSaveShared(false); setSaveDefault(false)
        setViews((prev) => {
          // If this became default, clear other defaults locally.
          const next = data.view.isDefault
            ? prev.map((v) => (v.ownerUserId === userId ? { ...v, isDefault: false } : v))
            : prev
          return [...next, data.view as SavedView]
        })
        setActiveId(data.view.id)
      } else {
        toast.error(data?.error || 'Could not save view')
      }
    } catch {
      toast.error('Could not save view')
    }
    setSaving(false)
  }

  // ─── Per-chip mutations ──────────────────────────────────────────────────
  async function toggleDefault(view: SavedView) {
    const makeDefault = !view.isDefault
    try {
      const res = await fetch(`/api/saved-views/${view.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: makeDefault }),
      })
      const data = await res.json()
      if (data?.view) {
        setViews((prev) =>
          prev.map((v) =>
            v.id === view.id
              ? { ...v, isDefault: makeDefault }
              : v.ownerUserId === view.ownerUserId && makeDefault
                ? { ...v, isDefault: false }
                : v,
          ),
        )
        toast.success(makeDefault ? `"${view.name}" is now your default` : 'Default cleared')
      } else {
        toast.error(data?.error || 'Update failed')
      }
    } catch {
      toast.error('Update failed')
    }
  }

  async function handleRename() {
    if (!renameView) return
    const name = renameName.trim()
    if (!name) { toast.error('Name cannot be empty'); return }
    try {
      const res = await fetch(`/api/saved-views/${renameView.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (data?.view) {
        setViews((prev) => prev.map((v) => (v.id === renameView.id ? { ...v, name } : v)))
        toast.success('View renamed')
        setRenameView(null)
      } else {
        toast.error(data?.error || 'Rename failed')
      }
    } catch {
      toast.error('Rename failed')
    }
  }

  async function handleDelete(view: SavedView) {
    try {
      const res = await fetch(`/api/saved-views/${view.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data?.ok) {
        setViews((prev) => prev.filter((v) => v.id !== view.id))
        if (activeId === view.id) applyView(null)
        toast.success(`"${view.name}" deleted`)
      } else {
        toast.error(data?.error || 'Delete failed')
      }
    } catch {
      toast.error('Delete failed')
    }
  }

  function canManage(view: SavedView): boolean {
    return isAdmin || view.ownerUserId === userId
  }

  // ─── Chip renderer ───────────────────────────────────────────────────────
  function chipStyle(active: boolean): React.CSSProperties {
    return active
      ? {
          backgroundColor: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
          color: 'var(--color-accent)',
          border: '1px solid color-mix(in srgb, var(--color-accent) 38%, transparent)',
        }
      : { backgroundColor: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }
  }

  return (
    <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
      {/* All Leads — always first */}
      <button
        type="button"
        onClick={() => applyView(null)}
        aria-pressed={activeId === ALL_LEADS_ID}
        className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-caption font-semibold tracking-wide transition-colors cursor-pointer focus-ring whitespace-nowrap"
        style={chipStyle(activeId === ALL_LEADS_ID)}
      >
        All Leads
      </button>

      {/* Saved view chips */}
      {loading ? (
        <>
          <div className="skeleton h-8 w-24 rounded-full shrink-0" />
          <div className="skeleton h-8 w-20 rounded-full shrink-0" />
        </>
      ) : (
        views.map((view) => {
          const active = activeId === view.id
          return (
            <div
              key={view.id}
              className="shrink-0 inline-flex items-center rounded-full transition-colors"
              style={chipStyle(active)}
            >
              <button
                type="button"
                onClick={() => applyView(view)}
                aria-pressed={active}
                className="inline-flex items-center gap-1.5 pl-3.5 pr-2 py-1.5 rounded-l-full text-caption font-semibold tracking-wide cursor-pointer focus-ring whitespace-nowrap"
                title={view.scope === 'shared' ? 'Shared view' : 'Private view'}
              >
                {view.isDefault && (
                  <Star className="w-3 h-3 shrink-0" fill="currentColor" strokeWidth={0} aria-label="Default view" />
                )}
                {view.scope === 'shared'
                  ? <Users className="w-3 h-3 shrink-0 opacity-80" aria-label="Shared" />
                  : <Lock className="w-3 h-3 shrink-0 opacity-50" aria-label="Private" />}
                <span className="max-w-[14ch] truncate">{view.name}</span>
              </button>

              {/* ★ Pin this view */}
              <FavoriteStar
                active={isFavorite('view', view.id)}
                onToggle={() => toggleFavorite('view', view.id)}
                label={`${view.name} view`}
                className={`w-6 h-6 -ml-0.5 ${canManage(view) ? '' : 'rounded-r-full pr-1'}`}
              />

              {canManage(view) && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Manage view ${view.name}`}
                    className="inline-flex items-center justify-center pr-2.5 pl-1 py-1.5 rounded-r-full cursor-pointer opacity-70 hover:opacity-100 transition-opacity focus-ring"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-44">
                    <DropdownMenuItem
                      onClick={() => { setRenameView(view); setRenameName(view.name) }}
                    >
                      <Pencil className="w-3.5 h-3.5" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleDefault(view)}>
                      {view.isDefault
                        ? <><Check className="w-3.5 h-3.5" /> Unset default</>
                        : <><Star className="w-3.5 h-3.5" /> Set as default</>}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => handleDelete(view)}>
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )
        })
      )}

      {/* + Save view */}
      <button
        type="button"
        onClick={() => setSaveOpen(true)}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-semibold tracking-wide transition-colors cursor-pointer focus-ring whitespace-nowrap text-dim hover:text-accent border border-dashed border-border hover:border-accent/40"
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={2} />
        Save view
      </button>

      {/* ── Save dialog ─────────────────────────────────────────────────── */}
      <Dialog open={saveOpen} onOpenChange={(o) => { setSaveOpen(o); if (!o) { setSaveName(''); setSaveShared(false); setSaveDefault(false) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save current view</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="view-name">View name</Label>
              <Input
                id="view-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                placeholder="e.g. HOT leads due this week"
                autoFocus
              />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Checkbox checked={saveShared} onCheckedChange={(c) => setSaveShared(!!c)} />
              <span className="text-body inline-flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-dim" />
                Share with the team
              </span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Checkbox checked={saveDefault} onCheckedChange={(c) => setSaveDefault(!!c)} />
              <span className="text-body inline-flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-dim" />
                Make this my default view
              </span>
            </label>
            <p className="text-caption text-dim">
              Captures the current search, status, priority, assignee, date range and sort.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleSave} disabled={saving || !saveName.trim()}>
              {saving ? 'Saving…' : 'Save view'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rename dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!renameView} onOpenChange={(o) => { if (!o) setRenameView(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename view</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-view">View name</Label>
            <Input
              id="rename-view"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename() }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRenameView(null)}>Cancel</Button>
            <Button type="button" onClick={handleRename} disabled={!renameName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
