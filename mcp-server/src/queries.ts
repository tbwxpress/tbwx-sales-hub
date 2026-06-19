/**
 * All SQL the MCP server runs. Read queries return key fields; writes replicate
 * the app's exact INSERT/audit patterns (src/lib/db.ts + src/lib/leads-db.ts).
 *
 * Tables touched (all owned/created by the app):
 *   READ:  leads, contacts, messages, tasks, lead_notes,
 *          lead_status_changes, pipeline_stages
 *   WRITE: lead_notes (add_lead_note), leads + lead_status_changes
 *          (update_lead_status), tasks (create_task)
 *
 * No DELETE / no bulk / no destructive operations are ever issued.
 */
import { getClient, normalizePhone, last10, serializeRows, type SqlArg } from './db.js'

// ─────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────

const LEAD_KEY_FIELDS =
  'row_number, id, created_time, campaign_name, full_name, phone, email, city, ' +
  'state, model_interest, experience, timeline, platform, lead_status, ' +
  'lead_priority, assigned_to, next_followup, attempted_contact, ' +
  'first_call_date, notes, updated_at'

export interface SearchLeadsFilters {
  name?: string
  phone?: string
  city?: string
  status?: string
  priority?: string
  limit: number
  offset: number
}

export async function searchLeads(f: SearchLeadsFilters) {
  const db = getClient()
  const conditions: string[] = []
  const args: SqlArg[] = []

  if (f.name) { conditions.push('full_name LIKE ?'); args.push(`%${f.name}%`) }
  if (f.phone) { conditions.push('SUBSTR(phone, -10) = ?'); args.push(last10(f.phone)) }
  if (f.city) { conditions.push('city LIKE ?'); args.push(`%${f.city}%`) }
  if (f.status) { conditions.push('lead_status = ?'); args.push(f.status) }
  if (f.priority) { conditions.push('lead_priority = ?'); args.push(f.priority) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const countRes = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM leads ${where}`,
    args,
  })
  const total = Number(countRes.rows[0]?.n ?? 0)

  const res = await db.execute({
    sql: `SELECT ${LEAD_KEY_FIELDS} FROM leads ${where}
          ORDER BY row_number DESC LIMIT ? OFFSET ?`,
    args: [...args, f.limit, f.offset],
  })

  return {
    total,
    limit: f.limit,
    offset: f.offset,
    hasMore: f.offset + res.rows.length < total,
    leads: serializeRows(res.rows),
  }
}

// Look up one lead by row_number OR phone. Returns the full lead row plus a
// lightweight activity summary (recent notes, last status changes, counts).
export async function getLead(opts: { rowNumber?: number; phone?: string }) {
  const db = getClient()
  let leadRow: Record<string, unknown> | undefined

  if (opts.rowNumber !== undefined) {
    const res = await db.execute({
      sql: `SELECT * FROM leads WHERE row_number = ?`,
      args: [opts.rowNumber],
    })
    leadRow = serializeRows(res.rows)[0]
  } else if (opts.phone) {
    const res = await db.execute({
      sql: `SELECT * FROM leads WHERE SUBSTR(phone, -10) = ? ORDER BY row_number DESC LIMIT 1`,
      args: [last10(opts.phone)],
    })
    leadRow = serializeRows(res.rows)[0]
  }

  if (!leadRow) return null

  const phone = String(leadRow.phone || '')
  const norm = normalizePhone(phone)

  const notesRes = await db.execute({
    sql: `SELECT id, note, created_by, created_at FROM lead_notes
          WHERE phone = ? OR phone = ? ORDER BY created_at DESC LIMIT 10`,
    args: [norm, phone],
  })

  const changesRes = await db.execute({
    sql: `SELECT id, old_status, new_status, changed_by, source, created_at
          FROM lead_status_changes WHERE lead_row = ?
          ORDER BY created_at DESC LIMIT 10`,
    args: [Number(leadRow.row_number)],
  })

  const msgCountRes = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM messages WHERE phone = ? OR phone = ?`,
    args: [norm, phone],
  })

  return {
    lead: leadRow,
    recent_notes: serializeRows(notesRes.rows),
    recent_status_changes: serializeRows(changesRes.rows),
    message_count: Number(msgCountRes.rows[0]?.n ?? 0),
  }
}

// WhatsApp conversation for a phone — most recent N, returned oldest→newest.
export async function getConversation(phone: string, limit: number) {
  const db = getClient()
  const norm = normalizePhone(phone)
  const res = await db.execute({
    sql: `SELECT id, phone, direction, text, timestamp, sent_by, status, template_used, media_type
          FROM messages
          WHERE phone = ? OR phone = ?
          ORDER BY timestamp DESC LIMIT ?`,
    args: [norm, phone, limit],
  })
  const rows = serializeRows(res.rows)
  rows.reverse() // chronological order for readability
  return rows
}

// Latest inbound (received) messages across all leads, newest first.
export async function listRecentMessages(limit: number) {
  const db = getClient()
  const res = await db.execute({
    sql: `SELECT m.id, m.phone, m.text, m.timestamp, m.media_type, c.name AS contact_name
          FROM messages m
          LEFT JOIN contacts c ON c.phone = m.phone
          WHERE m.direction = 'received'
          ORDER BY m.timestamp DESC LIMIT ?`,
    args: [limit],
  })
  return serializeRows(res.rows)
}

// Counts by status + priority, conversions, and today's new leads.
export async function leadStats() {
  const db = getClient()

  const byStatusRes = await db.execute(
    `SELECT lead_status AS status, COUNT(*) AS count FROM leads
     GROUP BY lead_status ORDER BY count DESC`,
  )
  const byPriorityRes = await db.execute(
    `SELECT COALESCE(NULLIF(lead_priority, ''), 'UNSET') AS priority, COUNT(*) AS count
     FROM leads GROUP BY priority ORDER BY count DESC`,
  )
  const totalRes = await db.execute(`SELECT COUNT(*) AS n FROM leads`)
  const convertedRes = await db.execute(
    `SELECT COUNT(*) AS n FROM leads WHERE lead_status = 'CONVERTED'`,
  )
  // created_time is the intake timestamp; fall back to updated_at date match.
  const todayRes = await db.execute(
    `SELECT COUNT(*) AS n FROM leads
     WHERE DATE(created_time) = DATE('now') OR DATE(updated_at) = DATE('now')`,
  )

  const total = Number(totalRes.rows[0]?.n ?? 0)
  const converted = Number(convertedRes.rows[0]?.n ?? 0)

  return {
    total_leads: total,
    converted,
    conversion_rate_pct: total > 0 ? Math.round((converted / total) * 1000) / 10 : 0,
    new_today: Number(todayRes.rows[0]?.n ?? 0),
    by_status: serializeRows(byStatusRes.rows),
    by_priority: serializeRows(byPriorityRes.rows),
  }
}

export async function listPipelineStages(includeInactive: boolean) {
  const db = getClient()
  const where = includeInactive ? '' : 'WHERE is_active = 1'
  const res = await db.execute(
    `SELECT key, label, color, sort_order, is_active, is_won, is_lost
     FROM pipeline_stages ${where} ORDER BY sort_order ASC, id ASC`,
  )
  return serializeRows(res.rows)
}

// Valid status keys — used to validate update_lead_status input.
export async function getPipelineStageKeys(): Promise<string[]> {
  const db = getClient()
  const res = await db.execute(`SELECT key FROM pipeline_stages`)
  return res.rows.map(r => String(r.key))
}

// ─────────────────────────────────────────────────────────────────────────
// WRITE (audited, non-destructive)
// ─────────────────────────────────────────────────────────────────────────

// add_lead_note — mirrors insertNote() in src/lib/db.ts.
export async function addLeadNote(opts: { phone: string; text: string; createdBy: string }) {
  const db = getClient()
  const phone = normalizePhone(opts.phone)
  const res = await db.execute({
    sql: 'INSERT INTO lead_notes (phone, note, created_by) VALUES (?, ?, ?)',
    args: [phone, opts.text, opts.createdBy],
  })
  return { id: Number(res.lastInsertRowid), phone }
}

// Resolve a lead by row_number or phone — used by update_lead_status / create_task.
async function resolveLead(opts: { rowNumber?: number; phone?: string }) {
  const db = getClient()
  if (opts.rowNumber !== undefined) {
    const res = await db.execute({
      sql: `SELECT row_number, phone, lead_status FROM leads WHERE row_number = ?`,
      args: [opts.rowNumber],
    })
    return res.rows[0] ? serializeRows(res.rows)[0] : null
  }
  if (opts.phone) {
    const res = await db.execute({
      sql: `SELECT row_number, phone, lead_status FROM leads
            WHERE SUBSTR(phone, -10) = ? ORDER BY row_number DESC LIMIT 1`,
      args: [last10(opts.phone)],
    })
    return res.rows[0] ? serializeRows(res.rows)[0] : null
  }
  return null
}

// update_lead_status — replicates the app's PATCH flow (src/app/api/leads/[id]/route.ts):
//   1. update leads.lead_status (+ updated_at), validated against pipeline_stages.key
//      (mirrors dbUpdateLeadFields)
//   2. write a lead_status_changes audit row with source 'mcp'
//      (mirrors insertStatusChange)
export async function updateLeadStatus(opts: {
  rowNumber?: number
  phone?: string
  newStatus: string
  changedBy: string
}): Promise<
  | { ok: true; row_number: number; phone: string; old_status: string; new_status: string; unchanged: boolean }
  | { ok: false; error: string; validStatuses?: string[] }
> {
  const db = getClient()

  const validKeys = await getPipelineStageKeys()
  if (!validKeys.includes(opts.newStatus)) {
    return {
      ok: false,
      error: `Invalid status "${opts.newStatus}". Must be one of the pipeline_stages keys.`,
      validStatuses: validKeys,
    }
  }

  const lead = await resolveLead({ rowNumber: opts.rowNumber, phone: opts.phone })
  if (!lead) {
    return { ok: false, error: 'Lead not found for the given row_number/phone.' }
  }

  const rowNumber = Number(lead.row_number)
  const phone = String(lead.phone || '')
  const oldStatus = String(lead.lead_status || '')

  if (oldStatus === opts.newStatus) {
    return {
      ok: true,
      row_number: rowNumber,
      phone,
      old_status: oldStatus,
      new_status: opts.newStatus,
      unchanged: true,
    }
  }

  // 1. Update the lead (mirrors leads-db.ts dbUpdateLeadFields).
  await db.execute({
    sql: `UPDATE leads SET lead_status = ?, updated_at = datetime('now') WHERE row_number = ?`,
    args: [opts.newStatus, rowNumber],
  })

  // 2. Audit row, source = 'mcp' (mirrors db.ts insertStatusChange).
  await db.execute({
    sql: `INSERT INTO lead_status_changes
            (lead_row, phone, old_status, new_status, changed_by, changed_by_id, source)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [rowNumber, phone ? normalizePhone(phone) : '', oldStatus, opts.newStatus, opts.changedBy, '', 'mcp'],
  })

  return {
    ok: true,
    row_number: rowNumber,
    phone,
    old_status: oldStatus,
    new_status: opts.newStatus,
    unchanged: false,
  }
}

// create_task — mirrors insertTask() in src/lib/db.ts. Phone is normalized so
// the task joins cleanly to contacts; null phone is allowed by the schema.
export async function createTask(opts: {
  phone?: string
  title: string
  dueAt: string
  createdBy: string
}) {
  const db = getClient()
  const phone = opts.phone ? normalizePhone(opts.phone) : null
  const res = await db.execute({
    sql: 'INSERT INTO tasks (phone, title, due_at, created_by) VALUES (?, ?, ?, ?)',
    args: [phone, opts.title, opts.dueAt, opts.createdBy],
  })
  return { id: Number(res.lastInsertRowid), phone, title: opts.title, due_at: opts.dueAt }
}
