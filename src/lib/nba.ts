/**
 * Next-Best-Action — the deterministic "what should the rep do RIGHT NOW" engine.
 *
 * Rules, not an LLM: given the lead + its captured signals + a little context
 * (window state, deck history, attempt count), it returns ONE recommended move
 * with a Hinglish label + a one-line reason a novice can just execute. The LLM is
 * deliberately kept out — the DECISION stays explainable; only the words (drafts,
 * rebuttals) get an LLM elsewhere (Phase 2 reasoner). Shared by both the /work
 * rail and the Free-mode lead detail so both modes recommend the same move.
 */

import type { Lead } from './types'
import type { LeadSignal } from './db'

export interface NbaContext {
  windowOpen?: boolean
  deckSent?: boolean
  attemptCount?: number
}

export interface Nba {
  action: string
  label: string // the move, in Hinglish — fits a button/banner
  reason: string // one line: WHY this move now
}

const QUALIFIED = new Set(['CALL_DONE_INTERESTED', 'HOT'])

export function computeNBA(lead: Lead, signals?: LeadSignal | null, ctx: NbaContext = {}): Nba {
  const status = lead.lead_status

  // 1) Open WhatsApp window — the only free channel + the warmest moment.
  if (ctx.windowOpen) {
    return { action: 'reply_whatsapp', label: 'WhatsApp reply karo', reason: 'Window khula hai — abhi reply bhejo, customer wait kar raha hai.' }
  }
  // 2) The real decider isn't on the phone (the silent veto).
  if ((signals?.decision_maker && signals.decision_maker !== 'self') || signals?.objection === 'needs_family_approval') {
    return { action: 'involve_decider', label: 'Decider ko involve karo', reason: 'Family/partner decide karega — unhe call pe lao + unki bhasha mein outlet video bhejo.' }
  }
  // 3) Loan-dependent — hand them the finance path before they stall.
  if (signals?.capital_readiness === 'needs_loan') {
    return { action: 'finance_help', label: 'Loan/finance option do', reason: 'Loan-based buyer — MUDRA/bank finance ka option batao, warna ruk jayega.' }
  }
  // 4) Objection-specific proof.
  if (signals?.objection === 'roi_doubt') {
    return { action: 'send_roi', label: 'ROI + outlet proof bhejo', reason: 'Paisa-wapas ka doubt hai — payback months + paas wale outlet ka proof bhejo.' }
  }
  if (signals?.objection === 'brand_unknown') {
    return { action: 'send_proof', label: 'Outlet proof video bhejo', reason: 'Brand pe bharosa nahi — running outlets ka video + testimonial bhejo.' }
  }
  // 5) Qualified but no deck yet.
  if (QUALIFIED.has(status) && !ctx.deckSent) {
    return { action: 'send_deck', label: 'Deck bhejo', reason: 'Qualified hai par deck nahi gaya — abhi bhejo.' }
  }
  // 6) Closing stage — get them to a real outlet.
  if (status === 'FINAL_NEGOTIATION') {
    return { action: 'book_visit', label: 'Outlet visit book karo', reason: 'Closing stage — ek outlet visit fix karo, deal pakki hogi.' }
  }
  // 7) Just exploring — keep it light, don't burn the lead.
  if (signals?.objection === 'just_exploring') {
    return { action: 'nurture', label: 'Halki follow-up', reason: 'Abhi serious nahi — pressure mat do, halki follow-up pe rakho.' }
  }
  // 8) Many attempts, still no connect — change the channel/time.
  if ((ctx.attemptCount ?? 0) >= 4 && !ctx.windowOpen) {
    return { action: 'switch_channel', label: 'WhatsApp pe try karo', reason: 'Kaafi baar call ho chuki — ab WhatsApp pe ek message bhejo, window khulegi.' }
  }
  // 9) Default — pick up the phone.
  return { action: 'call_now', label: 'Call karo', reason: 'Phone karke baat karo aur agla step decide karo.' }
}

// Best-time-to-call hint from a lead's modal inbound hour (IST 0–23) → null when
// we have no message history to learn from.
export function bestCallHint(hourIst: number | null): string | null {
  if (hourIst == null) return null
  const ampm = hourIst === 0 ? '12am' : hourIst < 12 ? `${hourIst}am` : hourIst === 12 ? '12pm' : `${hourIst - 12}pm`
  return `Aksar ~${ampm} message karta hai — us time call karo`
}

// Objection → a ready, on-brand Hinglish rebuttal the rep can say verbatim. Used
// as the deterministic fallback for the AI brief (and as a guardrail anchor when
// the LLM is available). Keep facts honest: ₹4–7L · 5% royalty · 8–12mo ROI.
export const REBUTTALS: Record<string, string> = {
  roi_doubt: 'Payback aam taur pe 8–12 mahine ka hota hai. Main aapko paas wale outlet ke actual numbers dikha sakta hoon — kitna kamaata hai.',
  location_risk: 'Location hum khud survey karke approve karte hain — footfall aur competition dekh ke — taaki risk kam ho.',
  brand_unknown: '40+ outlets already chal rahe hain. Main running outlets ke videos aur owners ke testimonials bhej deta hoon.',
  support_fear: 'Setup, training, marketing aur supply — sab end-to-end support milti hai, aapko akele nahi chhodte.',
  capital_not_ready: 'Koi baat nahi — main exact investment breakdown bhej deta hoon, aur loan/MUDRA ka option bhi hai.',
  needs_family_approval: 'Bilkul, family ke saath decision lena sahi hai. Main unke liye ek short video + numbers bhej deta hoon, aur chahein to ek saath baat kar lete hain.',
  saturation: 'Demand abhi bhi strong hai — hum location aise choose karte hain ki aapka catchment alag ho, cannibalization na ho.',
  just_exploring: 'Koi pressure nahi — main basics bhej deta hoon, aaram se dekh lijiye; jab ready ho tab aage badhte hain.',
}

export function objectionRebuttal(objection: string | null | undefined): string | null {
  if (!objection) return null
  return REBUTTALS[objection] || null
}
