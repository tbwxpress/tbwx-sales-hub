import type { Row } from '@libsql/client'
import type { Lead, LeadStatus } from './types'
import { ensureInit, normalizePhone } from './db'

// Column order for the `leads` table. row_number is the primary key and the
// shared lead identifier used across the rest of the schema (lead_row columns).
const LEAD_FIELDS = [
  'row_number', 'id', 'created_time', 'campaign_name', 'full_name', 'phone',
  'email', 'city', 'state', 'model_interest', 'experience', 'timeline',
  'platform', 'lead_status', 'attempted_contact', 'first_call_date',
  'wa_message_id', 'lead_priority', 'assigned_to', 'next_followup', 'notes',
  'form_id', 'form_name', 'form_answers',
] as const

// Fields an agent action is allowed to change in the DB. Excludes row_number
// (the key) and the immutable intake fields are still allowed for admin edits
// (full_name/email/city/state/model_interest) — mirrors LEAD_WRITE_COLUMNS.
const EDITABLE_FIELDS = new Set<string>([
  'lead_status', 'attempted_contact', 'first_call_date', 'wa_message_id',
  'lead_priority', 'assigned_to', 'next_followup', 'notes',
  'full_name', 'email', 'city', 'state', 'model_interest', 'phone',
  // Fill-if-blank by the bot qualifier (webhook answers); uses the same value
  // tokens the intake forms write ('within_30_days', '1-3_months', …).
  'timeline',
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
    form_id: s(r.form_id),
    form_name: s(r.form_name),
    form_answers: s(r.form_answers),
    last_enquiry_at: s(r.last_enquiry_at),
    enquiry_count: r.enquiry_count == null ? 1 : Number(r.enquiry_count),
    merged_into: r.merged_into == null ? null : Number(r.merged_into),
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

// Highest lead key inside one form-source band (see lib/form-sources.ts).
// 0 = the band has no leads yet (fresh source → needs a full-tab seed).
export async function dbGetMaxRowInBand(offset: number, bandSize: number): Promise<number> {
  const db = await ensureInit()
  const res = await db.execute({
    sql: 'SELECT MAX(row_number) AS m FROM leads WHERE row_number >= ? AND row_number < ?',
    args: [offset, offset + bandSize],
  })
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

/**
 * Statuses a re-enquiry resets to NEW. A cold or finished lead who fills the
 * form again is, for the agent's purposes, a fresh lead: it belongs back in the
 * queue and should get the deck again.
 *
 * Everything NOT listed here is a live conversation the agent is already in the
 * middle of (Call Done, HOT, Final Negotiation, Converted). Dropping one of
 * those back to NEW would erase real pipeline signal — Final Negotiation closes
 * at ~47% — so those keep their stage and are surfaced by priority + a note
 * instead.
 */
const REVIVABLE_STATUSES = new Set([
  'NEW', 'DECK_SENT', 'REPLIED', 'NO_RESPONSE', 'DELAYED', 'LOST', 'ARCHIVED', '',
])

export interface ReEnquiryResult {
  updated: number
  archivedDuplicates: number
}

/**
 * Fold repeat enquiries into the lead that already exists for that phone.
 *
 * Meta writes a brand-new sheet row every time someone fills a form, so the
 * same person enquiring in August and again in December used to produce two
 * lead records. The old one held the WhatsApp thread, the agent and the
 * history; the new one held the fresh answers and nobody worked it.
 *
 * The incoming row is still inserted (the sync tracks its progress by the
 * highest row number it has seen, so skipping rows would make it re-read them
 * forever) but is immediately archived and pointed at the original via
 * merged_into — the same mechanism the manual merge tool uses, so it stays out
 * of every active query and leaves an audit trail.
 */
export async function dbApplyReEnquiries(incoming: Lead[]): Promise<ReEnquiryResult> {
  const out: ReEnquiryResult = { updated: 0, archivedDuplicates: 0 }
  if (incoming.length === 0) return out
  const db = await ensureInit()

  const existingRes = await db.execute(
    'SELECT row_number, phone, lead_status, assigned_to, enquiry_count, created_time FROM leads WHERE merged_into IS NULL',
  )
  // The master is the EARLIEST-CREATED record — the one carrying the thread,
  // the agent and the history. Explicitly not the lowest row_number: row
  // numbers are band-offset per form source (0, 100000, 200000…), so a lead
  // that came through a newer form always sorts higher than an older lead from
  // the original form, regardless of age. Ordering by row number would archive
  // the record with the history into the empty new one.
  const olderWins = (a: Record<string, unknown>, b: Record<string, unknown>) => {
    const at = String(a.created_time || ''), bt = String(b.created_time || '')
    if (at && bt && at !== bt) return at < bt
    return Number(a.row_number) < Number(b.row_number)
  }
  const byPhone = new Map<string, Record<string, unknown>>()
  for (const r of existingRes.rows as unknown as Record<string, unknown>[]) {
    const key = normalizePhone(String(r.phone || ''))
    if (key.length < 12) continue
    const prev = byPhone.get(key)
    if (!prev || olderWins(r, prev)) byPhone.set(key, r)
  }

  for (const lead of incoming) {
    const key = normalizePhone(String(lead.phone || ''))
    if (key.length < 12) continue
    const master = byPhone.get(key)
    if (!master) continue
    const masterRow = Number(master.row_number)
    if (masterRow === Number(lead.row_number)) continue // this IS the master

    const status = String(master.lead_status || '')
    const revive = REVIVABLE_STATUSES.has(status)
    const enquiryAt = String(lead.created_time || new Date().toISOString())

    try {
      // 1. Park the duplicate row against the master.
      await db.execute({
        sql: `UPDATE leads SET merged_into = ?, lead_status = 'ARCHIVED'
              WHERE row_number = ? AND merged_into IS NULL`,
        args: [masterRow, Number(lead.row_number)],
      })

      // 2. Refresh the master with what they just told us. assigned_to is
      //    untouched: the agent who knows them keeps them.
      const sets = [
        'id = ?', 'campaign_name = ?', 'form_id = ?', 'form_name = ?', 'form_answers = ?',
        'model_interest = ?', 'timeline = ?', 'experience = ?', 'platform = ?',
        'last_enquiry_at = ?', 'enquiry_count = COALESCE(enquiry_count, 1) + 1',
      ]
      const args: (string | number)[] = [
        String(lead.id || ''), String(lead.campaign_name || ''), String(lead.form_id || ''),
        String(lead.form_name || ''), String(lead.form_answers || ''),
        String(lead.model_interest || ''), String(lead.timeline || ''),
        String(lead.experience || ''), String(lead.platform || ''), enquiryAt,
      ]
      if (revive) {
        sets.push("lead_status = 'NEW'", "attempted_contact = ''", "next_followup = ''")
      } else {
        sets.push("lead_priority = 'HOT'")
      }
      args.push(masterRow)
      await db.execute({ sql: `UPDATE leads SET ${sets.join(', ')} WHERE row_number = ?`, args })

      // 3. Audit trail the agent can see on the lead.
      const label = `Re-enquired ${enquiryAt.slice(0, 10)} via ${lead.campaign_name || 'ad'}${lead.form_name ? ` (${lead.form_name})` : ''}`
      await db.execute({
        sql: `INSERT INTO lead_status_changes (lead_row, phone, old_status, new_status, changed_by, source, reason)
              VALUES (?, ?, ?, ?, 'system', 'reenquiry', ?)`,
        args: [masterRow, key, status, revive ? 'NEW' : status, label],
      })
      out.updated++
      out.archivedDuplicates++
    } catch (err) {
      console.error(`[reenquiry] failed for row ${lead.row_number} -> ${masterRow}:`, err)
    }
  }
  return out
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

  // Root-cause fix: every synced lead also gets a contacts row. Without it,
  // sheet-imported leads had no contact and any note/call/message on them
  // failed with a FK constraint (contacts is FK-referenced by those tables).
  // INSERT OR IGNORE so existing contacts are untouched and it's a no-op on
  // re-sync. Best-effort — a contact failure must never fail the lead seed.
  try {
    const contactRows = leads
      .map(l => {
        const norm = normalizePhone(String(l.phone || ''))
        if (norm.length < 12) return null // needs a full 91XXXXXXXXXX key
        return {
          sql: 'INSERT OR IGNORE INTO contacts (phone, name, is_lead, lead_row, lead_id, city) VALUES (?, ?, 1, ?, ?, ?)',
          args: [norm, String(l.full_name || ''), Number(l.row_number), String(l.id || ''), String(l.city || '')],
        }
      })
      .filter((x): x is { sql: string; args: (string | number)[] } => x !== null)
    if (contactRows.length) await db.batch(contactRows, 'write')
  } catch (err) {
    console.error('[dbInsertLeadsIfAbsent] contact backfill failed (non-fatal):', err)
  }

  const inserted = results.reduce((sum, r) => sum + Number(r.rowsAffected ?? 0), 0)

  // Fold repeats into the lead that already exists for that phone. Runs after
  // the insert so the sync's row-number bookkeeping still advances; failures
  // are contained so a re-enquiry problem can never block the sync itself.
  if (inserted > 0) {
    try {
      const re = await dbApplyReEnquiries(leads)
      if (re.updated > 0) {
        console.log(`[leads-sync] ${re.updated} re-enquiry/ies folded into existing leads`)
      }
    } catch (err) {
      console.error('[leads-sync] re-enquiry pass failed (non-fatal):', err)
    }
  }

  return inserted
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
