import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import type { gmail_v1 } from 'googleapis'
import {
  ensureInit,
  getSetting,
  setSetting,
  insertMessage,
  upsertContact,
  getDripState,
  upsertDripState,
  insertStatusChange,
  insertNote,
  normalizePhone,
} from '@/lib/db'
import { getLeads, updateLead } from '@/lib/sheets'
import { notifyQuiet } from '@/lib/notifications'
import { isNegativeReply } from '@/lib/negative-replies'
import { getUsers } from '@/lib/users'
import type { Lead } from '@/lib/types'

const CRON_SECRET = process.env.CRON_SECRET

// Our own sending identities — anything FROM these is our outbound (or a
// self-loop) and must never be ingested as a lead reply.
const SELF_ADDRESSES = ['ai@tbwxpress.com', 'tbwxpress@gmail.com']

// The franchise welcome email's subject is "<name>, your TBWX franchise
// overview" (lib/email.ts) — replies keep that phrase in "Re: ..." subjects.
// A second, broader inbox sweep catches leads who compose a FRESH email (or
// edit the subject): any inbox mail whose From matches a lead email is
// ingested through the exact same guards.
// Bounces: Gmail/Yahoo DSNs come from mailer-daemon; Exchange/M365 remote
// NDRs come from postmaster — query both.
const replyQuery = (days: number) => `in:inbox subject:"franchise overview" newer_than:${days}d`
const inboxQuery = (days: number) => `in:inbox newer_than:${days}d`
const bounceQuery = (days: number) => `(from:mailer-daemon OR from:postmaster) newer_than:${days}d`

// First run processes only the trailing 7 days; after that the processed-id
// ledger dedupes forever. The watermark pins that first-run boundary so a
// redeploy can never re-widen the window.
const WATERMARK_KEY = 'mail_watcher.first_run_watermark_ms'

// Last successful run — used to self-heal after an outage: the query window
// grows to cover the gap (capped at 30d) instead of silently skipping mail
// older than 7d. The watermark above still fences off pre-launch history.
const LAST_SUCCESS_KEY = 'mail_watcher.last_success_ms'

// Overlap lock: a slow run (hundreds of Gmail fetches) must not race the next
// 15-min tick or a manual admin POST — notifications would double-fire.
const LOCK_KEY = 'mail_watcher.run_lock_ms'
const LOCK_STALE_MS = 10 * 60 * 1000

const BODY_CAP = 2000
const NOTES_CAP = 1500
const MAX_MESSAGES_PER_QUERY = 200

// ---------- processed-message ledger ----------
// Survives restarts (lives in the same SQLite/Turso DB as everything else).
// kind also records WHY a message was skipped, so unmatched senders are
// auditable without any new UI ("misc ledger" per owner's direction).
//
// Unmatched kinds are RETRYABLE: a transient lead-source hiccup or a lead
// added/corrected later must not permanently void a real reply/bounce. They
// stay in the ledger for audit but are re-checked every run until the message
// ages out of the query window; on a later match the row is upgraded in place.

const RETRYABLE_KINDS = ['reply_unmatched', 'bounce_unmatched', 'inbox_unmatched']

async function ensureLedger() {
  const db = await ensureInit()
  await db.execute(`
    CREATE TABLE IF NOT EXISTS mail_watcher_ledger (
      gmail_message_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT '',
      from_email TEXT DEFAULT '',
      lead_row INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  return db
}

async function isProcessed(gmailId: string): Promise<boolean> {
  const db = await ensureInit()
  const r = await db.execute({
    sql: 'SELECT kind FROM mail_watcher_ledger WHERE gmail_message_id = ?',
    args: [gmailId],
  })
  if (r.rows.length === 0) return false
  return !RETRYABLE_KINDS.includes(String(r.rows[0].kind || ''))
}

async function markProcessed(gmailId: string, kind: string, fromEmail = '', leadRow: number | null = null): Promise<void> {
  const db = await ensureInit()
  await db.execute({
    sql: `INSERT INTO mail_watcher_ledger (gmail_message_id, kind, from_email, lead_row) VALUES (?, ?, ?, ?)
          ON CONFLICT(gmail_message_id) DO UPDATE SET kind = excluded.kind, from_email = excluded.from_email, lead_row = excluded.lead_row`,
    args: [gmailId, kind, fromEmail, leadRow],
  })
}

// ---------- run lock ----------
// Atomic acquire via the settings table: the conflicting upsert only wins when
// the stored timestamp is stale, and rowsAffected tells us who won.

async function acquireRunLock(): Promise<boolean> {
  const db = await ensureInit()
  const now = Date.now()
  const res = await db.execute({
    sql: `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
          WHERE CAST(settings.value AS INTEGER) < ?`,
    args: [LOCK_KEY, String(now), now - LOCK_STALE_MS],
  })
  return Number(res.rowsAffected ?? 0) > 0
}

async function releaseRunLock(): Promise<void> {
  try {
    await setSetting(LOCK_KEY, '0')
  } catch { /* stale-timeout self-heals */ }
}

// ---------- MIME helpers ----------

function decodeB64Url(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  } catch {
    return ''
  }
}

function headerValue(payload: gmail_v1.Schema$MessagePart | undefined, name: string): string {
  const h = (payload?.headers || []).find(x => String(x.name || '').toLowerCase() === name.toLowerCase())
  return String(h?.value || '')
}

// Walk the part tree collecting decodable text. `other` catches DSN parts
// (message/delivery-status etc.) that carry the failed-recipient fields.
function collectParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  out: { plain: string[]; html: string[]; other: string[] },
): void {
  if (!part) return
  const mime = String(part.mimeType || '')
  if (part.body?.data) {
    const text = decodeB64Url(part.body.data)
    if (mime === 'text/plain') out.plain.push(text)
    else if (mime === 'text/html') out.html.push(text)
    else out.other.push(text)
  }
  for (const p of part.parts || []) collectParts(p, out)
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseAddress(fromHeader: string): string {
  const angle = fromHeader.match(/<([^<>\s]+@[^<>\s]+)>/)
  if (angle) return angle[1].trim().toLowerCase()
  const bare = fromHeader.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
  return (bare ? bare[0] : '').trim().toLowerCase()
}

function isDaemonAddress(email: string): boolean {
  return email.startsWith('mailer-daemon') || email.startsWith('postmaster')
}

// Strip quoted history below the "On ... wrote:" line (and other common
// top-quote markers), drop trailing '>' quote lines, cap length.
function trimReplyBody(text: string): string {
  const original = String(text || '').replace(/\r\n/g, '\n')
  let t = original
  const markers = [
    /\n\s*On [^\n]{0,300}wrote:\s*\n/, // classic single-line "On ... wrote:"
    /\nOn [\s\S]{0,300}?wrote:/, // wrapped across lines
    /\n-{2,}\s*Original Message\s*-{2,}/i,
    /\n_{5,}\n/, // Outlook divider
    /\nFrom:\s[^\n]*\n(?:Sent|Date):\s/, // Outlook top-quote header block
  ]
  let cut = t.length
  for (const p of markers) {
    const m = t.match(p)
    if (m && m.index !== undefined && m.index < cut) cut = m.index
  }
  t = t.slice(0, cut)
  const lines = t.split('\n')
  while (lines.length && (/^\s*>/.test(lines[lines.length - 1]) || !lines[lines.length - 1].trim())) {
    lines.pop()
  }
  t = lines.filter(l => !/^\s*>/.test(l)).join('\n').trim()
  if (!t) t = original.trim() // never lose the message entirely
  return t.length > BODY_CAP ? t.slice(0, BODY_CAP) : t
}

function isAutoReply(payload: gmail_v1.Schema$MessagePart | undefined, subject: string): boolean {
  const autoSubmitted = headerValue(payload, 'Auto-Submitted').toLowerCase()
  if (autoSubmitted && autoSubmitted !== 'no') return true
  if (headerValue(payload, 'X-Autoreply') || headerValue(payload, 'X-Autorespond')) return true
  const precedence = headerValue(payload, 'Precedence').toLowerCase()
  if (precedence === 'auto_reply') return true
  return /\b(out of office|auto[- ]?reply|automatic reply|autoreply|away from (the )?office)\b/i.test(subject)
}

// DSN failed-recipient extraction: X-Failed-Recipients header first, then the
// delivery-status fields, then any address in the body that isn't ours.
function parseFailedRecipient(payload: gmail_v1.Schema$MessagePart | undefined, bodyPool: string): string {
  const xFailed = parseAddress(headerValue(payload, 'X-Failed-Recipients'))
  if (xFailed) return xFailed
  const final = bodyPool.match(/Final-Recipient:\s*rfc822;\s*<?([^\s>;]+@[^\s>;]+)>?/i)
  if (final) return final[1].trim().toLowerCase()
  const orig = bodyPool.match(/Original-Recipient:\s*rfc822;\s*<?([^\s>;]+@[^\s>;]+)>?/i)
  if (orig) return orig[1].trim().toLowerCase()
  const all = bodyPool.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []
  for (const a of all) {
    const lower = a.toLowerCase()
    if (SELF_ADDRESSES.includes(lower)) continue
    if (isDaemonAddress(lower)) continue
    return lower
  }
  return ''
}

// ---------- lead matching ----------

function matchLeadByEmail(leads: Lead[], email: string): Lead | null {
  const target = String(email || '').trim().toLowerCase()
  if (!target) return null
  const hits = leads.filter(
    l => !l.merged_into && String(l.email || '').trim().toLowerCase() === target,
  )
  if (hits.length === 0) return null
  if (hits.length === 1) return hits[0]
  // Multiple leads share the address → most recent lead wins.
  const ts = (l: Lead) => {
    const t = Date.parse(String(l.created_time || ''))
    return Number.isNaN(t) ? 0 : t
  }
  hits.sort((a, b) => ts(b) - ts(a) || b.row_number - a.row_number)
  return hits[0]
}

// Prepend an auto-marker to the lead's notes WITHOUT destroying what an agent
// hand-wrote there. Idempotent: never stacks the same marker twice.
function prependNote(existingNotes: string, marker: string): string {
  const cur = String(existingNotes || '').trim()
  if (!cur) return marker.slice(0, NOTES_CAP)
  if (cur.includes(marker)) return cur
  return `${marker} | ${cur}`.slice(0, NOTES_CAP)
}

// ---------- ingestion ----------

// Same early-stage gate the WhatsApp webhook uses: never regress an advanced
// pipeline stage on an inbound message.
const EARLY_STATUSES = ['NEW', 'DECK_SENT', 'NO_RESPONSE']

// Mirror of the WA webhook's inbound path: message row in the same table
// (channel 'email' — the existing discriminator column), drip pause, REPLIED
// upgrade + audit, and the existing lead_replied owner notification (plus the
// same possible-negative flag the webhook raises). No new alert channels.
async function ingestReply(lead: Lead, fromEmail: string, body: string, tsIso: string, gmailId: string): Promise<'ingested' | 'no_phone'> {
  const phone = normalizePhone(String(lead.phone || ''))
  if (phone.replace(/\D/g, '').length < 10) {
    // The timeline is phone-keyed, so with no phone the notes column is the
    // only surface where this reply can be seen — stamp it there.
    try {
      const stamp = `[Auto] Email reply from ${fromEmail} (no phone on lead): "${body.slice(0, 120)}"`
      const newNotes = prependNote(String(lead.notes || ''), stamp)
      if (newNotes !== String(lead.notes || '').trim()) {
        await updateLead(lead.row_number, { notes: newNotes })
      }
    } catch (err) {
      console.error('[mail-watcher] no-phone notes stamp failed (non-critical):', err)
    }
    return 'no_phone'
  }

  await upsertContact(phone, {
    name: lead.full_name || '',
    is_lead: true,
    lead_row: lead.row_number,
    lead_id: lead.id || '',
  })

  await insertMessage({
    phone,
    direction: 'received',
    text: `[Email] ${body}`,
    timestamp: tsIso,
    wa_message_id: `email:${gmailId}`, // dedupe key in the same column WA uses
    status: 'received',
    read: false,
    channel: 'email',
  })

  // Auto-pause drip — the lead replied (same rule as the WA webhook).
  try {
    const drip = await getDripState(phone)
    if (drip && Number(drip.enabled) === 1 && !drip.paused_at) {
      await upsertDripState(phone, {
        paused_at: new Date().toISOString(),
        pause_reason: 'Lead replied (email)',
      })
    }
  } catch { /* non-critical */ }

  // REPLIED + next-day follow-up, early stages only.
  try {
    const cur = String(lead.lead_status || '').toUpperCase()
    const shouldUpdateStatus = !cur || EARLY_STATUSES.includes(cur)
    const followup = new Date()
    followup.setDate(followup.getDate() + 1)
    const fields: Record<string, string> = { next_followup: followup.toISOString().split('T')[0] }
    if (shouldUpdateStatus) fields.lead_status = 'REPLIED'
    await updateLead(lead.row_number, fields)
    if (shouldUpdateStatus && cur !== 'REPLIED') {
      await insertStatusChange({
        lead_row: lead.row_number,
        phone,
        old_status: lead.lead_status || '',
        new_status: 'REPLIED',
        changed_by: 'System (Mail Watcher)',
        source: 'cron',
      })
    }
  } catch (err) {
    console.error('[mail-watcher] lead status update failed (non-critical):', err)
  }

  // Notify the lead's owner via the existing lead_replied path (exactly what
  // the WA webhook does for an inbound reply), including the webhook's
  // possible-negative flag — alert only, never auto-LOST.
  if (lead.assigned_to) {
    try {
      const users = await getUsers()
      const owner = users.find(u => u.name === lead.assigned_to && u.active)
      if (owner) {
        const previewText = body.slice(0, 80)
        await notifyQuiet({
          user_id: owner.id,
          type: 'lead_replied',
          title: `${lead.full_name || fromEmail} replied (email)`,
          body: previewText,
          ref_phone: phone,
          ref_lead_row: lead.row_number,
        })
        if (isNegativeReply(body)) {
          await notifyQuiet({
            user_id: owner.id,
            type: 'negative_reply',
            title: `⚠️ Possible negative reply — ${lead.full_name || fromEmail}`,
            body: previewText,
            ref_phone: phone,
            ref_lead_row: lead.row_number,
          })
        }
      }
    } catch { /* best effort */ }
  }

  return 'ingested'
}

// Bounce: timeline note + a notes-field marker the lead view already renders.
// The marker is PREPENDED to existing notes (never overwrites an agent's
// hand-written notes). Never an unread inbox message (nobody replied), never
// a new alert.
async function ingestBounce(lead: Lead, failedEmail: string): Promise<void> {
  const marker = `[Auto] Email bounced — address invalid, collect a correct one (${failedEmail})`
  const phone = normalizePhone(String(lead.phone || ''))
  if (phone.replace(/\D/g, '').length >= 10) {
    try {
      await insertNote({ phone, note: marker, created_by: 'System (Mail Watcher)' })
    } catch (err) {
      console.error('[mail-watcher] bounce note insert failed (non-critical):', err)
    }
  }
  const newNotes = prependNote(String(lead.notes || ''), marker)
  if (newNotes !== String(lead.notes || '').trim()) {
    await updateLead(lead.row_number, { notes: newNotes })
  }
}

// ---------- route ----------

/**
 * POST /api/cron/mail-watcher
 *
 * Every 15 min. Polls ai@tbwxpress.com for replies to the franchise welcome
 * email (in-thread AND fresh compositions from known lead addresses) plus
 * mailer-daemon/postmaster bounces, and folds both into the lead's existing
 * timeline/updates — the same tables and replied-state the WhatsApp webhook
 * drives. Read-only on Gmail: NEVER sends, labels, or modifies mail.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = authHeader?.replace('Bearer ', '')

  if (!CRON_SECRET || cronSecret !== CRON_SECRET) {
    const { getSession, requireAuth } = await import('@/lib/auth')
    const session = await getSession()
    try {
      const user = requireAuth(session)
      if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const hasGmailEnv = !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    (process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN)
  )
  if (!hasGmailEnv) {
    return NextResponse.json({ success: true, skipped: true, reason: 'Gmail env not configured' })
  }

  try {
    await ensureLedger()

    if (!(await acquireRunLock())) {
      return NextResponse.json({ success: true, skipped: true, reason: 'another run is in progress' })
    }

    try {
      // First-run watermark: anything older than (first run − 7d) is dead history.
      let watermarkMs = Number((await getSetting(WATERMARK_KEY).catch(() => null)) || 0)
      if (!watermarkMs || Number.isNaN(watermarkMs)) {
        watermarkMs = Date.now() - 7 * 86400000
        await setSetting(WATERMARK_KEY, String(watermarkMs)).catch(() => { /* non-critical */ })
      }

      // Self-healing window: cover any cron outage gap (up to 30d) instead of
      // silently losing mail older than 7d; the ledger keeps this idempotent.
      const lastSuccessMs = Number((await getSetting(LAST_SUCCESS_KEY).catch(() => null)) || 0)
      let windowDays = 7
      if (lastSuccessMs > 0) {
        const gapDays = Math.ceil((Date.now() - lastSuccessMs) / 86400000) + 1
        windowDays = Math.min(Math.max(7, gapDays), 30)
      }

      const { google } = await import('googleapis')
      const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
      auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN })
      const gmail = google.gmail({ version: 'v1', auth })

      const listIds = async (q: string): Promise<string[]> => {
        const ids: string[] = []
        let pageToken: string | undefined
        do {
          const res = await gmail.users.messages.list({ userId: 'me', q, maxResults: 100, pageToken })
          for (const m of res.data.messages || []) if (m.id) ids.push(m.id)
          pageToken = res.data.nextPageToken || undefined
        } while (pageToken && ids.length < MAX_MESSAGES_PER_QUERY)
        return ids
      }

      const counts = {
        bounces_seen: 0,
        bounces_marked: 0,
        bounces_unmatched: 0,
        replies_seen: 0,
        replies_ingested: 0,
        replies_unmatched: 0,
        inbox_unmatched: 0,
        skipped_self: 0,
        skipped_auto: 0,
        skipped_old: 0,
        skipped_no_phone: 0,
        already_processed: 0,
      }

      const leads = await getLeads()
      if (leads.length === 0) {
        // A transient lead-source outage (DB empty + every sheet read failing)
        // returns []; matching against it would mis-ledger every pending
        // message as unmatched. Abort with NOTHING ledgered — next run retries.
        console.error('[mail-watcher] lead source returned 0 leads — aborting run, nothing ledgered')
        return NextResponse.json({ success: true, skipped: true, reason: 'lead source returned 0 leads — run aborted, will retry' })
      }

      const seenThisRun = new Set<string>()

      const fetchFull = async (id: string) => {
        const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
        return res.data
      }
      // Cheap header-only probe for the broad inbox sweep — the full body is
      // fetched only once the sender matches a lead (or is a bounce daemon).
      const fetchMeta = async (id: string) => {
        const res = await gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Auto-Submitted', 'X-Autoreply', 'X-Autorespond', 'Precedence'],
        })
        return res.data
      }

      // Shared bounce processor (needs a full message for the DSN body).
      const processBounce = async (id: string, msg: gmail_v1.Schema$Message): Promise<void> => {
        const pool = { plain: [] as string[], html: [] as string[], other: [] as string[] }
        collectParts(msg.payload, pool)
        const bodyPool = [...pool.plain, ...pool.other, ...pool.html.map(htmlToText)].join('\n')
        const failedEmail = parseFailedRecipient(msg.payload, bodyPool)
        const lead = failedEmail ? matchLeadByEmail(leads, failedEmail) : null
        if (!lead) {
          counts.bounces_unmatched++
          await markProcessed(id, 'bounce_unmatched', failedEmail) // retryable
          return
        }
        await ingestBounce(lead, failedEmail)
        counts.bounces_marked++
        await markProcessed(id, 'bounce', failedEmail, lead.row_number)
      }

      // Shared reply processor for an already-matched lead (full message).
      const processReply = async (id: string, msg: gmail_v1.Schema$Message, lead: Lead, fromEmail: string): Promise<void> => {
        const pool = { plain: [] as string[], html: [] as string[], other: [] as string[] }
        collectParts(msg.payload, pool)
        const rawBody = pool.plain.join('\n').trim() || htmlToText(pool.html.join('\n'))
        const body = trimReplyBody(rawBody) || '(empty email body)'
        const internalMs = Number(msg.internalDate || 0)
        const tsIso = internalMs ? new Date(internalMs).toISOString() : new Date().toISOString()
        const outcome = await ingestReply(lead, fromEmail, body, tsIso, id)
        if (outcome === 'no_phone') {
          counts.skipped_no_phone++
          await markProcessed(id, 'reply_no_phone', fromEmail, lead.row_number)
          return
        }
        counts.replies_ingested++
        await markProcessed(id, 'reply', fromEmail, lead.row_number)
      }

      // --- PASS 1 — BOUNCES FIRST: a DSN can also match the reply/inbox
      // queries (subject quotes the original) — the ledger + seenThisRun then
      // keep the later passes off it. ---
      for (const id of await listIds(bounceQuery(windowDays))) {
        if (seenThisRun.has(id)) continue
        seenThisRun.add(id)
        try {
          if (await isProcessed(id)) { counts.already_processed++; continue }
          counts.bounces_seen++
          const msg = await fetchFull(id)
          const internalMs = Number(msg.internalDate || 0)
          if (internalMs && internalMs < watermarkMs) {
            counts.skipped_old++
            await markProcessed(id, 'skipped_old')
            continue
          }
          await processBounce(id, msg)
        } catch (err) {
          // Not ledgered — retried next run.
          console.error(`[mail-watcher] bounce ${id} failed (will retry):`, err)
        }
      }

      // --- PASS 2 — IN-THREAD REPLIES (subject match) ---
      for (const id of await listIds(replyQuery(windowDays))) {
        if (seenThisRun.has(id)) continue
        seenThisRun.add(id)
        try {
          if (await isProcessed(id)) { counts.already_processed++; continue }
          counts.replies_seen++
          const msg = await fetchFull(id)
          const internalMs = Number(msg.internalDate || 0)
          if (internalMs && internalMs < watermarkMs) {
            counts.skipped_old++
            await markProcessed(id, 'skipped_old')
            continue
          }
          const fromEmail = parseAddress(headerValue(msg.payload, 'From'))
          const subject = headerValue(msg.payload, 'Subject')
          if (!fromEmail || SELF_ADDRESSES.includes(fromEmail)) {
            counts.skipped_self++
            await markProcessed(id, 'skipped_self', fromEmail)
            continue
          }
          if (isDaemonAddress(fromEmail)) {
            // An NDR that quoted our subject ("Undeliverable: ... franchise
            // overview") — route it through the bounce handler so the lead's
            // email still gets marked invalid.
            await processBounce(id, msg)
            continue
          }
          if (isAutoReply(msg.payload, subject)) {
            counts.skipped_auto++
            await markProcessed(id, 'skipped_auto', fromEmail)
            continue
          }
          const lead = matchLeadByEmail(leads, fromEmail)
          if (!lead) {
            counts.replies_unmatched++
            await markProcessed(id, 'reply_unmatched', fromEmail) // retryable
            continue
          }
          await processReply(id, msg, lead, fromEmail)
        } catch (err) {
          // Not ledgered — retried next run.
          console.error(`[mail-watcher] reply ${id} failed (will retry):`, err)
        }
      }

      // --- PASS 3 — FRESH MAIL FROM KNOWN LEAD ADDRESSES: prospects routinely
      // compose a NEW email (or edit the subject) instead of hitting reply.
      // Header-only probe first; full fetch only for lead/daemon senders. ---
      for (const id of await listIds(inboxQuery(windowDays))) {
        if (seenThisRun.has(id)) continue
        seenThisRun.add(id)
        try {
          if (await isProcessed(id)) { counts.already_processed++; continue }
          const meta = await fetchMeta(id)
          const internalMs = Number(meta.internalDate || 0)
          if (internalMs && internalMs < watermarkMs) {
            counts.skipped_old++
            await markProcessed(id, 'skipped_old')
            continue
          }
          const fromEmail = parseAddress(headerValue(meta.payload, 'From'))
          const subject = headerValue(meta.payload, 'Subject')
          if (!fromEmail || SELF_ADDRESSES.includes(fromEmail)) {
            counts.skipped_self++
            await markProcessed(id, 'skipped_self', fromEmail)
            continue
          }
          if (isDaemonAddress(fromEmail)) {
            counts.bounces_seen++
            await processBounce(id, await fetchFull(id))
            continue
          }
          if (isAutoReply(meta.payload, subject)) {
            counts.skipped_auto++
            await markProcessed(id, 'skipped_auto', fromEmail)
            continue
          }
          const lead = matchLeadByEmail(leads, fromEmail)
          if (!lead) {
            // Normal inbox noise — ledgered for audit but retryable, so a
            // transiently-degraded lead list can't permanently void a reply.
            counts.inbox_unmatched++
            await markProcessed(id, 'inbox_unmatched', fromEmail)
            continue
          }
          counts.replies_seen++
          await processReply(id, await fetchFull(id), lead, fromEmail)
        } catch (err) {
          // Not ledgered — retried next run.
          console.error(`[mail-watcher] inbox ${id} failed (will retry):`, err)
        }
      }

      await setSetting(LAST_SUCCESS_KEY, String(Date.now())).catch(() => { /* non-critical */ })

      // Counts only — never bodies.
      console.log(
        `[mail-watcher] replies ${counts.replies_ingested}/${counts.replies_seen} ingested ` +
        `(${counts.replies_unmatched} unmatched, ${counts.inbox_unmatched} inbox-unmatched, ${counts.skipped_auto} auto, ` +
        `${counts.skipped_self} self, ${counts.skipped_no_phone} no-phone), ` +
        `bounces ${counts.bounces_marked}/${counts.bounces_seen} marked (${counts.bounces_unmatched} unmatched), ` +
        `${counts.already_processed} already processed, ${counts.skipped_old} pre-watermark, window ${windowDays}d`,
      )

      return NextResponse.json({ success: true, window_days: windowDays, ...counts })
    } finally {
      await releaseRunLock()
    }
  } catch (err) {
    console.error('[mail-watcher] Error:', err)
    return NextResponse.json({ success: false, error: apiError(err, 'Mail watcher failed') }, { status: 500 })
  }
}

export async function GET() {
  const watermark = await getSetting(WATERMARK_KEY).catch(() => null)
  const lastSuccess = await getSetting(LAST_SUCCESS_KEY).catch(() => null)
  return NextResponse.json({
    name: 'mail-watcher',
    description:
      'Every 15 min: pulls franchise-email replies (in-thread + fresh mail from known lead addresses) and mailer-daemon/postmaster bounces from ai@tbwxpress.com into the lead timeline (channel email); replies drive the same REPLIED state as WhatsApp, bounces stamp an invalid-email note. Gmail read-only.',
    reply_query: replyQuery(7),
    inbox_query: inboxQuery(7),
    bounce_query: bounceQuery(7),
    window_note: 'window grows past 7d (max 30d) after a cron outage; first-run watermark still applies',
    first_run_watermark: watermark ? new Date(Number(watermark)).toISOString() : null,
    last_success: lastSuccess && Number(lastSuccess) > 0 ? new Date(Number(lastSuccess)).toISOString() : null,
  })
}
