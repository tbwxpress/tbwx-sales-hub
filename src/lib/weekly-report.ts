/**
 * Saturday weekly report — the owner's full picture of the Sales Hub week.
 *
 * Read-only by construction: it queries and renders, never writes lead data
 * and never messages a customer. The route owns delivery + the watermark.
 *
 * Timestamp note: `messages.timestamp` is ISO ('2026-07-28T11:57:48.591Z')
 * while the audit tables use SQLite datetime ('2026-07-28 11:57:48'), so
 * every window is passed in BOTH shapes.
 */

import { ensureInit } from './db'

export interface ReportWindow {
  sinceIso: string
  untilIso: string
  sinceSql: string
  untilSql: string
  label: string
  days: number
}

// Message senders that are NOT a human agent typing.
const AUTO_SENDERS = ['auto-send', 'System (Auto)', 'bot', 'auto: missed-call', 'System (Webhook)', '']
const AUTO_LIST = AUTO_SENDERS.map(s => `'${s.replace(/'/g, "''")}'`).join(',')

function n(v: unknown): number {
  return Number(v ?? 0)
}
function s(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

export function buildWindow(sinceUtc: Date, untilUtc: Date): ReportWindow {
  const iso = (d: Date) => d.toISOString()
  const sql = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')
  const istLabel = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
  const days = Math.max(1, Math.round((untilUtc.getTime() - sinceUtc.getTime()) / 86400000))
  return {
    sinceIso: iso(sinceUtc),
    untilIso: iso(untilUtc),
    sinceSql: sql(sinceUtc),
    untilSql: sql(untilUtc),
    label: `${istLabel(sinceUtc)} → ${istLabel(untilUtc)}`,
    days,
  }
}

export interface AgentRow {
  name: string
  msgs_sent: number
  leads_messaged: number
  calls: number
  qualified: number
  converted: number
  lost: number
  notes: number
  first_activity: string
  last_activity: string
}

export interface EngagementRow {
  owner: string
  messaged_in: number
  answered: number
  called_instead: number
  ignored: number
}

export interface WeeklyReportData {
  window: ReportWindow
  prior: ReportWindow
  headline: {
    converted: number
    prior_converted: number
    qualified: number
    prior_qualified: number
    new_leads: number
    prior_new_leads: number
    lost: number
    inbound_conversations: number
  }
  sources: { name: string; count: number }[]
  agents: AgentRow[]
  engagement: EngagementRow[]
  prior_engagement: EngagementRow[]
  telecaller: { sent_to_queue: number; handed_back: number; queue_size: number }
  formAnswers: { question: string; answer: string; count: number }[]
  automation: {
    opt_ins: number
    decks: number
    intros: number
    capi_sent: number
    capi_failed: number
    wa_click_leads: number
    dedupe_folds: number
  }
  system: {
    failed_sends: number
    prior_failed_sends: number
    failures_by_code: { code: string; count: number }[]
    lead_edits: number
    notes: number
    nudges: number
  }
  insights: string[]
  pending: string[]
}

async function engagementFor(win: ReportWindow): Promise<EngagementRow[]> {
  const db = await ensureInit()
  const res = await db.execute({
    sql: `
      WITH inb AS (
        SELECT substr(replace(replace(phone,'+',''),' ',''),-10) p10, MAX(timestamp) last_in
        FROM messages WHERE direction='received' AND timestamp >= ? AND timestamp < ?
        GROUP BY p10
      ),
      hum AS (
        SELECT substr(replace(replace(phone,'+',''),' ',''),-10) p10, MAX(timestamp) last_h
        FROM messages WHERE direction='sent' AND timestamp >= ? AND timestamp < ?
          AND sent_by NOT IN (${AUTO_LIST})
        GROUP BY p10
      ),
      cl AS (
        SELECT substr(replace(replace(phone,'+',''),' ',''),-10) p10, COUNT(*) n
        FROM call_logs WHERE created_at >= ? AND created_at < ? GROUP BY p10
      ),
      ld AS (
        SELECT assigned_to, lead_status,
               substr(replace(replace(replace(replace(phone,'+',''),' ',''),'-',''),'p:',''),-10) p10
        FROM leads WHERE merged_into IS NULL AND COALESCE(assigned_to,'') != ''
      )
      SELECT l.assigned_to AS owner,
        COUNT(*) AS messaged_in,
        SUM(CASE WHEN h.last_h IS NOT NULL AND h.last_h > i.last_in THEN 1 ELSE 0 END) AS answered,
        SUM(CASE WHEN (h.last_h IS NULL OR h.last_h <= i.last_in) AND c.n IS NOT NULL THEN 1 ELSE 0 END) AS called_instead,
        SUM(CASE WHEN (h.last_h IS NULL OR h.last_h <= i.last_in) AND c.n IS NULL
                  AND l.lead_status NOT IN ('LOST','ARCHIVED','CONVERTED') THEN 1 ELSE 0 END) AS ignored
      FROM ld l JOIN inb i ON i.p10 = l.p10
      LEFT JOIN hum h ON h.p10 = l.p10
      LEFT JOIN cl c ON c.p10 = l.p10
      GROUP BY l.assigned_to ORDER BY messaged_in DESC`,
    args: [win.sinceIso, win.untilIso, win.sinceIso, win.untilIso, win.sinceSql, win.untilSql],
  })
  return res.rows.map(r => ({
    owner: s(r.owner),
    messaged_in: n(r.messaged_in),
    answered: n(r.answered),
    called_instead: n(r.called_instead),
    ignored: n(r.ignored),
  }))
}

export async function gatherWeeklyReport(win: ReportWindow, prior: ReportWindow): Promise<WeeklyReportData> {
  const db = await ensureInit()

  const statusCount = async (w: ReportWindow, status: string) => {
    const r = await db.execute({
      sql: `SELECT COUNT(DISTINCT lead_row) c FROM lead_status_changes
            WHERE new_status = ? AND created_at >= ? AND created_at < ?`,
      args: [status, w.sinceSql, w.untilSql],
    })
    return n(r.rows[0]?.c)
  }

  const newLeadsCount = async (w: ReportWindow) => {
    const r = await db.execute({
      sql: `SELECT COUNT(*) c FROM leads WHERE merged_into IS NULL AND created_time >= ? AND created_time < ?`,
      args: [w.sinceIso.slice(0, 10), w.untilIso.slice(0, 10) + 'z'],
    })
    return n(r.rows[0]?.c)
  }

  const [converted, priorConverted, qualified, priorQualified, lost, newLeads, priorNewLeads] = await Promise.all([
    statusCount(win, 'CONVERTED'), statusCount(prior, 'CONVERTED'),
    statusCount(win, 'CALL_DONE_INTERESTED'), statusCount(prior, 'CALL_DONE_INTERESTED'),
    statusCount(win, 'LOST'),
    newLeadsCount(win), newLeadsCount(prior),
  ])

  const inboundRes = await db.execute({
    sql: `SELECT COUNT(DISTINCT substr(replace(replace(phone,'+',''),' ',''),-10)) c
          FROM messages WHERE direction='received' AND timestamp >= ? AND timestamp < ?`,
    args: [win.sinceIso, win.untilIso],
  })

  const sourcesRes = await db.execute({
    sql: `SELECT COALESCE(NULLIF(campaign_name,''),'(unknown)') nm, COUNT(*) c FROM leads
          WHERE merged_into IS NULL AND created_time >= ? AND created_time < ?
          GROUP BY nm ORDER BY c DESC LIMIT 8`,
    args: [win.sinceIso.slice(0, 10), win.untilIso.slice(0, 10) + 'z'],
  })

  // Per-agent activity (messages, calls, status work, notes, day shape)
  const agentsRes = await db.execute({
    sql: `
      WITH ppl AS (SELECT name FROM users WHERE active = 1),
      msg AS (
        SELECT sent_by nm, COUNT(*) c, COUNT(DISTINCT substr(replace(replace(phone,'+',''),' ',''),-10)) d,
               MIN(timestamp) f, MAX(timestamp) l
        FROM messages WHERE direction='sent' AND timestamp >= ? AND timestamp < ?
          AND sent_by NOT IN (${AUTO_LIST}) GROUP BY sent_by
      ),
      cal AS (SELECT logged_by nm, COUNT(*) c FROM call_logs WHERE created_at >= ? AND created_at < ? GROUP BY logged_by),
      nts AS (SELECT created_by nm, COUNT(*) c FROM lead_notes WHERE created_at >= ? AND created_at < ? GROUP BY created_by),
      sc AS (
        SELECT changed_by nm,
          SUM(CASE WHEN new_status='CALL_DONE_INTERESTED' THEN 1 ELSE 0 END) q,
          SUM(CASE WHEN new_status='CONVERTED' THEN 1 ELSE 0 END) cv,
          SUM(CASE WHEN new_status='LOST' THEN 1 ELSE 0 END) ls
        FROM lead_status_changes WHERE created_at >= ? AND created_at < ? GROUP BY changed_by
      )
      SELECT ppl.name,
        COALESCE(msg.c,0) msgs, COALESCE(msg.d,0) leads_msgd, COALESCE(msg.f,'') firstt, COALESCE(msg.l,'') lastt,
        COALESCE(cal.c,0) calls, COALESCE(nts.c,0) notes,
        COALESCE(sc.q,0) qual, COALESCE(sc.cv,0) conv, COALESCE(sc.ls,0) lost
      FROM ppl
      LEFT JOIN msg ON msg.nm = ppl.name
      LEFT JOIN cal ON cal.nm = ppl.name
      LEFT JOIN nts ON nts.nm = ppl.name
      LEFT JOIN sc ON sc.nm = ppl.name
      ORDER BY conv DESC, qual DESC, msgs DESC`,
    args: [
      win.sinceIso, win.untilIso,
      win.sinceSql, win.untilSql,
      win.sinceSql, win.untilSql,
      win.sinceSql, win.untilSql,
    ],
  })

  // Telecaller loop
  const [tcSentRes, tcBackRes, tcQueueRes] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(*) c FROM lead_telecaller_assignments WHERE assigned_at >= ? AND assigned_at < ?`,
      args: [win.sinceSql, win.untilSql],
    }),
    db.execute({
      sql: `SELECT COUNT(*) c FROM assignment_log a JOIN users u ON u.name = a.assigned_by
            WHERE (u.is_telecaller = 1 OR u.agent_role='telecaller') AND a.created_at >= ? AND a.created_at < ?`,
      args: [win.sinceSql, win.untilSql],
    }),
    db.execute('SELECT COUNT(*) c FROM lead_telecaller_assignments'),
  ])

  // Form v2 answer distribution (leads created in-window that carry answers)
  const formRes = await db.execute({
    sql: `SELECT form_answers FROM leads
          WHERE merged_into IS NULL AND COALESCE(form_answers,'') != ''
            AND created_time >= ? AND created_time < ?`,
    args: [win.sinceIso.slice(0, 10), win.untilIso.slice(0, 10) + 'z'],
  })
  const answerTally = new Map<string, number>()
  for (const row of formRes.rows) {
    try {
      const obj = JSON.parse(s(row.form_answers)) as Record<string, string>
      for (const [q, a] of Object.entries(obj)) {
        if (!a) continue
        const key = `${q}||${a}`
        answerTally.set(key, (answerTally.get(key) || 0) + 1)
      }
    } catch { /* skip malformed */ }
  }
  const formAnswers = [...answerTally.entries()]
    .map(([k, count]) => {
      const [question, answer] = k.split('||')
      return { question, answer, count }
    })
    .sort((a, b) => a.question.localeCompare(b.question) || b.count - a.count)

  // Automation health
  const tmplCount = async (like: string) => {
    const r = await db.execute({
      sql: `SELECT COUNT(*) c FROM messages WHERE direction='sent' AND status != 'failed'
            AND template_used LIKE ? AND timestamp >= ? AND timestamp < ?`,
      args: [like, win.sinceIso, win.untilIso],
    })
    return n(r.rows[0]?.c)
  }
  const [optIns, decks, intros] = await Promise.all([
    tmplCount('opt_in%'), tmplCount('franchise_inquiry%'), tmplCount('agent_intro'),
  ])
  const capiRes = await db.execute({
    sql: `SELECT status, COUNT(*) c FROM meta_capi_events WHERE created_at >= ? AND created_at < ? GROUP BY status`,
    args: [win.sinceSql, win.untilSql],
  })
  const waClickRes = await db.execute({
    sql: `SELECT COUNT(*) c FROM leads WHERE id LIKE 'wac:%' AND created_time >= ? AND created_time < ?`,
    args: [win.sinceIso.slice(0, 10), win.untilIso.slice(0, 10) + 'z'],
  })
  const dedupeRes = await db.execute({
    sql: `SELECT COUNT(*) c FROM assignment_log WHERE assigned_by LIKE '%dedupe%' AND created_at >= ? AND created_at < ?`,
    args: [win.sinceSql, win.untilSql],
  })

  // System health
  const failsFor = async (w: ReportWindow) => {
    const r = await db.execute({
      sql: `SELECT COUNT(*) c FROM messages WHERE direction='sent' AND status='failed'
            AND timestamp >= ? AND timestamp < ?`,
      args: [w.sinceIso, w.untilIso],
    })
    return n(r.rows[0]?.c)
  }
  const [failed, priorFailed] = await Promise.all([failsFor(win), failsFor(prior)])
  const failCodesRes = await db.execute({
    sql: `SELECT COALESCE(NULLIF(error_code,''),'(none)') code, COUNT(*) c FROM messages
          WHERE direction='sent' AND status='failed' AND timestamp >= ? AND timestamp < ?
          GROUP BY code ORDER BY c DESC LIMIT 5`,
    args: [win.sinceIso, win.untilIso],
  })
  const usageRes = await db.execute({
    sql: `SELECT
            (SELECT COUNT(*) FROM lead_edits WHERE created_at >= ?1 AND created_at < ?2) e,
            (SELECT COUNT(*) FROM lead_notes WHERE created_at >= ?1 AND created_at < ?2) nt,
            (SELECT COUNT(*) FROM followup_nudges WHERE created_at >= ?1 AND created_at < ?2) nd`,
    args: [win.sinceSql, win.untilSql],
  })

  const engagement = await engagementFor(win)
  const prior_engagement = await engagementFor(prior)

  const capiSent = capiRes.rows.filter(r => s(r.status) === 'sent').reduce((a, r) => a + n(r.c), 0)
  const capiFailed = capiRes.rows.filter(r => s(r.status) === 'failed').reduce((a, r) => a + n(r.c), 0)

  const data: WeeklyReportData = {
    window: win,
    prior,
    headline: {
      converted, prior_converted: priorConverted,
      qualified, prior_qualified: priorQualified,
      new_leads: newLeads, prior_new_leads: priorNewLeads,
      lost,
      inbound_conversations: n(inboundRes.rows[0]?.c),
    },
    sources: sourcesRes.rows.map(r => ({ name: s(r.nm), count: n(r.c) })),
    agents: agentsRes.rows.map(r => ({
      name: s(r.name),
      msgs_sent: n(r.msgs), leads_messaged: n(r.leads_msgd),
      calls: n(r.calls), qualified: n(r.qual), converted: n(r.conv),
      lost: n(r.lost), notes: n(r.notes),
      first_activity: s(r.firstt), last_activity: s(r.lastt),
    })),
    engagement,
    prior_engagement,
    telecaller: {
      sent_to_queue: n(tcSentRes.rows[0]?.c),
      handed_back: n(tcBackRes.rows[0]?.c),
      queue_size: n(tcQueueRes.rows[0]?.c),
    },
    formAnswers,
    automation: {
      opt_ins: optIns, decks, intros,
      capi_sent: capiSent, capi_failed: capiFailed,
      wa_click_leads: n(waClickRes.rows[0]?.c),
      dedupe_folds: n(dedupeRes.rows[0]?.c),
    },
    system: {
      failed_sends: failed, prior_failed_sends: priorFailed,
      failures_by_code: failCodesRes.rows.map(r => ({ code: s(r.code), count: n(r.c) })),
      lead_edits: n(usageRes.rows[0]?.e),
      notes: n(usageRes.rows[0]?.nt),
      nudges: n(usageRes.rows[0]?.nd),
    },
    insights: [],
    pending: [],
  }

  data.insights = buildInsights(data)
  data.pending = await buildPending(data)
  return data
}

/** Rule-based observations — no filler; each line must be actionable or notable. */
export function buildInsights(d: WeeklyReportData): string[] {
  const out: string[] = []
  const ignored = d.engagement.reduce((a, e) => a + e.ignored, 0)
  const priorIgnored = d.prior_engagement.reduce((a, e) => a + e.ignored, 0)
  const answered = d.engagement.reduce((a, e) => a + e.answered, 0)
  const totalIn = d.engagement.reduce((a, e) => a + e.messaged_in, 0)

  if (totalIn > 0) {
    const pct = Math.round((ignored / totalIn) * 100)
    const delta = priorIgnored === 0 ? null : Math.round(((ignored - priorIgnored) / priorIgnored) * 100)
    out.push(
      `${ignored} of ${totalIn} leads who messaged in (${pct}%) got no reply and no call — still active, still recoverable` +
      (delta === null ? '.' : ` (${delta >= 0 ? '+' : ''}${delta}% vs last week).`)
    )
  }
  if (answered > 0 && ignored > answered) {
    out.push(`Ignored conversations outnumber answered ones ${ignored}:${answered} — reply-first ordering is the cheapest available lift.`)
  }
  if (d.headline.converted > d.headline.prior_converted) {
    out.push(`Conversions up: ${d.headline.converted} this week vs ${d.headline.prior_converted} last week.`)
  } else if (d.headline.converted < d.headline.prior_converted) {
    out.push(`Conversions down: ${d.headline.converted} vs ${d.headline.prior_converted} last week — check qualified-lead follow-through.`)
  }
  if (d.system.failed_sends > d.system.prior_failed_sends * 1.5 && d.system.failed_sends > 10) {
    out.push(`WhatsApp send failures rose to ${d.system.failed_sends} (from ${d.system.prior_failed_sends}) — check template health and per-user marketing caps.`)
  } else if (d.system.failed_sends < d.system.prior_failed_sends) {
    out.push(`Send failures down to ${d.system.failed_sends} (from ${d.system.prior_failed_sends}).`)
  }
  const topSource = d.sources[0]
  if (topSource) {
    out.push(`Top lead source: ${topSource.name} (${topSource.count} leads).`)
  }
  if (d.telecaller.sent_to_queue === 0 && d.telecaller.queue_size > 100) {
    out.push(`No new leads routed to the telecaller this week, though ${d.telecaller.queue_size} sit in the standing queue — auto-queue would keep this leg moving.`)
  }
  if (d.automation.intros > 0) {
    out.push(`${d.automation.intros} agent-intro messages went out — leads now get their advisor's direct number automatically.`)
  }
  if (d.automation.dedupe_folds > 0) {
    out.push(`${d.automation.dedupe_folds} duplicate leads folded automatically (nightly sweep).`)
  }
  for (const e of d.engagement) {
    const p = d.prior_engagement.find(x => x.owner === e.owner)
    if (p && p.ignored >= 10 && e.ignored <= p.ignored * 0.6) {
      out.push(`${e.owner} cut ignored conversations from ${p.ignored} to ${e.ignored} — biggest individual improvement.`)
    }
  }
  return out
}

/** Standing decisions still parked, computed from live config. */
async function buildPending(d: WeeklyReportData): Promise<string[]> {
  const db = await ensureInit()
  const out: string[] = []
  const setting = async (k: string) => {
    const r = await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [k] })
    return r.rows[0] ? s(r.rows[0].value) : null
  }
  const [autoQueue, dripOn] = await Promise.all([
    setting('telecaller.auto_queue_enabled'),
    setting('drip.enabled'),
  ])
  if (autoQueue !== 'true') out.push('Telecaller auto-queue is OFF — No-Response/Delayed leads are not routed automatically.')
  if (dripOn !== 'true') out.push('Drip sequences are OFF — no automated nurture between human touches.')
  const noPhone = await db.execute(
    "SELECT name FROM users WHERE active = 1 AND role='agent' AND COALESCE(phone,'') = ''"
  )
  if (noPhone.rows.length) {
    out.push(`No calling number saved for: ${noPhone.rows.map(r => s(r.name)).join(', ')} — their leads get no agent-intro.`)
  }
  if (d.engagement.some(e => e.ignored > 20)) {
    out.push('Consider defaulting the inbox to the "awaiting reply" view so ignored conversations lead the day.')
  }
  return out
}

// ─── HTML rendering ──────────────────────────────────────────────────

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function delta(cur: number, prev: number): string {
  if (prev === cur) return `<span style="color:#888">±0</span>`
  const up = cur > prev
  const arrow = up ? '▲' : '▼'
  const color = up ? '#0a7d33' : '#b3261e'
  return `<span style="color:${color}">${arrow} ${Math.abs(cur - prev)}</span>`
}

function table(headers: string[], rows: string[][]): string {
  const th = headers
    .map(h => `<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #ddd;font-size:12px;color:#555;text-transform:uppercase;letter-spacing:.03em">${esc(h)}</th>`)
    .join('')
  const tr = rows
    .map(r => `<tr>${r.map(c => `<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:14px">${c}</td>`).join('')}</tr>`)
    .join('')
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0 18px"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`
}

function section(title: string, body: string): string {
  return `<h2 style="font-size:15px;margin:26px 0 4px;padding-bottom:4px;border-bottom:2px solid #111;letter-spacing:.02em">${esc(title)}</h2>${body}`
}

function istTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

export function renderWeeklyReportHtml(d: WeeklyReportData, opts: { preview?: boolean } = {}): string {
  const h = d.headline
  const totalIn = d.engagement.reduce((a, e) => a + e.messaged_in, 0)
  const totalIgnored = d.engagement.reduce((a, e) => a + e.ignored, 0)
  const totalAnswered = d.engagement.reduce((a, e) => a + e.answered, 0)

  const scorecard = table(
    ['Metric', 'This week', 'vs last week'],
    [
      ['<strong>Conversions</strong>', `<strong>${h.converted}</strong>`, delta(h.converted, h.prior_converted)],
      ['Qualified (Call Done – Interested)', String(h.qualified), delta(h.qualified, h.prior_qualified)],
      ['New leads', String(h.new_leads), delta(h.new_leads, h.prior_new_leads)],
      ['Leads who messaged in', String(h.inbound_conversations), '—'],
      ['Marked Lost (with reason)', String(h.lost), '—'],
    ],
  )

  const sources = d.sources.length
    ? table(['Source', 'New leads'], d.sources.map(s2 => [esc(s2.name), String(s2.count)]))
    : '<p style="font-size:14px;color:#666">No new leads recorded in this window.</p>'

  const engRows = d.engagement.map(e => {
    const p = d.prior_engagement.find(x => x.owner === e.owner)
    const pct = e.messaged_in ? Math.round((e.ignored / e.messaged_in) * 100) : 0
    return [
      esc(e.owner),
      String(e.messaged_in),
      String(e.answered),
      String(e.called_instead),
      `<strong style="color:${pct > 50 ? '#b3261e' : '#333'}">${e.ignored}</strong> (${pct}%)`,
      p ? delta(e.ignored, p.ignored) : '—',
    ]
  })
  const engagement = `
    <p style="font-size:14px;margin:6px 0 10px;color:#333">
      <strong>${totalIn}</strong> leads wrote to us. <strong>${totalAnswered}</strong> got a WhatsApp reply,
      <strong style="color:#b3261e">${totalIgnored}</strong> got neither a reply nor a call and are still active.
    </p>
    ${table(['Owner', 'Messaged in', 'Answered', 'Called instead', 'Ignored', 'vs last wk'], engRows)}`

  const agentRows = d.agents
    .filter(a => a.msgs_sent || a.calls || a.qualified || a.converted || a.lost || a.notes)
    .map(a => [
      `<strong>${esc(a.name)}</strong>`,
      String(a.converted), String(a.qualified), String(a.lost),
      String(a.msgs_sent), String(a.leads_messaged), String(a.calls), String(a.notes),
      `${istTime(a.first_activity)}–${istTime(a.last_activity)}`,
    ])
  const agents = agentRows.length
    ? table(['Agent', 'Conv', 'Qual', 'Lost', 'Msgs', 'Leads msgd', 'Calls', 'Notes', 'Active (IST)'], agentRows)
    : '<p style="font-size:14px;color:#666">No agent activity recorded.</p>'

  const telecaller = table(
    ['Telecaller loop', 'Count'],
    [
      ['Leads routed to telecaller this week', String(d.telecaller.sent_to_queue)],
      ['Leads handed back to closers', String(d.telecaller.handed_back)],
      ['Standing queue size', String(d.telecaller.queue_size)],
    ],
  )

  const form = d.formAnswers.length
    ? table(['Question', 'Answer', 'Leads'], d.formAnswers.map(f => [esc(f.question), esc(f.answer), String(f.count)]))
    : '<p style="font-size:14px;color:#666">No form-answer data captured this window (leads may predate the new form).</p>'

  const automation = table(
    ['Automation', 'Count'],
    [
      ['Opt-in messages sent', String(d.automation.opt_ins)],
      ['Franchise decks delivered', String(d.automation.decks)],
      ['Agent-intro messages', String(d.automation.intros)],
      ['Quality signals sent to Meta', String(d.automation.capi_sent) + (d.automation.capi_failed ? ` (${d.automation.capi_failed} failed, auto-retried)` : '')],
      ['Leads auto-created from website WhatsApp clicks', String(d.automation.wa_click_leads)],
      ['Duplicate leads folded by nightly sweep', String(d.automation.dedupe_folds)],
    ],
  )

  const system = table(
    ['System', 'Value'],
    [
      ['WhatsApp send failures', `${d.system.failed_sends} ${delta(d.system.failed_sends, d.system.prior_failed_sends)}`],
      ['Top failure reasons', d.system.failures_by_code.length
        ? esc(d.system.failures_by_code.map(f => `${f.code}×${f.count}`).join(', '))
        : 'none'],
      ['Lead edits in the Hub', String(d.system.lead_edits)],
      ['Notes written', String(d.system.notes)],
      ['Follow-up nudges answered', String(d.system.nudges)],
    ],
  )

  const insights = d.insights.length
    ? `<ul style="font-size:14px;line-height:1.7;padding-left:20px;margin:8px 0 18px">${d.insights.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
    : '<p style="font-size:14px;color:#666">Nothing unusual this week.</p>'

  const pending = d.pending.length
    ? `<ul style="font-size:14px;line-height:1.7;padding-left:20px;margin:8px 0 18px">${d.pending.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
    : '<p style="font-size:14px;color:#666">Nothing waiting on you.</p>'

  const banner = opts.preview
    ? `<div style="background:#fff4e5;border:1px solid #ffb547;padding:10px 12px;border-radius:6px;margin-bottom:16px;font-size:13px">
         <strong>PREVIEW</strong> — sample run for review. The live report sends every Saturday 7:00 PM IST.
       </div>`
    : ''

  return `<!-- TBWX weekly report -->
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;padding:18px;color:#111">
  ${banner}
  <h1 style="font-size:20px;margin:0 0 2px">TBWX Sales Hub — Weekly Report</h1>
  <p style="font-size:13px;color:#666;margin:0 0 6px">${esc(d.window.label)} · ${d.window.days} day${d.window.days === 1 ? '' : 's'}</p>

  ${section('1. Scorecard', scorecard)}
  ${section('2. Lead engagement — who wrote in, who got answered', engagement)}
  ${section('3. Agent performance', agents)}
  ${section('4. Telecaller loop', telecaller)}
  ${section('5. Where leads came from', sources)}
  ${section('6. What leads told us on the form', form)}
  ${section('7. Automation health', automation)}
  ${section('8. System health & Hub usage', system)}
  ${section('9. Insights', insights)}
  ${section('10. Waiting on you', pending)}

  <p style="font-size:12px;color:#888;margin-top:26px;border-top:1px solid #eee;padding-top:10px">
    Generated automatically by TBWX Sales Hub · <a href="https://sales.tbwxpress.com/analytics" style="color:#555">Open analytics</a>
  </p>
</div>`
}
