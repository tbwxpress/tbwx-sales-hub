'use client'

import * as React from 'react'

export type FavoriteKind = 'lead' | 'view'

export interface Favorite {
  id: number
  user_id: string
  kind: FavoriteKind
  ref: string
  created_at: string
}

/**
 * Fetches the current user's favorites from GET /api/favorites and exposes an
 * optimistic toggle backed by POST/DELETE /api/favorites.
 * Plain fetch + useState/useEffect (the app does not use SWR/react-query),
 * mirroring usePipelineStages.
 *
 * Returns { favorites, isFavorite(kind, ref), toggle(kind, ref), loading }.
 */
export function useFavorites(): {
  favorites: Favorite[]
  isFavorite: (kind: FavoriteKind, ref: string | number) => boolean
  toggle: (kind: FavoriteKind, ref: string | number) => Promise<void>
  loading: boolean
} {
  const [favorites, setFavorites] = React.useState<Favorite[]>([])
  const [loading, setLoading] = React.useState(true)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/favorites')
      if (!res.ok) throw new Error(`Failed to load favorites (${res.status})`)
      const json = await res.json()
      setFavorites(Array.isArray(json?.favorites) ? json.favorites : [])
    } catch (err) {
      console.error('[useFavorites]', err)
      setFavorites([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  const isFavorite = React.useCallback(
    (kind: FavoriteKind, ref: string | number) => {
      const refStr = String(ref)
      return favorites.some(f => f.kind === kind && f.ref === refStr)
    },
    [favorites],
  )

  const toggle = React.useCallback(
    async (kind: FavoriteKind, ref: string | number) => {
      const refStr = String(ref)
      const currentlyFav = favorites.some(f => f.kind === kind && f.ref === refStr)

      // Optimistic update.
      if (currentlyFav) {
        setFavorites(prev => prev.filter(f => !(f.kind === kind && f.ref === refStr)))
      } else {
        setFavorites(prev => [
          { id: -1, user_id: '', kind, ref: refStr, created_at: new Date().toISOString() },
          ...prev,
        ])
      }

      try {
        const res = await fetch('/api/favorites', {
          method: currentlyFav ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, ref: refStr }),
        })
        if (!res.ok) throw new Error(`Toggle failed (${res.status})`)
        // Re-sync to pick up the server-assigned id / dedupe.
        await refresh()
      } catch (err) {
        console.error('[useFavorites.toggle]', err)
        // Roll back to the server truth on failure.
        await refresh()
      }
    },
    [favorites, refresh],
  )

  return { favorites, isFavorite, toggle, loading }
}
