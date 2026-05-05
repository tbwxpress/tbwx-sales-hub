/**
 * Telecaller assignment + auto-queue helpers.
 *
 * Two ways a lead can land in a telecaller's queue:
 *   1. Explicit assignment (lead_telecaller_assignments row)
 *   2. Auto-queue (admin-enabled rule: leads with certain statuses route to a designated telecaller)
 *
 * Lead "owner" (assigned_to in Sheet) never changes via telecaller assignment.
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

// --- Setting keys for the auto-queue feature ---
export const TELECALLER_SETTING_KEYS = {
  AUTO_QUEUE_ENABLED: 'telecaller.auto_queue_enabled',
  AUTO_QUEUE_USER_ID: 'telecaller.auto_queue_user_id',
  AUTO_QUEUE_STATUSES: 'telecaller.auto_queue_statuses',
} as const

export const TELECALLER_DEFAULTS = {
  AUTO_QUEUE_STATUSES: 'NO_RESPONSE,DECK_SENT,LOST',
} as const

// --- Assignment record ---
export interface TelecallerAssignment {
  lead_row: number
  telecaller_user_id: string
  assigned_by_user_id: string
  assigned_at: string
  notes: string | null
}

export async function assignTelecaller(
  leadRow: number,
  telecallerUserId: string,
  assignedByUserId: string,
  notes?: string,
): Promise<void> {
  const db = getClient()
  await db.execute({
    sql: `INSERT INTO lead_telecaller_assignments (lead_row, telecaller_user_id, assigned_by_user_id, assigned_at, notes)
          VALUES (?, ?, ?, datetime('now'), ?)
          ON CONFLICT(lead_row) DO UPDATE SET
            telecaller_user_id = excluded.telecaller_user_id,
            assigned_by_user_id = excluded.assigned_by_user_id,
            assigned_at = datetime('now'),
            notes = excluded.notes`,
    args: [leadRow, telecallerUserId, assignedByUserId, notes ?? null],
  })
}

export async function unassignTelecaller(leadRow: number): Promise<void> {
  const db = getClient()
  await db.execute({
    sql: 'DELETE FROM lead_telecaller_assignments WHERE lead_row = ?',
    args: [leadRow],
  })
}

export async function getAssignmentForLead(leadRow: number): Promise<TelecallerAssignment | null> {
  const db = getClient()
  const r = await db.execute({
    sql: 'SELECT * FROM lead_telecaller_assignments WHERE lead_row = ?',
    args: [leadRow],
  })
  if (r.rows.length === 0) return null
  const row = r.rows[0]
  return {
    lead_row: Number(row.lead_row),
    telecaller_user_id: String(row.telecaller_user_id),
    assigned_by_user_id: String(row.assigned_by_user_id),
    assigned_at: String(row.assigned_at),
    notes: row.notes ? String(row.notes) : null,
  }
}

export async function getAssignmentsByTelecaller(telecallerUserId: string): Promise<TelecallerAssignment[]> {
  const db = getClient()
  const r = await db.execute({
    sql: 'SELECT * FROM lead_telecaller_assignments WHERE telecaller_user_id = ?',
    args: [telecallerUserId],
  })
  return r.rows.map(row => ({
    lead_row: Number(row.lead_row),
    telecaller_user_id: String(row.telecaller_user_id),
    assigned_by_user_id: String(row.assigned_by_user_id),
    assigned_at: String(row.assigned_at),
    notes: row.notes ? String(row.notes) : null,
  }))
}

export async function getAllAssignments(): Promise<TelecallerAssignment[]> {
  const db = getClient()
  const r = await db.execute('SELECT * FROM lead_telecaller_assignments')
  return r.rows.map(row => ({
    lead_row: Number(row.lead_row),
    telecaller_user_id: String(row.telecaller_user_id),
    assigned_by_user_id: String(row.assigned_by_user_id),
    assigned_at: String(row.assigned_at),
    notes: row.notes ? String(row.notes) : null,
  }))
}

// --- Auto-queue settings ---
export interface AutoQueueConfig {
  enabled: boolean
  user_id: string
  statuses: string[]
}

export async function getAutoQueueConfig(): Promise<AutoQueueConfig> {
  const [enabled, userId, statuses] = await Promise.all([
    getSetting(TELECALLER_SETTING_KEYS.AUTO_QUEUE_ENABLED),
    getSetting(TELECALLER_SETTING_KEYS.AUTO_QUEUE_USER_ID),
    getSetting(TELECALLER_SETTING_KEYS.AUTO_QUEUE_STATUSES),
  ])
  return {
    enabled: enabled === 'true',
    user_id: userId || '',
    statuses: (statuses || TELECALLER_DEFAULTS.AUTO_QUEUE_STATUSES).split(',').map(s => s.trim()).filter(Boolean),
  }
}

export async function setAutoQueueConfig(config: Partial<AutoQueueConfig>): Promise<void> {
  if (config.enabled !== undefined) {
    await setSetting(TELECALLER_SETTING_KEYS.AUTO_QUEUE_ENABLED, String(config.enabled))
  }
  if (config.user_id !== undefined) {
    await setSetting(TELECALLER_SETTING_KEYS.AUTO_QUEUE_USER_ID, config.user_id)
  }
  if (config.statuses !== undefined) {
    await setSetting(TELECALLER_SETTING_KEYS.AUTO_QUEUE_STATUSES, config.statuses.join(','))
  }
}

/**
 * Returns the set of lead_rows visible to a given telecaller, combining:
 *   - Explicit assignments (from lead_telecaller_assignments)
 *   - Auto-queue matches (if enabled, this user is the auto-queue target,
 *     and the lead's status is in the configured set, AND lead is not opted out)
 *
 * Caller passes the full leads array + opted-out phone set; this function
 * filters to those visible to the telecaller.
 */
export async function getTelecallerVisibleLeadRows(params: {
  telecallerUserId: string
  leads: Array<{ row_number: number; lead_status: string; phone: string }>
  optedOutPhones: Set<string>
}): Promise<Set<number>> {
  const { telecallerUserId, leads, optedOutPhones } = params

  const explicit = await getAssignmentsByTelecaller(telecallerUserId)
  const visibleRows = new Set<number>(explicit.map(a => a.lead_row))

  const config = await getAutoQueueConfig()
  if (config.enabled && config.user_id === telecallerUserId && config.statuses.length > 0) {
    const statusSet = new Set(config.statuses)
    for (const lead of leads) {
      if (!statusSet.has(lead.lead_status)) continue
      if (optedOutPhones.has(lead.phone)) continue
      visibleRows.add(lead.row_number)
    }
  }

  return visibleRows
}
