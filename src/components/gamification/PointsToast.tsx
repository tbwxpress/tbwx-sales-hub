'use client'

import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Phone, TrendingUp, Flame, Trophy, CalendarCheck, Sparkles } from 'lucide-react'
import type { Award, AwardKind } from '@/lib/gamification/points'
import { BadgeGlyph } from './BadgeShelf'

/**
 * PointsToast — the small floating "+5 Lead moved forward" chip that rises
 * from wherever the agent just tapped, plus the bigger "Badge unlocked" card.
 * Imperative API (`showPointsChip`, `showBadgeChip`) so any handler can fire it;
 * rendered once by <PointsToastLayer/> inside GamificationProvider (a portal).
 */

type Chip =
  | { id: number; type: 'points'; x: number; y: number; points: number | null; label: string; kind: AwardKind | 'bulk' }
  | { id: number; type: 'badge'; badgeId: string; name: string }

let chips: Chip[] = []
let seq = 0
const listeners = new Set<() => void>()
const EMPTY: Chip[] = []

function emit() {
  for (const l of listeners) l()
}

function push(chip: Chip, ttl: number) {
  chips = [...chips.slice(-4), chip]
  emit()
  setTimeout(() => {
    chips = chips.filter(c => c.id !== chip.id)
    emit()
  }, ttl)
}

function clampX(x: number): number {
  if (typeof window === 'undefined') return x
  return Math.min(window.innerWidth - 90, Math.max(90, x))
}

function clampY(y: number): number {
  if (typeof window === 'undefined') return y
  return Math.min(window.innerHeight - 24, Math.max(84, y))
}

/** Show earned points near (x, y). Several awards from one action merge into one chip. */
export function showPointsChip(awards: Award[], anchor?: { x: number; y: number } | null): void {
  if (typeof window === 'undefined' || awards.length === 0) return
  const total = awards.reduce((s, a) => s + a.points, 0)
  const best = [...awards].sort((a, b) => b.points - a.points)[0]
  const label = awards.length > 1 ? awards.map(a => a.label).join(' · ') : best.label
  const x = clampX(anchor?.x ?? window.innerWidth / 2)
  const y = clampY(anchor?.y ?? window.innerHeight - 96)
  push({ id: ++seq, type: 'points', x, y, points: total, label, kind: best.kind }, 1700)
}

/** A neutral chip for changes whose points land on the next refresh (bulk edits). */
export function showInfoChip(label: string, anchor?: { x: number; y: number } | null): void {
  if (typeof window === 'undefined') return
  const x = clampX(anchor?.x ?? window.innerWidth / 2)
  const y = clampY(anchor?.y ?? window.innerHeight - 96)
  push({ id: ++seq, type: 'points', x, y, points: null, label, kind: 'bulk' }, 1900)
}

export function showBadgeChip(badgeId: string, name: string): void {
  if (typeof window === 'undefined') return
  push({ id: ++seq, type: 'badge', badgeId, name }, 4000)
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

const KIND_ICON: Record<AwardKind | 'bulk', typeof Phone> = {
  call: Phone,
  forward: TrendingUp,
  hot: Flame,
  converted: Trophy,
  followup: CalendarCheck,
  bulk: Sparkles,
}

export default function PointsToastLayer() {
  const list = useSyncExternalStore(subscribe, () => chips, () => EMPTY)
  if (list.length === 0) return null
  const latest = list[list.length - 1]
  const announce = latest.type === 'badge'
    ? `Badge unlocked: ${latest.name}`
    : latest.points != null ? `Plus ${latest.points} points. ${latest.label}` : latest.label

  return createPortal(
    <>
      <div className="sr-only" aria-live="polite" role="status">{announce}</div>
      {list.map((c, i) => {
        if (c.type === 'badge') {
          // Several badges at once stack downwards instead of overlapping.
          const slot = list.filter((x, j) => x.type === 'badge' && j < i).length
          return (
            <div key={c.id} className="gam-badge-toast" style={{ marginTop: slot * 68, animationDelay: `${slot * 160}ms` }} aria-hidden>
              <span className="gam-medal gam-medal--earned" style={{ width: 40, height: 40 }}>
                <BadgeGlyph id={c.badgeId} className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-eyebrow" style={{ color: 'var(--color-accent)' }}>Badge unlocked</span>
                <span className="block truncate text-[15px] font-bold" style={{ color: 'var(--color-text)' }}>{c.name}</span>
              </span>
            </div>
          )
        }
        const Icon = KIND_ICON[c.kind]
        const big = c.kind === 'converted' || c.kind === 'hot'
        return (
          <div
            key={c.id}
            className={`gam-chip${big ? ' gam-chip--big' : ''}`}
            style={{ left: c.x, top: c.y - i * 4 }}
            aria-hidden
          >
            <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
            {c.points != null && <span className="gam-chip__pts">+{c.points}</span>}
            <span className="gam-chip__label">{c.label}</span>
          </div>
        )
      })}
    </>,
    document.body,
  )
}
