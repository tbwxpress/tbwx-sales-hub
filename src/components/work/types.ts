/**
 * Shared types for Guided Work Mode — the single-focus "work rail".
 *
 * These mirror the backend contracts exactly (GET /api/work/queue,
 * POST /api/work/outcome, GET /api/work/stats). Keep them in lock-step with
 * `src/lib/work.ts`; the UI consumes them verbatim and never reshapes.
 */

/** One step in a lead's history, rendered in the lifecycle strip (chronological). */
export interface Milestone {
  key: string
  label: string
  who: string
  at: string
  /** Human "relative" string the server pre-computes, e.g. "12d ago". */
  rel: string
}

/** A forced-choice outcome button. Rendered straight from the card — never hardcoded. */
export interface Outcome {
  key: string
  label: string
}

/** The 24h WhatsApp service-window state for this lead. */
export interface WorkWindow {
  open: boolean
  last_received_at: string | null
}

/** The single guided card the rail serves, one at a time. */
export interface Card {
  lead_row: number
  name: string
  phone: string
  city: string
  lead_status: string
  lead_priority: string
  model_interest: string
  timeline: string
  experience: string
  campaign_name: string
  platform: string
  /** The "why now" reason string the engine attaches. */
  why_now: string
  window: WorkWindow
  lifecycle: Milestone[]
  primary_action: 'whatsapp' | 'call'
  outcomes: Outcome[]
  queue_reason: string
  /** How many cards remain in this agent's queue after the current one. */
  remaining: number
}

/** Cadence stats — drives the progress rings, "left" count, and streak chip. */
export interface WorkStats {
  /** Every logged outcome (dial/touch) — the volume bar. */
  attempts_today: number
  attempts_target: number
  /** Outcomes where the agent actually reached/engaged the lead — the quality floor. */
  conversations_today: number
  conversations_target: number
  streak: number
  queue_depth: number
}

/** POST /api/work/outcome request body. */
export interface OutcomePayload {
  leadRow: number
  outcome: string
  channel: 'call' | 'whatsapp' | 'template' | 'system'
  note?: string
  alsoWhatsapp?: boolean
}

/** POST /api/work/outcome response. */
export interface OutcomeResponse {
  ok: boolean
  routedTo?: string
  next: Card | null
  stats: WorkStats
}

/** GET /api/work/queue response. */
export interface QueueResponse {
  cards: Card[]
  stats: WorkStats
}
