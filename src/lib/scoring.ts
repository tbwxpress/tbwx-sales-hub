import type { Lead } from './types'
import type { LeadSignal } from './db'

// --- Tier city lists (lowercase for matching) ---

const TIER_1_CITIES = new Set([
  'mumbai', 'delhi', 'bangalore', 'bengaluru', 'hyderabad', 'chennai',
  'kolkata', 'pune', 'ahmedabad', 'jaipur', 'lucknow', 'chandigarh',
  'gurgaon', 'gurugram', 'noida', 'ghaziabad',
])

const TIER_2_CITIES = new Set([
  'indore', 'bhopal', 'nagpur', 'surat', 'vadodara', 'coimbatore',
  'kochi', 'vizag', 'visakhapatnam', 'mysore', 'mangalore', 'shimla',
  'dehradun', 'raipur', 'patna', 'ranchi', 'bhubaneswar', 'agra',
  'varanasi', 'amritsar',
])

// --- Helper: case-insensitive substring check ---

function includes(value: string | undefined | null, ...keywords: string[]): boolean {
  if (!value) return false
  const lower = value.toLowerCase()
  return keywords.some(k => lower.includes(k))
}

// --- Scoring components ---

function scoreBudgetModel(modelInterest: string | undefined | null): number {
  if (!modelInterest || modelInterest.trim() === '') return 5
  if (includes(modelInterest, 'full store', '7-8')) return 25
  if (includes(modelInterest, 'mini', '5-6')) return 20
  if (includes(modelInterest, 'kiosk', '3-4')) return 15
  return 10
}

function scoreTimeline(timeline: string | undefined | null): number {
  if (!timeline || timeline.trim() === '') return 3
  if (includes(timeline, 'immediately', 'this month', 'asap', '1 month')) return 25
  if (includes(timeline, '1-3 month', '2 month', '3 month', 'next month')) return 18
  if (includes(timeline, '3-6', '6 month', 'exploring', 'looking')) return 10
  return 8
}

function scoreExperience(experience: string | undefined | null): number {
  if (!experience || experience.trim() === '') return 3
  if (includes(experience, 'food', 'restaurant', 'cafe', 'hotel', 'franchise')) return 15
  if (includes(experience, 'business', 'retail', 'shop')) return 10
  return 6
}

function scoreCityTier(city: string | undefined | null): number {
  if (!city || city.trim() === '') return 6
  const lower = city.toLowerCase().trim()
  if (TIER_1_CITIES.has(lower)) return 15
  if (TIER_2_CITIES.has(lower)) return 10
  return 6
}

function scoreEngagement(leadStatus: string | undefined | null): number {
  switch (leadStatus) {
    case 'HOT':
    case 'FINAL_NEGOTIATION':
      return 20
    case 'CALL_DONE_INTERESTED':
      return 16
    case 'REPLIED':
    case 'NO_RESPONSE':
      return 12
    case 'DECK_SENT':
      return 8
    case 'NEW':
      return 4
    case 'DELAYED':
      return 2
    case 'LOST':
    case 'CONVERTED':
      return 0
    default:
      return 4
  }
}

function computeDecay(lead: Lead): number {
  if (!lead.created_time) return 0

  const created = new Date(lead.created_time)
  if (isNaN(created.getTime())) return 0

  const now = new Date()
  const daysSinceCreated = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))

  const status = lead.lead_status

  if ((status === 'NEW' || status === 'DECK_SENT') && daysSinceCreated > 7) {
    return Math.min(daysSinceCreated - 7, 15)
  }

  if (status === 'NO_RESPONSE' && daysSinceCreated > 14) {
    return Math.min(daysSinceCreated - 14, 10)
  }

  return 0
}

function computePriorityBoost(leadPriority: string | undefined | null): number {
  if (!leadPriority) return 0
  const upper = leadPriority.toUpperCase().trim()
  if (upper === 'HOT') return 5
  if (upper === 'COLD') return -5
  return 0
}

// --- Main exported functions ---

export function computeLeadScore(lead: Lead): number {
  let score = 0

  score += scoreBudgetModel(lead.model_interest)
  score += scoreTimeline(lead.timeline)
  score += scoreExperience(lead.experience)
  score += scoreCityTier(lead.city)
  score += scoreEngagement(lead.lead_status)

  // Apply decay (subtract)
  score -= computeDecay(lead)

  // Apply priority boost
  score += computePriorityBoost(lead.lead_priority)

  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(score)))
}

export function getScoreLabel(score: number): 'excellent' | 'good' | 'average' | 'low' | 'cold' {
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'good'
  if (score >= 40) return 'average'
  if (score >= 20) return 'low'
  return 'cold'
}

const SCORE_COLOR_MAP: Record<ReturnType<typeof getScoreLabel>, string> = {
  excellent: '#22c55e',
  good: '#3b82f6',
  average: '#f59e0b',
  low: '#f97316',
  cold: '#ef4444',
}

export function getScoreColor(score: number): string {
  return SCORE_COLOR_MAP[getScoreLabel(score)]
}

// ───────────────────────────────────────────────────────────────────────────
// Sales-AI: the richer, EXPLAINABLE score shared by BOTH the /work rail (Guided)
// and the leads view (Free). Reuses computeLeadScore() as the qualification base
// (single source of truth, scaled to leave headroom) and layers the captured
// structured signals (lead_signals) + reply-recency on top, returning the human
// reasons + a temperature trend. The LLM is intentionally NOT used here — order
// must stay explainable integer math.
// ───────────────────────────────────────────────────────────────────────────

export interface ScoreContext {
  /** ISO/space timestamp of the lead's last INBOUND message, if any. */
  lastReceivedAt?: string | null
  now?: number
}
export interface LeadScoreResult {
  score: number // 0–100
  reasons: string[] // e.g. ["Paisa ready +20","Garam lead +15"]
  temperature: 'warming' | 'flat' | 'cooling'
}

const HOT_STATUSES = new Set(['HOT', 'FINAL_NEGOTIATION'])
const DAY_MS = 24 * 60 * 60 * 1000

function lastReceivedMs(s?: string | null): number {
  if (!s) return NaN
  let str = String(s).trim().replace(' ', 'T')
  // Pin a zone-less SQLite/sheet timestamp to UTC so it isn't read as server-local
  // (matches work.ts tsToMs). ISO strings with a Z/offset are left alone.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(str)) str += 'Z'
  const t = new Date(str).getTime()
  return Number.isNaN(t) ? NaN : t
}

export function leadScore(lead: Lead, signals?: LeadSignal | null, ctx: ScoreContext = {}): LeadScoreResult {
  const now = ctx.now ?? Date.now()
  const reasons: string[] = []

  // Base qualification = the existing deterministic components, scaled to ~60 so
  // the captured signals below have room to differentiate two similar leads.
  let score = Math.round(computeLeadScore(lead) * 0.6)
  if (scoreTimeline(lead.timeline) >= 18) reasons.push('Jaldi chahiye')
  if (scoreCityTier(lead.city) >= 15) reasons.push('Tier-1 city')
  if (HOT_STATUSES.has(lead.lead_status || '')) reasons.push('HOT status')

  const add = (pts: number, why: string) => {
    score += pts
    if (why) reasons.push(why)
  }

  // Speed-to-lead: a fresh NEW lead is most convertible in the first minutes —
  // the boost decays with age so a 2-min lead always outranks a 40-min one.
  if (lead.lead_status === 'NEW' && lead.created_time) {
    let cs = String(lead.created_time).trim().replace(' ', 'T')
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(cs)) cs += 'Z'
    const ageMin = (now - new Date(cs).getTime()) / 60000
    if (!Number.isNaN(ageMin) && ageMin >= 0) {
      if (ageMin < 15) add(28, 'Abhi aaya — turant call +28')
      else if (ageMin < 60) add(18, 'Naya lead (<1h) +18')
      else if (ageMin < 240) add(8, '')
    }
  }

  // Reply recency — behaviour out-predicts the (often blank) ad-form fields.
  const lr = lastReceivedMs(ctx.lastReceivedAt)
  if (!Number.isNaN(lr)) {
    const age = now - lr
    if (age < DAY_MS) add(14, 'Abhi reply kiya +14')
    else if (age < 3 * DAY_MS) add(7, 'Reply 3 din mein +7')
  }

  // Captured structured signals (the "why" — the shared brain's richest input).
  if (signals) {
    switch (signals.capital_readiness) {
      case 'funds_ready': add(20, 'Paisa ready +20'); break
      case 'needs_loan': add(8, 'Loan-based +8'); break
      case 'arranging': add(2, ''); break
      case 'not_yet': add(-6, 'Paisa ready nahi −6'); break // down-weight, never hide
      case 'unknown': add(-3, ''); break
    }
    switch (signals.sentiment) {
      case 'hot': add(15, 'Garam lead +15'); break
      case 'warm': add(6, ''); break
      case 'cool': add(-5, 'Thanda −5'); break
      case 'cold': add(-14, 'Cold −14'); break
    }
    if (signals.connected_ever) add(4, 'Phone uthaya +4')
    if (signals.decision_maker && signals.decision_maker !== 'self') add(-3, 'Decider offscreen −3')
    switch (signals.objection) {
      case 'just_exploring': add(-8, 'Bas dekh rahe −8'); break
      case 'capital_not_ready': add(-6, ''); break
      case 'saturation': add(-4, ''); break
      case 'needs_family_approval': add(-3, ''); break
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)))

  // Temperature trend. Active positive signals (hot/warm sentiment, a recent
  // reply, HOT status) WIN over passive cooling concerns, so we never show a red
  // "Cooling" badge next to a "+14 Abhi reply kiya" reason.
  const sentiment = signals?.sentiment
  const repliedRecently = !Number.isNaN(lr) && now - lr < DAY_MS
  const warming = sentiment === 'hot' || sentiment === 'warm' || repliedRecently || HOT_STATUSES.has(lead.lead_status || '')
  const cooling = sentiment === 'cool' || sentiment === 'cold' || signals?.objection === 'just_exploring' || signals?.capital_readiness === 'not_yet'
  const temperature: 'warming' | 'flat' | 'cooling' = warming ? 'warming' : cooling ? 'cooling' : 'flat'

  return { score, reasons: reasons.filter(Boolean), temperature }
}
