/**
 * Lead-lifecycle DB helpers that sit beside db.ts: undoing a send claim when
 * the send fails, counting failed attempts, and phone-scoped message lookups
 * the crons use to decide whether a lead was already messaged.
 */
import { ensureInit, normalizePhone } from './db'

/**
 * Hand back a claim taken with claimEvent() so the event can be claimed again.
 *
 * A claim marks a send as done. When the WhatsApp send it guarded FAILED,
 * keeping the claim meant the lead was treated as messaged forever and never
 * got its first message. Releasing it lets the next cron run retry.
 * Best-effort: a failed release is logged, never thrown.
 */
export async function releaseEvent(eventId: string): Promise<boolean> {
  if (!eventId) return false
  try {
    const db = await ensureInit()
    const res = await db.execute({
      sql: 'DELETE FROM processed_events WHERE event_id = ?',
      args: [eventId],
    })
    return Number(res.rowsAffected || 0) > 0
  } catch (err) {
    console.error('[releaseEvent] failed:', err)
    return false
  }
}

const failPrefix = (claimKey: string) => `${claimKey}:fail:`

/** How many failed send attempts have been recorded against a claim key. */
export async function countSendFailures(claimKey: string): Promise<number> {
  if (!claimKey) return 0
  try {
    const db = await ensureInit()
    const prefix = failPrefix(claimKey)
    const res = await db.execute({
      sql: 'SELECT COUNT(*) AS n FROM processed_events WHERE substr(event_id, 1, ?) = ?',
      args: [prefix.length, prefix],
    })
    return Number(res.rows[0]?.n ?? 0)
  } catch (err) {
    console.error('[countSendFailures] failed:', err)
    return 0
  }
}

/**
 * Record one more failed send attempt for a claim key and return the attempt
 * number (1, 2, 3…). Stored in processed_events so the count survives across
 * cron runs without touching any lead column.
 */
export async function recordSendFailure(claimKey: string): Promise<number> {
  const attempt = (await countSendFailures(claimKey)) + 1
  try {
    const db = await ensureInit()
    await db.execute({
      sql: 'INSERT OR IGNORE INTO processed_events (event_id, kind) VALUES (?, ?)',
      args: [`${failPrefix(claimKey)}${attempt}`, 'send_failure'],
    })
  } catch (err) {
    console.error('[recordSendFailure] failed:', err)
  }
  return attempt
}

export interface SentMessageLite {
  sent_by: string
  template_used: string
  status: string
  timestamp: string
}

/**
 * Every message we have SENT to a phone, oldest first: the whole history, not
 * the latest page. Uses the phone index, so it stays cheap even for long
 * threads.
 */
export async function getSentMessagesForPhone(phone: string): Promise<SentMessageLite[]> {
  const db = await ensureInit()
  const res = await db.execute({
    sql: `SELECT sent_by, template_used, status, timestamp FROM messages
          WHERE (phone = ? OR phone = ?) AND direction = 'sent'
          ORDER BY timestamp ASC`,
    args: [normalizePhone(phone), phone],
  })
  return res.rows.map(r => ({
    sent_by: String(r.sent_by ?? ''),
    template_used: String(r.template_used ?? ''),
    status: String(r.status ?? ''),
    timestamp: String(r.timestamp ?? ''),
  }))
}

/**
 * Normalized phones that were sent `template` at or after `sinceIso`
 * (sends that failed don't count).
 */
export async function getPhonesSentTemplateSince(template: string, sinceIso: string): Promise<Set<string>> {
  const db = await ensureInit()
  const res = await db.execute({
    sql: `SELECT DISTINCT phone FROM messages
          WHERE direction = 'sent' AND template_used = ? AND timestamp >= ?
            AND COALESCE(status, '') != 'failed'`,
    args: [template, sinceIso],
  })
  return new Set(res.rows.map(r => normalizePhone(String(r.phone ?? ''))))
}

// Senders that are automations, not a person typing.
const AUTOMATED_SENDERS = new Set(['', 'auto-send', 'bot', 'n8n', 'auto: missed-call'])

/** True for any automated sender: auto-send, bots, n8n, and every "System (…)" job. */
export function isAutomatedSender(sentBy: unknown): boolean {
  const s = String(sentBy ?? '').trim()
  return AUTOMATED_SENDERS.has(s) || s.startsWith('System (')
}

/** True when a person (not an automation) sent this phone a message at or after `sinceIso`. */
export async function hasManualMessageSince(phone: string, sinceIso: string): Promise<boolean> {
  const db = await ensureInit()
  const res = await db.execute({
    sql: `SELECT sent_by FROM messages
          WHERE (phone = ? OR phone = ?) AND direction = 'sent' AND timestamp >= ?`,
    args: [normalizePhone(phone), phone, sinceIso],
  })
  return res.rows.some(r => !isAutomatedSender(r.sent_by))
}
