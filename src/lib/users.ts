/**
 * User management — backed by Turso/SQLite DB (not Google Sheets).
 * Replaces the old sheets-based user storage for security.
 */

import fs from 'fs'
import path from 'path'
import { createClient, type Client } from '@libsql/client'
import type { User } from './types'

// Re-use the same DB connection logic from db.ts
const dbUrl = process.env.TURSO_DATABASE_URL || 'file:data/inbox.db'
const authToken = process.env.TURSO_AUTH_TOKEN || undefined

let _db: Client | null = null
let _tableReady = false

function getClient(): Client {
  if (!_db) {
    if (dbUrl.startsWith('file:')) {
      const filePath = dbUrl.replace('file:', '')
      const dir = path.dirname(path.resolve(process.cwd(), filePath))
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    }
    _db = createClient({ url: dbUrl, authToken })
  }
  return _db
}

async function ensureTable(): Promise<void> {
  if (_tableReady) return
  const db = getClient()
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'agent' CHECK(role IN ('admin', 'agent')),
      can_assign INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      in_lead_pool INTEGER NOT NULL DEFAULT 0,
      is_closer INTEGER NOT NULL DEFAULT 0,
      is_telecaller INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `)

  // Idempotent column migrations for upgrades from older schemas.
  const cols = await db.execute('PRAGMA table_info(users)')
  const colNames = new Set(cols.rows.map(r => String(r.name)))
  if (!colNames.has('in_lead_pool')) {
    await db.execute('ALTER TABLE users ADD COLUMN in_lead_pool INTEGER NOT NULL DEFAULT 0')
  }
  if (!colNames.has('is_closer')) {
    await db.execute('ALTER TABLE users ADD COLUMN is_closer INTEGER NOT NULL DEFAULT 0')
  }
  if (!colNames.has('is_telecaller')) {
    await db.execute('ALTER TABLE users ADD COLUMN is_telecaller INTEGER NOT NULL DEFAULT 0')
  }

  _tableReady = true
}

export async function getUsers(): Promise<User[]> {
  await ensureTable()
  const db = getClient()
  const result = await db.execute('SELECT * FROM users ORDER BY created_at ASC')
  return result.rows.map(row => ({
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    password_hash: String(row.password_hash),
    role: String(row.role) as User['role'],
    can_assign: Boolean(row.can_assign),
    active: Boolean(row.active),
    in_lead_pool: Boolean(row.in_lead_pool),
    is_closer: Boolean(row.is_closer),
    is_telecaller: Boolean(row.is_telecaller),
  }))
}

export async function getUserByEmail(email: string): Promise<User | null> {
  await ensureTable()
  const db = getClient()
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE LOWER(email) = LOWER(?)',
    args: [email],
  })
  if (result.rows.length === 0) return null
  const row = result.rows[0]
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    password_hash: String(row.password_hash),
    role: String(row.role) as User['role'],
    can_assign: Boolean(row.can_assign),
    active: Boolean(row.active),
    in_lead_pool: Boolean(row.in_lead_pool),
    is_closer: Boolean(row.is_closer),
    is_telecaller: Boolean(row.is_telecaller),
  }
}

export async function createUser(user: Omit<User, 'id'>): Promise<string> {
  await ensureTable()
  const db = getClient()
  const id = `u_${Date.now()}`
  await db.execute({
    sql: `INSERT INTO users (id, name, email, password_hash, role, can_assign, active, in_lead_pool, is_closer, is_telecaller)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      user.name,
      user.email,
      user.password_hash,
      user.role,
      user.can_assign ? 1 : 0,
      user.active ? 1 : 0,
      user.in_lead_pool ? 1 : 0,
      user.is_closer ? 1 : 0,
      user.is_telecaller ? 1 : 0,
    ],
  })
  return id
}

export async function getUserById(userId: string): Promise<User | null> {
  await ensureTable()
  const db = getClient()
  const r = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [userId] })
  if (r.rows.length === 0) return null
  const row = r.rows[0]
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    password_hash: String(row.password_hash),
    role: String(row.role) as User['role'],
    can_assign: Boolean(row.can_assign),
    active: Boolean(row.active),
    in_lead_pool: Boolean(row.in_lead_pool),
    is_closer: Boolean(row.is_closer),
    is_telecaller: Boolean(row.is_telecaller),
  }
}

export async function deleteUser(userId: string): Promise<void> {
  await ensureTable()
  const db = getClient()
  await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [userId] })
}

export async function countAdmins(): Promise<number> {
  await ensureTable()
  const db = getClient()
  const r = await db.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1")
  return Number(r.rows[0]?.n || 0)
}

export async function updateUser(userId: string, fields: Partial<User>): Promise<void> {
  const db = getClient()
  const updates: string[] = []
  const values: (string | number | null)[] = []

  if (fields.name !== undefined) { updates.push('name = ?'); values.push(fields.name) }
  if (fields.email !== undefined) { updates.push('email = ?'); values.push(fields.email) }
  if (fields.password_hash !== undefined) { updates.push('password_hash = ?'); values.push(fields.password_hash) }
  if (fields.role !== undefined) { updates.push('role = ?'); values.push(fields.role) }
  if (fields.can_assign !== undefined) { updates.push('can_assign = ?'); values.push(fields.can_assign ? 1 : 0) }
  if (fields.active !== undefined) { updates.push('active = ?'); values.push(fields.active ? 1 : 0) }
  if (fields.in_lead_pool !== undefined) { updates.push('in_lead_pool = ?'); values.push(fields.in_lead_pool ? 1 : 0) }
  if (fields.is_closer !== undefined) { updates.push('is_closer = ?'); values.push(fields.is_closer ? 1 : 0) }
  if (fields.is_telecaller !== undefined) { updates.push('is_telecaller = ?'); values.push(fields.is_telecaller ? 1 : 0) }

  if (updates.length === 0) return

  updates.push("updated_at = datetime('now')")
  values.push(userId)

  await db.execute({
    sql: `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
    args: values,
  })
}
