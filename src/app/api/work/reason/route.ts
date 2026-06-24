import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import {
  getMessages,
  getLeadSignal,
  getLastReceivedMessageByPhone,
  getContactCountForLead,
} from '@/lib/db'
import { getLeadByRow } from '@/lib/sheets'
import { computeNBA, objectionRebuttal } from '@/lib/nba'
import {
  labelFor,
  OBJECTION_CHIPS,
  CAPITAL_CHIPS,
  PERSONA_CHIPS,
  DECISION_MAKER_CHIPS,
} from '@/config/sales-signals'
import type { Lead } from '@/lib/types'
import type { LeadSignal } from '@/lib/db'

// POST /api/work/reason  — Body: { leadRow }
// The per-lead AI brief: a 1-line thread summary, 3 lead-specific Hinglish
// talking points, an objection rebuttal, and an opener. Uses free Gemini Flash
// (GEMINI_API_KEY) when configured; otherwise a GENUINELY useful deterministic
// fallback (NBA + objection rebuttal + qualification-driven points), so the
// feature ships working and upgrades to live Gemini once the key is added.
//
// The DECISION (what to do) stays in computeNBA (rules); this endpoint only
// produces the WORDS. Ownership-gated like the leads PATCH route.

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
const last10 = (p: string | undefined | null) => String(p || '').replace(/\D/g, '').slice(-10)

interface Brief {
  summary: string
  talking_points: string[]
  rebuttal: string | null
  opener: string
  model: string
}

function firstName(lead: Lead): string {
  return String(lead.full_name || '').trim().split(/\s+/)[0] || ''
}
// "Ramesh ji" when we know the name, else a neutral salute (avoids "ji ji").
function salute(fn: string): string {
  return fn ? `${fn} ji` : 'Sir/Ma’am'
}

// Deterministic, on-brand brief — used when the LLM is unavailable, and as the
// base the LLM output is merged onto (so a partial LLM response never blanks a
// field).
function fallbackBrief(
  lead: Lead,
  signals: LeadSignal | null,
  nba: { label: string; reason: string },
  modelTag = 'fallback',
): Brief {
  const fn = firstName(lead)
  const greet = salute(fn)
  const objectionLabel = labelFor(OBJECTION_CHIPS, signals?.objection)
  const capitalLabel = labelFor(CAPITAL_CHIPS, signals?.capital_readiness)
  const personaLabel = labelFor(PERSONA_CHIPS, signals?.buyer_persona)
  const deciderLabel = labelFor(DECISION_MAKER_CHIPS, signals?.decision_maker)

  const summaryBits = [
    lead.lead_status || 'NEW',
    personaLabel && `Buyer: ${personaLabel}`,
    capitalLabel && `Paisa: ${capitalLabel}`,
    objectionLabel && `Rok: ${objectionLabel}`,
    deciderLabel && deciderLabel !== 'Khud' && `Decider: ${deciderLabel}`,
  ].filter(Boolean)

  const points: string[] = []
  points.push(`Warm open: "${greet}, TBWX franchise ke baare mein aapki enquiry pe call kiya."`)
  if (lead.model_interest) {
    points.push(`Unke interest pe anchor karo — ${lead.model_interest} model; budget + city confirm karo.`)
  } else {
    points.push(`3 cheezein pakka karo: budget range, pasandida city, aur kab tak start karna hai.`)
  }
  // The NBA-driven next step is the third point.
  points.push(`Agla step: ${nba.reason}`)

  return {
    summary: summaryBits.join(' · '),
    talking_points: points.slice(0, 3),
    rebuttal: objectionRebuttal(signals?.objection),
    opener: `${greet}, TBWX se baat kar raha hoon — aapki franchise enquiry pe.`,
    model: modelTag,
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const body = await req.json().catch(() => ({}))
    const leadRow = Number(body?.leadRow)
    if (!Number.isFinite(leadRow)) {
      return NextResponse.json({ success: false, error: 'leadRow required' }, { status: 400 })
    }

    const lead = await getLeadByRow(leadRow)
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 })
    }
    // Ownership gate — same rule as the leads PATCH route.
    if (user.role === 'agent') {
      const isMine = lead.assigned_to === user.name
      const isUnassigned = !lead.assigned_to
      if (!isMine && !(user.can_assign && isUnassigned)) {
        return NextResponse.json({ success: false, error: 'Not authorized for this lead' }, { status: 403 })
      }
    }

    const [signals, msgs, lastRecvMap, attemptCount] = await Promise.all([
      getLeadSignal(leadRow),
      getMessages(lead.phone, 50, 0),
      getLastReceivedMessageByPhone(),
      getContactCountForLead(leadRow),
    ])

    const lr = lastRecvMap.get(last10(lead.phone))?.last_received_at
    let lrMs = NaN
    if (lr) {
      let s = String(lr).trim().replace(' ', 'T')
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(s)) s += 'Z'
      lrMs = new Date(s).getTime()
    }
    // Prefer the card's own window.open (sent as a hint) so the brief's NBA matches
    // the card the rep is looking at; else recompute from last-received.
    const windowOpen = typeof body?.windowOpen === 'boolean'
      ? body.windowOpen
      : !Number.isNaN(lrMs) && Date.now() - lrMs < 24 * 60 * 60 * 1000
    const nba = computeNBA(lead, signals, { windowOpen, deckSent: lead.lead_status === 'DECK_SENT', attemptCount })

    const base = fallbackBrief(lead, signals, nba)

    // No Gemini key → ship the deterministic brief (still genuinely useful).
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ success: true, data: base })
    }

    // msgs is oldest-first (ASC); take the most recent 10 and keep oldest-first to
    // match the prompt label. Collapse whitespace so a lead can't spoof AGENT:/LEAD:
    // turns by embedding newlines.
    const thread = (msgs || [])
      .slice(-10)
      .map((m: { direction?: string; text?: string }) => `${m.direction === 'sent' ? 'AGENT' : 'LEAD'}: ${String(m.text || '').replace(/\s+/g, ' ').slice(0, 280)}`)
      .join('\n')

    const systemPrompt = `You are an expert franchise-sales coach for The Belgian Waffle Xpress (TBWX), a 40+-outlet Indian QSR franchise brand. You brief an INEXPERIENCED telecaller/closer before they contact a lead.
Reply with STRICT JSON only: { "summary": string, "talking_points": string[3], "rebuttal": string, "opener": string }.
Rules:
- Language: HINGLISH (Hindi + English mix in Roman script) — natural, like how an Indian sales rep talks.
- "summary": ONE short line — where this lead is + the main blocker.
- "talking_points": exactly 3 short, specific lines the rep can actually SAY (not generic advice).
- "rebuttal": address the lead's main objection in 1–2 lines; "" if there is no clear objection.
- "opener": the first line to open the call/message.
- Honest facts ONLY when relevant: Investment ₹4–7 Lakhs · Royalty 5% · ROI 8–12 months · 40+ outlets. NEVER invent numbers, names, cities, or outlet locations not given.
- Be concrete to THIS lead's signals + thread. No emojis. No markdown. JSON only.`

    const userPrompt = `LEAD: ${lead.full_name || 'unknown'} · City: ${lead.city || 'unknown'} · Status: ${lead.lead_status} · Model: ${lead.model_interest || '—'} · Timeline: ${lead.timeline || '—'}
CAPTURED SIGNALS: sentiment=${signals?.sentiment || '—'}, capital=${signals?.capital_readiness || '—'}, objection=${signals?.objection || '—'}, decision_maker=${signals?.decision_maker || '—'}, persona=${signals?.buyer_persona || '—'}
RECOMMENDED NEXT MOVE (from rules): ${nba.label} — ${nba.reason}
RECENT WHATSAPP THREAD (oldest first):
${thread || '(no prior messages)'}

Write the brief as JSON.`

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 7000)
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ac.signal,
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 800, responseMimeType: 'application/json' },
          }),
        },
      )
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        console.error('[work/reason] Gemini error:', res.status, t.slice(0, 200))
        return NextResponse.json({ success: true, data: { ...base, model: 'fallback (gemini error)' } })
      }
      const data = await res.json()
      const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
      // Tolerant parse: pull the first balanced {...} so a truncated/garnished
      // response doesn't nuke an otherwise-good brief.
      const jstart = text.indexOf('{')
      const jend = text.lastIndexOf('}')
      const parsed = JSON.parse(jstart >= 0 && jend > jstart ? text.slice(jstart, jend + 1) : text) as Partial<Brief> & { talking_points?: unknown }
      const points = Array.isArray(parsed.talking_points)
        ? parsed.talking_points.map((p) => String(p)).filter(Boolean).slice(0, 3)
        : base.talking_points
      return NextResponse.json({
        success: true,
        data: {
          summary: (typeof parsed.summary === 'string' && parsed.summary.trim()) || base.summary,
          talking_points: points.length ? points : base.talking_points,
          rebuttal: typeof parsed.rebuttal === 'string' && parsed.rebuttal.trim() ? parsed.rebuttal.trim() : base.rebuttal,
          opener: (typeof parsed.opener === 'string' && parsed.opener.trim()) || base.opener,
          model: GEMINI_MODEL,
        },
      })
    } catch (e) {
      console.error('[work/reason] Gemini parse/fetch failed:', e)
      return NextResponse.json({ success: true, data: { ...base, model: 'fallback (gemini timeout/parse)' } })
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to build brief') }, { status: 500 })
  }
}
