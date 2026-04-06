import type { Lead } from './types'

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
