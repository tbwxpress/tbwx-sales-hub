'use client'

import { Flame, Phone, MessageCircle, LogOut } from 'lucide-react'
import type { WorkStats } from './types'

/**
 * CadenceHeader — pinned top of the rail. The agent's always-visible momentum.
 *
 * Two honest targets, not one:
 *   · CONVERSATIONS (the hero gold ring) — leads actually reached/engaged today
 *     vs the quality floor (≥50). This is what "good work" means.
 *   · DIALS / ATTEMPTS (the slim bar) — every logged outcome vs the volume bar
 *     (~200). Effort, not just outcomes.
 * Plus a "{queue_depth} left" count and a streak chip (consecutive days hitting
 * the conversation target). Tasteful operator pride, not childish gamification.
 *
 * The ring is a pure SVG radial bar (stroke-dasharray = circumference, animated
 * stroke-dashoffset) so it fills smoothly via a CSS transition — no animation
 * library. Respects prefers-reduced-motion through the global media query.
 */
export default function CadenceHeader({ stats }: { stats: WorkStats }) {
  // Conversations — the hero metric.
  const convTarget = Math.max(1, stats.conversations_target || 1)
  const conv = Math.max(0, stats.conversations_today || 0)
  const convPct = Math.min(100, Math.round((conv / convTarget) * 100))
  const convHit = conv >= convTarget

  // Dials / attempts — the volume bar.
  const attTarget = Math.max(1, stats.attempts_target || 1)
  const att = Math.max(0, stats.attempts_today || 0)
  const attPct = Math.min(100, Math.round((att / attTarget) * 100))

  // Ring geometry — small, dense.
  const size = 48
  const stroke = 4
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - convPct / 100)

  return (
    <header
      className="glass-nav sticky top-0 z-30 border-b border-border safe-top"
      style={{ boxShadow: '0 1px 0 0 color-mix(in srgb, var(--color-border) 50%, transparent)' }}
    >
      <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-2.5">
        {/* Conversations ring (hero) */}
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90"
            role="progressbar"
            aria-valuenow={conv}
            aria-valuemin={0}
            aria-valuemax={convTarget}
            aria-label={`${conv} of ${convTarget} conversations today`}
          >
            <circle
              cx={size / 2} cy={size / 2} r={r} fill="transparent" strokeWidth={stroke}
              stroke="color-mix(in srgb, var(--color-accent) 14%, transparent)"
            />
            <circle
              cx={size / 2} cy={size / 2} r={r} fill="transparent" strokeWidth={stroke}
              stroke={convHit ? 'var(--color-success)' : 'var(--color-accent)'}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.43,0.13,0.23,0.96), stroke 0.3s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[14px] font-bold leading-none tabular-nums text-text">{conv}</span>
            <span className="text-[8px] font-semibold leading-none text-dim">/{convTarget}</span>
          </div>
        </div>

        {/* Labels + dials bar */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="flex items-center gap-1 text-heading font-bold text-text">
              <MessageCircle className="h-3.5 w-3.5 text-accent" strokeWidth={2.4} />
              {conv} talks today
            </span>
            {convHit && (
              <span className="text-eyebrow text-[var(--color-success)]">target hit 🎯</span>
            )}
          </div>

          {/* Dials / attempts — slim bar */}
          <div className="mt-1.5 flex items-center gap-2">
            <Phone className="h-3 w-3 shrink-0 text-dim" strokeWidth={2.4} aria-hidden />
            <div
              className="relative h-1.5 flex-1 overflow-hidden rounded-full"
              style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}
              role="progressbar"
              aria-valuenow={att}
              aria-valuemin={0}
              aria-valuemax={attTarget}
              aria-label={`${att} of ${attTarget} dials today`}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${attPct}%`,
                  background: 'var(--color-accent)',
                  transition: 'width 0.6s cubic-bezier(0.43,0.13,0.23,0.96)',
                }}
              />
            </div>
            <span className="shrink-0 text-caption tabular-nums text-muted">
              {att}<span className="text-dim">/{attTarget} dials</span>
            </span>
          </div>

          <div className="mt-0.5 text-caption text-dim">
            <span className="tabular-nums font-semibold text-body">{stats.queue_depth}</span> on your rail
          </div>
        </div>

        {/* Streak chip */}
        {stats.streak > 0 && (
          <div
            className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-caption font-bold tabular-nums"
            style={{
              background: 'color-mix(in srgb, var(--color-hot) 16%, transparent)',
              color: 'var(--color-hot)',
            }}
            title={`${stats.streak} consecutive days hitting your conversation target`}
          >
            <Flame className="h-3.5 w-3.5" strokeWidth={2.4} />
            {stats.streak}-day
          </div>
        )}

        {/* Sign out — the rail is immersive (no Navbar), so logout lives here so
            guided telecallers + closers can always log out. */}
        <button
          type="button"
          onClick={async () => {
            try { await fetch('/api/auth/logout', { method: 'POST' }) } catch { /* ignore */ }
            window.location.href = '/login'
          }}
          title="Sign out"
          aria-label="Sign out"
          className="focus-ring flex shrink-0 items-center justify-center rounded-full p-2 text-dim transition-colors hover:text-text"
          style={{ background: 'color-mix(in srgb, var(--color-border) 30%, transparent)' }}
        >
          <LogOut className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </header>
  )
}
