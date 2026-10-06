'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { HUB_LEAD_UPDATED_EVENT } from '@/lib/gamification/config'
import { BADGE_BY_ID, CALL_AWARD, type Award } from '@/lib/gamification/points'
import { addAwards, ensureMe, subscribeGamification, type GamificationState } from './store'
import { emitLeadUpdated, type HubLeadUpdatedDetail } from './events'
import PointsToastLayer, { showBadgeChip, showInfoChip, showPointsChip } from './PointsToast'
import { fireConfetti } from './Confetti'

/**
 * GamificationProvider — mounted once in the root layout. It turns successful
 * work into instant feedback without touching the screens that do the work:
 *
 *  1. Listens for `hub:lead-updated` (fired by Log Call, the work rail, or any
 *     screen) and shows the "+N" chip where the agent tapped.
 *  2. Observes successful `PATCH /api/leads/:id` responses (status / follow-up
 *     edits from the leads list, lead page, pipeline, side panel) and turns
 *     each into a `hub:lead-updated` event. Observe-only: the request and the
 *     response the caller receives are untouched.
 *  3. Watches the badge list and celebrates a newly earned badge once.
 *
 * Agents only, and only while gamification is switched on.
 */

const LAST_POINTER_MAX_AGE_MS = 10_000
let lastPointer: { x: number; y: number; t: number } | null = null

function anchor(): { x: number; y: number } | null {
  if (!lastPointer || Date.now() - lastPointer.t > LAST_POINTER_MAX_AGE_MS) return null
  return { x: lastPointer.x, y: lastPointer.y }
}

function installPointerTracker(): () => void {
  const onDown = (e: PointerEvent) => { lastPointer = { x: e.clientX, y: e.clientY, t: Date.now() } }
  window.addEventListener('pointerdown', onDown, { capture: true, passive: true })
  return () => window.removeEventListener('pointerdown', onDown, { capture: true })
}

// ─── Observe lead PATCHes (batching bursts from bulk actions) ───────────

let patchBatch: HubLeadUpdatedDetail[] = []
let patchTimer: ReturnType<typeof setTimeout> | null = null

function queuePatch(detail: HubLeadUpdatedDetail) {
  patchBatch.push(detail)
  if (patchTimer) return
  patchTimer = setTimeout(() => {
    const batch = patchBatch
    patchBatch = []
    patchTimer = null
    if (batch.length > 2) emitLeadUpdated({ source: 'bulk', count: batch.length })
    else for (const d of batch) emitLeadUpdated(d)
  }, 450)
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

type ObservedWindow = Window & { __hubFetchObserved?: boolean }

function installFetchObserver(): () => void {
  const w = window as ObservedWindow
  if (w.__hubFetchObserved) return () => {}
  const original = window.fetch
  const wrapped: typeof window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const pending = original.call(window, input, init)
    try {
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
      const match = method === 'PATCH' ? /\/api\/leads\/(\d+)(?:[?#]|$)/.exec(urlOf(input)) : null
      if (match && typeof init?.body === 'string') {
        let body: Record<string, unknown> | null = null
        try { body = JSON.parse(init.body) } catch { body = null }
        const status = typeof body?.lead_status === 'string' ? body.lead_status : undefined
        const followup = !!body && 'next_followup' in body
        if (status || followup) {
          const row = Number(match[1])
          pending
            .then(res => (res.ok ? res.clone().json() : null))
            .then((json: { success?: boolean } | null) => {
              if (json?.success) queuePatch({ source: 'patch', row, status, followup })
            })
            .catch(() => { /* observation only */ })
        }
      }
    } catch { /* never break a request */ }
    return pending
  }
  window.fetch = wrapped
  w.__hubFetchObserved = true
  return () => {
    if (window.fetch === wrapped) {
      window.fetch = original
      w.__hubFetchObserved = false
    }
  }
}

// ─── Turning an event into points ───────────────────────────────────────

async function lookupAwards(row: number, status: boolean, followup: boolean): Promise<Award[]> {
  try {
    const res = await fetch(`/api/gamification/last-action?row=${row}&status=${status ? 1 : 0}&followup=${followup ? 1 : 0}`, { cache: 'no-store' })
    if (!res.ok) return []
    const json = await res.json()
    return Array.isArray(json?.data?.awards) ? (json.data.awards as Award[]) : []
  } catch {
    return []
  }
}

async function handleLeadUpdated(d: HubLeadUpdatedDetail) {
  const where = anchor()
  const me = await ensureMe()
  if (!me || !me.enabled || me.role !== 'agent') return

  if (d.source === 'bulk') {
    showInfoChip(`${d.count ?? 'Several'} leads updated · points land within a minute`, where)
    return
  }

  const awards: Award[] = []
  if (d.source === 'call' || (d.source === 'work' && d.channel === 'call')) awards.push(CALL_AWARD)
  if (d.row && (d.source === 'work' || d.status || d.followup)) {
    awards.push(...await lookupAwards(d.row, d.source === 'work' || !!d.status, !!d.followup))
  }
  if (awards.length === 0) return

  addAwards(awards)
  showPointsChip(awards, where)
  if (d.celebrate !== false && awards.some(a => a.kind === 'converted')) fireConfetti({ origin: where })
}

// ─── New-badge watcher ──────────────────────────────────────────────────

function seenKey(name: string) {
  return `hub.gam.badges.${name}`
}

function watchBadges(s: GamificationState) {
  const v = s.view
  if (!v || !v.enabled || v.role !== 'agent' || !v.name || !v.badges) return
  const ids = v.badges.map(b => b.id)
  let seen: string[] | null = null
  try {
    const raw = localStorage.getItem(seenKey(v.name))
    seen = raw ? (JSON.parse(raw) as string[]) : null
  } catch { seen = null }
  // First visit on this device: remember what's already earned, celebrate nothing.
  const fresh = seen ? ids.filter(id => !seen!.includes(id)) : []
  if (!seen || fresh.length) {
    try { localStorage.setItem(seenKey(v.name), JSON.stringify(ids)) } catch { /* private mode */ }
  }
  if (fresh.length) {
    fireConfetti()
    for (const id of fresh) showBadgeChip(id, BADGE_BY_ID[id]?.name || 'New badge')
  }
}

export default function GamificationProvider() {
  const pathname = usePathname()
  const active = !!pathname && !/^\/(login|sso)(\/|$)/.test(pathname)

  useEffect(() => {
    if (!active) return
    const offPointer = installPointerTracker()
    const offFetch = installFetchObserver()
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<HubLeadUpdatedDetail>).detail
      if (detail && typeof detail === 'object') void handleLeadUpdated(detail)
    }
    window.addEventListener(HUB_LEAD_UPDATED_EVENT, onEvent)
    const offBadges = subscribeGamification(watchBadges)
    return () => {
      offPointer()
      offFetch()
      offBadges()
      window.removeEventListener(HUB_LEAD_UPDATED_EVENT, onEvent)
    }
  }, [active])

  return <PointsToastLayer />
}
