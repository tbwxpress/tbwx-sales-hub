/**
 * In-app notifications. Persistent, per-user feed surfaced via NotificationBell.
 * Triggers fire from webhook (lead replied), assignment changes, telecaller updates,
 * and the auto-send cron (new lead assigned).
 */

import { createClient, type Client } from '@libsql/client'
import path from 'path'
import fs from 'fs'

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

export type NotificationType =
  | 'lead_replied'        // Lead sent a WhatsApp message in
  | 'lead_assigned'       // Lead assigned (round-robin or manual) to this user
  | 'lead_reassigned'     // Lead taken over by someone else
  | 'lead_hot'            // Lead was promoted to HOT
  | 'telecaller_update'   // Telecaller changed status / added note on owner's lead
  | 'followup_overdue'    // Follow-up date is past

export interface Notification {
  id: number
  user_id: string
  type: NotificationType | string
  title: string
  body: string
  ref_phone: string | null
  ref_lead_row: number | null
  read: boolean
  created_at: string
}

export async function insertNotification(input: {
  user_id: string
  type: NotificationType | string
  title: string
  body?: string
  ref_phone?: string | null
  ref_lead_row?: number | null
}): Promise<number> {
  const db = getClient()
  const r = await db.execute({
    sql: `INSERT INTO notifications (user_id, type, title, body, ref_phone, ref_lead_row, read)
          VALUES (?, ?, ?, ?, ?, ?, 0)`,
    args: [
      input.user_id,
      input.type,
      input.title,
      input.body ?? '',
      input.ref_phone ?? null,
      input.ref_lead_row ?? null,
    ],
  })
  return Number(r.lastInsertRowid || 0)
}

export async function getNotifications(userId: string, opts: { limit?: number; includeRead?: boolean } = {}): Promise<Notification[]> {
  const db = getClient()
  const limit = Math.max(1, Math.min(200, opts.limit ?? 50))
  const sql = opts.includeRead
    ? 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM notifications WHERE user_id = ? AND read = 0 ORDER BY created_at DESC LIMIT ?'
  const r = await db.execute({ sql, args: [userId, limit] })
  return r.rows.map(row => ({
    id: Number(row.id),
    user_id: String(row.user_id),
    type: String(row.type),
    title: String(row.title),
    body: String(row.body || ''),
    ref_phone: row.ref_phone ? String(row.ref_phone) : null,
    ref_lead_row: row.ref_lead_row ? Number(row.ref_lead_row) : null,
    read: Boolean(row.read),
    created_at: String(row.created_at),
  }))
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const db = getClient()
  const r = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', args: [userId] })
  return Number(r.rows[0]?.n || 0)
}

export async function markNotificationRead(id: number, userId: string): Promise<void> {
  const db = getClient()
  await db.execute({ sql: 'UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', args: [id, userId] })
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const db = getClient()
  const r = await db.execute({ sql: 'UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0', args: [userId] })
  return Number(r.rowsAffected || 0)
}

// Best-effort wrapper used inside webhook / cron paths — never throws.
export async function notifyQuiet(input: Parameters<typeof insertNotification>[0]): Promise<void> {
  try {
    await insertNotification(input)
  } catch (err) {
    console.error('[notifyQuiet] insert failed (non-critical):', err)
  }
}
