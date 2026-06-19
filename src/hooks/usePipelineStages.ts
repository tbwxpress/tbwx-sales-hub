'use client'

import * as React from 'react'
import type { Stage } from '@/lib/stages'

/**
 * Fetches the active pipeline stages from GET /api/pipeline-stages.
 * Plain fetch + useState/useEffect (the app does not use SWR/react-query).
 *
 * @param opts.all  when true, requests inactive stages too (?all=1) — for the admin editor
 * Returns { stages, loading, refresh }.
 */
export function usePipelineStages(opts?: { all?: boolean }): {
  stages: Stage[]
  loading: boolean
  refresh: () => Promise<void>
} {
  const [stages, setStages] = React.useState<Stage[]>([])
  const [loading, setLoading] = React.useState(true)
  const all = opts?.all ?? false

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pipeline-stages${all ? '?all=1' : ''}`)
      if (!res.ok) throw new Error(`Failed to load stages (${res.status})`)
      const json = await res.json()
      setStages(Array.isArray(json?.stages) ? json.stages : [])
    } catch (err) {
      console.error('[usePipelineStages]', err)
      setStages([])
    } finally {
      setLoading(false)
    }
  }, [all])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  return { stages, loading, refresh }
}
