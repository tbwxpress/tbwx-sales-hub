// Per-agent performance introspection + AI coaching read.
//
// Powers the "Coach's read" panel on /agent-stats (self view): the numbers an
// agent needs to see to answer "what is stopping me from closing more?" —
// activity (7d), book-health gaps (right now), and a Gemini-written coaching
// narrative in simple language. The narrative is cached per agent per day so
// quota is one call per agent per day at most.

import { ensureInit, getSetting, setSetting } from './db'

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models'
const MODEL = process.env.COACH_MODEL || 'gemini-2.5-flash'

export interface AgentGapMetrics {
  replies_waiting: number
  overdue_followups: number
  due_today: number
  hot_untouched_3d: number
  open_book: number
  book_by_status: Record<string, number>
}

export interface AgentActivity7d {
  calls: number
  notes: number
  hub_messages: number
  status_moves: number
  rail_events: number
  conversions: number
  qualified: number
  lost: number
  lost_reasons: Record<string, number>
}

export interface CoachMetrics {
  agent: string
  generated_at: string
  activity_7d: AgentActivity7d
  gaps: AgentGapMetrics
}

export interface CoachRead {
  headline: string
  working_well: string[]
  gaps: string[]
  actions: string[]
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

export async function getCoachMetrics(agentName: string): Promise<CoachMetrics> {
  const db = await ensureInit()
  const since = isoDaysAgo(7)
  const today = new Date().toISOString().slice(0, 10)

  const [calls, notes, msgs, moves, rail, conv, qual, lost, lostReasons] = await Promise.all([
    db.execute({ sql: 'SELECT COUNT(*) n FROM call_logs WHERE logged_by = ? AND created_at >= ?', args: [agentName, since] }),
    db.execute({ sql: 'SELECT COUNT(*) n FROM lead_notes WHERE created_by = ? AND created_at >= ?', args: [agentName, since] }),
    db.execute({ sql: "SELECT COUNT(*) n FROM messages WHERE sent_by = ? AND direction='sent' AND timestamp >= ?", args: [agentName, since] }),
    db.execute({ sql: "SELECT COUNT(*) n FROM lead_status_changes WHERE changed_by = ? AND source IN ('manual','work') AND created_at >= ?", args: [agentName, since] }),
    db.execute({ sql: 'SELECT COUNT(*) n FROM work_events WHERE user_name = ? AND created_at >= ?', args: [agentName, since] }),
    db.execute({ sql: "SELECT COUNT(*) n FROM lead_status_changes WHERE changed_by = ? AND new_status='CONVERTED' AND created_at >= ?", args: [agentName, since] }),
    db.execute({ sql: "SELECT COUNT(*) n FROM lead_status_changes WHERE changed_by = ? AND new_status='CALL_DONE_INTERESTED' AND created_at >= ?", args: [agentName, since] }),
    db.execute({ sql: "SELECT COUNT(*) n FROM lead_status_changes WHERE changed_by = ? AND new_status='LOST' AND created_at >= ?", args: [agentName, since] }),
    db.execute({ sql: "SELECT COALESCE(NULLIF(reason,''),'(none)') r, COUNT(*) n FROM lead_status_changes WHERE changed_by = ? AND new_status='LOST' AND created_at >= ? GROUP BY r", args: [agentName, since] }),
  ])

  // Book health — right now, not windowed. Phone joins use the normalized
  // '91'+last10 key (messages/notes/calls) vs leads.phone ('+91…').
  const [book, byStatus, replies, overdue, dueToday, hotStale] = await Promise.all([
    db.execute({ sql: "SELECT COUNT(*) n FROM leads WHERE assigned_to = ? AND lead_status NOT IN ('CONVERTED','LOST','ARCHIVED') AND merged_into IS NULL", args: [agentName] }),
    db.execute({ sql: "SELECT lead_status s, COUNT(*) n FROM leads WHERE assigned_to = ? AND lead_status NOT IN ('CONVERTED','LOST','ARCHIVED') AND merged_into IS NULL GROUP BY s ORDER BY n DESC", args: [agentName] }),
    db.execute({
      sql: `SELECT COUNT(*) n FROM leads l JOIN (
              SELECT phone, MAX(CASE WHEN direction='received' THEN timestamp END) rx, MAX(CASE WHEN direction='sent' THEN timestamp END) tx
              FROM messages GROUP BY phone
            ) m ON m.phone = '91'||substr(REPLACE(l.phone,'+',''),-10)
            WHERE l.assigned_to = ? AND m.rx IS NOT NULL AND (m.tx IS NULL OR m.rx > m.tx)
              AND l.lead_status NOT IN ('CONVERTED','LOST','ARCHIVED') AND l.merged_into IS NULL`,
      args: [agentName],
    }),
    db.execute({ sql: "SELECT COUNT(*) n FROM leads WHERE assigned_to = ? AND next_followup != '' AND next_followup < ? AND lead_status NOT IN ('CONVERTED','LOST','ARCHIVED') AND merged_into IS NULL", args: [agentName, today] }),
    db.execute({ sql: "SELECT COUNT(*) n FROM leads WHERE assigned_to = ? AND next_followup = ? AND lead_status NOT IN ('CONVERTED','LOST','ARCHIVED') AND merged_into IS NULL", args: [agentName, today] }),
    db.execute({
      sql: `SELECT COUNT(*) n FROM leads l WHERE l.assigned_to = ? AND (l.lead_status = 'HOT' OR l.lead_status = 'FINAL_NEGOTIATION')
              AND l.merged_into IS NULL
              AND COALESCE((SELECT MAX(created_at) FROM lead_notes n2 WHERE n2.phone = '91'||substr(REPLACE(l.phone,'+',''),-10)),'') < ?
              AND COALESCE((SELECT MAX(created_at) FROM call_logs c2 WHERE c2.phone = '91'||substr(REPLACE(l.phone,'+',''),-10)),'') < ?`,
      args: [agentName, isoDaysAgo(3), isoDaysAgo(3)],
    }),
  ])

  const n = (r: { rows: Array<Record<string, unknown>> }) => Number(r.rows[0]?.n ?? 0)
  const book_by_status: Record<string, number> = {}
  for (const row of byStatus.rows) book_by_status[String(row.s)] = Number(row.n)
  const lost_reasons: Record<string, number> = {}
  for (const row of lostReasons.rows) lost_reasons[String(row.r)] = Number(row.n)

  return {
    agent: agentName,
    generated_at: new Date().toISOString(),
    activity_7d: {
      calls: n(calls), notes: n(notes), hub_messages: n(msgs), status_moves: n(moves),
      rail_events: n(rail), conversions: n(conv), qualified: n(qual), lost: n(lost), lost_reasons,
    },
    gaps: {
      replies_waiting: n(replies), overdue_followups: n(overdue), due_today: n(dueToday),
      hot_untouched_3d: n(hotStale), open_book: n(book), book_by_status,
    },
  }
}

// Gemini coaching read — strict JSON, cached per agent per day (settings table).
export async function getCoachRead(agentName: string, roleType: string, metrics: CoachMetrics): Promise<CoachRead> {
  const cacheKey = `perf_coach.${agentName.replace(/[^a-zA-Z0-9]/g, '_')}.${new Date().toISOString().slice(0, 10)}`
  try {
    const cached = await getSetting(cacheKey)
    if (cached) return JSON.parse(cached) as CoachRead
  } catch { /* cache miss */ }

  const key = process.env.GOOGLE_AI_API_KEY
  if (!key) throw new Error('Missing GOOGLE_AI_API_KEY')

  const prompt = `You are a direct, supportive sales coach for a Belgian waffle franchise sales team in India.
This ${roleType} sells franchise units (₹4-7L investment). Their last-7-days activity and current lead-book state:
${JSON.stringify(metrics, null, 1)}
Field notes: replies_waiting = leads who messaged and are STILL waiting for this agent's reply (speed-to-reply is the #1 conversion lever). hot_untouched_3d = HOT/final-stage leads with no call or note in 3+ days (deals die here). overdue_followups = promised follow-ups not done. qualified = leads they marked interested. hub_messages = WhatsApp replies sent from the system.
Write a coaching read in simple English (light Hinglish is fine). Be specific — quote their actual numbers. No fluff, no generic advice.
Return STRICT JSON only: {"headline": string (one punchy sentence), "working_well": string[] (max 3), "gaps": string[] (max 3, each tied to a number above), "actions": string[] (max 3 concrete things to do TOMORROW, most impactful first)}`

  const res = await fetch(`${GEMINI_API}/${MODEL}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}`)
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const parsed = JSON.parse(text) as CoachRead
  if (!parsed.headline || !Array.isArray(parsed.actions)) throw new Error('Malformed coach response')

  try { await setSetting(cacheKey, JSON.stringify(parsed)) } catch { /* cache write best-effort */ }
  return parsed
}
