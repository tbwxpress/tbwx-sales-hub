'use client'

import { ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import type { Milestone } from './types'

/**
 * LifecycleStrip — the lead's story without leaving the rail. A compact
 * horizontal chain of milestones (came in → qualified → assigned → deck → last
 * contact), each labelled "who · rel". Tap to expand the full chronological
 * vertical trail in a popover.
 *
 * Each milestone gets a leading emoji baked into its label by the backend
 * (📥 / ✅ / 👤 / 📄 / 💬). We render labels verbatim and surface "who · rel".
 */
export default function LifecycleStrip({ lifecycle }: { lifecycle: Milestone[] }) {
  if (!lifecycle || lifecycle.length === 0) return null

  return (
    <Popover>
      <PopoverTrigger
        className="focus-ring -mx-1 flex w-full items-center gap-1.5 overflow-x-auto rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-elevated/50"
        aria-label="Expand full lead timeline"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {lifecycle.map((m, i) => (
            <div key={m.key} className="flex shrink-0 items-center gap-1.5">
              {i > 0 && <span className="text-dim/60" aria-hidden>→</span>}
              <span className="flex items-center gap-1 whitespace-nowrap text-caption text-muted">
                <span className="font-medium text-body">{m.label}</span>
                {m.rel && <span className="text-dim">{m.rel}</span>}
              </span>
            </div>
          ))}
        </div>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-dim" strokeWidth={2} />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 max-w-[88vw]">
        <div className="text-eyebrow mb-2 text-dim">Full timeline</div>
        <ol className="relative space-y-0">
          {lifecycle.map((m, i) => (
            <li key={m.key} className="relative flex gap-3 pb-3 last:pb-0">
              {/* Spine + node */}
              <div className="relative flex flex-col items-center">
                <span
                  className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: 'var(--color-accent)' }}
                />
                {i < lifecycle.length - 1 && (
                  <span className="mt-0.5 w-px flex-1 bg-border" />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="text-body font-medium text-text">{m.label}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-caption text-muted">
                  {m.who && <span className="text-body">{m.who}</span>}
                  {m.who && m.rel && <span className="text-dim">·</span>}
                  {m.rel && <span>{m.rel}</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <Separator className="my-2" />
        <p className="text-caption text-dim">Newest at the bottom — the live edge of this lead.</p>
      </PopoverContent>
    </Popover>
  )
}
