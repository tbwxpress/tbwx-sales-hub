'use client'

import { HUB_LEAD_UPDATED_EVENT } from '@/lib/gamification/config'

/**
 * `hub:lead-updated` — fired on window after any successful lead change.
 * Any screen may dispatch it (one line, no import needed):
 *   window.dispatchEvent(new CustomEvent('hub:lead-updated', { detail: { source: 'patch', row, status } }))
 * GamificationProvider listens and shows the points chip / confetti.
 */
export interface HubLeadUpdatedDetail {
  /** call = Log Call modal · work = work-rail outcome · patch = PATCH /api/leads/:id · bulk = many rows at once */
  source: 'call' | 'work' | 'patch' | 'bulk'
  row?: number
  phone?: string
  /** Work-rail channel the agent acted on (call / whatsapp / template). */
  channel?: string
  /** New lead_status, when the change moved the stage. */
  status?: string
  /** The change edited next_followup. */
  followup?: boolean
  /** Rows touched by a bulk change. */
  count?: number
  /** false = the screen runs its own celebration (work rail's WonCelebration). */
  celebrate?: boolean
}

export function emitLeadUpdated(detail: HubLeadUpdatedDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<HubLeadUpdatedDetail>(HUB_LEAD_UPDATED_EVENT, { detail }))
}
