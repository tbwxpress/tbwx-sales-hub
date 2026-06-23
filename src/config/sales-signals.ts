/**
 * Shared sales-signal taxonomies (Hinglish labels) for BOTH front-ends:
 *  - Guided Mode: the /work rail OutcomeBar (novice reps, tap-not-type).
 *  - Free Mode:   the leads page / lead detail (experienced reps).
 * One source of truth so the same structured signals are captured + displayed
 * across both UIs and feed the same scoring brain (src/lib/scoring.ts).
 *
 * Labels are deliberately Hinglish — the sales team's working language — so an
 * inexperienced rep reads "Ghar pe poochna hai", not "needs_family_approval".
 */

export interface Chip {
  key: string
  label: string
}

// Lead temperature — one tap on EVERY outcome (defaults neutral; skipping is allowed).
export const SENTIMENT_CHIPS: Chip[] = [
  { key: 'hot', label: '🔥 Garam' },
  { key: 'warm', label: 'Thoda interested' },
  { key: 'cool', label: 'Thanda' },
  { key: 'cold', label: 'Bilkul nahi' },
]

// Why a lead stalled — one tap on soft-no / loss outcomes.
export const OBJECTION_CHIPS: Chip[] = [
  { key: 'roi_doubt', label: 'Paisa wapas?' },
  { key: 'location_risk', label: 'Location chalega?' },
  { key: 'brand_unknown', label: 'Brand suna nahi' },
  { key: 'support_fear', label: 'Support milega?' },
  { key: 'capital_not_ready', label: 'Paisa ready nahi' },
  { key: 'needs_family_approval', label: 'Ghar pe poochna hai' },
  { key: 'saturation', label: 'Competition zyada' },
  { key: 'just_exploring', label: 'Bas dekh rahe' },
]

// Money reality — one tap on the qualify handoff. Out-predicts "timeline".
export const CAPITAL_CHIPS: Chip[] = [
  { key: 'funds_ready', label: 'Paisa ready' },
  { key: 'needs_loan', label: 'Loan chahiye' },
  { key: 'arranging', label: 'Arrange kar rahe' },
  { key: 'not_yet', label: 'Abhi nahi' },
  { key: 'unknown', label: 'Pata nahi' },
]

// Who actually approves — the silent veto.
export const DECISION_MAKER_CHIPS: Chip[] = [
  { key: 'self', label: 'Khud' },
  { key: 'spouse', label: 'Pati/Patni' },
  { key: 'father_family', label: 'Family/Papa' },
  { key: 'business_partner', label: 'Partner' },
]

// Buyer persona — the master routing key (each has a known dominant fear).
export const PERSONA_CHIPS: Chip[] = [
  { key: 'first_timer', label: 'Pehli baar' },
  { key: 'passive_investor', label: 'Investor (operate nahi)' },
  { key: 'existing_fnb', label: 'Already F&B' },
  { key: 'side_income_nri', label: 'Side income / NRI' },
  { key: 'family_funded', label: 'Family ke paise' },
]

// What the buyer committed to next — one tap on positive/advance outcomes.
export const NEXT_STEP_CHIPS: Chip[] = [
  { key: 'will_send_deck', label: 'Deck bhejunga' },
  { key: 'booked_call', label: 'Call fix' },
  { key: 'wants_visit', label: 'Outlet visit' },
  { key: 'comparing_options', label: 'Compare kar raha' },
  { key: 'awaiting_family', label: 'Family se poochega' },
]

const keysOf = (c: Chip[]) => new Set(c.map((x) => x.key))
export const SENTIMENT_KEYS = keysOf(SENTIMENT_CHIPS)
export const OBJECTION_KEYS = keysOf(OBJECTION_CHIPS)
export const CAPITAL_KEYS = keysOf(CAPITAL_CHIPS)
export const DECISION_MAKER_KEYS = keysOf(DECISION_MAKER_CHIPS)
export const PERSONA_KEYS = keysOf(PERSONA_CHIPS)
export const NEXT_STEP_KEYS = keysOf(NEXT_STEP_CHIPS)

/** Human label for a stored key (for read-only display in either UI). */
export function labelFor(chips: Chip[], key: string | null | undefined): string {
  if (!key) return ''
  return chips.find((c) => c.key === key)?.label || key
}
