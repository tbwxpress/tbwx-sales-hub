import { createClient, type Client, type Row } from '@libsql/client'

// Convert BigInt values to Number so JSON.stringify works
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeRow(row: Row): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {}
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
      const fs = require('fs')
      const path = require('path')
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
    `)

    // Additive migrations (try-catch for existing DBs)
    try { await db.execute('ALTER TABLE drip_state ADD COLUMN resumed_at TEXT') } catch { /* column may already exist */ }

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

export async function getContactsForAgent(assignedPhones: string[]) {
  const db = await ensureInit()
  if (assignedPhones.length === 0) return []

  // Match contacts by last 10 digits of phone
  const conditions = assignedPhones.map(() => 'SUBSTR(c.phone, -10) = ?').join(' OR ')
  const phones10 = assignedPhones.map(p => p.replace(/\D/g, '').slice(-10))

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
      ORDER BY m.timestamp DESC NULLS LAST
    `,
    args: phones10,
  })
  return serializeRows(result.rows)
}

export async function getUnreadCountForAgent(assignedPhones: string[]) {
  const db = await ensureInit()
  if (assignedPhones.length === 0) return 0
  const conditions = assignedPhones.map(() => 'SUBSTR(phone, -10) = ?').join(' OR ')
  const phones10 = assignedPhones.map(p => p.replace(/\D/g, '').slice(-10))
  const result = await db.execute({
    sql: `SELECT COUNT(*) as count FROM messages WHERE read = 0 AND direction = 'received' AND (${conditions})`,
    args: phones10,
  })
  return Number(result.rows[0]?.count ?? 0)
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
}) {
  const db = await ensureInit()
  data.phone = normalizePhone(data.phone)

  // Check for duplicate wa_message_id
  if (data.wa_message_id) {
    const existing = await db.execute({ sql: 'SELECT id FROM messages WHERE wa_message_id = ?', args: [data.wa_message_id] })
    if (existing.rows.length > 0) return null
  }

  const result = await db.execute({
    sql: `INSERT INTO messages (phone, direction, text, timestamp, sent_by, wa_message_id, status, template_used, read)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

export async function updateMessageStatus(waMessageId: string, status: string) {
  const db = await ensureInit()
  await db.execute({
    sql: 'UPDATE messages SET status = ? WHERE wa_message_id = ?',
    args: [status, waMessageId],
  })
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
    if (updates.length > 0) {
      values.push(phone)
      await db.execute({ sql: `UPDATE drip_state SET ${updates.join(', ')} WHERE phone = ?`, args: values })
    }
  } else {
    await db.execute({
      sql: `INSERT INTO drip_state (phone, sequence, current_step, last_sent_at, enabled, paused_at, pause_reason)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        phone,
        data.sequence || '',
        data.current_step ?? 0,
        data.last_sent_at || null,
        data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
        data.paused_at || null,
        data.pause_reason || null,
      ],
    })
  }
}

export async function getDripLeads(includesPaused: boolean = false): Promise<any[]> {
  const db = await ensureInit()
  const sql = includesPaused
    ? 'SELECT * FROM drip_state WHERE enabled = 1'
    : 'SELECT * FROM drip_state WHERE enabled = 1 AND paused_at IS NULL'
  const result = await db.execute(sql)
  return serializeRows(result.rows) as any[]
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
  const map: Record<string, any> = {}
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

export async function getCallCountToday(): Promise<number> {
  const db = await ensureInit()
  const today = new Date().toISOString().split('T')[0]
  const result = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM call_logs WHERE created_at >= ?`,
    args: [today],
  })
  return Number(result.rows[0]?.cnt || 0)
}

export async function getAgentActivityToday(agentName: string): Promise<{ messages_sent: number; calls_logged: number }> {
  const db = await ensureInit()
  const today = new Date().toISOString().split('T')[0]
  const [msgs, calls] = await Promise.all([
    db.execute({ sql: `SELECT COUNT(*) as cnt FROM messages WHERE direction = 'sent' AND sent_by = ? AND timestamp >= ?`, args: [agentName, today] }),
    db.execute({ sql: `SELECT COUNT(*) as cnt FROM call_logs WHERE logged_by = ? AND created_at >= ?`, args: [agentName, today] }),
  ])
  return {
    messages_sent: Number(msgs.rows[0]?.cnt || 0),
    calls_logged: Number(calls.rows[0]?.cnt || 0),
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
