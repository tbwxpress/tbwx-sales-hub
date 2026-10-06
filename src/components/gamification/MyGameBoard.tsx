'use client'

import { Phone, TrendingUp, Flame, Trophy, CalendarCheck, Info } from 'lucide-react'
import { POINTS, MAX_CALL_POINTS_PER_LEAD_PER_DAY } from '@/lib/gamification/config'
import GoalRing from './GoalRing'
import StreakFlame from './StreakFlame'
import Leaderboard from './Leaderboard'
import BadgeShelf from './BadgeShelf'
import CountUp from './CountUp'
import { coachLine } from './MyDayStrip'
import { useGamification } from './store'

/**
 * MyGameBoard — the full "points & badges" view on My Stats: today's ring
 * with a transparent breakdown (count × points), the calling streak, this
 * week's friendly leaderboard and the badge shelf. Agents only.
 */
export default function MyGameBoard() {
  const { view, status } = useGamification()

  if (!view) {
    if (status !== 'loading') return null
    return (
      <div className="mb-6 rounded-2xl border border-border bg-card p-5" aria-busy="true" aria-label="Loading your points">
        <div className="grid gap-6 md:grid-cols-[auto_1fr_auto] md:items-center">
          <div className="skeleton mx-auto h-32 w-32 rounded-full" />
          <div className="space-y-2.5">
            {[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton h-4 w-full max-w-sm" />)}
          </div>
          <div className="skeleton h-14 w-40 rounded-2xl" />
        </div>
      </div>
    )
  }
  if (!view.enabled || view.role !== 'agent' || !view.today) return null

  const t = view.today
  const s = view.streakInfo || { days: view.streak || 0, todayDone: false, atRisk: false }
  const lines = [
    { key: 'moved', Icon: TrendingUp, label: 'Moved forward', n: t.moved, each: POINTS.MOVED_FORWARD, pts: t.moved * POINTS.MOVED_FORWARD },
    { key: 'hot', Icon: Flame, label: 'Made HOT', n: t.hot, each: POINTS.HOT, pts: t.hot * POINTS.HOT },
    { key: 'won', Icon: Trophy, label: 'Converted', n: t.converted, each: POINTS.CONVERTED, pts: t.converted * POINTS.CONVERTED },
    { key: 'fu', Icon: CalendarCheck, label: 'Follow-ups on time', n: t.followups, each: POINTS.FOLLOWUP_ON_TIME, pts: t.followups * POINTS.FOLLOWUP_ON_TIME },
  ]
  const callPts = Math.max(0, t.points - lines.reduce((sum, l) => sum + l.pts, 0))
  const rows = [{ key: 'calls', Icon: Phone, label: 'Calls logged', n: t.calls, each: POINTS.CALL, pts: callPts }, ...lines]

  return (
    <section className="gam-board mb-6 overflow-hidden rounded-2xl border border-border bg-card" aria-label="Your points, streak and badges">
      <div className="grid gap-6 p-5 md:grid-cols-[auto_1fr_auto] md:items-center">
        {/* Ring */}
        <div className="flex flex-col items-center">
          <GoalRing value={t.points} goal={t.goal} size={132} />
          <p className="mt-2 max-w-[13rem] text-center text-caption text-muted">{coachLine(view)}</p>
        </div>

        {/* Breakdown — every point explained */}
        <div className="min-w-0">
          <p className="text-eyebrow mb-2 text-dim">Today’s points</p>
          <ul className="divide-y divide-border">
            {rows.map(r => (
              <li key={r.key} className="flex items-center gap-3 py-1.5 text-[13px]">
                <r.Icon className="h-3.5 w-3.5 shrink-0 text-dim" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-body">{r.label}</span>
                <span className="tabular-nums text-dim">
                  {r.key === 'calls' && r.pts < r.n * r.each
                    ? `${r.n} · ${MAX_CALL_POINTS_PER_LEAD_PER_DAY}/lead count`
                    : `${r.n} × ${r.each}`}
                </span>
                <span className="w-12 text-right font-bold tabular-nums" style={{ color: r.pts > 0 ? 'var(--color-accent)' : 'var(--color-dim)' }}>
                  {r.pts > 0 ? `+${r.pts}` : '0'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Streak + week */}
        <div className="flex flex-col gap-4 md:min-w-[11rem]">
          <StreakFlame days={s.days} todayDone={s.todayDone} atRisk={s.atRisk} size="lg" />
          <div>
            <p className="text-eyebrow text-dim">This week</p>
            <p className="mt-1 text-display leading-none">
              <CountUp value={view.week?.points ?? 0} className="text-accent" />
              <span className="ml-1 text-heading font-semibold text-muted">pts</span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 border-t border-border p-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Leaderboard rows={view.leaderboard || []} gapToNext={view.week?.gapToNext ?? null} title="Team this week" />
        <BadgeShelf earned={view.badges || []} />
      </div>

      <details className="group border-t border-border px-5 py-3 text-caption text-muted">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-body">
          <Info className="h-3.5 w-3.5 text-dim" aria-hidden />
          How points work
        </summary>
        <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <li>Call logged: <b className="text-text">+{POINTS.CALL}</b> (first {MAX_CALL_POINTS_PER_LEAD_PER_DAY} calls per lead per day)</li>
          <li>Lead moved forward a stage: <b className="text-text">+{POINTS.MOVED_FORWARD}</b></li>
          <li>Lead made HOT: <b className="text-text">+{POINTS.HOT}</b></li>
          <li>Lead converted: <b className="text-text">+{POINTS.CONVERTED}</b></li>
          <li>Follow-up handled on its due day: <b className="text-text">+{POINTS.FOLLOWUP_ON_TIME}</b></li>
          <li>Streak: working days (Mon–Sat) in a row with at least one call.</li>
        </ul>
        <p className="mt-2 text-dim">Points come from work you already log — nothing extra to fill in. Moving a lead backwards never costs points.</p>
      </details>
    </section>
  )
}
