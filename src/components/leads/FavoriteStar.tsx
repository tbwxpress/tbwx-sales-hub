'use client'

/**
 * FavoriteStar — a small, optimistic star toggle backed by useFavorites().
 * Used in three places this wave: the leftmost cell of each leads row, the
 * LeadSidePanel header, and (via the 'view' kind) each Saved View chip.
 *
 * It does NOT own the optimistic state — the parent passes `active` (from
 * useFavorites().isFavorite) and `onToggle` (from useFavorites().toggle). This
 * keeps a single source of truth (the hook's favorites array) so every star for
 * the same ref stays in sync. Errors are surfaced by the hook + a sonner toast
 * raised here only if the async toggle throws.
 *
 * Re-themed to TBWX dark-luxe tokens: a lit star is gold (var(--color-accent))
 * with a soft glow; an unlit star is dim and brightens on hover.
 */

import { Star } from 'lucide-react'
import { toast } from 'sonner'

interface FavoriteStarProps {
  /** Whether this ref is currently favorited (from useFavorites().isFavorite) */
  active: boolean
  /** Optimistic toggle (from useFavorites().toggle) — already handles rollback */
  onToggle: () => void | Promise<void>
  /** Accessible label, e.g. "Pin Asha Mehta" / "Pin HOT leads view" */
  label: string
  /** Visual size — sm for table rows / chips, md for the panel header */
  size?: 'sm' | 'md'
  className?: string
}

export default function FavoriteStar({
  active,
  onToggle,
  label,
  size = 'sm',
  className = '',
}: FavoriteStarProps) {
  const dim = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5'
  const box = size === 'md' ? 'w-8 h-8' : 'w-7 h-7'

  async function handle(e: React.MouseEvent) {
    // Never let the star bubble to a clickable row / chip.
    e.stopPropagation()
    e.preventDefault()
    try {
      await onToggle()
    } catch {
      toast.error('Could not update favorite')
    }
  }

  return (
    <button
      type="button"
      onClick={handle}
      aria-pressed={active}
      aria-label={active ? `Unpin ${label}` : `Pin ${label}`}
      title={active ? 'Unpin' : 'Pin to favorites'}
      className={`group/star inline-flex items-center justify-center ${box} rounded-md cursor-pointer transition-colors duration-150 focus-ring ${
        active
          ? 'text-accent hover:bg-accent/10'
          : 'text-dim hover:text-accent hover:bg-accent/10'
      } ${className}`}
    >
      <Star
        className={`${dim} transition-transform duration-150 group-active/star:scale-90 ${
          active ? 'drop-shadow-[0_0_4px_color-mix(in_srgb,var(--color-accent)_55%,transparent)]' : ''
        }`}
        fill={active ? 'currentColor' : 'none'}
        strokeWidth={active ? 0 : 1.75}
        aria-hidden
      />
    </button>
  )
}
