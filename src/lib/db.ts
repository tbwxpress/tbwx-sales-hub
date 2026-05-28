import fs from 'fs'
import path from 'path'
import { createClient, type Client, type Row } from '@libsql/client'
import type { Delegation, PaymentFollowup, PaymentFollowupUpdate, PaymentFollowupStatus } from './types'

// Convert BigInt values to Number so JSON.stringify works
function serializeRow(row: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(row)) {
    out[key] = typeof val === 'bigint' ? Number(val) : val
  }
  return out
}

function serializeRows(rows: Row[]) {
  return rows.map(serializeRow)
}

// In production, use TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
// Locally, falls back to a file-based SQLite database
const dbUrl = process.env.TURSO_DATABASE_URL || 'file:data/inbox.db'
const authToken = process.env.TURSO_AUTH_TOKEN || undefined

let _db: Client | null = null
let _initialized = false

function getClient(): Client {
  if (!_db) {
    // Ensure data directory exists for local file mode
    if (dbUrl.startsWith('file:')) {
      const filePath = dbUrl.replace('file:', '')
      const dir = path.dirname(path.resolve(process.cwd(), filePath))
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    }

    _db = createClient({
      url: dbUrl,
      authToken,
    })
  }
  return _db
}

async function ensureInit(): Promise<Client> {
  const db = getClient()
  if (!_initialized) {
    await db.executeMultiple(`
      CREATE TABLE IF NOT EXISTS contacts (
        phone TEXT PRIMARY KEY,
        name TEXT DEFAULT '',
        is_lead INTEGER DEFAULT 0,
        lead_row INTEGER,
        lead_id TEXT,
        city TEXT DEFAULT '',
        avatar_color TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('sent', 'received')),
        text TEXT NOT NULL DEFAULT '',
        timestamp TEXT NOT NULL,
        sent_by TEXT DEFAULT '',
        wa_message_id TEXT DEFAULT '',
        status TEXT DEFAULT '',
        template_used TEXT DEFAULT '',
        read INTEGER DEFAULT 0,
        media_type TEXT DEFAULT '',
        media_id TEXT DEFAULT '',
        media_mime TEXT DEFAULT '',
        media_filename TEXT DEFAULT '',
        media_path TEXT DEFAULT '',
        FOREIGN KEY (phone) REFERENCES contacts(phone) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(wa_message_id);

      CREATE TABLE IF NOT EXISTS call_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        duration TEXT DEFAULT '',
        outcome TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        logged_by TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (phone) REFERENCES contacts(phone) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_call_logs_phone ON call_logs(phone);

      CREATE TABLE IF NOT EXISTS lead_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_by TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (phone) REFERENCES contacts(phone) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_lead_notes_phone ON lead_notes(phone);

      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT,
        title TEXT NOT NULL DEFAULT '',
        due_at TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        completed_at TEXT,
        created_by TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (phone) REFERENCES contacts(phone) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_phone ON tasks(phone);

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'agent' CHECK(role IN ('admin', 'agent')),
        can_assign INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

      CREATE TABLE IF NOT EXISTS drip_state (
        phone TEXT PRIMARY KEY,
        sequence TEXT NOT NULL DEFAULT '',
        current_step INTEGER DEFAULT 0,
        last_sent_at TEXT,
        enabled INTEGER DEFAULT 1,
        paused_at TEXT,
        pause_reason TEXT,
        opted_out INTEGER DEFAULT 0,
        opted_out_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_drip_phone ON drip_state(phone);

      CREATE TABLE IF NOT EXISTS drip_sequences (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        priority_band TEXT NOT NULL CHECK(priority_band IN ('HOT','WARM','COLD')),
        steps TEXT NOT NULL DEFAULT '[]',
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS assignment_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_row INTEGER NOT NULL,
        phone TEXT DEFAULT '',
        from_agent TEXT DEFAULT '',
        to_agent TEXT DEFAULT '',
        assigned_by TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_assignment_log_row ON assignment_log(lead_row);
      CREATE INDEX IF NOT EXISTS idx_assignment_log_phone ON assignment_log(phone);

      CREATE TABLE IF NOT EXISTS voice_agent_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        lead_id TEXT DEFAULT '',
        call_sid TEXT DEFAULT '',
        status TEXT DEFAULT 'initiated',
        duration_seconds INTEGER DEFAULT 0,
        interest_level TEXT DEFAULT '',
        preferred_city TEXT DEFAULT '',
        callback_time TEXT DEFAULT '',
        questions TEXT DEFAULT '',
        summary TEXT DEFAULT '',
        transcript TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (phone) REFERENCES contacts(phone) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_voice_calls_phone ON voice_agent_calls(phone);
      CREATE INDEX IF NOT EXISTS idx_voice_calls_sid ON voice_agent_calls(call_sid);

      CREATE TABLE IF NOT EXISTS sla_metrics (
        phone TEXT PRIMARY KEY,
        lead_created_at TEXT,
        first_response_at TEXT,
        first_response_seconds INTEGER,
        closed_at TEXT,
        time_to_close_seconds INTEGER,
        closed_status TEXT DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_sla_phone ON sla_metrics(phone);

      CREATE TABLE IF NOT EXISTS meta_ads_snapshots (
        snapshot_type TEXT PRIMARY KEY,
        data TEXT NOT NULL DEFAULT '',
        fetched_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS agreements (
        id TEXT PRIMARY KEY,
        lead_phone TEXT,
        lead_row INTEGER,
        doc_type TEXT NOT NULL CHECK(doc_type IN ('FBA', 'FRANCHISE_AGREEMENT')),
        status TEXT DEFAULT 'DRAFT',
        fields TEXT NOT NULL DEFAULT '{}',
        pdf_data TEXT,
        generated_by TEXT,
        generated_at TEXT,
        reviewed_by TEXT,
        reviewed_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_agreements_phone ON agreements(lead_phone);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS lead_telecaller_assignments (
        lead_row INTEGER PRIMARY KEY,
        telecaller_user_id TEXT NOT NULL,
        assigned_by_user_id TEXT NOT NULL,
        assigned_at TEXT DEFAULT (datetime('now')),
        notes TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_telecaller_assignments_user ON lead_telecaller_assignments(telecaller_user_id);

      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        ref_phone TEXT,
        ref_lead_row INTEGER,
        read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read, created_at DESC);

      CREATE TABLE IF NOT EXISTS lead_status_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_row INTEGER NOT NULL,
        phone TEXT DEFAULT '',
        old_status TEXT DEFAULT '',
        new_status TEXT NOT NULL,
        changed_by TEXT NOT NULL,
        changed_by_id TEXT DEFAULT '',
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_lsc_changed_by_date ON lead_status_changes(changed_by, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_lsc_lead ON lead_status_changes(lead_row);

      CREATE TABLE IF NOT EXISTS meta_capi_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_row INTEGER,
        phone TEXT NOT NULL DEFAULT '',
        event_name TEXT NOT NULL,
        event_id TEXT NOT NULL,
        value REAL DEFAULT 0,
        currency TEXT DEFAULT 'INR',
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed', 'test')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        meta_response TEXT,
        meta_events_received INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        sent_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_meta_capi_events_status ON meta_capi_events(status);
      CREATE INDEX IF NOT EXISTS idx_meta_capi_events_event_id ON meta_capi_events(event_id);
      CREATE INDEX IF NOT EXISTS idx_meta_capi_events_phone ON meta_capi_events(phone);

      CREATE TABLE IF NOT EXISTS commission_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        closer_user_id TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        lead_rows TEXT NOT NULL DEFAULT '[]',
        amount REAL NOT NULL DEFAULT 0,
        paid INTEGER NOT NULL DEFAULT 0,
        paid_at TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_commission_payments_closer ON commission_payments(closer_user_id, paid);

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        last_used_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

      CREATE TABLE IF NOT EXISTS lead_edits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_row INTEGER NOT NULL,
        phone TEXT DEFAULT '',
        field_name TEXT NOT NULL,
        old_value TEXT DEFAULT '',
        new_value TEXT DEFAULT '',
        changed_by TEXT NOT NULL,
        changed_by_id TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_lead_edits_row ON lead_edits(lead_row);
      CREATE INDEX IF NOT EXISTS idx_lead_edits_changed_by_date ON lead_edits(changed_by, created_at DESC);

      CREATE TABLE IF NOT EXISTS lead_delegations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_row INTEGER NOT NULL,
        phone TEXT DEFAULT '',
        from_agent_id TEXT NOT NULL,
        from_agent_name TEXT NOT NULL,
        to_agent_id TEXT NOT NULL,
        to_agent_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        message TEXT DEFAULT '',
        expires_at TEXT DEFAULT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        responded_at TEXT DEFAULT NULL,
        ended_at TEXT DEFAULT NULL,
        ended_by TEXT DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_delegations_to_status ON lead_delegations(to_agent_id, status);
      CREATE INDEX IF NOT EXISTS idx_delegations_lead_status ON lead_delegations(lead_row, status);
      CREATE INDEX IF NOT EXISTS idx_delegations_expires ON lead_delegations(expires_at) WHERE status='active';

      CREATE TABLE IF NOT EXISTS payment_followups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_row INTEGER DEFAULT NULL,
        phone TEXT DEFAULT '',
        franchise_name TEXT NOT NULL,
        amount REAL DEFAULT 0,
        currency TEXT DEFAULT '₹',
        due_date TEXT DEFAULT NULL,
        assigned_to_id TEXT NOT NULL,
        assigned_to_name TEXT NOT NULL,
        created_by_id TEXT NOT NULL,
        created_by_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        reason TEXT DEFAULT '',
        cleared_at TEXT DEFAULT NULL,
        cleared_by_id TEXT DEFAULT '',
        cleared_amount REAL DEFAULT 0,
        notes TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_pf_assigned_status ON payment_followups(assigned_to_id, status);
      CREATE INDEX IF NOT EXISTS idx_pf_status_due ON payment_followups(status, due_date);
      CREATE INDEX IF NOT EXISTS idx_pf_lead ON payment_followups(lead_row);

      CREATE TABLE IF NOT EXISTS payment_followup_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        followup_id INTEGER NOT NULL,
        old_status TEXT DEFAULT '',
        new_status TEXT NOT NULL,
        reason TEXT DEFAULT '',
        amount_change REAL DEFAULT 0,
        note TEXT DEFAULT '',
        updated_by_id TEXT NOT NULL,
        updated_by_name TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (followup_id) REFERENCES payment_followups(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_pfu_followup ON payment_followup_updates(followup_id, created_at);
    `)

    // Additive migrations (try-catch for existing DBs)
    try { await db.execute('ALTER TABLE drip_state ADD COLUMN resumed_at TEXT') } catch { /* column may already exist */ }
    try { await db.execute('ALTER TABLE drip_state ADD COLUMN opted_out INTEGER DEFAULT 0') } catch { /* column may already exist */ }
    try { await db.execute('ALTER TABLE drip_state ADD COLUMN opted_out_at TEXT') } catch { /* column may already exist */ }
    try { await db.execute("ALTER TABLE messages ADD COLUMN media_type TEXT DEFAULT ''") } catch { /* column may already exist */ }
    try { await db.execute("ALTER TABLE messages ADD COLUMN media_id TEXT DEFAULT ''") } catch { /* column may already exist */ }
    try { await db.execute("ALTER TABLE messages ADD COLUMN media_mime TEXT DEFAULT ''") } catch { /* column may already exist */ }
    try { await db.execute("ALTER TABLE messages ADD COLUMN media_filename TEXT DEFAULT ''") } catch { /* column may already exist */ }
    try { await db.execute("ALTER TABLE messages ADD COLUMN media_path TEXT DEFAULT ''") } catch { /* column may already exist */ }
    try { await db.execute("ALTER TABLE messages ADD COLUMN error_code TEXT DEFAULT ''") } catch { /* column may already exist */ }
    try { await db.execute("ALTER TABLE messages ADD COLUMN error_message TEXT DEFAULT ''") } catch { /* column may already exist */ }

    _initialized = true
  }
  return db
}

// --- Phone normalization ---
// Always store phones as "91XXXXXXXXXX" (12 digits, India country code + 10 digit number)
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const last10 = digits.slice(-10)
  if (last10.length < 10) return digits // can't normalize, return as-is
  return `91${last10}`
}

// --- Contact operations ---

export async function upsertContact(phone: string, data: {
  name?: string
  is_lead?: boolean
  lead_row?: number
  lead_id?: string
  city?: string
}) {
  const db = await ensureInit()
  phone = normalizePhone(phone)
  const existing = await db.execute({ sql: 'SELECT * FROM contacts WHERE phone = ?', args: [phone] })

  if (existing.rows.length > 0) {
    const updates: string[] = []
    const values: (string | number | null)[] = []
    if (data.name) { updates.push('name = ?'); values.push(data.name) }
    if (data.is_lead !== undefined) { updates.push('is_lead = ?'); values.push(data.is_lead ? 1 : 0) }
    if (data.lead_row) { updates.push('lead_row = ?'); values.push(data.lead_row) }
    if (data.lead_id) { updates.push('lead_id = ?'); values.push(data.lead_id) }
    if (data.city) { updates.push('city = ?'); values.push(data.city) }
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')")
      values.push(phone)
      await db.execute({ sql: `UPDATE contacts SET ${updates.join(', ')} WHERE phone = ?`, args: values })
    }
  } else {
    const colors = ['#f97316', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#f5c518']
    const color = colors[Math.floor(Math.random() * colors.length)]
    await db.execute({
      sql: `INSERT INTO contacts (phone, name, is_lead, lead_row, lead_id, city, avatar_color)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        phone,
        data.name || '',
        data.is_lead ? 1 : 0,
        data.lead_row || null,
        data.lead_id || '',
        data.city || '',
        color,
      ],
    })
  }
}

export async function getContacts() {
  const db = await ensureInit()
  const result = await db.execute(`
    SELECT
      c.*,
      m.text AS last_message,
      m.direction AS last_direction,
      m.timestamp AS last_message_at,
      (SELECT COUNT(*) FROM messages WHERE phone = c.phone AND read = 0 AND direction = 'received') AS unread_count
    FROM contacts c
    LEFT JOIN messages m ON m.phone = c.phone AND m.timestamp = (
      SELECT MAX(timestamp) FROM messages WHERE phone = c.phone
    )
    ORDER BY m.timestamp DESC NULLS LAST
  `)
  return serializeRows(result.rows)
}

// Chunk size kept well under SQLite/libsql's ~999 parameter ceiling.
const PHONE_QUERY_CHUNK = 500

export async function getContactsForAgent(
  assignedPhones: string[],
  opts: { limit?: number; offset?: number } = {}
): Promise<{ contacts: any[]; total: number; hasMore: boolean }> {
  const db = await ensureInit()
  if (assignedPhones.length === 0) return { contacts: [], total: 0, hasMore: false }

  const limit = Math.max(opts.limit ?? 200, 1)
  const offset = Math.max(opts.offset ?? 0, 0)

  const phones10 = Array.from(
    new Set(
      assignedPhones
        .map(p => String(p).replace(/\D/g, '').slice(-10))
        .filter(p => p.length === 10)
    )
  )
  if (phones10.length === 0) return { contacts: [], total: 0, hasMore: false }

  const seen = new Set<string>()
  const merged: any[] = []

  for (let i = 0; i < phones10.length; i += PHONE_QUERY_CHUNK) {
    const batch = phones10.slice(i, i + PHONE_QUERY_CHUNK)
    const conditions = batch.map(() => 'SUBSTR(c.phone, -10) = ?').join(' OR ')
    const result = await db.execute({
      sql: `
        SELECT
          c.*,
          m.text AS last_message,
          m.direction AS last_direction,
          m.timestamp AS last_message_at,
          (SELECT COUNT(*) FROM messages WHERE phone = c.phone AND read = 0 AND direction = 'received') AS unread_count
        FROM contacts c
        LEFT JOIN messages m ON m.phone = c.phone AND m.timestamp = (
          SELECT MAX(timestamp) FROM messages WHERE phone = c.phone
        )
        WHERE ${conditions}
      `,
      args: batch,
    })
    for (const row of serializeRows(result.rows)) {
      const phoneKey = String(row.phone ?? '')
      if (!seen.has(phoneKey)) {
        seen.add(phoneKey)
        merged.push(row)
      }
    }
  }

  merged.sort((a, b) => {
    if (!a.last_message_at && !b.last_message_at) return 0
    if (!a.last_message_at) return 1
    if (!b.last_message_at) return -1
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  })

  const page = merged.slice(offset, offset + limit)
  return { contacts: page, total: merged.length, hasMore: merged.length > offset + limit }
}

export async function getUnreadCountForAgent(assignedPhones: string[]) {
  const db = await ensureInit()
  if (assignedPhones.length === 0) return 0

  const phones10 = Array.from(
    new Set(
      assignedPhones
        .map(p => String(p).replace(/\D/g, '').slice(-10))
        .filter(p => p.length === 10)
    )
  )
  if (phones10.length === 0) return 0

  let total = 0
  for (let i = 0; i < phones10.length; i += PHONE_QUERY_CHUNK) {
    const batch = phones10.slice(i, i + PHONE_QUERY_CHUNK)
    const conditions = batch.map(() => 'SUBSTR(phone, -10) = ?').join(' OR ')
    const result = await db.execute({
      sql: `SELECT COUNT(*) as count FROM messages WHERE read = 0 AND direction = 'received' AND (${conditions})`,
      args: batch,
    })
    total += Number(result.rows[0]?.count ?? 0)
  }
  return total
}

export async function getContact(phone: string) {
  const db = await ensureInit()
  phone = normalizePhone(phone)
  const result = await db.execute({ sql: 'SELECT * FROM contacts WHERE phone = ?', args: [phone] })
  return result.rows[0] ? serializeRow(result.rows[0]) : null
}

// --- Message operations ---

export async function insertMessage(data: {
  phone: string
  direction: 'sent' | 'received'
  text: string
  timestamp: string
  sent_by?: string
  wa_message_id?: string
  status?: string
  template_used?: string
  read?: boolean
  media_type?: string
  media_id?: string
  media_mime?: string
  media_filename?: string
  media_path?: string
}) {
  const db = await ensureInit()
  data.phone = normalizePhone(data.phone)

  // Check for duplicate wa_message_id
  if (data.wa_message_id) {
    const existing = await db.execute({ sql: 'SELECT id FROM messages WHERE wa_message_id = ?', args: [data.wa_message_id] })
    if (existing.rows.length > 0) return null
  }

  const result = await db.execute({
    sql: `INSERT INTO messages
            (phone, direction, text, timestamp, sent_by, wa_message_id, status, template_used, read,
             media_type, media_id, media_mime, media_filename, media_path)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      data.phone,
      data.direction,
      data.text,
      data.timestamp,
      data.sent_by || '',
      data.wa_message_id || '',
      data.status || '',
      data.template_used || '',
      data.read ? 1 : 0,
      data.media_type || '',
      data.media_id || '',
      data.media_mime || '',
      data.media_filename || '',
      data.media_path || '',
    ],
  })

  // Update contact's updated_at
  await db.execute({ sql: "UPDATE contacts SET updated_at = datetime('now') WHERE phone = ?", args: [data.phone] })

  return Number(result.lastInsertRowid)
}

export async function getMessages(phone: string, limit = 100, offset = 0) {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  // Query both normalized and original to catch old data
  const result = await db.execute({
    sql: `SELECT * FROM messages WHERE phone = ? OR phone = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?`,
    args: [norm, phone, limit, offset],
  })
  return serializeRows(result.rows)
}

export async function markMessagesRead(phone: string) {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  await db.execute({
    sql: "UPDATE messages SET read = 1 WHERE (phone = ? OR phone = ?) AND read = 0 AND direction = 'received'",
    args: [norm, phone],
  })
}

export async function getUnreadCount() {
  const db = await ensureInit()
  const result = await db.execute("SELECT COUNT(*) as count FROM messages WHERE read = 0 AND direction = 'received'")
  return Number(result.rows[0]?.count ?? 0)
}

export async function searchMessages(query: string) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT m.*, c.name as contact_name
          FROM messages m
          JOIN contacts c ON c.phone = m.phone
          WHERE m.text LIKE ? OR c.name LIKE ? OR c.phone LIKE ?
          ORDER BY m.timestamp DESC
          LIMIT 50`,
    args: [`%${query}%`, `%${query}%`, `%${query}%`],
  })
  return serializeRows(result.rows)
}

// Search received/sent messages whose text contains any of the keywords.
// Used by the opt-out backfill to find STOP/unsubscribe replies retroactively.
export async function getMessagesContainingText(
  direction: 'sent' | 'received',
  keywords: string[],
): Promise<Array<{ phone: string; text: string; timestamp: string }>> {
  if (!keywords.length) return []
  const db = await ensureInit()
  const likeClauses = keywords.map(() => 'LOWER(text) LIKE ?').join(' OR ')
  const args: string[] = [direction, ...keywords.map(k => `%${k.toLowerCase()}%`)]
  const result = await db.execute({
    sql: `SELECT phone, text, timestamp FROM messages WHERE direction = ? AND (${likeClauses}) ORDER BY timestamp ASC`,
    args,
  })
  return result.rows.map(r => ({
    phone: String(r.phone || ''),
    text: String(r.text || ''),
    timestamp: String(r.timestamp || ''),
  }))
}

export async function updateMessageStatus(
  waMessageId: string,
  status: string,
  errorCode?: string,
  errorMessage?: string,
) {
  const db = await ensureInit()
  if (errorCode || errorMessage) {
    await db.execute({
      sql: 'UPDATE messages SET status = ?, error_code = ?, error_message = ? WHERE wa_message_id = ?',
      args: [status, errorCode || '', errorMessage || '', waMessageId],
    })
  } else {
    await db.execute({
      sql: 'UPDATE messages SET status = ? WHERE wa_message_id = ?',
      args: [status, waMessageId],
    })
  }
}

/**
 * Get the delivery status of the first automated message for a lead.
 * Checks by wa_message_id first, then falls back to finding the first
 * sent template message for the phone number.
 */
export async function getAutoMessageStatus(waMessageId: string, phone: string): Promise<{
  status: string
  timestamp: string
  template_used: string
  source: 'db_by_id' | 'db_by_phone' | 'not_found'
}> {
  const db = await ensureInit()

  // Try to find by exact wa_message_id
  if (waMessageId) {
    const result = await db.execute({
      sql: 'SELECT status, timestamp, template_used FROM messages WHERE wa_message_id = ? LIMIT 1',
      args: [waMessageId],
    })
    if (result.rows.length > 0) {
      const row = result.rows[0]
      return {
        status: String(row.status || 'sent'),
        timestamp: String(row.timestamp || ''),
        template_used: String(row.template_used || ''),
        source: 'db_by_id',
      }
    }
  }

  // Fallback: find the first sent template message for this phone
  if (phone) {
    const result = await db.execute({
      sql: `SELECT status, timestamp, template_used FROM messages
            WHERE phone LIKE ? AND direction = 'sent' AND template_used != ''
            ORDER BY timestamp ASC LIMIT 1`,
      args: [`%${phone.slice(-10)}`],
    })
    if (result.rows.length > 0) {
      const row = result.rows[0]
      return {
        status: String(row.status || 'sent'),
        timestamp: String(row.timestamp || ''),
        template_used: String(row.template_used || ''),
        source: 'db_by_phone',
      }
    }
  }

  // If wa_message_id exists but not in our DB, it was sent by n8n
  // (n8n sends via its own WhatsApp node, so it won't be in our SQLite)
  if (waMessageId) {
    return {
      status: 'sent',
      timestamp: '',
      template_used: '',
      source: 'not_found',
    }
  }

  return {
    status: 'none',
    timestamp: '',
    template_used: '',
    source: 'not_found',
  }
}

/**
 * Get the delivery status of the first sent template message for all phones.
 * Returns a map of phone -> { status, template_used, timestamp }.
 * Used by dashboard to show WA delivery status for all leads at once.
 */
export async function getBulkAutoMessageStatus(): Promise<
  Record<string, { status: string; template_used: string; timestamp: string }>
> {
  const db = await ensureInit()

  // Get the first (earliest) sent template message per phone
  const result = await db.execute(`
    SELECT m.phone, m.status, m.template_used, m.timestamp
    FROM messages m
    INNER JOIN (
      SELECT phone, MIN(timestamp) as first_ts
      FROM messages
      WHERE direction = 'sent' AND template_used != ''
      GROUP BY phone
    ) first ON m.phone = first.phone AND m.timestamp = first.first_ts
    WHERE m.direction = 'sent' AND m.template_used != ''
  `)

  const map: Record<string, { status: string; template_used: string; timestamp: string }> = {}
  for (const row of result.rows) {
    const phone = String(row.phone || '')
    // Store by last 10 digits for matching with leads
    const key = phone.slice(-10)
    map[key] = {
      status: String(row.status || 'sent'),
      template_used: String(row.template_used || ''),
      timestamp: String(row.timestamp || ''),
    }
  }

  return map
}

// --- Call log operations ---

export async function insertCallLog(data: {
  phone: string
  duration?: string
  outcome?: string
  notes?: string
  logged_by?: string
}) {
  const db = await ensureInit()
  data.phone = normalizePhone(data.phone)
  const result = await db.execute({
    sql: `INSERT INTO call_logs (phone, duration, outcome, notes, logged_by) VALUES (?, ?, ?, ?, ?)`,
    args: [data.phone, data.duration || '', data.outcome || '', data.notes || '', data.logged_by || ''],
  })
  return Number(result.lastInsertRowid)
}

export async function getCallLogs(phone: string) {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  const result = await db.execute({
    sql: 'SELECT * FROM call_logs WHERE phone = ? OR phone = ? ORDER BY created_at DESC',
    args: [norm, phone],
  })
  return serializeRows(result.rows)
}

// --- Last discussion lookup (lead list view) ---
// Returns a Map from normalized phone (91XXXXXXXXXX) to the most recent
// human-curated interaction across notes, calls, and inbound messages.
// Auto-sent templates and system messages are excluded — they're not "discussion."
export interface LastDiscussion {
  source: 'note' | 'call' | 'message_in' | 'message_out'
  text: string
  by: string
  at: string
}
export async function getLastDiscussionByPhone(): Promise<Map<string, LastDiscussion>> {
  try {
    const db = await ensureInit()
    const map = new Map<string, LastDiscussion>()

    // Helper: keep the most recent entry per phone
    const consider = (phone: string, candidate: LastDiscussion) => {
      const existing = map.get(phone)
      if (!existing || candidate.at > existing.at) map.set(phone, candidate)
    }

    // Latest note per phone — SQLite "bare column with MAX" trick gives
    // the row that owns the MAX value
    const notesRes = await db.execute(
      "SELECT phone, note, created_by, MAX(created_at) AS at FROM lead_notes GROUP BY phone"
    )
    for (const r of notesRes.rows) {
      const phone = normalizePhone(String(r.phone))
      consider(phone, {
        source: 'note',
        text: String(r.note || ''),
        by: String(r.created_by || ''),
        at: String(r.at || ''),
      })
    }

    // Latest call log per phone — prefer notes field, fall back to outcome
    const callsRes = await db.execute(
      "SELECT phone, outcome, notes, logged_by, MAX(created_at) AS at FROM call_logs GROUP BY phone"
    )
    for (const r of callsRes.rows) {
      const phone = normalizePhone(String(r.phone))
      const text = String(r.notes || r.outcome || '').trim()
      if (!text) continue
      consider(phone, {
        source: 'call',
        text,
        by: String(r.logged_by || ''),
        at: String(r.at || ''),
      })
    }

    // Latest non-template, non-auto message per phone (both directions)
    // Skip messages where text starts with "[Template:" or "[Auto]" or sent_by is auto
    const msgsRes = await db.execute(
      `SELECT phone, text, direction, sent_by, MAX(timestamp) AS at
       FROM messages
       WHERE text NOT LIKE '[Template:%'
         AND text NOT LIKE '[Auto]%'
         AND sent_by NOT IN ('auto-send', 'System (Auto)')
       GROUP BY phone`
    )
    for (const r of msgsRes.rows) {
      const phone = normalizePhone(String(r.phone))
      const text = String(r.text || '').trim()
      if (!text) continue
      consider(phone, {
        source: String(r.direction) === 'received' ? 'message_in' : 'message_out',
        text,
        by: String(r.sent_by || (String(r.direction) === 'received' ? 'lead' : '')),
        at: String(r.at || ''),
      })
    }

    return map
  } catch (err) {
    console.error('[getLastDiscussionByPhone] non-critical:', err)
    return new Map()
  }
}

// --- Lead notes ---

export async function insertNote(data: { phone: string; note: string; created_by?: string }) {
  const db = await ensureInit()
  data.phone = normalizePhone(data.phone)
  const result = await db.execute({
    sql: 'INSERT INTO lead_notes (phone, note, created_by) VALUES (?, ?, ?)',
    args: [data.phone, data.note, data.created_by || ''],
  })
  return Number(result.lastInsertRowid)
}

export async function getNotes(phone: string) {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  const result = await db.execute({
    sql: 'SELECT * FROM lead_notes WHERE phone = ? OR phone = ? ORDER BY created_at DESC',
    args: [norm, phone],
  })
  return serializeRows(result.rows)
}

// --- Lead status change audit log ---
// Captures every transition with actor + source so the daily activity tracker
// can answer "which agent moved which lead through which stage today".
// Source = 'manual' (user PATCHed) | 'auto-send' (cron set DECK_SENT) |
// 'webhook' (button auto-classify or REPLIED) | 'cron' (other cron paths).

export async function insertStatusChange(data: {
  lead_row: number
  phone?: string
  old_status?: string
  new_status: string
  changed_by: string
  changed_by_id?: string
  source?: 'manual' | 'auto-send' | 'webhook' | 'cron'
}): Promise<number | null> {
  try {
    const db = await ensureInit()
    const r = await db.execute({
      sql: `INSERT INTO lead_status_changes
              (lead_row, phone, old_status, new_status, changed_by, changed_by_id, source)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        data.lead_row,
        data.phone ? normalizePhone(data.phone) : '',
        data.old_status || '',
        data.new_status,
        data.changed_by,
        data.changed_by_id || '',
        data.source || 'manual',
      ],
    })
    return Number(r.lastInsertRowid)
  } catch (err) {
    // Audit logging must never break the main flow
    console.error('[insertStatusChange] non-critical:', err)
    return null
  }
}

export async function getStatusChangesByAgent(opts: {
  changed_by: string
  since: string  // ISO timestamp inclusive
  until: string  // ISO timestamp exclusive
}) {
  const db = await ensureInit()
  const r = await db.execute({
    sql: `SELECT id, lead_row, phone, old_status, new_status, source, created_at
          FROM lead_status_changes
          WHERE changed_by = ? AND created_at >= ? AND created_at < ?
          ORDER BY created_at DESC`,
    args: [opts.changed_by, opts.since, opts.until],
  })
  return serializeRows(r.rows)
}

export async function getStatusChangesForLead(leadRow: number) {
  const db = await ensureInit()
  const r = await db.execute({
    sql: `SELECT id, lead_row, phone, old_status, new_status, changed_by, changed_by_id, source, created_at
          FROM lead_status_changes
          WHERE lead_row = ?
          ORDER BY created_at DESC`,
    args: [leadRow],
  })
  return serializeRows(r.rows)
}

// --- Tasks/Reminders ---

export async function insertTask(data: { phone?: string; title: string; due_at: string; created_by?: string }) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'INSERT INTO tasks (phone, title, due_at, created_by) VALUES (?, ?, ?, ?)',
    args: [data.phone || null, data.title, data.due_at, data.created_by || ''],
  })
  return Number(result.lastInsertRowid)
}

export async function getTasks(filters?: { completed?: boolean; due_before?: string; phone?: string }) {
  const db = await ensureInit()
  const conditions: string[] = []
  const args: (string | number)[] = []

  if (filters?.completed !== undefined) {
    conditions.push('completed = ?')
    args.push(filters.completed ? 1 : 0)
  }
  if (filters?.due_before) {
    conditions.push('due_at <= ?')
    args.push(filters.due_before)
  }
  if (filters?.phone) {
    conditions.push('phone = ?')
    args.push(filters.phone)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const result = await db.execute({
    sql: `SELECT t.*, c.name as contact_name FROM tasks t LEFT JOIN contacts c ON c.phone = t.phone ${where} ORDER BY t.due_at ASC`,
    args,
  })
  return serializeRows(result.rows)
}

export async function completeTask(id: number) {
  const db = await ensureInit()
  await db.execute({
    sql: "UPDATE tasks SET completed = 1, completed_at = datetime('now') WHERE id = ?",
    args: [id],
  })
}

// --- Phone dedup migration ---
// Merges duplicate contacts (same last 10 digits) into one normalized entry.
// Moves all messages, call_logs, lead_notes to the normalized phone.
export async function migratePhoneNumbers(): Promise<{ merged: number; messages_moved: number; contacts_deleted: number }> {
  const db = await ensureInit()
  let merged = 0, messagesMoved = 0, contactsDeleted = 0

  // Find all contacts grouped by last 10 digits
  const contacts = await db.execute('SELECT phone, name, is_lead, lead_row, lead_id, city, avatar_color, created_at FROM contacts ORDER BY created_at ASC')
  const groups: Record<string, typeof contacts.rows> = {}
  for (const row of contacts.rows) {
    const phone = String(row.phone || '')
    const key = phone.replace(/\D/g, '').slice(-10)
    if (key.length < 10) continue
    if (!groups[key]) groups[key] = []
    groups[key].push(row)
  }

  for (const [key, rows] of Object.entries(groups)) {
    if (rows.length <= 1) continue // no duplicates

    const canonPhone = `91${key}`
    merged++

    // Pick the best contact data (prefer one with name, is_lead, etc.)
    const best = rows.find(r => r.name && String(r.name).length > 0) || rows[0]

    // Ensure canonical contact exists
    const existing = await db.execute({ sql: 'SELECT phone FROM contacts WHERE phone = ?', args: [canonPhone] })
    if (existing.rows.length === 0) {
      await db.execute({
        sql: 'INSERT INTO contacts (phone, name, is_lead, lead_row, lead_id, city, avatar_color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [canonPhone, best.name || '', best.is_lead ?? 0, best.lead_row ?? null, best.lead_id || '', best.city || '', best.avatar_color || '#3b82f6', best.created_at || new Date().toISOString()],
      })
    }

    // Move all messages, call_logs, lead_notes from duplicate phones to canonical
    for (const row of rows) {
      const oldPhone = String(row.phone || '')
      if (oldPhone === canonPhone) continue

      const moved = await db.execute({ sql: 'UPDATE messages SET phone = ? WHERE phone = ?', args: [canonPhone, oldPhone] })
      messagesMoved += Number(moved.rowsAffected || 0)
      await db.execute({ sql: 'UPDATE call_logs SET phone = ? WHERE phone = ?', args: [canonPhone, oldPhone] })
      await db.execute({ sql: 'UPDATE lead_notes SET phone = ? WHERE phone = ?', args: [canonPhone, oldPhone] })
      await db.execute({ sql: 'UPDATE tasks SET phone = ? WHERE phone = ?', args: [canonPhone, oldPhone] })
      await db.execute({ sql: 'DELETE FROM contacts WHERE phone = ?', args: [oldPhone] })
      contactsDeleted++
    }
  }

  return { merged, messages_moved: messagesMoved, contacts_deleted: contactsDeleted }
}

// --- Drip sequence operations ---

export async function getDripState(phone: string) {
  const db = await ensureInit()
  const result = await db.execute({ sql: 'SELECT * FROM drip_state WHERE phone = ?', args: [phone] })
  return result.rows[0] ? serializeRow(result.rows[0]) : null
}

export async function upsertDripState(phone: string, data: {
  sequence?: string
  current_step?: number
  last_sent_at?: string | null
  enabled?: boolean
  paused_at?: string | null
  pause_reason?: string | null
  opted_out?: boolean
  opted_out_at?: string | null
}) {
  const db = await ensureInit()
  const existing = await db.execute({ sql: 'SELECT * FROM drip_state WHERE phone = ?', args: [phone] })

  if (existing.rows.length > 0) {
    const updates: string[] = []
    const values: (string | number | null)[] = []
    if (data.sequence !== undefined) { updates.push('sequence = ?'); values.push(data.sequence) }
    if (data.current_step !== undefined) { updates.push('current_step = ?'); values.push(data.current_step) }
    if (data.last_sent_at !== undefined) { updates.push('last_sent_at = ?'); values.push(data.last_sent_at) }
    if (data.enabled !== undefined) { updates.push('enabled = ?'); values.push(data.enabled ? 1 : 0) }
    if (data.paused_at !== undefined) { updates.push('paused_at = ?'); values.push(data.paused_at) }
    if (data.pause_reason !== undefined) { updates.push('pause_reason = ?'); values.push(data.pause_reason) }
    if (data.opted_out !== undefined) { updates.push('opted_out = ?'); values.push(data.opted_out ? 1 : 0) }
    if (data.opted_out_at !== undefined) { updates.push('opted_out_at = ?'); values.push(data.opted_out_at) }
    if (updates.length > 0) {
      values.push(phone)
      await db.execute({ sql: `UPDATE drip_state SET ${updates.join(', ')} WHERE phone = ?`, args: values })
    }
  } else {
    await db.execute({
      sql: `INSERT INTO drip_state (phone, sequence, current_step, last_sent_at, enabled, paused_at, pause_reason, opted_out, opted_out_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        phone,
        data.sequence || '',
        data.current_step ?? 0,
        data.last_sent_at || null,
        data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
        data.paused_at || null,
        data.pause_reason || null,
        data.opted_out ? 1 : 0,
        data.opted_out_at || null,
      ],
    })
  }
}

export async function getDripLeads(includesPaused: boolean = false): Promise<Record<string, unknown>[]> {
  const db = await ensureInit()
  const sql = includesPaused
    ? 'SELECT * FROM drip_state WHERE enabled = 1'
    : 'SELECT * FROM drip_state WHERE enabled = 1 AND paused_at IS NULL'
  const result = await db.execute(sql)
  return serializeRows(result.rows) as Record<string, unknown>[]
}

export async function toggleDrip(phone: string, enabled: boolean) {
  const db = await ensureInit()
  const existing = await db.execute({ sql: 'SELECT * FROM drip_state WHERE phone = ?', args: [phone] })
  if (existing.rows.length > 0) {
    await db.execute({ sql: 'UPDATE drip_state SET enabled = ? WHERE phone = ?', args: [enabled ? 1 : 0, phone] })
  } else {
    await db.execute({
      sql: 'INSERT INTO drip_state (phone, enabled) VALUES (?, ?)',
      args: [phone, enabled ? 1 : 0],
    })
  }
}

export async function getBulkDripState(): Promise<Record<string, { enabled: boolean; sequence: string; current_step: number; paused_at: string | null }>> {
  const db = await ensureInit()
  const result = await db.execute('SELECT * FROM drip_state')
  const map: Record<string, { enabled: boolean; sequence: string; current_step: number; paused_at: string | null }> = {}
  for (const row of result.rows) {
    const phone = String(row.phone || '')
    const key = phone.slice(-10)
    map[key] = {
      enabled: row.enabled === 1,
      sequence: String(row.sequence || ''),
      current_step: Number(row.current_step || 0),
      paused_at: row.paused_at ? String(row.paused_at) : null,
    }
  }
  return map
}

// --- Assignment Log ---

export async function logAssignment(data: {
  lead_row: number
  phone?: string
  from_agent: string
  to_agent: string
  assigned_by: string
}) {
  const db = await ensureInit()
  await db.execute({
    sql: 'INSERT INTO assignment_log (lead_row, phone, from_agent, to_agent, assigned_by) VALUES (?, ?, ?, ?, ?)',
    args: [data.lead_row, data.phone || '', data.from_agent, data.to_agent, data.assigned_by],
  })
}

export async function getAssignmentHistory(leadRow: number) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT * FROM assignment_log WHERE lead_row = ? ORDER BY created_at DESC',
    args: [leadRow],
  })
  return serializeRows(result.rows)
}

// --- Lead Edits Audit Log ---

export async function insertLeadEdit(opts: {
  lead_row: number
  phone: string
  field_name: string
  old_value: string
  new_value: string
  changed_by: string
  changed_by_id: string
}): Promise<void> {
  try {
    const db = await ensureInit()
    await db.execute({
      sql: `INSERT INTO lead_edits (lead_row, phone, field_name, old_value, new_value, changed_by, changed_by_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        opts.lead_row,
        opts.phone ? normalizePhone(opts.phone) : '',
        opts.field_name,
        opts.old_value ?? '',
        opts.new_value ?? '',
        opts.changed_by,
        opts.changed_by_id,
      ],
    })
  } catch (err) {
    // Audit logging must never break the main flow
    console.error('[insertLeadEdit] non-critical:', err)
  }
}

export async function getLeadEdits(leadRow: number, limit = 50) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM lead_edits WHERE lead_row = ? ORDER BY created_at DESC LIMIT ?`,
    args: [leadRow, limit],
  })
  return serializeRows(result.rows)
}

export async function getRecentLeadEdits(days: number, filters?: { changed_by_id?: string; field_name?: string }) {
  const db = await ensureInit()
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 19)
  const conditions: string[] = ['created_at >= ?']
  const args: (string | number)[] = [cutoff]

  if (filters?.changed_by_id) {
    conditions.push('changed_by_id = ?')
    args.push(filters.changed_by_id)
  }
  if (filters?.field_name) {
    conditions.push('field_name = ?')
    args.push(filters.field_name)
  }

  const result = await db.execute({
    sql: `SELECT * FROM lead_edits WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 500`,
    args,
  })
  return serializeRows(result.rows)
}

// --- Voice Agent Call operations ---

export async function insertVoiceAgentCall(data: {
  phone: string
  lead_id?: string
  call_sid?: string
  status?: string
  duration_seconds?: number
  interest_level?: string
  preferred_city?: string
  callback_time?: string
  questions?: string
  summary?: string
  transcript?: string
}) {
  const db = await ensureInit()
  data.phone = normalizePhone(data.phone)
  const result = await db.execute({
    sql: `INSERT INTO voice_agent_calls (phone, lead_id, call_sid, status, duration_seconds, interest_level, preferred_city, callback_time, questions, summary, transcript)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      data.phone,
      data.lead_id || '',
      data.call_sid || '',
      data.status || 'initiated',
      data.duration_seconds || 0,
      data.interest_level || '',
      data.preferred_city || '',
      data.callback_time || '',
      data.questions || '',
      data.summary || '',
      data.transcript || '',
    ],
  })
  return Number(result.lastInsertRowid)
}

export async function updateVoiceAgentCall(callSid: string, data: {
  status?: string
  duration_seconds?: number
  interest_level?: string
  preferred_city?: string
  callback_time?: string
  questions?: string
  summary?: string
  transcript?: string
}) {
  const db = await ensureInit()
  const updates: string[] = []
  const values: (string | number | null)[] = []
  if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status) }
  if (data.duration_seconds !== undefined) { updates.push('duration_seconds = ?'); values.push(data.duration_seconds) }
  if (data.interest_level !== undefined) { updates.push('interest_level = ?'); values.push(data.interest_level) }
  if (data.preferred_city !== undefined) { updates.push('preferred_city = ?'); values.push(data.preferred_city) }
  if (data.callback_time !== undefined) { updates.push('callback_time = ?'); values.push(data.callback_time) }
  if (data.questions !== undefined) { updates.push('questions = ?'); values.push(data.questions) }
  if (data.summary !== undefined) { updates.push('summary = ?'); values.push(data.summary) }
  if (data.transcript !== undefined) { updates.push('transcript = ?'); values.push(data.transcript) }
  if (updates.length > 0) {
    values.push(callSid)
    await db.execute({ sql: `UPDATE voice_agent_calls SET ${updates.join(', ')} WHERE call_sid = ?`, args: values })
  }
}

export async function getVoiceAgentCalls(phone: string) {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  const result = await db.execute({
    sql: 'SELECT * FROM voice_agent_calls WHERE phone = ? OR phone = ? ORDER BY created_at DESC',
    args: [norm, phone],
  })
  return serializeRows(result.rows)
}

export async function getVoiceAgentCallBySid(callSid: string) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT * FROM voice_agent_calls WHERE call_sid = ? LIMIT 1',
    args: [callSid],
  })
  return result.rows[0] ? serializeRow(result.rows[0]) : null
}

// --- Phones that received a given template but the latest delivery was failed ---
// Used to retry only the leads where Meta dropped delivery for a campaign batch.
export async function getFailedPhonesForTemplate(templateName: string): Promise<Set<string>> {
  try {
    const db = await ensureInit()
    // For each phone that has any row with this template, take the latest one.
    // If that latest row is status='failed', include it.
    const result = await db.execute({
      sql: `
        SELECT phone, status FROM messages m1
        WHERE template_used = ?
          AND timestamp = (
            SELECT MAX(timestamp) FROM messages m2
            WHERE m2.phone = m1.phone AND m2.template_used = ?
          )
      `,
      args: [templateName, templateName],
    })
    return new Set(
      result.rows
        .filter(r => String(r.status) === 'failed')
        .map(r => normalizePhone(String(r.phone))),
    )
  } catch (err) {
    console.error('[getFailedPhonesForTemplate] non-critical:', err)
    return new Set()
  }
}

// --- Opted-out lookup (used to exclude leads who tapped Not Interested) ---
// Defensive: if the opted_out column is missing on an older DB schema, return
// an empty set rather than throw — never block the leads route over this.
export async function getOptedOutPhones(): Promise<Set<string>> {
  try {
    const db = await ensureInit()
    const result = await db.execute('SELECT phone FROM drip_state WHERE opted_out = 1')
    return new Set(result.rows.map(r => normalizePhone(String(r.phone))))
  } catch (err) {
    console.error('[getOptedOutPhones] non-critical:', err)
    return new Set()
  }
}

// --- Settings operations ---

export async function getSetting(key: string): Promise<string | null> {
  const db = await ensureInit()
  const result = await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] })
  return result.rows[0] ? String(result.rows[0].value) : null
}

export async function setSetting(key: string, value: string) {
  const db = await ensureInit()
  await db.execute({
    sql: `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`,
    args: [key, value, value],
  })
}

// --- SLA Metrics operations ---

export async function recordFirstResponse(phone: string, leadCreatedAt: string) {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  const now = new Date()
  const created = new Date(leadCreatedAt)
  const diffSeconds = Math.max(0, Math.round((now.getTime() - created.getTime()) / 1000))

  // Only insert if no first_response_at exists yet
  const existing = await db.execute({ sql: 'SELECT first_response_at FROM sla_metrics WHERE phone = ?', args: [norm] })
  if (existing.rows.length > 0 && existing.rows[0].first_response_at) return // Already recorded

  await db.execute({
    sql: `INSERT INTO sla_metrics (phone, lead_created_at, first_response_at, first_response_seconds)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(phone) DO UPDATE SET
            first_response_at = CASE WHEN first_response_at IS NULL THEN ? ELSE first_response_at END,
            first_response_seconds = CASE WHEN first_response_at IS NULL THEN ? ELSE first_response_seconds END`,
    args: [norm, leadCreatedAt, now.toISOString(), diffSeconds, now.toISOString(), diffSeconds],
  })
}

export async function recordLeadClose(phone: string, status: string) {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  const now = new Date()

  // Get lead_created_at from existing record or skip
  const existing = await db.execute({ sql: 'SELECT lead_created_at FROM sla_metrics WHERE phone = ?', args: [norm] })
  const createdAt = existing.rows.length > 0 ? String(existing.rows[0].lead_created_at || '') : ''
  const diffSeconds = createdAt ? Math.max(0, Math.round((now.getTime() - new Date(createdAt).getTime()) / 1000)) : 0

  await db.execute({
    sql: `INSERT INTO sla_metrics (phone, closed_at, time_to_close_seconds, closed_status)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(phone) DO UPDATE SET
            closed_at = ?, time_to_close_seconds = ?, closed_status = ?`,
    args: [norm, now.toISOString(), diffSeconds, status, now.toISOString(), diffSeconds, status],
  })
}

export async function getSlaForAgentPhones(phones: string[]): Promise<Record<string, unknown>[]> {
  const db = await ensureInit()
  if (phones.length === 0) return []
  const placeholders = phones.map(() => '?').join(',')
  const normalized = phones.map(normalizePhone)
  const result = await db.execute({
    sql: `SELECT * FROM sla_metrics WHERE phone IN (${placeholders})`,
    args: normalized,
  })
  return result.rows.map(serializeRow)
}

export async function getSlaAverages(): Promise<{ avg_first_response_hours: number; avg_close_days: number; total: number }> {
  const db = await ensureInit()
  const result = await db.execute(`
    SELECT
      AVG(first_response_seconds) as avg_response,
      AVG(time_to_close_seconds) as avg_close,
      COUNT(*) as total
    FROM sla_metrics WHERE first_response_seconds IS NOT NULL
  `)
  const row = result.rows[0]
  return {
    avg_first_response_hours: row?.avg_response ? Math.round(Number(row.avg_response) / 3600 * 10) / 10 : 0,
    avg_close_days: row?.avg_close ? Math.round(Number(row.avg_close) / 86400 * 10) / 10 : 0,
    total: Number(row?.total || 0),
  }
}

// --- Drip Sequences CRUD ---

export async function getDripSequences(): Promise<Record<string, unknown>[]> {
  const db = await ensureInit()
  const result = await db.execute('SELECT * FROM drip_sequences ORDER BY priority_band, created_at')
  return result.rows.map(serializeRow)
}

export async function upsertDripSequence(data: { id: string; name: string; priority_band: string; steps: string; active?: boolean }) {
  const db = await ensureInit()
  await db.execute({
    sql: `INSERT INTO drip_sequences (id, name, priority_band, steps, active, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            name = ?, priority_band = ?, steps = ?, active = ?, updated_at = datetime('now')`,
    args: [data.id, data.name, data.priority_band, data.steps, data.active !== false ? 1 : 0,
           data.name, data.priority_band, data.steps, data.active !== false ? 1 : 0],
  })
}

export async function deleteDripSequence(id: string) {
  const db = await ensureInit()
  await db.execute({ sql: 'DELETE FROM drip_sequences WHERE id = ?', args: [id] })
}

// --- Meta Ads Snapshot Cache ---

export async function getMetaAdsSnapshot(type: string = 'full'): Promise<{ data: unknown; fetched_at: string } | null> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT data, fetched_at FROM meta_ads_snapshots WHERE snapshot_type = ?',
    args: [type],
  })
  if (result.rows.length === 0) return null
  const row = result.rows[0]
  try {
    return {
      data: JSON.parse(String(row.data || 'null')),
      fetched_at: String(row.fetched_at || ''),
    }
  } catch {
    return null
  }
}

export async function setMetaAdsSnapshot(type: string, data: unknown) {
  const db = await ensureInit()
  const json = JSON.stringify(data)
  const now = new Date().toISOString()
  await db.execute({
    sql: `INSERT INTO meta_ads_snapshots (snapshot_type, data, fetched_at)
          VALUES (?, ?, ?)
          ON CONFLICT(snapshot_type) DO UPDATE SET data = ?, fetched_at = ?`,
    args: [type, json, now, json, now],
  })
}

// --- Agreements CRUD ---

export async function insertAgreement(data: {
  id: string
  lead_phone: string
  lead_row?: number
  doc_type: 'FBA' | 'FRANCHISE_AGREEMENT'
  fields: Record<string, string>
  generated_by?: string
}) {
  const db = await ensureInit()
  await db.execute({
    sql: `INSERT INTO agreements (id, lead_phone, lead_row, doc_type, status, fields, generated_by, created_at)
          VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, datetime('now'))`,
    args: [data.id, normalizePhone(data.lead_phone), data.lead_row || null, data.doc_type, JSON.stringify(data.fields), data.generated_by || ''],
  })
}

export async function getAgreementsForLead(phone: string): Promise<Record<string, unknown>[]> {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  const result = await db.execute({
    sql: 'SELECT * FROM agreements WHERE lead_phone = ? ORDER BY created_at DESC',
    args: [norm],
  })
  return result.rows.map(serializeRow)
}

export async function getAgreementById(id: string): Promise<Record<string, unknown> | null> {
  const db = await ensureInit()
  const result = await db.execute({ sql: 'SELECT * FROM agreements WHERE id = ?', args: [id] })
  return result.rows.length > 0 ? serializeRow(result.rows[0]) : null
}

export async function updateAgreement(id: string, updates: Record<string, unknown>) {
  const db = await ensureInit()
  const fields: string[] = []
  const values: (string | number | null)[] = []
  for (const [k, v] of Object.entries(updates)) {
    if (['status', 'fields', 'pdf_data', 'generated_by', 'generated_at', 'reviewed_by', 'reviewed_at'].includes(k)) {
      fields.push(`${k} = ?`)
      const val = k === 'fields' && typeof v === 'object' ? JSON.stringify(v) : v
      values.push(val == null ? null : String(val))
    }
  }
  if (fields.length === 0) return
  values.push(id)
  await db.execute({ sql: `UPDATE agreements SET ${fields.join(', ')} WHERE id = ?`, args: values })
}

export async function getAllAgreements(): Promise<Record<string, unknown>[]> {
  const db = await ensureInit()
  const result = await db.execute('SELECT * FROM agreements ORDER BY created_at DESC')
  return result.rows.map(serializeRow)
}

// ─── Push Subscriptions (Wave C) ─────────────────────────────────────────

export interface PushSubscriptionRow {
  id: number
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string
  created_at: string
  last_used_at: string | null
}

export async function upsertPushSubscription(input: {
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent?: string
}): Promise<void> {
  const db = await ensureInit()
  await db.execute({
    sql: `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET
            user_id = excluded.user_id,
            p256dh = excluded.p256dh,
            auth = excluded.auth,
            user_agent = excluded.user_agent,
            last_used_at = datetime('now')`,
    args: [input.user_id, input.endpoint, input.p256dh, input.auth, input.user_agent ?? ''],
  })
}

export async function deletePushSubscription(endpoint: string, userId?: string): Promise<void> {
  const db = await ensureInit()
  if (userId) {
    await db.execute({ sql: 'DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', args: [endpoint, userId] })
  } else {
    await db.execute({ sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?', args: [endpoint] })
  }
}

export async function getPushSubscriptionsForUser(userId: string): Promise<PushSubscriptionRow[]> {
  const db = await ensureInit()
  const r = await db.execute({ sql: 'SELECT * FROM push_subscriptions WHERE user_id = ?', args: [userId] })
  return r.rows.map(row => ({
    id: Number(row.id),
    user_id: String(row.user_id),
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
    user_agent: String(row.user_agent || ''),
    created_at: String(row.created_at),
    last_used_at: row.last_used_at ? String(row.last_used_at) : null,
  }))
}

export async function touchPushSubscription(endpoint: string): Promise<void> {
  const db = await ensureInit()
  await db.execute({ sql: "UPDATE push_subscriptions SET last_used_at = datetime('now') WHERE endpoint = ?", args: [endpoint] })
}

// --- Admin cross-lead activity helpers ---

export async function getStatusChangesForAllLeads(days: number, filters?: { changed_by_id?: string }) {
  const db = await ensureInit()
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 19)
  const conditions: string[] = ['created_at >= ?']
  const args: (string | number)[] = [cutoff]

  if (filters?.changed_by_id) {
    conditions.push('changed_by_id = ?')
    args.push(filters.changed_by_id)
  }

  const result = await db.execute({
    sql: `SELECT * FROM lead_status_changes WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 500`,
    args,
  })
  return serializeRows(result.rows)
}

export async function getAssignmentHistoryRecent(days: number, filters?: { assigned_by_id?: string }) {
  const db = await ensureInit()
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 19)
  const conditions: string[] = ['created_at >= ?']
  const args: (string | number)[] = [cutoff]

  // assignment_log stores assigned_by as name, not id — filter by name not possible without join
  // agent_id filter skipped here; admin UI filters by name via the edits/status tables
  void filters // suppress unused warning

  const result = await db.execute({
    sql: `SELECT * FROM assignment_log WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 500`,
    args,
  })
  return serializeRows(result.rows)
}

// --- Lead Delegation helpers ---

function rowToDelegation(row: Record<string, unknown>): Delegation {
  return {
    id: Number(row.id),
    lead_row: Number(row.lead_row),
    phone: String(row.phone || ''),
    from_agent_id: String(row.from_agent_id || ''),
    from_agent_name: String(row.from_agent_name || ''),
    to_agent_id: String(row.to_agent_id || ''),
    to_agent_name: String(row.to_agent_name || ''),
    status: String(row.status || 'pending') as Delegation['status'],
    message: String(row.message || ''),
    expires_at: row.expires_at ? String(row.expires_at) : null,
    created_at: String(row.created_at || ''),
    responded_at: row.responded_at ? String(row.responded_at) : null,
    ended_at: row.ended_at ? String(row.ended_at) : null,
    ended_by: String(row.ended_by || ''),
  }
}

export async function createDelegation(opts: {
  lead_row: number
  phone: string
  from_agent_id: string
  from_agent_name: string
  to_agent_id: string
  to_agent_name: string
  message?: string
  expires_at?: string
  auto_accept?: boolean
}): Promise<Delegation> {
  const db = await ensureInit()
  const status = opts.auto_accept ? 'active' : 'pending'
  const result = await db.execute({
    sql: `INSERT INTO lead_delegations
            (lead_row, phone, from_agent_id, from_agent_name, to_agent_id, to_agent_name, status, message, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      opts.lead_row,
      opts.phone || '',
      opts.from_agent_id,
      opts.from_agent_name,
      opts.to_agent_id,
      opts.to_agent_name,
      status,
      opts.message || '',
      opts.expires_at || null,
    ],
  })
  const id = Number(result.lastInsertRowid)
  const row = await db.execute({ sql: 'SELECT * FROM lead_delegations WHERE id = ?', args: [id] })
  return rowToDelegation(serializeRow(row.rows[0]))
}

export async function getPendingDelegationsFor(to_agent_id: string): Promise<Delegation[]> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM lead_delegations WHERE to_agent_id = ? AND status = 'pending' ORDER BY created_at DESC`,
    args: [to_agent_id],
  })
  return serializeRows(result.rows).map(rowToDelegation)
}

export async function getActiveDelegationsFor(to_agent_id: string): Promise<Delegation[]> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM lead_delegations WHERE to_agent_id = ? AND status = 'active' ORDER BY created_at DESC`,
    args: [to_agent_id],
  })
  return serializeRows(result.rows).map(rowToDelegation)
}

export async function getActiveDelegationForLead(lead_row: number): Promise<Delegation | null> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM lead_delegations WHERE lead_row = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    args: [lead_row],
  })
  if (result.rows.length === 0) return null
  return rowToDelegation(serializeRow(result.rows[0]))
}

export async function getDelegationsForLead(lead_row: number): Promise<Delegation[]> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM lead_delegations WHERE lead_row = ? ORDER BY created_at ASC`,
    args: [lead_row],
  })
  return serializeRows(result.rows).map(rowToDelegation)
}

export async function respondToDelegation(
  id: number,
  action: 'accept' | 'decline',
  responder_id: string,
): Promise<void> {
  const db = await ensureInit()
  const existing = await db.execute({ sql: 'SELECT * FROM lead_delegations WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) throw new Error('Delegation not found')
  const row = serializeRow(existing.rows[0])
  if (String(row.to_agent_id) !== responder_id) throw new Error('Not authorized to respond to this delegation')
  const newStatus = action === 'accept' ? 'active' : 'declined'
  await db.execute({
    sql: `UPDATE lead_delegations SET status = ?, responded_at = datetime('now') WHERE id = ?`,
    args: [newStatus, id],
  })
}

export async function endDelegation(id: number, ended_by_id: string): Promise<void> {
  const db = await ensureInit()
  await db.execute({
    sql: `UPDATE lead_delegations SET status = 'ended', ended_at = datetime('now'), ended_by = ? WHERE id = ?`,
    args: [ended_by_id, id],
  })
}

export async function bulkCreateDelegations(opts: {
  lead_rows: number[]
  from_agent_id: string
  from_agent_name: string
  to_agent_id: string
  to_agent_name: string
  expires_at?: string
  admin_id: string
}): Promise<{ count: number; ids: number[] }> {
  const db = await ensureInit()
  const ids: number[] = []
  for (const lead_row of opts.lead_rows) {
    // Get lead phone from contacts (best-effort)
    let phone = ''
    try {
      const c = await db.execute({ sql: 'SELECT phone FROM contacts WHERE lead_row = ? LIMIT 1', args: [lead_row] })
      if (c.rows.length > 0) phone = String(c.rows[0].phone || '')
    } catch { /* phone not critical */ }

    const result = await db.execute({
      sql: `INSERT INTO lead_delegations
              (lead_row, phone, from_agent_id, from_agent_name, to_agent_id, to_agent_name, status, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      args: [
        lead_row,
        phone,
        opts.from_agent_id,
        opts.from_agent_name,
        opts.to_agent_id,
        opts.to_agent_name,
        opts.expires_at || null,
      ],
    })
    ids.push(Number(result.lastInsertRowid))
  }
  return { count: ids.length, ids }
}

export async function getExpiredActiveDelegations(): Promise<Delegation[]> {
  const db = await ensureInit()
  const result = await db.execute(
    `SELECT * FROM lead_delegations WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < datetime('now')`
  )
  return serializeRows(result.rows).map(rowToDelegation)
}

export async function getDelegationById(id: number): Promise<Delegation | null> {
  const db = await ensureInit()
  const result = await db.execute({ sql: 'SELECT * FROM lead_delegations WHERE id = ?', args: [id] })
  if (result.rows.length === 0) return null
  return rowToDelegation(serializeRow(result.rows[0]))
}

// ─── Payment Followup operations ─────────────────────────────────────────────

function rowToFollowup(row: Record<string, unknown>): PaymentFollowup {
  return {
    id: Number(row.id),
    lead_row: row.lead_row != null ? Number(row.lead_row) : null,
    phone: String(row.phone ?? ''),
    franchise_name: String(row.franchise_name ?? ''),
    amount: Number(row.amount ?? 0),
    currency: String(row.currency ?? '₹'),
    due_date: row.due_date != null ? String(row.due_date) : null,
    assigned_to_id: String(row.assigned_to_id ?? ''),
    assigned_to_name: String(row.assigned_to_name ?? ''),
    created_by_id: String(row.created_by_id ?? ''),
    created_by_name: String(row.created_by_name ?? ''),
    status: String(row.status ?? 'pending') as PaymentFollowupStatus,
    reason: String(row.reason ?? ''),
    cleared_at: row.cleared_at != null ? String(row.cleared_at) : null,
    cleared_by_id: String(row.cleared_by_id ?? ''),
    cleared_amount: Number(row.cleared_amount ?? 0),
    notes: String(row.notes ?? ''),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function rowToFollowupUpdate(row: Record<string, unknown>): PaymentFollowupUpdate {
  return {
    id: Number(row.id),
    followup_id: Number(row.followup_id),
    old_status: String(row.old_status ?? ''),
    new_status: String(row.new_status ?? ''),
    reason: String(row.reason ?? ''),
    amount_change: Number(row.amount_change ?? 0),
    note: String(row.note ?? ''),
    updated_by_id: String(row.updated_by_id ?? ''),
    updated_by_name: String(row.updated_by_name ?? ''),
    created_at: String(row.created_at ?? ''),
  }
}

export async function createPaymentFollowup(data: {
  lead_row?: number | null
  phone?: string
  franchise_name: string
  amount?: number
  currency?: string
  due_date?: string | null
  assigned_to_id: string
  assigned_to_name: string
  created_by_id: string
  created_by_name: string
  notes?: string
}): Promise<PaymentFollowup> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `INSERT INTO payment_followups
            (lead_row, phone, franchise_name, amount, currency, due_date, assigned_to_id, assigned_to_name,
             created_by_id, created_by_name, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      data.lead_row ?? null,
      data.phone || '',
      data.franchise_name,
      data.amount ?? 0,
      data.currency ?? '₹',
      data.due_date ?? null,
      data.assigned_to_id,
      data.assigned_to_name,
      data.created_by_id,
      data.created_by_name,
      data.notes || '',
    ],
  })
  const id = Number(result.lastInsertRowid)
  const row = await db.execute({ sql: 'SELECT * FROM payment_followups WHERE id = ?', args: [id] })
  return rowToFollowup(serializeRow(row.rows[0]))
}

export async function updatePaymentFollowup(
  id: number,
  updates: Partial<Pick<PaymentFollowup, 'franchise_name' | 'amount' | 'currency' | 'due_date' | 'assigned_to_id' | 'assigned_to_name' | 'status' | 'reason' | 'cleared_at' | 'cleared_by_id' | 'cleared_amount' | 'notes'>>,
  updated_by: { id: string; name: string },
): Promise<PaymentFollowup> {
  const db = await ensureInit()

  // Fetch current row for status diff
  const existing = await db.execute({ sql: 'SELECT * FROM payment_followups WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) throw new Error('Payment followup not found')
  const current = rowToFollowup(serializeRow(existing.rows[0]))

  const setClauses: string[] = ["updated_at = datetime('now')"]
  const values: (string | number | null)[] = []

  if (updates.franchise_name !== undefined) { setClauses.push('franchise_name = ?'); values.push(updates.franchise_name) }
  if (updates.amount !== undefined) { setClauses.push('amount = ?'); values.push(updates.amount) }
  if (updates.currency !== undefined) { setClauses.push('currency = ?'); values.push(updates.currency) }
  if (updates.due_date !== undefined) { setClauses.push('due_date = ?'); values.push(updates.due_date ?? null) }
  if (updates.assigned_to_id !== undefined) { setClauses.push('assigned_to_id = ?'); values.push(updates.assigned_to_id) }
  if (updates.assigned_to_name !== undefined) { setClauses.push('assigned_to_name = ?'); values.push(updates.assigned_to_name) }
  if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status) }
  if (updates.reason !== undefined) { setClauses.push('reason = ?'); values.push(updates.reason) }
  if (updates.cleared_at !== undefined) { setClauses.push('cleared_at = ?'); values.push(updates.cleared_at ?? null) }
  if (updates.cleared_by_id !== undefined) { setClauses.push('cleared_by_id = ?'); values.push(updates.cleared_by_id) }
  if (updates.cleared_amount !== undefined) { setClauses.push('cleared_amount = ?'); values.push(updates.cleared_amount) }
  if (updates.notes !== undefined) { setClauses.push('notes = ?'); values.push(updates.notes) }

  values.push(id)
  await db.execute({
    sql: `UPDATE payment_followups SET ${setClauses.join(', ')} WHERE id = ?`,
    args: values,
  })

  // If status changed, log it
  if (updates.status !== undefined && updates.status !== current.status) {
    const amountChange = updates.cleared_amount !== undefined ? updates.cleared_amount - current.cleared_amount : 0
    await db.execute({
      sql: `INSERT INTO payment_followup_updates
              (followup_id, old_status, new_status, reason, amount_change, note, updated_by_id, updated_by_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        current.status,
        updates.status,
        updates.reason ?? '',
        amountChange,
        updates.notes ?? '',
        updated_by.id,
        updated_by.name,
      ],
    })
  }

  const updated = await db.execute({ sql: 'SELECT * FROM payment_followups WHERE id = ?', args: [id] })
  return rowToFollowup(serializeRow(updated.rows[0]))
}

export async function getPaymentFollowupsForAgent(
  agent_id: string,
  opts?: { status?: string; includeCleared?: boolean },
): Promise<PaymentFollowup[]> {
  const db = await ensureInit()
  const conditions: string[] = ['assigned_to_id = ?']
  const args: (string | number)[] = [agent_id]

  if (!opts?.includeCleared) {
    conditions.push("status != 'cleared'")
  }
  if (opts?.status) {
    conditions.push('status = ?')
    args.push(opts.status)
  }

  const result = await db.execute({
    sql: `SELECT * FROM payment_followups WHERE ${conditions.join(' AND ')}
          ORDER BY
            CASE WHEN status IN ('pending','in_progress') THEN 0 ELSE 1 END ASC,
            due_date ASC NULLS LAST,
            created_at DESC`,
    args,
  })
  return serializeRows(result.rows).map(rowToFollowup)
}

export async function getAllPaymentFollowups(opts?: {
  status?: string
  agent_id?: string
  days?: number
}): Promise<PaymentFollowup[]> {
  const db = await ensureInit()
  const conditions: string[] = []
  const args: (string | number)[] = []

  if (opts?.status) {
    conditions.push('status = ?')
    args.push(opts.status)
  }
  if (opts?.agent_id) {
    conditions.push('assigned_to_id = ?')
    args.push(opts.agent_id)
  }
  if (opts?.days) {
    const cutoff = new Date(Date.now() - opts.days * 86400_000).toISOString().slice(0, 19)
    conditions.push('created_at >= ?')
    args.push(cutoff)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const result = await db.execute({
    sql: `SELECT * FROM payment_followups ${where}
          ORDER BY
            CASE WHEN status IN ('pending','in_progress') THEN 0 ELSE 1 END ASC,
            due_date ASC NULLS LAST,
            created_at DESC`,
    args,
  })
  return serializeRows(result.rows).map(rowToFollowup)
}

export async function getPaymentFollowup(id: number): Promise<PaymentFollowup | null> {
  const db = await ensureInit()
  const result = await db.execute({ sql: 'SELECT * FROM payment_followups WHERE id = ?', args: [id] })
  if (result.rows.length === 0) return null
  return rowToFollowup(serializeRow(result.rows[0]))
}

export async function getPaymentFollowupUpdates(followup_id: number): Promise<PaymentFollowupUpdate[]> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT * FROM payment_followup_updates WHERE followup_id = ? ORDER BY created_at ASC',
    args: [followup_id],
  })
  return serializeRows(result.rows).map(rowToFollowupUpdate)
}

export async function deletePaymentFollowup(id: number): Promise<void> {
  const db = await ensureInit()
  await db.execute({ sql: 'DELETE FROM payment_followups WHERE id = ?', args: [id] })
}

export async function getPaymentFollowupsForLead(lead_row: number): Promise<PaymentFollowup[]> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT * FROM payment_followups WHERE lead_row = ? ORDER BY created_at DESC',
    args: [lead_row],
  })
  return serializeRows(result.rows).map(rowToFollowup)
}
