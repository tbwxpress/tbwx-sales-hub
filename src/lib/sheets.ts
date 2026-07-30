import { google } from 'googleapis'
import type { Lead, LeadStatus, QuickReply, Message, KnowledgeBaseEntry } from './types'
import { LEAD_COLUMN_MAP, LEAD_WRITE_COLUMNS, SHEETS } from '@/config/client'
import {
  dbGetLeads, dbGetLeadByRow, dbInsertLead, dbInsertLeadsIfAbsent,
  dbUpdateLeadFields, dbDeleteLead, dbGetMaxRowInBand,
} from './leads-db'
import {
  type FormSource, BAND_SIZE, getActiveFormSources, resolveSourceForRow,
  sheetRowFor, pkFor, colMapFor, writeColsFor, buildFormAnswers, defaultFormSource,
} from './form-sources'

// --- Auth setup ---
function getAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return auth
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() })
}

// --- Retry wrapper for Sheets API calls (3 attempts, exponential backoff) ---
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const isRetryable = err instanceof Error && (
        err.message.includes('429') ||
        err.message.includes('500') ||
        err.message.includes('503') ||
        err.message.includes('ECONNRESET') ||
        err.message.includes('ETIMEDOUT')
      )
      if (!isRetryable || i === attempts - 1) throw err
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i))) // 1s, 2s, 4s
    }
  }
  throw new Error('Retry exhausted')
}

// Shorthand for tab names
const T = SHEETS.tabs

// --- Lead operations ---
//
// The leads system of record is now the local SQLite `leads` table (see
// leads-db.ts). The Google Sheet is INTAKE + BACKUP: new rows are synced in
// from the sheet, agent edits are written to the DB first and mirrored back to
// the sheet. The raw sheet readers/writers below are used by the sync + mirror;
// the public getLeads/getLeadByRow/updateLead/createLead read & write the DB.

// Shared row → Lead mapper for raw sheet reads. `rowNumber` is the LEAD KEY
// (source band offset + sheet row); pass the source so per-tab column maps
// and question capture apply. Omitting the source = built-in map (manual rows).
function mapSheetRowToLead(row: string[], rowNumber: number, source?: FormSource): Lead {
  const C = source ? colMapFor(source) : LEAD_COLUMN_MAP
  return {
    row_number: rowNumber,
    id: row[C.id] || '',
    created_time: row[C.created_time] || '',
    campaign_name: row[C.campaign_name] || '',
    full_name: row[C.full_name] || '',
    phone: (row[C.phone] || '').replace('p:', ''),
    email: row[C.email] || '',
    city: row[C.city] || '',
    state: row[C.state] || '',
    model_interest: row[C.model_interest] || '',
    experience: row[C.experience] || '',
    timeline: row[C.timeline] || '',
    platform: row[C.platform] || '',
    lead_status: (row[C.lead_status] || 'NEW') as LeadStatus,
    attempted_contact: row[C.attempted_contact] || '',
    first_call_date: row[C.first_call_date] || '',
    wa_message_id: row[C.wa_message_id] || '',
    lead_priority: row[C.lead_priority] || '',
    assigned_to: row[C.assigned_to] || '',
    next_followup: row[C.next_followup] || '',
    notes: row[C.notes] || '',
    // Multi-form fields. Meta's payload carries form id/name at fixed
    // positions (cols 8/9) unless the source's map overrides them.
    form_id: (row[C.form_id ?? 8] || '').replace('f:', ''),
    form_name: row[C.form_name ?? 9] || '',
    form_answers: source ? buildFormAnswers(row, source) : '',
  }
}

// Raw: read EVERY lead row from one source's tab (the slow full-range read).
// Used for the per-source seed and the safety fallback.
async function readAllLeadsFromSheet(source: FormSource): Promise<Lead[]> {
  const sheets = getSheets()
  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: process.env.LEADS_SHEET_ID,
    range: `${source.tab_name}!A2:${source.range_end}`,
  }))
  const rows = res.data.values || []
  return rows.map((row, i) => mapSheetRowToLead(row, pkFor(source, i + 2), source))
}

// Raw: read only a source's sheet rows from `startSheetRow` downward (cheap —
// used by the incremental sync to pull newly-appended leads). Skips blanks.
async function readLeadsFromSheetStartingAt(source: FormSource, startSheetRow: number): Promise<Lead[]> {
  if (startSheetRow < 2) startSheetRow = 2
  const sheets = getSheets()
  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: process.env.LEADS_SHEET_ID,
    range: `${source.tab_name}!A${startSheetRow}:${source.range_end}`,
  }))
  const rows = res.data.values || []
  return rows
    .map((row, i) => mapSheetRowToLead(row, pkFor(source, startSheetRow + i), source))
    .filter(l => l.id || l.phone || l.full_name)
}

// Raw: read a single lead row from a source's tab. `sheetRow` is the ACTUAL
// row in that tab (not the lead key).
async function readLeadRowFromSheet(source: FormSource, sheetRow: number): Promise<Lead | null> {
  const sheets = getSheets()
  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: process.env.LEADS_SHEET_ID,
    range: `${source.tab_name}!A${sheetRow}:${source.range_end}${sheetRow}`,
  }))
  const rows = res.data.values || []
  if (rows.length === 0) return null
  return mapSheetRowToLead(rows[0], pkFor(source, sheetRow), source)
}

// Fallback single-row read by LEAD KEY: resolves which source's tab owns the
// key band, then reads the actual sheet row.
async function readLeadRowByPk(rowNumber: number): Promise<Lead | null> {
  const sources = await getActiveFormSources()
  const source = resolveSourceForRow(sources, rowNumber) ?? defaultFormSource()
  return readLeadRowFromSheet(source, sheetRowFor(source, rowNumber))
}

// --- Module-level in-memory caches for Sheets reads ---
//
// Pattern: store an in-flight Promise (not the resolved value) plus a timestamp.
// - Concurrent callers within the TTL share the same Promise → single Sheets API
//   call instead of one per caller (no thundering herd on first request).
// - On error, the Promise is cleared so the next caller retries fresh.
// - TTL ceiling is 30s per the perf-fix plan. Mutations call the matching
//   invalidate* function below so writers see their own changes immediately.
//
// What IS cached: pure read functions whose result is shaped by the function
// signature alone (no arguments, or args that filter an already-fetched payload).
// What is NOT cached: getLeadByRow (single-row reads are already cheap and
// callers may want absolute freshness), all write operations, and getConversation
// (it's a composition of cached reads, so it inherits the cache for free).
// 2 min: every write (updateLead/createLead/etc.) calls invalidate*, so a longer
// TTL never serves stale data after an edit — it just makes the slow full-sheet
// cold read 4x rarer for read-only navigation (e.g. dashboard/leads page loads).
const SHEETS_CACHE_TTL_MS = 120_000
// Inbound replies (Replies tab) are written by n8n OUTSIDE this module, so they
// have NO write-driven invalidation — keep their cache short so agents still see
// customer replies within ~30s in the inbox even though the general TTL is 2 min.
const RECEIVED_MESSAGES_TTL_MS = 30_000

type CacheEntry<T> = { promise: Promise<T>; ts: number; refreshing?: boolean }

// NOTE: leads are no longer cached in-memory here — they're served from the
// local `leads` table (instant), so this cache layer now only covers the
// message / quick-reply / knowledge-base sheet reads.
// Sent/received messages are cached UNFILTERED. The optional `phone` arg
// filters the already-fetched array in memory, so the cache key is the
// function itself (not the phone number).
let _sentMessagesCache: CacheEntry<Message[]> | null = null
let _receivedMessagesCache: CacheEntry<Message[]> | null = null
let _quickRepliesCache: CacheEntry<QuickReply[]> | null = null
let _knowledgeBaseCache: CacheEntry<KnowledgeBaseEntry[]> | null = null

function readThrough<T>(
  entryRef: { get: () => CacheEntry<T> | null; set: (e: CacheEntry<T> | null) => void },
  fetcher: () => Promise<T>,
  ttlMs: number = SHEETS_CACHE_TTL_MS,
): Promise<T> {
  const cur = entryRef.get()
  if (cur) {
    // Stale-while-revalidate: if we already have a value, ALWAYS serve it
    // immediately — even if stale — so no caller ever blocks on a multi-second
    // full-sheet download. When it's past the TTL, kick off a single background
    // refresh (deduped via `refreshing`) and let the next caller pick up the
    // fresh result. This is the key fix for "slow for everyone": after the very
    // first load, reads are instant regardless of how often the sheet changes.
    if (Date.now() - cur.ts >= ttlMs && !cur.refreshing) {
      cur.refreshing = true
      fetcher()
        .then(val => { entryRef.set({ promise: Promise.resolve(val), ts: Date.now() }) })
        .catch(() => {
          // Keep serving the last good value, but allow another attempt next read.
          const e = entryRef.get()
          if (e) e.refreshing = false
        })
    }
    return cur.promise
  }
  // Truly cold (nothing cached yet) — fetch once and await. Concurrent cold
  // callers share this same in-flight promise (no thundering herd).
  const promise = fetcher().catch(err => {
    // Clear on failure so the next caller retries instead of returning a poisoned promise.
    if (entryRef.get()?.promise === promise) entryRef.set(null)
    throw err
  })
  entryRef.set({ promise, ts: Date.now() })
  return promise
}

// Kept for backward-compat with callers that still import it (e.g. the
// auto-send cron). Leads are no longer cached in this module, so this is a
// no-op — the DB is always current.
export function invalidateLeadsCache() { /* no-op: leads served from DB */ }

// --- Leads sheet → DB sync ---
// The sheet is intake-only: new leads append at the bottom. We seed the DB once
// (full read) and then pull only newly-appended rows incrementally (cheap read
// from maxRow+1 down). Sync runs opportunistically in the BACKGROUND from
// getLeads(), so a reader is never blocked on a sheet round-trip.
const LEADS_SYNC_INTERVAL_MS = 90_000
let _leadsSyncing = false
let _lastLeadsSyncTs = 0
let _seedPromise: Promise<void> | null = null

async function doSeedLeads(): Promise<void> {
  // Per-source: any active source whose key band is empty gets a full-tab
  // seed. Fresh installs seed the primary tab; a newly registered form tab
  // seeds itself on the next read (also covered by syncNewLeads below).
  const sources = await getActiveFormSources()
  for (const source of sources) {
    const bandMax = await dbGetMaxRowInBand(source.row_offset, BAND_SIZE)
    if (bandMax === 0) {
      const all = await readAllLeadsFromSheet(source)
      if (all.length) await dbInsertLeadsIfAbsent(all)
    }
  }
  _lastLeadsSyncTs = Date.now()
}

// Idempotent first-run import. Concurrent callers share one seed promise.
function ensureLeadsSeeded(): Promise<void> {
  if (!_seedPromise) {
    _seedPromise = doSeedLeads().catch(err => {
      _seedPromise = null // allow a retry on the next read if the seed failed
      throw err
    })
  }
  return _seedPromise
}

// Pull newly-appended sheet rows into the DB, per active source. A broken
// tab (renamed, permissions) can never block the other sources' sync.
async function syncNewLeads(): Promise<number> {
  const sources = await getActiveFormSources()
  let inserted = 0
  for (const source of sources) {
    try {
      const bandMax = await dbGetMaxRowInBand(source.row_offset, BAND_SIZE)
      const newRows = bandMax === 0
        ? await readAllLeadsFromSheet(source) // fresh source — first full pull
        : await readLeadsFromSheetStartingAt(source, sheetRowFor(source, bandMax) + 1)
      if (newRows.length) inserted += await dbInsertLeadsIfAbsent(newRows)
    } catch (err) {
      console.error(`[leads-sync] source "${source.tab_name}" sync failed:`, err)
    }
  }
  _lastLeadsSyncTs = Date.now()
  return inserted
}

// Awaitable on-demand sync — for flows that must see leads appended to the
// sheet SECONDS ago (e.g. website form submit → immediate WhatsApp click).
// Bypasses the throttle; callers accept one sheet round-trip of latency.
export async function forceLeadsSync(): Promise<void> {
  try {
    await syncNewLeads()
  } catch (err) {
    console.error('[leads-sync] forced sync failed:', err)
  }
}

// Fire-and-forget background sync, throttled to LEADS_SYNC_INTERVAL_MS.
function maybeSyncNewLeads(): void {
  if (_leadsSyncing) return
  if (Date.now() - _lastLeadsSyncTs < LEADS_SYNC_INTERVAL_MS) return
  _leadsSyncing = true
  syncNewLeads()
    .catch(err => console.error('[leads-sync] background sync failed:', err))
    .finally(() => { _leadsSyncing = false })
}

// Mirror lead-field changes back to the sheet (backup). Async + retried; the DB
// stays the source of truth, so a mirror failure never fails the agent's edit.
function mirrorLeadFieldsToSheet(rowNumber: number, fields: Array<[string, string]>): void {
  ;(async () => {
    const sources = await getActiveFormSources()
    const source = resolveSourceForRow(sources, rowNumber) ?? defaultFormSource()
    const writeCols = writeColsFor(source)
    const sheetRow = sheetRowFor(source, rowNumber)
    const data = fields
      .filter(([field]) => writeCols[field])
      .map(([field, value]) => ({
        range: `${source.tab_name}!${writeCols[field]}${sheetRow}`,
        values: [[value]],
      }))
    if (data.length === 0) return
    const sheets = getSheets()
    await withRetry(() => sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: process.env.LEADS_SHEET_ID!,
      requestBody: { valueInputOption: 'RAW', data },
    }))
  })().catch(err => console.error(`[leads-mirror] row ${rowNumber} mirror failed:`, err))
}

export function invalidateSentMessagesCache() {
  _sentMessagesCache = null
}

export function invalidateReceivedMessagesCache() {
  _receivedMessagesCache = null
}

export function invalidateQuickRepliesCache() {
  _quickRepliesCache = null
}

export function invalidateKnowledgeBaseCache() {
  _knowledgeBaseCache = null
}

export async function getLeads(): Promise<Lead[]> {
  try {
    await ensureLeadsSeeded()
    maybeSyncNewLeads() // background, never blocks this read
    const leads = await dbGetLeads()
    if (leads.length > 0) return leads
    // DB empty even after a seed attempt → fall back to a direct sheet read so
    // the app can never show an empty leads list.
    return await readAllLeadsFromAllSources()
  } catch (err) {
    console.error('[getLeads] DB path failed; falling back to sheet read:', err)
    return await readAllLeadsFromAllSources()
  }
}

// Emergency fallback: concat every active source's tab. One broken tab never
// hides the others' leads.
async function readAllLeadsFromAllSources(): Promise<Lead[]> {
  const sources = await getActiveFormSources()
  const all: Lead[] = []
  for (const source of sources) {
    try {
      all.push(...await readAllLeadsFromSheet(source))
    } catch (err) {
      console.error(`[getLeads] fallback read failed for "${source.tab_name}":`, err)
    }
  }
  return all
}

export async function getLeadByRow(rowNumber: number): Promise<Lead | null> {
  try {
    const lead = await dbGetLeadByRow(rowNumber)
    if (lead) return lead
  } catch (err) {
    console.error(`[getLeadByRow] DB read failed for row ${rowNumber}; falling back to sheet:`, err)
  }
  // Not in the DB (yet) or DB error → read the single row from its tab.
  return await readLeadRowByPk(rowNumber)
}

// Reverse of LEAD_WRITE_COLUMNS: column letter → Lead field name. Lets the
// column-based updateLeadField apply the same change to the DB.
const WRITE_COLUMN_TO_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(LEAD_WRITE_COLUMNS).map(([field, col]) => [col, field]),
)

// Write lead-field changes to the DB. If the row isn't in the DB yet (e.g. a
// sheet lead that hasn't synced in), pull the full row from the sheet, apply
// the change, and insert it — so an edit is NEVER silently lost.
async function writeLeadFieldsToDb(rowNumber: number, fields: Partial<Record<string, string>>): Promise<void> {
  const affected = await dbUpdateLeadFields(rowNumber, fields)
  if (affected > 0) return
  const base = await readLeadRowByPk(rowNumber)
  if (base) {
    await dbInsertLead({ ...base, ...(fields as Partial<Lead>) })
  } else {
    console.warn(`[writeLeadFieldsToDb] row ${rowNumber} not in DB or sheet — update not persisted`)
  }
}

export async function updateLeadField(rowNumber: number, column: string, value: string): Promise<void> {
  const field = WRITE_COLUMN_TO_FIELD[column]
  if (!field) {
    console.warn(`[updateLeadField] unknown column "${column}" — write skipped`)
    return
  }
  // DB is the source of truth — write it first so the agent sees the change.
  await writeLeadFieldsToDb(rowNumber, { [field]: value })
  // Mirror to the sheet as a backup (async, retried, non-fatal).
  mirrorLeadFieldsToSheet(rowNumber, [[field, value]])
}

export async function updateLead(rowNumber: number, fields: Partial<Record<string, string>>): Promise<void> {
  const entries = Object.entries(fields).filter(
    ([field, value]) => LEAD_WRITE_COLUMNS[field] && value !== undefined,
  ) as Array<[string, string]>
  if (entries.length === 0) return
  // DB first (source of truth), then mirror all changed fields to the sheet.
  await writeLeadFieldsToDb(rowNumber, Object.fromEntries(entries))
  mirrorLeadFieldsToSheet(rowNumber, entries)
}

/**
 * Set a single field across multiple leads. Writes the DB then mirrors to the
 * sheet in one batchUpdate.
 */
export async function bulkUpdateField(rowNumbers: number[], field: string, value: string): Promise<void> {
  if (!LEAD_WRITE_COLUMNS[field]) throw new Error(`Unknown field: ${field}`)
  // DB first (insert-if-missing so a not-yet-synced row is never skipped).
  for (const rowNum of rowNumbers) {
    await writeLeadFieldsToDb(rowNum, { [field]: value })
  }
  // Mirror to the sheet in a single batchUpdate (one call for all rows),
  // routing each lead key to its owning source tab.
  const sources = await getActiveFormSources()
  const fallback = defaultFormSource()
  const data = rowNumbers.flatMap(rowNum => {
    const source = resolveSourceForRow(sources, rowNum) ?? fallback
    const col = writeColsFor(source)[field]
    if (!col) return []
    return [{
      range: `${source.tab_name}!${col}${sheetRowFor(source, rowNum)}`,
      values: [[value]],
    }]
  })
  if (data.length === 0) return
  const sheets = getSheets()
  withRetry(() => sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.LEADS_SHEET_ID!,
    requestBody: { valueInputOption: 'RAW', data },
  })).catch(err => console.error('[bulkUpdateField] sheet mirror failed:', err))
}

/**
 * Clear all data in a lead row (soft-delete — preserves row numbers).
 */
export async function clearLeadRow(rowNumber: number): Promise<void> {
  // Remove from the DB (source of truth) first.
  await dbDeleteLead(rowNumber)
  // Then clear the sheet row (backup) in the owning source's tab.
  const sources = await getActiveFormSources()
  const source = resolveSourceForRow(sources, rowNumber) ?? defaultFormSource()
  const sheetRow = sheetRowFor(source, rowNumber)
  const sheets = getSheets()
  await sheets.spreadsheets.values.clear({
    spreadsheetId: process.env.LEADS_SHEET_ID!,
    range: `${source.tab_name}!A${sheetRow}:Z${sheetRow}`,
  })
}

// --- Create Lead ---

export async function createLead(data: {
  full_name: string
  phone: string
  email?: string
  city?: string
  state?: string
  model_interest?: string
  lead_priority?: string
  assigned_to?: string
  notes?: string
  source?: string
  /** Stable external id (e.g. `wac:<p10>` for website WhatsApp-click leads). */
  id?: string
  /** Intake platform label; defaults to 'Manual'. */
  platform?: string
}): Promise<number> {
  const sheets = getSheets()
  // Manual leads always land on the PRIMARY source (offset-0 band) so their
  // sheet row number IS their lead key — exactly the pre-registry behavior.
  const allSources = await getActiveFormSources()
  const primary = allSources.find(s => s.row_offset === 0) ?? defaultFormSource()
  const tab = primary.tab_name
  const C = LEAD_COLUMN_MAP

  // Build a row array matching the sheet column layout
  const maxCol = Math.max(...Object.values(C)) + 1
  const row: string[] = new Array(maxCol).fill('')

  const id = data.id || `manual_${Date.now()}`
  row[C.id] = id
  row[C.created_time] = new Date().toISOString()
  row[C.campaign_name] = data.source || 'Manual Entry'
  row[C.platform] = data.platform || 'Manual'
  row[C.full_name] = data.full_name
  row[C.phone] = data.phone
  row[C.email] = data.email || ''
  row[C.city] = data.city || ''
  row[C.state] = data.state || ''
  row[C.model_interest] = data.model_interest || ''
  row[C.lead_status] = 'NEW'
  row[C.lead_priority] = data.lead_priority || 'WARM'
  row[C.assigned_to] = data.assigned_to || ''
  row[C.notes] = data.notes || ''

  // Append to the sheet first — this allocates the canonical row number that we
  // reuse as the DB primary key (keeps DB rows aligned with sheet rows).
  const appendRes = await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.LEADS_SHEET_ID,
    range: `${tab}!A:${primary.range_end}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  })

  // Extract row number from the append response (e.g. "Leads!A255:AC255" → 255)
  const updatedRange = appendRes.data.updates?.updatedRange || ''
  const rowMatch = updatedRange.match(/(\d+)$/)
  const newRow = rowMatch ? parseInt(rowMatch[1]) : 0

  // Insert into the DB (source of truth) so it shows up immediately.
  if (newRow) {
    await dbInsertLead(mapSheetRowToLead(row, newRow, primary))
  } else {
    // Couldn't resolve the appended row number — the lead is in the sheet and
    // the background sync will pull it into the DB shortly.
    console.warn('[createLead] could not resolve appended row number; DB insert deferred to sync')
  }
  return newRow
}

// --- Messages ---

// Internal fetcher — gets the full unfiltered Replies tab from Sheets.
async function fetchAllReceivedMessages(): Promise<Message[]> {
  const sheets = getSheets()
  const repliesTab = process.env.REPLIES_TAB_NAME || T.replies
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.LEADS_SHEET_ID,
    range: `${repliesTab}!${SHEETS.ranges.repliesRange}`,
  })
  const rows = res.data.values || []
  return rows
    .filter(row => (row[6] || '') === 'message')
    .map(row => ({
      timestamp: row[0] || '',
      phone: row[1] || '',
      name: row[2] || '',
      direction: 'received' as const,
      text: row[4] || '',
      sent_by: '',
      wa_message_id: row[5] || '',
      status: 'Received',
      template_used: '',
    }))
}

export async function getReceivedMessages(phone?: string): Promise<Message[]> {
  // The cache holds the FULL unfiltered list; the optional phone filter is
  // applied in-memory after the cached read. This means a hit for one phone
  // is also a hit for any other phone in the same 30s window.
  const all = await readThrough<Message[]>(
    { get: () => _receivedMessagesCache, set: e => { _receivedMessagesCache = e } },
    fetchAllReceivedMessages,
    RECEIVED_MESSAGES_TTL_MS,
  )
  if (!phone) return all
  const cleanPhone = phone.replace(/\D/g, '')
  return all.filter(m => m.phone.replace(/\D/g, '').includes(cleanPhone) || cleanPhone.includes(m.phone.replace(/\D/g, '')))
}

// Internal fetcher — gets the full unfiltered Sent Messages tab from Sheets.
async function fetchAllSentMessages(): Promise<Message[]> {
  const sheets = getSheets()
  const sentTab = process.env.SENT_MESSAGES_TAB_NAME || T.sentMessages
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.HUB_SHEET_ID,
    range: `${sentTab}!${SHEETS.ranges.sentRange}`,
  })
  const rows = res.data.values || []
  return rows.map(row => ({
    timestamp: row[0] || '',
    phone: row[1] || '',
    name: row[2] || '',
    direction: 'sent' as const,
    text: row[3] || '',
    sent_by: row[4] || '',
    wa_message_id: row[5] || '',
    status: row[6] || '',
    template_used: row[7] || '',
  }))
}

export async function getSentMessages(phone?: string): Promise<Message[]> {
  // Same shape as getReceivedMessages — cache the unfiltered list, filter in-memory.
  const all = await readThrough<Message[]>(
    { get: () => _sentMessagesCache, set: e => { _sentMessagesCache = e } },
    fetchAllSentMessages
  )
  if (!phone) return all
  const cleanPhone = phone.replace(/\D/g, '')
  return all.filter(m => m.phone.replace(/\D/g, '').includes(cleanPhone) || cleanPhone.includes(m.phone.replace(/\D/g, '')))
}

export async function getConversation(phone: string): Promise<Message[]> {
  const [sent, received] = await Promise.all([
    getSentMessages(phone),
    getReceivedMessages(phone),
  ])
  return [...sent, ...received].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
}

export async function logSentMessage(data: {
  phone: string, name: string, message: string, sent_by: string,
  wa_message_id: string, status: string, template_used?: string
}): Promise<void> {
  const sheets = getSheets()
  const sentTab = process.env.SENT_MESSAGES_TAB_NAME || T.sentMessages
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.HUB_SHEET_ID,
    range: `${sentTab}!A:H`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        new Date().toISOString(),
        data.phone,
        data.name,
        data.message,
        data.sent_by,
        data.wa_message_id,
        data.status,
        data.template_used || '',
      ]],
    },
  })
  // The just-appended row needs to be visible to the same request that wrote
  // it (e.g. send-then-render flows).
  invalidateSentMessagesCache()
}

// --- Quick Replies ---

async function fetchAllQuickReplies(): Promise<QuickReply[]> {
  const sheets = getSheets()
  const qrTab = process.env.QUICK_REPLIES_TAB_NAME || T.quickReplies
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.HUB_SHEET_ID,
    range: `${qrTab}!${SHEETS.ranges.quickRepliesRange}`,
  })
  const rows = res.data.values || []
  return rows.map(row => ({
    id: row[0] || '',
    category: row[1] || '',
    title: row[2] || '',
    message: row[3] || '',
    created_by: row[4] || '',
    created_at: row[5] || '',
  }))
}

export async function getQuickReplies(): Promise<QuickReply[]> {
  return readThrough<QuickReply[]>(
    { get: () => _quickRepliesCache, set: e => { _quickRepliesCache = e } },
    fetchAllQuickReplies
  )
}

export async function createQuickReply(qr: Omit<QuickReply, 'id' | 'created_at'>): Promise<string> {
  const sheets = getSheets()
  const qrTab = process.env.QUICK_REPLIES_TAB_NAME || T.quickReplies
  const id = `qr_${Date.now()}`
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.HUB_SHEET_ID,
    range: `${qrTab}!A:F`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[id, qr.category, qr.title, qr.message, qr.created_by, new Date().toISOString()]],
    },
  })
  invalidateQuickRepliesCache()
  return id
}

export async function updateQuickReply(qrId: string, fields: Partial<Pick<QuickReply, 'category' | 'title' | 'message'>>): Promise<void> {
  const sheets = getSheets()
  const qrTab = process.env.QUICK_REPLIES_TAB_NAME || T.quickReplies
  const qrs = await getQuickReplies()
  const idx = qrs.findIndex(q => q.id === qrId)
  if (idx === -1) throw new Error('Quick reply not found')

  const rowNum = idx + 2
  const updated = { ...qrs[idx], ...fields }

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.HUB_SHEET_ID!,
    range: `${qrTab}!A${rowNum}:F${rowNum}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[updated.id, updated.category, updated.title, updated.message, updated.created_by, updated.created_at]],
    },
  })
  invalidateQuickRepliesCache()
}

export async function deleteQuickReply(qrId: string): Promise<void> {
  const sheets = getSheets()
  const qrTab = process.env.QUICK_REPLIES_TAB_NAME || T.quickReplies
  const qrs = await getQuickReplies()
  const idx = qrs.findIndex(q => q.id === qrId)
  if (idx === -1) throw new Error('Quick reply not found')

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: process.env.HUB_SHEET_ID!,
    fields: 'sheets.properties',
  })
  const qrSheet = meta.data.sheets?.find(s => s.properties?.title === qrTab)
  if (!qrSheet?.properties?.sheetId && qrSheet?.properties?.sheetId !== 0) throw new Error('Sheet not found')

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: process.env.HUB_SHEET_ID!,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: qrSheet.properties.sheetId,
            dimension: 'ROWS',
            startIndex: idx + 1,
            endIndex: idx + 2,
          },
        },
      }],
    },
  })
  invalidateQuickRepliesCache()
}

// --- Stats ---

export async function getLeadStats(filterAgent?: string): Promise<{
  total: number
  new: number
  deck_sent: number
  replied: number
  no_response: number
  call_done_interested: number
  hot: number
  converted: number
  delayed: number
  lost: number
  unassigned: number
  overdue_followups: number
}> {
  const { STATUS_MIGRATION } = await import('@/config/client')
  let leads = (await getLeads()).map(l => ({
    ...l,
    lead_status: (STATUS_MIGRATION[l.lead_status] || l.lead_status) as typeof l.lead_status,
  }))
  if (filterAgent) {
    leads = leads.filter(l => l.assigned_to === filterAgent)
  }
  const now = new Date()
  return {
    total: leads.length,
    new: leads.filter(l => l.lead_status === 'NEW').length,
    deck_sent: leads.filter(l => l.lead_status === 'DECK_SENT').length,
    replied: leads.filter(l => l.lead_status === 'REPLIED').length,
    no_response: leads.filter(l => l.lead_status === 'NO_RESPONSE').length,
    call_done_interested: leads.filter(l => l.lead_status === 'CALL_DONE_INTERESTED').length,
    hot: leads.filter(l => l.lead_status === 'HOT').length,
    converted: leads.filter(l => l.lead_status === 'CONVERTED').length,
    delayed: leads.filter(l => l.lead_status === 'DELAYED').length,
    lost: leads.filter(l => l.lead_status === 'LOST').length,
    unassigned: leads.filter(l => !l.assigned_to).length,
    overdue_followups: leads.filter(l => {
      if (!l.next_followup || l.lead_status === 'CONVERTED' || l.lead_status === 'LOST') return false
      return new Date(l.next_followup) < now
    }).length,
  }
}

// --- Knowledge Base ---

async function fetchAllKnowledgeBase(): Promise<KnowledgeBaseEntry[]> {
  const sheets = getSheets()
  const kbTab = process.env.KNOWLEDGE_BASE_TAB_NAME || T.knowledgeBase
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.HUB_SHEET_ID,
    range: `${kbTab}!${SHEETS.ranges.knowledgeBaseRange}`,
  })
  const rows = res.data.values || []
  return rows.map(row => ({
    id: row[0] || '',
    category: row[1] || '',
    title: row[2] || '',
    content: row[3] || '',
    link: row[4] || '',
    created_by: row[5] || '',
    created_at: row[6] || '',
  }))
}

export async function getKnowledgeBase(): Promise<KnowledgeBaseEntry[]> {
  return readThrough<KnowledgeBaseEntry[]>(
    { get: () => _knowledgeBaseCache, set: e => { _knowledgeBaseCache = e } },
    fetchAllKnowledgeBase
  )
}

export async function createKnowledgeBaseEntry(entry: Omit<KnowledgeBaseEntry, 'id' | 'created_at'>): Promise<string> {
  const sheets = getSheets()
  const kbTab = process.env.KNOWLEDGE_BASE_TAB_NAME || T.knowledgeBase
  const id = `kb_${Date.now()}`
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.HUB_SHEET_ID,
    range: `${kbTab}!A:G`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[id, entry.category, entry.title, entry.content, entry.link, entry.created_by, new Date().toISOString()]],
    },
  })
  invalidateKnowledgeBaseCache()
  return id
}

export async function updateKnowledgeBaseEntry(entryId: string, fields: Partial<Pick<KnowledgeBaseEntry, 'category' | 'title' | 'content' | 'link'>>): Promise<void> {
  const sheets = getSheets()
  const kbTab = process.env.KNOWLEDGE_BASE_TAB_NAME || T.knowledgeBase
  const entries = await getKnowledgeBase()
  const idx = entries.findIndex(e => e.id === entryId)
  if (idx === -1) throw new Error('Knowledge base entry not found')

  const rowNum = idx + 2
  const updated = { ...entries[idx], ...fields }

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.HUB_SHEET_ID!,
    range: `${kbTab}!A${rowNum}:G${rowNum}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[updated.id, updated.category, updated.title, updated.content, updated.link, updated.created_by, updated.created_at]],
    },
  })
  invalidateKnowledgeBaseCache()
}

export async function deleteKnowledgeBaseEntry(entryId: string): Promise<void> {
  const sheets = getSheets()
  const kbTab = process.env.KNOWLEDGE_BASE_TAB_NAME || T.knowledgeBase
  const entries = await getKnowledgeBase()
  const idx = entries.findIndex(e => e.id === entryId)
  if (idx === -1) throw new Error('Knowledge base entry not found')

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: process.env.HUB_SHEET_ID!,
    fields: 'sheets.properties',
  })
  const kbSheet = meta.data.sheets?.find(s => s.properties?.title === kbTab)
  if (!kbSheet?.properties?.sheetId && kbSheet?.properties?.sheetId !== 0) throw new Error('Sheet not found')

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: process.env.HUB_SHEET_ID!,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: kbSheet.properties.sheetId,
            dimension: 'ROWS',
            startIndex: idx + 1,
            endIndex: idx + 2,
          },
        },
      }],
    },
  })
  invalidateKnowledgeBaseCache()
}
