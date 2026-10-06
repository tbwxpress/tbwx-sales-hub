'use client'

import Link from 'next/link'
import { ChevronRight, Phone, TrendingUp, Flame, Trophy } from 'lucide-react'
import { HOT_STREAK_LEADS, MARATHON_CALLS } from '@/lib/gamification/config'
import GoalRing from './GoalRing'
import StreakFlame from './StreakFlame'
import { useGamification, type MeData } from './store'

/**
 * MyDayStrip — the compact "how's my day going" bar for the top of Work,
 * Today, Leads and the agent dashboard: points ring vs goal, the calling
 * streak, and ONE line of coaching that always names the next small win.
 * Tapping it opens My Stats. Agents only; renders nothing for the owner or
 * when gamification is switched off.
 */

export function coachLine(v: MeData): string {
  const t = v.today
  if (!t) return ''
  const s = v.streakInfo
  // Kept short: this line must fit one row on a 360px phone.
  if (s?.atRisk) return `Call today to keep your ${s.days}-day streak`
  if (t.points >= t.goal) return t.converted > 0 ? 'Goal hit + a sale! All bonus now.' : 'Goal hit! All bonus from here.'
  const earned = new Set((v.badges || []).map(b => b.id))
  if (!earned.has('hot_streak') && t.hot > 0 && t.hot < HOT_STREAK_LEADS) {
    const left = HOT_STREAK_LEADS - t.hot
    return `${left} more HOT today → Hot Streak badge`
  }
  if (!earned.has('marathon') && t.calls >= MARATHON_CALLS - 15 && t.calls < MARATHON_CALLS) {
    return `${MARATHON_CALLS - t.calls} more calls → Marathon badge`
  }
  if (t.points === 0) return 'First call = first points. Let’s go!'
  return `${t.goal - t.points} pts to today’s goal`
}

export default function MyDayStrip({ variant = 'default', className = '' }: { variant?: 'default' | 'compact'; className?: string }) {
  // No placeholder while loading: until /me answers we don't know whether this
  // is an agent (strip) or the owner (nothing), and a flashing skeleton for the
  // owner is worse than the strip easing in a moment later for agents.
  const { view } = useGamification()
  if (!view || !view.enabled || view.role !== 'agent' || !view.today) return null

  const t = view.today
  const s = view.streakInfo || { days: view.streak || 0, todayDone: false, atRisk: false }
  const hit = t.points >= t.goal
  const compact = variant === 'compact'

  return (
    <Link
      href="/agent-stats"
      className={`gam-strip group flex items-center gap-3 rounded-xl border bg-card transition-colors ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'} ${className}`}
      style={{ borderColor: hit ? 'color-mix(in srgb, var(--color-success) 45%, transparent)' : 'var(--color-border)' }}
      aria-label={`Today: ${t.points} of ${t.goal} points. Streak ${s.days} days. Open My Stats.`}
    >
      <GoalRing value={t.points} goal={t.goal} size={compact ? 40 : 50} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-extrabold leading-none tabular-nums text-text">{t.points}</span>
          <span className="text-caption text-dim tabular-nums">/ {t.goal} pts today</span>
          {hit && (
            <span className="gam-pop ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ background: 'color-mix(in srgb, var(--color-success) 16%, transparent)', color: 'var(--color-success)' }}>
              Goal hit
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-caption text-muted">{coachLine(view)}</p>
        {!compact && (
          <div className="mt-1 hidden items-center gap-3 text-[11px] text-dim sm:flex">
            <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" aria-hidden />{t.calls} calls</span>
            <span className="inline-flex items-center gap-1"><TrendingUp className="h-3 w-3" aria-hidden />{t.moved} moved</span>
            <span className="inline-flex items-center gap-1"><Flame className="h-3 w-3" aria-hidden />{t.hot} HOT</span>
            <span className="inline-flex items-center gap-1"><Trophy className="h-3 w-3" aria-hidden />{t.converted} won</span>
          </div>
        )}
      </div>

      <StreakFlame days={s.days} todayDone={s.todayDone} atRisk={s.atRisk} />
      <ChevronRight className="h-4 w-4 shrink-0 text-dim transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}
