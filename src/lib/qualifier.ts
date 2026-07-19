// Level-2 AI qualifier — the advisor-bot's reading brain.
//
// The advisor bot (advisor-bot.ts) asks button-tappers 3 qualifying questions
// (city / ₹4-7L budget fit / timeline). This module reads the lead's free-text
// ANSWERS and extracts structured facts with Gemini. Hard boundary: the AI
// never composes customer-facing text — Level 2 sends NOTHING to the lead. It
// only writes into the system: lead fields (fill-if-blank), the sales-signals
// brain (same keys the guided rail captures), an upward-only priority bump,
// a "[Bot qualifier]" note, and a HOT notification to the owner.
//
// Rails: runs only on free text received within 48h AFTER a bot message, skips
// long threads (>8 answers), validates every enum against whitelists, and all
// failures are silent no-ops (the webhook must never break on this).

import { getMessages, getContact, upsertLeadSignal, insertNote, getNotes } from './db'
import { getLeadByRow, updateLead } from './sheets'
import { notifyQuiet } from './notifications'
import { getUsers } from './users'
import { BOT_SENDER } from './advisor-bot'

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models'
const MODEL = process.env.QUALIFIER_MODEL || 'gemini-2.5-flash'
const WINDOW_MS = 48 * 60 * 60 * 1000
const MAX_ANSWERS = 8

const BUDGET_FITS = new Set(['yes', 'no', 'unclear'])
const TIMELINES = new Set(['within_30_days', '1-3_months', 'later', 'unclear'])
const CAPITALS = new Set(['funds_ready', 'needs_loan', 'arranging', 'not_yet'])
const SENTIMENTS = new Set(['hot', 'warm', 'cool', 'cold'])

interface Extraction {
  city: string | null
  budget_fit: string
  timeline: string
  capital_readiness: string | null
  sentiment: string | null
  qualified_hot: boolean
  summary: string
}

const PRIORITY_RANK: Record<string, number> = { COLD: 1, WARM: 2, HOT: 3 }

export async function maybeQualifyReply(phone: string): Promise<void> {
  const key = process.env.GOOGLE_AI_API_KEY
  if (!key) return

  // The answer window: free text received AFTER our bot's questions, within 48h.
  const msgs = await getMessages(phone, 60)
  let botIdx = -1
  for (let i = msgs.length - 1; i >= 0; i--) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((msgs[i] as any).sent_by === BOT_SENDER) { botIdx = i; break }
  }
  if (botIdx === -1) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const botTs = new Date(String((msgs[botIdx] as any).timestamp || '')).getTime()
  if (!botTs || Date.now() - botTs > WINDOW_MS) return
  const answers = msgs
    .slice(botIdx + 1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((m: any) => m.direction === 'received')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => String(m.text || '').slice(0, 200))
    .filter(t => t && !t.startsWith('['))
  if (answers.length === 0 || answers.length > MAX_ANSWERS) return

  const contact = await getContact(phone)
  if (!contact?.lead_row) return
  const leadRow = Number(contact.lead_row)
  const lead = await getLeadByRow(leadRow)
  if (!lead) return

  const prompt = `You are a data extractor for a Belgian waffle franchise sales team in India (franchise cost ₹4-7 lakh all-in).
A lead was asked exactly these 3 questions on WhatsApp:
1) Which city are you planning for?  2) Does ₹4-7 lakh fit your budget?  3) How soon do you want to start?
Their reply messages, oldest first: ${JSON.stringify(answers)}
Extract ONLY what they actually said (Hinglish is common; "10L"/"10 lakh" means ₹10,00,000 which FITS a ₹4-7L requirement; "ASAP"/"jaldi" means within_30_days).
Return STRICT JSON:
{"city": string|null (proper-cased city name, null if not given),
 "budget_fit": "yes"|"no"|"unclear",
 "timeline": "within_30_days"|"1-3_months"|"later"|"unclear",
 "capital_readiness": "funds_ready"|"needs_loan"|"arranging"|"not_yet"|null,
 "sentiment": "hot"|"warm"|"cool"|"cold"|null,
 "qualified_hot": boolean (true ONLY if budget clearly fits AND timeline is within ~3 months),
 "summary": string (one line, e.g. "Pune · budget OK (10L) · wants to start in 2 months")}`

  const res = await fetch(`${GEMINI_API}/${MODEL}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    }),
  })
  if (!res.ok) return
  const data = await res.json()
  let x: Extraction
  try {
    x = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text || '')
  } catch { return }

  // Whitelist validation — anything off-menu becomes null/unclear.
  const budgetFit = BUDGET_FITS.has(x.budget_fit) ? x.budget_fit : 'unclear'
  const timeline = TIMELINES.has(x.timeline) ? x.timeline : 'unclear'
  const capital = x.capital_readiness && CAPITALS.has(x.capital_readiness) ? x.capital_readiness : null
  const sentiment = x.sentiment && SENTIMENTS.has(x.sentiment) ? x.sentiment : null
  const city = typeof x.city === 'string' && x.city.trim() && x.city.length <= 40 ? x.city.trim() : null
  const summary = String(x.summary || '').slice(0, 200)

  // 1) Lead fields — fill-if-blank only; never overwrite what a human/form set.
  const patch: Record<string, string> = {}
  if (city && !lead.city) patch.city = city
  if (timeline !== 'unclear' && !lead.timeline) {
    patch.timeline = timeline === 'later' ? 'just_exploring_for_now' : timeline
  }
  // 2) Priority — upward only. Budget + soon = HOT; budget alone = WARM.
  const current = PRIORITY_RANK[String(lead.lead_priority || '').toUpperCase()] || 0
  if (x.qualified_hot === true && budgetFit === 'yes' && current < 3) patch.lead_priority = 'HOT'
  else if (budgetFit === 'yes' && current < 2) patch.lead_priority = 'WARM'
  if (Object.keys(patch).length > 0) {
    try { await updateLead(leadRow, patch) } catch { /* field patch best-effort */ }
  }

  // 3) Sales-signals brain (same store the rail chips feed).
  if (sentiment || capital) {
    try {
      await upsertLeadSignal(leadRow, {
        sentiment: sentiment ?? undefined,
        capital_readiness: capital ?? undefined,
        updated_by: 'bot-qualifier',
      })
    } catch { /* non-critical */ }
  }

  // 4) Note for the humans — skip if identical to the last qualifier note
  // (each extra answer message re-runs the extraction and refines it).
  if (summary) {
    const noteText = `[Bot qualifier] ${summary}`
    try {
      const notes = await getNotes(phone)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastQualifier = (notes || []).find((n: any) => String(n.note || '').startsWith('[Bot qualifier]'))
      if (!lastQualifier || String(lastQualifier.note) !== noteText) {
        await insertNote({ phone, note: noteText, created_by: 'bot' })
      }
    } catch { /* non-critical */ }
  }

  // 5) Wake the owner on a HOT qualification.
  if (patch.lead_priority === 'HOT' && lead.assigned_to) {
    try {
      const users = await getUsers()
      const owner = users.find(u => u.name === lead.assigned_to && u.active)
      if (owner) {
        await notifyQuiet({
          user_id: owner.id,
          type: 'lead_hot',
          title: `🔥 Bot-qualified HOT: ${lead.full_name || phone}`,
          body: summary || 'Budget fits, wants to start soon',
          ref_phone: phone,
          ref_lead_row: leadRow,
        })
      }
    } catch { /* non-critical */ }
  }

  console.log(`[qualifier] ${phone} → ${summary || 'no summary'}${patch.lead_priority ? ` (priority → ${patch.lead_priority})` : ''}`)
}
