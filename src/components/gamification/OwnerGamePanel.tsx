'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { useVisiblePolling } from '@/lib/use-visible-polling'
import { MIN_DAILY_GOAL, MAX_DAILY_GOAL } from '@/lib/gamification/config'
import { BADGES } from '@/lib/gamification/points'
import { FlameIcon } from './StreakFlame'

/**
 * OwnerGamePanel — admin view of the points game: the on/off switch, the
 * daily goal, and every agent's points today / this week, streak and badges.
 */

interface Row {
  id: string
  name: string
  role: 'telecaller' | 'closer'
  todayPoints: number
  weekPoints: number
  goalHit: boolean
  calls: number
  moved: number
  hot: number
  converted: number
  followups: number
  streak: number
  streakAtRisk: boolean
  badges: number
}

interface Overview {
  config: { enabled: boolean; dailyGoal: number }
  rows: Row[]
}

export default function OwnerGamePanel() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [goalDraft, setGoalDraft] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/gamification/overview', { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        if (json?.success) { setData(json.data); setError('') }
        else setError(json?.error || 'Could not load points')
      })
      .catch(() => setError('Could not load points'))
  }, [])

  useVisiblePolling(load, 60_000)

  async function save(patch: { enabled?: boolean; daily_goal?: number }) {
    setSaving(true)
    try {
      const res = await fetch('/api/gamification/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!json?.success) throw new Error(json?.error || 'Save failed')
      setData(d => (d ? { ...d, config: json.data } : d))
      setGoalDraft(null)
      toast.success(patch.enabled === false ? 'Points & badges switched off for everyone' : patch.enabled ? 'Points & badges switched on' : 'Daily goal saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    }
    setSaving(false)
  }

  const enabled = data?.config.enabled ?? true
  const goal = data?.config.dailyGoal ?? 60
  const goalValue = goalDraft ?? String(goal)
  const goalNum = Number(goalValue)
  const goalValid = Number.isFinite(goalNum) && goalNum >= MIN_DAILY_GOAL && goalNum <= MAX_DAILY_GOAL

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4" aria-label="Points and badges — owner controls">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-heading text-text">Points &amp; badges</h2>
          <p className="mt-0.5 text-caption text-dim">
            Agents earn points from work they already log. Calls +2 · moved forward +5 · HOT +15 · converted +100 · follow-up on its due day +3.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-caption text-muted">
            Daily goal
            <input
              type="number"
              inputMode="numeric"
              min={MIN_DAILY_GOAL}
              max={MAX_DAILY_GOAL}
              value={goalValue}
              onChange={e => setGoalDraft(e.target.value)}
              className="w-20 rounded-md border border-border bg-elevated px-2 py-1 text-xs text-text"
              aria-label="Daily points goal"
            />
          </label>
          {goalDraft !== null && goalNum !== goal && (
            <button
              type="button"
              disabled={saving || !goalValid}
              onClick={() => save({ daily_goal: goalNum })}
              className="rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
              style={{ background: 'var(--color-accent)', color: '#1a1209' }}
            >
              Save
            </button>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={saving || !data}
            onClick={() => save({ enabled: !enabled })}
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50"
            style={{
              borderColor: enabled ? 'color-mix(in srgb, var(--color-success) 45%, transparent)' : 'var(--color-border)',
              color: enabled ? 'var(--color-success)' : 'var(--color-muted)',
              background: enabled ? 'color-mix(in srgb, var(--color-success) 10%, transparent)' : 'var(--color-elevated)',
            }}
          >
            <span className="relative inline-block h-4 w-7 rounded-full transition-colors"
              style={{ background: enabled ? 'var(--color-success)' : 'var(--color-border-light)' }} aria-hidden>
              <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-[left] duration-200" style={{ left: enabled ? 14 : 2 }} />
            </span>
            {enabled ? 'On for agents' : 'Off'}
          </button>
          <button type="button" onClick={load} className="rounded-md p-1.5 text-dim hover:text-text" aria-label="Refresh points">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-caption" style={{ color: 'var(--color-danger)' }}>{error}</p>}

      {!data && !error && (
        <div className="mt-4 space-y-2" aria-busy="true">
          {[0, 1, 2].map(i => <div key={i} className="skeleton h-8 w-full" />)}
        </div>
      )}

      {data && data.rows.length === 0 && (
        <p className="mt-4 text-caption text-dim">No active agents yet.</p>
      )}

      {data && data.rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-dim">
                <th className="py-2 pr-3 font-semibold">Agent</th>
                <th className="px-2 py-2 text-right font-semibold">Today</th>
                <th className="px-2 py-2 text-right font-semibold">Week</th>
                <th className="px-2 py-2 text-right font-semibold">Calls</th>
                <th className="px-2 py-2 text-right font-semibold">Moved / HOT / Won</th>
                <th className="px-2 py-2 text-right font-semibold">Streak</th>
                <th className="py-2 pl-2 text-right font-semibold">Badges</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.rows.map(r => (
                <tr key={r.id} className="table-row-hover">
                  <td className="py-2 pr-3">
                    <span className="font-medium text-text">{r.name}</span>
                    <span className="ml-1.5 text-[10px] capitalize text-dim">{r.role}</span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <span className="font-bold" style={{ color: r.goalHit ? 'var(--color-success)' : 'var(--color-text)' }}>{r.todayPoints}</span>
                    <span className="text-[10px] text-dim">/{data.config.dailyGoal}</span>
                  </td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums text-accent">{r.weekPoints}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-body">{r.calls}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted">{r.moved} / {r.hot} / {r.converted}</td>
                  <td className="px-2 py-2 text-right">
                    <span className="inline-flex items-center gap-1 tabular-nums" title={r.streakAtRisk ? 'No call yet today' : undefined}
                      style={{ color: r.streak > 0 && !r.streakAtRisk ? 'var(--color-hot)' : 'var(--color-dim)' }}>
                      <FlameIcon lit={r.streak > 0} size={13} />{r.streak}
                    </span>
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums text-muted">{r.badges}/{BADGES.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
