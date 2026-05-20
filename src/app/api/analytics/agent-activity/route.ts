import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import { getUsers } from '@/lib/users'
import { getLeads } from '@/lib/sheets'
import { getAllAssignments, getAutoQueueConfig } from '@/lib/telecaller'
import { createClient } from '@libsql/client'
import { normalizePhone } from '@/lib/db'

// GET /api/analytics/agent-activity?date=YYYY-MM-DD&tz_offset_min=330
// Returns micro-level daily activity scoped to active actions (manual messages,
// calls logged, notes added, status changes, reassignments).
//
// Admin → full leaderboard (every active user, all warnings, telecaller ghosts).
// Non-admin → self view: only the caller's own row, plus team averages and an
//   anonymous rank (e.g. "#3 of 7"). Peers are NEVER named in the response so
//   non-admins can self-evaluate without exposing other agents' raw numbers.

interface AgentActivity {
  user_id: string
  name: string
  email: string
  role: string
  type: 'closer' | 'telecaller' | 'admin' | 'none'
  active: boolean
  leads_touched: number
  actions: {
    manual_messages: number
    calls_logged: number
    notes_added: number
    status_changes: number
    reassignments_performed: number
  }
  status_progressions: Record<string, number>
  touched_leads: Array<{
    lead_row: number | null
    phone: string
    name: string
    current_status: string
    actions: string[]
  }>
}

function userType(u: { role: string; in_lead_pool: boolean; is_telecaller: boolean }): AgentActivity['type'] {
  if (u.role === 'admin') return 'admin'
  if (u.is_telecaller) return 'telecaller'
  if (u.in_lead_pool) return 'closer'
  return 'none'
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const isAdmin = user.role === 'admin'

    const url = new URL(req.url)
    const tzOffsetMin = parseInt(url.searchParams.get('tz_offset_min') || '330', 10) // IST default
    const dateStr = url.searchParams.get('date') || (() => {
      const istNow = new Date(Date.now() + tzOffsetMin * 60 * 1000)
      return istNow.toISOString().split('T')[0]
    })()

    // Build window: [dateStr 00:00 IST, dateStr 24:00 IST) → UTC bounds
    const [y, m, d] = dateStr.split('-').map(Number)
    if (!y || !m || !d) {
      return NextResponse.json({ success: false, error: 'Invalid date format (YYYY-MM-DD)' }, { status: 400 })
    }
    const sinceUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - tzOffsetMin * 60 * 1000)
    const untilUTC = new Date(sinceUTC.getTime() + 24 * 60 * 60 * 1000)
    const sinceISO = sinceUTC.toISOString()
    const untilISO = untilUTC.toISOString()

    // ─── Parallel fetch: users + leads + 5 activity queries ─────────────
    const dbUrl = process.env.TURSO_DATABASE_URL || 'file:data/inbox.db'
    const authToken = process.env.TURSO_AUTH_TOKEN || undefined
    const db = createClient({ url: dbUrl, authToken })

    const [users, leads, msgsRes, callsRes, notesRes, statusRes, assignRes] = await Promise.all([
      getUsers(),
      getLeads(),
      db.execute({
        sql: `SELECT sent_by, phone, COUNT(*) AS n FROM messages
              WHERE direction = 'sent' AND timestamp >= ? AND timestamp < ?
                AND sent_by != '' AND sent_by NOT IN ('auto-send', 'System (Auto)', 'System (Webhook)')
              GROUP BY sent_by, phone`,
        args: [sinceISO, untilISO],
      }),
      db.execute({
        sql: `SELECT logged_by, phone, COUNT(*) AS n FROM call_logs
              WHERE created_at >= ? AND created_at < ? AND logged_by != ''
              GROUP BY logged_by, phone`,
        args: [sinceISO, untilISO],
      }),
      db.execute({
        sql: `SELECT created_by, phone, COUNT(*) AS n FROM lead_notes
              WHERE created_at >= ? AND created_at < ? AND created_by != ''
              GROUP BY created_by, phone`,
        args: [sinceISO, untilISO],
      }),
      db.execute({
        sql: `SELECT changed_by, lead_row, phone, new_status, COUNT(*) AS n FROM lead_status_changes
              WHERE created_at >= ? AND created_at < ?
                AND source = 'manual' AND changed_by != ''
              GROUP BY changed_by, lead_row, phone, new_status`,
        args: [sinceISO, untilISO],
      }),
      db.execute({
        sql: `SELECT assigned_by, lead_row, phone, COUNT(*) AS n FROM assignment_log
              WHERE created_at >= ? AND created_at < ? AND assigned_by != ''
              GROUP BY assigned_by, lead_row, phone`,
        args: [sinceISO, untilISO],
      }),
    ])

    // Index leads by row + by normalized phone for cross-reference
    const leadsByRow = new Map(leads.map(l => [l.row_number, l]))
    const leadsByPhone = new Map<string, typeof leads[number]>()
    for (const l of leads) {
      const norm = normalizePhone(l.phone || '')
      if (norm) leadsByPhone.set(norm, l)
    }

    // Per-agent rollup
    const agentMap = new Map<string, AgentActivity>()
    const ensureAgent = (name: string, u: typeof users[number] | null): AgentActivity => {
      let a = agentMap.get(name)
      if (a) return a
      a = {
        user_id: u?.id || '',
        name,
        email: u?.email || '',
        role: u?.role || '',
        type: u ? userType(u) : 'none',
        active: u?.active ?? false,
        leads_touched: 0,
        actions: { manual_messages: 0, calls_logged: 0, notes_added: 0, status_changes: 0, reassignments_performed: 0 },
        status_progressions: {},
        touched_leads: [],
      }
      agentMap.set(name, a)
      return a
    }

    // Pre-populate every active user (so idle agents show with all zeros)
    for (const u of users) {
      if (u.active) ensureAgent(u.name, u)
    }

    // Per-agent + per-phone touch tracker
    const touchMap = new Map<string, Map<string, Set<string>>>() // agent → phone → action types
    const addTouch = (agent: string, phone: string, action: string) => {
      let perAgent = touchMap.get(agent)
      if (!perAgent) { perAgent = new Map(); touchMap.set(agent, perAgent) }
      let actions = perAgent.get(phone)
      if (!actions) { actions = new Set(); perAgent.set(phone, actions) }
      actions.add(action)
    }

    // Aggregate messages
    for (const r of msgsRes.rows) {
      const name = String(r.sent_by)
      const phone = normalizePhone(String(r.phone || ''))
      const n = Number(r.n || 0)
      const u = users.find(x => x.name === name)
      const a = ensureAgent(name, u || null)
      a.actions.manual_messages += n
      if (phone) addTouch(name, phone, 'msg')
    }

    // Calls
    for (const r of callsRes.rows) {
      const name = String(r.logged_by)
      const phone = normalizePhone(String(r.phone || ''))
      const n = Number(r.n || 0)
      const u = users.find(x => x.name === name)
      const a = ensureAgent(name, u || null)
      a.actions.calls_logged += n
      if (phone) addTouch(name, phone, 'call')
    }

    // Notes
    for (const r of notesRes.rows) {
      const name = String(r.created_by)
      const phone = normalizePhone(String(r.phone || ''))
      const n = Number(r.n || 0)
      const u = users.find(x => x.name === name)
      const a = ensureAgent(name, u || null)
      a.actions.notes_added += n
      if (phone) addTouch(name, phone, 'note')
    }

    // Status changes (manual only — system actors are useful elsewhere but
    // we only want to credit human agents in this tracker)
    for (const r of statusRes.rows) {
      const name = String(r.changed_by)
      const phone = normalizePhone(String(r.phone || ''))
      const n = Number(r.n || 0)
      const newStatus = String(r.new_status || '')
      const u = users.find(x => x.name === name)
      const a = ensureAgent(name, u || null)
      a.actions.status_changes += n
      if (newStatus) {
        const k = `to_${newStatus}`
        a.status_progressions[k] = (a.status_progressions[k] || 0) + n
      }
      if (phone) addTouch(name, phone, 'status')
    }

    // Reassignments (assignment_log) — credit to assigned_by
    for (const r of assignRes.rows) {
      const name = String(r.assigned_by)
      const phone = normalizePhone(String(r.phone || ''))
      const n = Number(r.n || 0)
      const u = users.find(x => x.name === name)
      const a = ensureAgent(name, u || null)
      a.actions.reassignments_performed += n
      if (phone) addTouch(name, phone, 'reassign')
    }

    // Build touched_leads + leads_touched for each agent
    for (const [name, perAgent] of touchMap) {
      const a = agentMap.get(name)
      if (!a) continue
      a.leads_touched = perAgent.size
      for (const [phone, actions] of perAgent) {
        const lead = leadsByPhone.get(phone)
        a.touched_leads.push({
          lead_row: lead?.row_number ?? null,
          phone,
          name: lead?.full_name || phone,
          current_status: lead?.lead_status || '',
          actions: Array.from(actions).sort(),
        })
      }
      // Sort touched leads: most-actions first, then alphabetical name
      a.touched_leads.sort((x, y) => y.actions.length - x.actions.length || x.name.localeCompare(y.name))
    }

    const agents = Array.from(agentMap.values()).sort((x, y) => {
      // Active users first; then by leads_touched desc; then by name
      if (x.active !== y.active) return x.active ? -1 : 1
      if (x.leads_touched !== y.leads_touched) return y.leads_touched - x.leads_touched
      return x.name.localeCompare(y.name)
    })

    // Org-level totals
    const totals = agents.reduce(
      (acc, a) => ({
        leads_touched: acc.leads_touched + a.leads_touched,
        manual_messages: acc.manual_messages + a.actions.manual_messages,
        calls_logged: acc.calls_logged + a.actions.calls_logged,
        notes_added: acc.notes_added + a.actions.notes_added,
        status_changes: acc.status_changes + a.actions.status_changes,
        reassignments_performed: acc.reassignments_performed + a.actions.reassignments_performed,
      }),
      { leads_touched: 0, manual_messages: 0, calls_logged: 0, notes_added: 0, status_changes: 0, reassignments_performed: 0 }
    )

    // Ghost-agent warnings: closers with active assignments today but zero touches
    const warnings: string[] = []
    const todayLeadsByAssignee = leads.reduce<Record<string, number>>((acc, l) => {
      if (l.assigned_to && l.created_time) {
        const t = Date.parse(l.created_time) || Date.parse(l.created_time.replace(' ', 'T') + 'Z')
        if (t >= sinceUTC.getTime() && t < untilUTC.getTime()) {
          acc[l.assigned_to] = (acc[l.assigned_to] || 0) + 1
        }
      }
      return acc
    }, {})
    for (const a of agents) {
      const assignedToday = todayLeadsByAssignee[a.name] || 0
      if (a.type === 'closer' && a.active && assignedToday > 0 && a.leads_touched === 0) {
        warnings.push(`${a.name} was assigned ${assignedToday} new lead${assignedToday === 1 ? '' : 's'} but didn't touch a single one in Sales Hub.`)
      }
    }

    // Telecaller ghost warnings: telecallers with queue but zero touches today.
    // Queue size = explicit assignments + auto-queue eligible.
    const [tcAssignments, tcAutoCfg] = await Promise.all([
      getAllAssignments(),
      getAutoQueueConfig(),
    ])
    const tcQueueSizeByUserId = new Map<string, number>()
    for (const a of tcAssignments) {
      tcQueueSizeByUserId.set(a.telecaller_user_id, (tcQueueSizeByUserId.get(a.telecaller_user_id) || 0) + 1)
    }
    if (tcAutoCfg.enabled && tcAutoCfg.user_id && tcAutoCfg.statuses.length > 0) {
      const statusSet = new Set(tcAutoCfg.statuses)
      const autoCount = leads.filter(l => statusSet.has(l.lead_status)).length
      tcQueueSizeByUserId.set(
        tcAutoCfg.user_id,
        (tcQueueSizeByUserId.get(tcAutoCfg.user_id) || 0) + autoCount,
      )
    }
    for (const a of agents) {
      if (a.type !== 'telecaller' || !a.active) continue
      const queueSize = tcQueueSizeByUserId.get(a.user_id) || 0
      if (queueSize >= 5 && a.leads_touched === 0) {
        warnings.push(`${a.name} has ${queueSize} lead${queueSize === 1 ? '' : 's'} in their telecaller queue but logged zero activity today.`)
      }
    }
    void leadsByRow // suppress unused

    // Self-scoped response for non-admins: hide peers, expose team average + rank.
    // The "you" object is the same shape as one entry in `agents[]` for an admin.
    if (!isAdmin) {
      const myEntry = agents.find(a => a.email === user.email) || null
      const peers = agents.filter(a => a.active && a.email !== user.email)
      const peerCount = peers.length

      const sum = (pick: (a: AgentActivity) => number) => peers.reduce((acc, a) => acc + pick(a), 0)
      const team_avg = peerCount === 0
        ? { leads_touched: 0, manual_messages: 0, calls_logged: 0, notes_added: 0, status_changes: 0 }
        : {
            leads_touched: Math.round((sum(a => a.leads_touched) / peerCount) * 10) / 10,
            manual_messages: Math.round((sum(a => a.actions.manual_messages) / peerCount) * 10) / 10,
            calls_logged: Math.round((sum(a => a.actions.calls_logged) / peerCount) * 10) / 10,
            notes_added: Math.round((sum(a => a.actions.notes_added) / peerCount) * 10) / 10,
            status_changes: Math.round((sum(a => a.actions.status_changes) / peerCount) * 10) / 10,
          }

      // Rank by leads_touched, ties broken by total actions
      const ranked = [...agents.filter(a => a.active)].sort((x, y) => {
        if (x.leads_touched !== y.leads_touched) return y.leads_touched - x.leads_touched
        const xa = x.actions.manual_messages + x.actions.calls_logged + x.actions.notes_added + x.actions.status_changes
        const ya = y.actions.manual_messages + y.actions.calls_logged + y.actions.notes_added + y.actions.status_changes
        return ya - xa
      })
      const myPosition = myEntry ? ranked.findIndex(a => a.email === myEntry.email) + 1 : 0

      return NextResponse.json({
        success: true,
        data: {
          scope: 'self',
          date: dateStr,
          window: { since: sinceISO, until: untilISO },
          you: myEntry,
          team_avg,
          your_rank: myEntry ? { position: myPosition, of: ranked.length } : null,
          // Only forward warnings that name the caller — peer warnings stay private.
          warnings: warnings.filter(w => myEntry && w.startsWith(`${myEntry.name} `)),
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        scope: 'admin',
        date: dateStr,
        window: { since: sinceISO, until: untilISO },
        agents,
        totals,
        warnings,
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
