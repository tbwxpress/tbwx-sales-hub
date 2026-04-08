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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `)
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
  }
}

export async function createUser(user: Omit<User, 'id'>): Promise<string> {
  await ensureTable()
  const db = getClient()
  const id = `u_${Date.now()}`
  await db.execute({
    sql: `INSERT INTO users (id, name, email, password_hash, role, can_assign, active)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      user.name,
      user.email,
      user.password_hash,
      user.role,
      user.can_assign ? 1 : 0,
      user.active ? 1 : 0,
    ],
  })
  return id
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

  if (updates.length === 0) return

  updates.push("updated_at = datetime('now')")
  values.push(userId)

  await db.execute({
    sql: `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
    args: values,
  })
}
