import { STATUS_LABELS, STATUS_COLORS } from '@/config/client'

/**
 * Pipeline stage shape as returned by GET /api/pipeline-stages.
 * `key` is the immutable lead_status identifier stored on every lead.
 */
export interface Stage {
  key: string
  label: string
  color: string
  sortOrder: number
  isActive: boolean
  isWon: boolean
  isLost: boolean
}

/**
 * Filter state persisted by a saved view (mirrors the /leads filter bar).
 */
export interface SavedViewFilters {
  search?: string
  status?: string
  priority?: string
  assignee?: string
  telecaller?: string
  dateFrom?: string
  dateTo?: string
  sort?: string
  columns?: { key: string; visible: boolean }[]
}

/**
 * Saved view shape as returned by the /api/saved-views endpoints.
 */
export interface SavedView {
  id: number
  name: string
  ownerUserId: string
  scope: 'private' | 'shared'
  filters: SavedViewFilters
  isDefault: boolean
  createdAt: string
}

/**
 * Resolve a stage's display label + color from a list of stages, with a
 * graceful fallback to the config/client.ts constants when the key isn't
 * present in the list (e.g. a legacy lead_status no longer in the editable set).
 * Always returns a usable { label, color } so UI never renders a blank chip.
 */
export function getStageMeta(stages: Stage[], key: string): { label: string; color: string } {
  const found = stages.find(s => s.key === key)
  if (found) {
    return {
      label: found.label || STATUS_LABELS[key] || key,
      color: found.color || STATUS_COLORS[key] || '',
    }
  }
  return {
    label: STATUS_LABELS[key] || key,
    color: STATUS_COLORS[key] || '',
  }
}
