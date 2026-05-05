/**
 * Commission tracker.
 *
 * Settings:
 *   - commission.amount_per_conversion (default ₹10000)
 *   - commission.currency (default ₹)
 *
 * Pending earnings = leads where lead_status === 'CONVERTED' AND
 *   - assigned_to matches the closer's name
 *   - the lead's row_number is NOT already inside any commission_payments.lead_rows
 *
 * Mark-paid creates a row in commission_payments freezing the snapshot:
 *   { closer_user_id, period_start, period_end, lead_rows[], amount, paid, paid_at, notes }
 */

import { createClient, type Client } from '@libsql/client'
import path from 'path'
import fs from 'fs'
import { getSetting, setSetting } from './db'

const dbUrl = process.env.TURSO_DATABASE_URL || 'file:data/inbox.db'
const authToken = process.env.TURSO_AUTH_TOKEN || undefined

let _db: Client | null = null
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

export const COMMISSION_KEYS = {
  AMOUNT_PER_CONVERSION: 'commission.amount_per_conversion',
  CURRENCY: 'commission.currency',
} as const

export const COMMISSION_DEFAULTS = {
  AMOUNT_PER_CONVERSION: 10000,
  CURRENCY: '₹',
} as const

export interface CommissionSettings {
  amount_per_conversion: number
  currency: string
}

export async function getCommissionSettings(): Promise<CommissionSettings> {
  const [amt, cur] = await Promise.all([
    getSetting(COMMISSION_KEYS.AMOUNT_PER_CONVERSION),
    getSetting(COMMISSION_KEYS.CURRENCY),
  ])
  const parsed = amt ? Number(amt) : NaN
  return {
    amount_per_conversion: Number.isFinite(parsed) && parsed > 0 ? parsed : COMMISSION_DEFAULTS.AMOUNT_PER_CONVERSION,
    currency: cur || COMMISSION_DEFAULTS.CURRENCY,
  }
}

export async function setCommissionSettings(input: Partial<CommissionSettings>): Promise<void> {
  if (typeof input.amount_per_conversion === 'number' && input.amount_per_conversion > 0) {
    await setSetting(COMMISSION_KEYS.AMOUNT_PER_CONVERSION, String(input.amount_per_conversion))
  }
  if (typeof input.currency === 'string' && input.currency.trim()) {
    await setSetting(COMMISSION_KEYS.CURRENCY, input.currency.trim())
  }
}

export interface CommissionPayment {
  id: number
  closer_user_id: string
  period_start: string
  period_end: string
  lead_rows: number[]
  amount: number
  paid: boolean
  paid_at: string | null
  notes: string | null
  created_at: string
}

export async function getPaymentsByCloser(closerUserId: string): Promise<CommissionPayment[]> {
  const db = getClient()
  const r = await db.execute({
    sql: 'SELECT * FROM commission_payments WHERE closer_user_id = ? ORDER BY created_at DESC',
    args: [closerUserId],
  })
  return r.rows.map(rowToPayment)
}

export async function getAllPayments(): Promise<CommissionPayment[]> {
  const db = getClient()
  const r = await db.execute('SELECT * FROM commission_payments ORDER BY created_at DESC')
  return r.rows.map(rowToPayment)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPayment(row: any): CommissionPayment {
  let leadRows: number[] = []
  try { leadRows = JSON.parse(String(row.lead_rows || '[]')) } catch { leadRows = [] }
  return {
    id: Number(row.id),
    closer_user_id: String(row.closer_user_id),
    period_start: String(row.period_start),
    period_end: String(row.period_end),
    lead_rows: leadRows,
    amount: Number(row.amount),
    paid: Boolean(row.paid),
    paid_at: row.paid_at ? String(row.paid_at) : null,
    notes: row.notes ? String(row.notes) : null,
    created_at: String(row.created_at),
  }
}

/**
 * Returns the set of all lead row_numbers that have already been included in
 * any commission_payments record (paid or unpaid). Used to avoid double-counting
 * pending earnings.
 */
export async function getCommissionedLeadRowSet(closerUserId?: string): Promise<Set<number>> {
  const db = getClient()
  const sql = closerUserId
    ? 'SELECT lead_rows FROM commission_payments WHERE closer_user_id = ?'
    : 'SELECT lead_rows FROM commission_payments'
  const args = closerUserId ? [closerUserId] : []
  const r = await db.execute({ sql, args })
  const set = new Set<number>()
  for (const row of r.rows) {
    try {
      const arr = JSON.parse(String(row.lead_rows || '[]')) as number[]
      for (const n of arr) set.add(Number(n))
    } catch { /* skip malformed */ }
  }
  return set
}

export async function recordCommissionPayment(input: {
  closer_user_id: string
  period_start: string
  period_end: string
  lead_rows: number[]
  amount: number
  paid: boolean
  notes?: string
}): Promise<number> {
  const db = getClient()
  const r = await db.execute({
    sql: `INSERT INTO commission_payments
            (closer_user_id, period_start, period_end, lead_rows, amount, paid, paid_at, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.closer_user_id,
      input.period_start,
      input.period_end,
      JSON.stringify(input.lead_rows),
      input.amount,
      input.paid ? 1 : 0,
      input.paid ? new Date().toISOString() : null,
      input.notes ?? null,
    ],
  })
  return Number(r.lastInsertRowid || 0)
}

export async function markPaymentPaid(paymentId: number, paid: boolean): Promise<void> {
  const db = getClient()
  await db.execute({
    sql: 'UPDATE commission_payments SET paid = ?, paid_at = ? WHERE id = ?',
    args: [paid ? 1 : 0, paid ? new Date().toISOString() : null, paymentId],
  })
}

export async function deletePayment(paymentId: number): Promise<void> {
  const db = getClient()
  await db.execute({ sql: 'DELETE FROM commission_payments WHERE id = ?', args: [paymentId] })
}
