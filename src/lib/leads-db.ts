import type { Row } from '@libsql/client'
import type { Lead, LeadStatus } from './types'
import { ensureInit } from './db'

// Column order for the `leads` table. row_number is the primary key and the
// shared lead identifier used across the rest of the schema (lead_row columns).
const LEAD_FIELDS = [
  'row_number', 'id', 'created_time', 'campaign_name', 'full_name', 'phone',
  'email', 'city', 'state', 'model_interest', 'experience', 'timeline',
  'platform', 'lead_status', 'attempted_contact', 'first_call_date',
  'wa_message_id', 'lead_priority', 'assigned_to', 'next_followup', 'notes',
] as const

// Fields an agent action is allowed to change in the DB. Excludes row_number
// (the key) and the immutable intake fields are still allowed for admin edits
// (full_name/email/city/state/model_interest) — mirrors LEAD_WRITE_COLUMNS.
const EDITABLE_FIELDS = new Set<string>([
  'lead_status', 'attempted_contact', 'first_call_date', 'wa_message_id',
  'lead_priority', 'assigned_to', 'next_followup', 'notes',
  'full_name', 'email', 'city', 'state', 'model_interest', 'phone',
])

function s(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

function rowToLead(r: Record<string, unknown>): Lead {
  return {
    row_number: Number(r.row_number),
    id: s(r.id),
    created_time: s(r.created_time),
    campaign_name: s(r.campaign_name),
    full_name: s(r.full_name),
    phone: s(r.phone),
    email: s(r.email),
    city: s(r.city),
    state: s(r.state),
    model_interest: s(r.model_interest),
    experience: s(r.experience),
    timeline: s(r.timeline),
    platform: s(r.platform),
    lead_status: (s(r.lead_status) || 'NEW') as LeadStatus,
    attempted_contact: s(r.attempted_contact),
    first_call_date: s(r.first_call_date),
    wa_message_id: s(r.wa_message_id),
    lead_priority: s(r.lead_priority),
    assigned_to: s(r.assigned_to),
    next_followup: s(r.next_followup),
    notes: s(r.notes),
  }
}

function leadToArgs(lead: Lead): (string | number)[] {
  return LEAD_FIELDS.map(f => {
    if (f === 'row_number') return Number(lead.row_number)
    return s((lead as unknown as Record<string, unknown>)[f])
  })
}

export async function dbCountLeads(): Promise<number> {
  const db = await ensureInit()
  const res = await db.execute('SELECT COUNT(*) AS n FROM leads')
  return Number(res.rows[0]?.n ?? 0)
}

export async function dbGetMaxRow(): Promise<number> {
  const db = await ensureInit()
  const res = await db.execute('SELECT MAX(row_number) AS m FROM leads')
  return Number(res.rows[0]?.m ?? 0)
}

export async function dbGetLeads(): Promise<Lead[]> {
  const db = await ensureInit()
  const res = await db.execute('SELECT * FROM leads ORDER BY row_number ASC')
  return (res.rows as Row[]).map(r => rowToLead(r as unknown as Record<string, unknown>))
}

export async function dbGetLeadByRow(rowNumber: number): Promise<Lead | null> {
  const db = await ensureInit()
  const res = await db.execute({ sql: 'SELECT * FROM leads WHERE row_number = ?', args: [rowNumber] })
  return res.rows[0] ? rowToLead(res.rows[0] as unknown as Record<string, unknown>) : null
}

// Insert a single lead, replacing any existing row with the same row_number.
// Used by manual createLead (the row is freshly appended to the sheet, so it
// is genuinely new).
export async function dbInsertLead(lead: Lead): Promise<void> {
  const db = await ensureInit()
  const placeholders = LEAD_FIELDS.map(() => '?').join(', ')
  await db.execute({
    sql: `INSERT OR REPLACE INTO leads (${LEAD_FIELDS.join(', ')}) VALUES (${placeholders})`,
    args: leadToArgs(lead),
  })
}

// Insert many leads but NEVER overwrite an existing row (INSERT OR IGNORE).
// This is what the sheet→DB sync uses, so a sync can never clobber an
// agent's edit that already lives in the DB. Runs as a SINGLE batch (one
// transaction) so a seed is all-or-nothing — a mid-way failure can never leave
// the DB partially populated (which would make the gap invisible to the
// incremental sync). Returns the actual number of rows inserted.
export async function dbInsertLeadsIfAbsent(leads: Lead[]): Promise<number> {
  if (leads.length === 0) return 0
  const db = await ensureInit()
  const placeholders = LEAD_FIELDS.map(() => '?').join(', ')
  const sql = `INSERT OR IGNORE INTO leads (${LEAD_FIELDS.join(', ')}) VALUES (${placeholders})`
  const results = await db.batch(leads.map(l => ({ sql, args: leadToArgs(l) })), 'write')
  return results.reduce((sum, r) => sum + Number(r.rowsAffected ?? 0), 0)
}

// Apply a partial field update to one lead. Field names are validated against
// EDITABLE_FIELDS so callers can never inject arbitrary column names.
// Returns the number of rows actually updated (0 if the row isn't in the DB
// yet — callers use this to fall back to an insert so an edit is never lost).
export async function dbUpdateLeadFields(
  rowNumber: number,
  fields: Partial<Record<string, string>>,
): Promise<number> {
  const entries = Object.entries(fields).filter(
    ([k, v]) => EDITABLE_FIELDS.has(k) && v !== undefined,
  )
  if (entries.length === 0) return 0
  const db = await ensureInit()
  const setClause = entries.map(([k]) => `${k} = ?`).join(', ')
  const args = entries.map(([, v]) => s(v))
  args.push(Number(rowNumber) as unknown as string)
  const res = await db.execute({
    sql: `UPDATE leads SET ${setClause}, updated_at = datetime('now') WHERE row_number = ?`,
    args,
  })
  return Number(res.rowsAffected ?? 0)
}

export async function dbDeleteLead(rowNumber: number): Promise<void> {
  const db = await ensureInit()
  await db.execute({ sql: 'DELETE FROM leads WHERE row_number = ?', args: [rowNumber] })
}
