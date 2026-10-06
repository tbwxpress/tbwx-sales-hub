'use client'

import { ArrowUp, ArrowDown } from 'lucide-react'
import type { LeaderRowDTO } from './store'

/**
 * Leaderboard — this week's top 5 by points, plus "you". Friendly by design:
 * first names only, nobody below you is ever listed, a drop in rank is shown
 * in a quiet grey (never red), and the footer always says what it takes to
 * move up.
 */

const MEDAL: Record<number, { bg: string; fg: string; ring: string }> = {
  1: { bg: 'linear-gradient(145deg, #ffe27a, #e6b800)', fg: '#3a2604', ring: 'rgba(245,197,24,0.45)' },
  2: { bg: 'linear-gradient(145deg, #f1ece2, #b9b0a1)', fg: '#2d2417', ring: 'rgba(205,195,180,0.45)' },
  3: { bg: 'linear-gradient(145deg, #e0a36a, #9a5b25)', fg: '#2a1404', ring: 'rgba(176,122,60,0.45)' },
}

function RankToken({ rank, unranked }: { rank: number; unranked?: boolean }) {
  const m = unranked ? undefined : MEDAL[rank]
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold tabular-nums"
      style={m
        ? { background: m.bg, color: m.fg, boxShadow: `0 0 0 2px ${m.ring}` }
        : { background: 'var(--color-elevated)', color: 'var(--color-muted)' }}
      aria-label={unranked ? 'Not ranked yet' : `Rank ${rank}`}
    >
      {unranked ? '–' : rank}
    </span>
  )
}

export default function Leaderboard({
  rows,
  gapToNext,
  title = 'This week',
}: {
  rows: LeaderRowDTO[]
  gapToNext: number | null
  title?: string
}) {
  // The API sends the top scorers, then appends "you" when you're outside them
  // (or haven't scored yet) — show that appended row after a gap.
  const meIdx = rows.findIndex(r => r.isMe)
  const me = meIdx >= 0 ? rows[meIdx] : undefined
  const myRowDetached = !!me && meIdx === rows.length - 1 && meIdx > 0 && (rows.length > 5 || me.points === 0)
  const visible = myRowDetached ? rows.slice(0, -1) : rows

  let footer: string
  if (!me || me.points === 0) footer = 'Your first call this week puts you on the board.'
  else if (me.rank === 1 && gapToNext === null) footer = 'You’re leading the week. Keep it rolling!'
  else if (gapToNext !== null) footer = `${gapToNext} pts to move up a spot.`
  else footer = 'Every call counts — keep going.'

  const empty = rows.every(r => r.points === 0)

  return (
    <section aria-label={`${title} leaderboard`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-eyebrow text-dim">{title}</h3>
        <span className="text-caption text-dim">Resets every Monday</span>
      </div>

      {empty ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-caption text-muted">
          Fresh week — nobody has scored yet. The first call puts you on top.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {visible.map((r, i) => <Row key={`${r.agent}-${i}`} r={r} index={i} />)}
          {myRowDetached && me && (
            <>
              <li aria-hidden className="flex justify-center py-0.5 text-dim">
                <span className="tracking-[0.3em]">···</span>
              </li>
              <Row r={me} index={visible.length} />
            </>
          )}
        </ol>
      )}

      <p className="mt-3 text-caption text-muted">{footer}</p>
    </section>
  )
}

function Row({ r, index }: { r: LeaderRowDTO; index: number }) {
  return (
    <li
      className="gam-row flex items-center gap-3 rounded-xl px-2.5 py-2"
      style={{
        animationDelay: `${index * 50}ms`,
        background: r.isMe ? 'color-mix(in srgb, var(--color-accent) 11%, var(--color-card))' : 'transparent',
        boxShadow: r.isMe ? 'inset 3px 0 0 var(--color-accent)' : undefined,
      }}
    >
      <RankToken rank={r.rank} unranked={r.points === 0} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text">
        {r.agent}
        {r.isMe && (
          <span className="ml-1.5 rounded-full px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide"
            style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
            you
          </span>
        )}
      </span>
      {r.movement > 0 && (
        <span className="inline-flex items-center text-[11px] font-bold tabular-nums" style={{ color: 'var(--color-success)' }} title={`Up ${r.movement} since yesterday`}>
          <ArrowUp className="h-3 w-3" strokeWidth={3} aria-hidden />{r.movement}
          <span className="sr-only"> places up since yesterday</span>
        </span>
      )}
      {r.movement < 0 && (
        <span className="inline-flex items-center text-[11px] font-semibold tabular-nums text-dim" title={`Down ${-r.movement} since yesterday`}>
          <ArrowDown className="h-3 w-3" strokeWidth={2.5} aria-hidden />{-r.movement}
          <span className="sr-only"> places down since yesterday</span>
        </span>
      )}
      <span className="w-14 text-right text-[13px] font-bold tabular-nums" style={{ color: r.isMe ? 'var(--color-accent)' : 'var(--color-body)' }}>
        {r.points.toLocaleString('en-IN')}
        <span className="ml-0.5 text-[10px] font-semibold text-dim">pts</span>
      </span>
    </li>
  )
}
