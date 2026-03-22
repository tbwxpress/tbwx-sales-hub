import { createClient, type Client } from '@libsql/client'

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
    `)
    _initialized = true
  }
  return db
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
  return result.rows
}

export async function getContact(phone: string) {
  const db = await ensureInit()
  const result = await db.execute({ sql: 'SELECT * FROM contacts WHERE phone = ?', args: [phone] })
  return result.rows[0] || null
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

  return result.lastInsertRowid
}

export async function getMessages(phone: string, limit = 100, offset = 0) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM messages WHERE phone = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?`,
    args: [phone, limit, offset],
  })
  return result.rows
}

export async function markMessagesRead(phone: string) {
  const db = await ensureInit()
  await db.execute({
    sql: "UPDATE messages SET read = 1 WHERE phone = ? AND read = 0 AND direction = 'received'",
    args: [phone],
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
  return result.rows
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
  const result = await db.execute({
    sql: `INSERT INTO call_logs (phone, duration, outcome, notes, logged_by) VALUES (?, ?, ?, ?, ?)`,
    args: [data.phone, data.duration || '', data.outcome || '', data.notes || '', data.logged_by || ''],
  })
  return result.lastInsertRowid
}

export async function getCallLogs(phone: string) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT * FROM call_logs WHERE phone = ? ORDER BY created_at DESC',
    args: [phone],
  })
  return result.rows
}

// --- Lead notes ---

export async function insertNote(data: { phone: string; note: string; created_by?: string }) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'INSERT INTO lead_notes (phone, note, created_by) VALUES (?, ?, ?)',
    args: [data.phone, data.note, data.created_by || ''],
  })
  return result.lastInsertRowid
}

export async function getNotes(phone: string) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT * FROM lead_notes WHERE phone = ? ORDER BY created_at DESC',
    args: [phone],
  })
  return result.rows
}

// --- Tasks/Reminders ---

export async function insertTask(data: { phone?: string; title: string; due_at: string; created_by?: string }) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'INSERT INTO tasks (phone, title, due_at, created_by) VALUES (?, ?, ?, ?)',
    args: [data.phone || null, data.title, data.due_at, data.created_by || ''],
  })
  return result.lastInsertRowid
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
  return result.rows
}

export async function completeTask(id: number) {
  const db = await ensureInit()
  await db.execute({
    sql: "UPDATE tasks SET completed = 1, completed_at = datetime('now') WHERE id = ?",
    args: [id],
  })
}
