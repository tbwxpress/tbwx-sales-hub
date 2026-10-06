'use client'

import { Swords, Flame, Footprints, Sunrise, RotateCcw, CalendarCheck, Crown, Lock, Award } from 'lucide-react'
import { BADGES, BADGE_BY_ID, type BadgeIcon } from '@/lib/gamification/points'
import type { BadgeDTO } from './store'

/**
 * BadgeShelf — every badge as a stamped medallion. Earned ones are gold coins
 * with the date; locked ones stay on the shelf greyed out with a one-line
 * "how to earn", so the next goal is always visible.
 */

const ICONS: Record<BadgeIcon, typeof Swords> = {
  swords: Swords,
  flame: Flame,
  footprints: Footprints,
  sunrise: Sunrise,
  comeback: RotateCcw,
  week: CalendarCheck,
  crown: Crown,
}

export function BadgeGlyph({ id, className }: { id: string; className?: string }) {
  const def = BADGE_BY_ID[id]
  const Icon = def ? ICONS[def.icon] : Award
  return <Icon className={className} strokeWidth={2.2} aria-hidden />
}

export function formatDay(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`)
  if (!Number.isFinite(ms)) return day
  return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export default function BadgeShelf({ earned, compact = false }: { earned: BadgeDTO[]; compact?: boolean }) {
  const got = new Map(earned.map(b => [b.id, b]))
  const count = BADGES.filter(b => got.has(b.id)).length

  return (
    <section aria-label="Badges">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-eyebrow text-dim">Badges</h3>
        <span className="text-caption text-muted tabular-nums">
          {count} of {BADGES.length} earned
        </span>
      </div>
      <ul className={`grid gap-x-2 gap-y-4 ${compact ? 'grid-cols-4 sm:grid-cols-7' : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-7'}`}>
        {BADGES.map((b, i) => {
          const e = got.get(b.id)
          const Icon = ICONS[b.icon]
          return (
            <li
              key={b.id}
              className="gam-badge flex flex-col items-center text-center"
              style={{ animationDelay: `${i * 45}ms` }}
              title={e ? `${b.name} — earned ${formatDay(e.earnedAt)}` : `${b.name} — ${b.howTo}`}
            >
              <span className={`gam-medal ${e ? 'gam-medal--earned' : 'gam-medal--locked'}`}>
                <Icon className="h-6 w-6" strokeWidth={2} aria-hidden />
                {!e && (
                  <span className="gam-medal__lock" aria-hidden>
                    <Lock className="h-2.5 w-2.5" strokeWidth={2.6} />
                  </span>
                )}
              </span>
              <span className={`mt-2 text-[12px] font-semibold leading-tight ${e ? 'text-text' : 'text-muted'}`}>
                {b.name}
              </span>
              {!compact && (
                <span className="mt-0.5 line-clamp-3 max-w-[11rem] text-[11px] leading-snug text-dim">
                  {e ? `Earned ${formatDay(e.earnedAt)}` : b.howTo}
                </span>
              )}
              <span className="sr-only">{e ? 'Earned' : 'Locked'}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
