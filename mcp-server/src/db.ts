/**
 * Direct, read-mostly access to the SAME libsql/Turso SQLite database the
 * TBWX Sales Hub Next.js app uses.
 *
 * This file deliberately mirrors the client setup, env var names, phone
 * normalization, and write/audit SQL from `../../src/lib/db.ts` +
 * `../../src/lib/leads-db.ts` so the MCP server shares the app's config and
 * never diverges from the app's data conventions.
 *
 * We do NOT run the app's `ensureInit()` schema bootstrap here — the app owns
 * the schema. The MCP server only reads existing tables and performs a small,
 * fixed set of additive, audited writes against tables the app already created.
 */
import { createClient, type Client, type Row, type InValue } from '@libsql/client'

// Same env var names as the app (src/lib/db.ts lines 20-23) so a single .env
// shared with the app just works. Local dev falls back to the same file path.
const dbUrl = process.env.TURSO_DATABASE_URL || 'file:data/inbox.db'
const authToken = process.env.TURSO_AUTH_TOKEN || undefined

let _db: Client | null = null

export function getClient(): Client {
  if (!_db) {
    _db = createClient({ url: dbUrl, authToken })
  }
  return _db
}

export function getDbTarget(): string {
  // For diagnostics only — never logs the auth token.
  return dbUrl
}

// --- Phone normalization (verbatim from src/lib/db.ts normalizePhone) ---
// Always store/lookup phones as "91XXXXXXXXXX" (India country code + 10 digits).
export function normalizePhone(phone: string): string {
  const digits = String(phone).replace(/\D/g, '')
  const last10 = digits.slice(-10)
  if (last10.length < 10) return digits // can't normalize, return as-is
  return `91${last10}`
}

// Last 10 digits — used for cross-table joins where stored phones may be
// inconsistently prefixed (mirrors the app's `SUBSTR(phone, -10)` matching).
export function last10(phone: string): string {
  return String(phone).replace(/\D/g, '').slice(-10)
}

// Convert BigInt → Number so values are JSON-serializable (mirrors serializeRow).
export function serializeRow(row: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(row)) {
    out[key] = typeof val === 'bigint' ? Number(val) : val
  }
  return out
}

export function serializeRows(rows: Row[]): Record<string, unknown>[] {
  return rows.map(serializeRow)
}

export type SqlArg = InValue
