/**
 * Sheet backup — keeps the Google Sheet a complete, current backup of app-only data.
 *
 * Lead FIELDS (status/assignment/notes-on-lead/etc.) already mirror to the leads tab on
 * every edit (see sheets.ts mirrorLeadFieldsToSheet). But lead NOTES, CALL LOGS and the
 * MESSAGE history live ONLY in the local SQLite DB. This module pushes them to dedicated
 * backup tabs in the leads workbook so nothing is ever stranded in the app's DB.
 *
 * - Lead Notes / Call Logs: full refresh each run (small, may be edited/deleted, so we
 *   re-write the whole tab to stay exactly in sync with the DB).
 * - Messages: append-only in the DB, so we back up INCREMENTALLY (only rows newer than the
 *   last backed-up id, tracked in settings) — cheap per run even with tens of thousands.
 */

import { google } from 'googleapis'
import { ensureInit, getSetting, setSetting } from './db'

const SPREADSHEET_ID = process.env.LEADS_SHEET_ID
const WRITE_CHUNK = 2000

function getSheets() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.sheets({ version: 'v4', auth })
}

// Create the tab if missing; always (re)write the header row.
async function ensureTab(title: string, headers: string[]): Promise<void> {
  const sheets = getSheets()
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID!, fields: 'sheets.properties' })
  const exists = meta.data.sheets?.some(s => s.properties?.title === title)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID!,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    })
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID!,
    range: `${title}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] },
  })
}

// Append rows (chunked). append auto-EXPANDS the grid, so it never hits the
// default ~1000-row grid limit a freshly-created tab starts with.
async function appendRows(title: string, rows: string[][]): Promise<void> {
  if (!rows.length) return
  const sheets = getSheets()
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const batch = rows.slice(i, i + WRITE_CHUNK)
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID!,
      range: `${title}!A:Z`,
      valueInputOption: 'RAW',
      requestBody: { values: batch },
    })
  }
}

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

// --- Lead Notes: full refresh ---
export async function backupNotes(): Promise<number> {
  const db = await ensureInit()
  const res = await db.execute(
    `SELECT n.created_at, n.phone, COALESCE(c.name,'') nm, n.note, n.created_by
     FROM lead_notes n LEFT JOIN contacts c ON c.phone = n.phone
     ORDER BY n.created_at`,
  )
  const rows = res.rows.map(r => [s(r.created_at), s(r.phone), s(r.nm), s(r.note), s(r.created_by)])
  const title = 'Lead Notes (Backup)'
  await ensureTab(title, ['created_at', 'phone', 'lead_name', 'note', 'created_by'])
  await getSheets().spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID!, range: `${title}!A2:E` })
  await appendRows(title, rows)
  return rows.length
}

// --- Call Logs: full refresh ---
export async function backupCallLogs(): Promise<number> {
  const db = await ensureInit()
  const res = await db.execute(
    `SELECT cl.created_at, cl.phone, COALESCE(c.name,'') nm, cl.duration, cl.outcome, cl.notes, cl.logged_by
     FROM call_logs cl LEFT JOIN contacts c ON c.phone = cl.phone
     ORDER BY cl.created_at`,
  )
  const rows = res.rows.map(r => [
    s(r.created_at), s(r.phone), s(r.nm), s(r.duration), s(r.outcome), s(r.notes), s(r.logged_by),
  ])
  const title = 'Call Logs (Backup)'
  await ensureTab(title, ['created_at', 'phone', 'lead_name', 'duration', 'outcome', 'notes', 'logged_by'])
  await getSheets().spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID!, range: `${title}!A2:G` })
  await appendRows(title, rows)
  return rows.length
}

// --- Messages: incremental append (watermark on max id) ---
export async function backupMessages(): Promise<number> {
  const db = await ensureInit()
  const title = 'Messages (Backup)'
  await ensureTab(title, ['id', 'timestamp', 'phone', 'lead_name', 'direction', 'text', 'sent_by', 'status', 'template_used', 'wa_message_id'])
  const lastIdStr = await getSetting('backup.messages_last_id')
  const lastId = lastIdStr ? parseInt(lastIdStr, 10) : 0
  const res = await db.execute({
    sql: `SELECT m.id, m.timestamp, m.phone, COALESCE(c.name,'') nm, m.direction, m.text, m.sent_by, m.status, m.template_used, m.wa_message_id
          FROM messages m LEFT JOIN contacts c ON c.phone = m.phone
          WHERE m.id > ? ORDER BY m.id`,
    args: [lastId],
  })
  if (res.rows.length === 0) return 0
  const rows = res.rows.map(r => [
    s(r.id), s(r.timestamp), s(r.phone), s(r.nm), s(r.direction), s(r.text), s(r.sent_by), s(r.status), s(r.template_used), s(r.wa_message_id),
  ])
  await appendRows(title, rows)
  const maxId = res.rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), lastId)
  await setSetting('backup.messages_last_id', String(maxId))
  return rows.length
}

export async function runFullBackup(): Promise<{ notes: number; call_logs: number; messages_appended: number }> {
  const notes = await backupNotes()
  const call_logs = await backupCallLogs()
  const messages_appended = await backupMessages()
  return { notes, call_logs, messages_appended }
}
