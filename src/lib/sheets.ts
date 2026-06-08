import { google } from 'googleapis'
import type { Lead, LeadStatus, QuickReply, Message, KnowledgeBaseEntry } from './types'
import { LEAD_COLUMN_MAP, LEAD_WRITE_COLUMNS, SHEETS } from '@/config/client'

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

/**
 * Get a single lead by row number — reads only that one row instead of all leads.
 * Use this when you need just one lead (e.g. to get a name for a message).
 */
export async function getLeadByRow(rowNumber: number): Promise<Lead | null> {
  const sheets = getSheets()
  const tab = process.env.LEADS_TAB_NAME || T.leads
  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: process.env.LEADS_SHEET_ID,
    range: `${tab}!A${rowNumber}:${SHEETS.ranges.leadsEnd}${rowNumber}`,
  }))
  const rows = res.data.values || []
  if (rows.length === 0) return null
  const row = rows[0]
  const C = LEAD_COLUMN_MAP
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
  }
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

type CacheEntry<T> = { promise: Promise<T>; ts: number }

let _leadsCache: CacheEntry<Lead[]> | null = null
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
  if (cur && Date.now() - cur.ts < ttlMs) {
    return cur.promise
  }
  const promise = fetcher().catch(err => {
    // Clear on failure so the next caller retries instead of returning a poisoned promise.
    if (entryRef.get()?.promise === promise) entryRef.set(null)
    throw err
  })
  entryRef.set({ promise, ts: Date.now() })
  return promise
}

export function invalidateLeadsCache() {
  _leadsCache = null
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
  return readThrough<Lead[]>(
    { get: () => _leadsCache, set: e => { _leadsCache = e } },
    async () => {
      const sheets = getSheets()
      const tab = process.env.LEADS_TAB_NAME || T.leads
      const res = await withRetry(() => sheets.spreadsheets.values.get({
        spreadsheetId: process.env.LEADS_SHEET_ID,
        range: `${tab}!A2:${SHEETS.ranges.leadsEnd}`,
      }))
      const rows = res.data.values || []
      const C = LEAD_COLUMN_MAP
      return rows.map((row, i) => ({
        row_number: i + 2,
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
      }))
    }
  )
}

export async function updateLeadField(rowNumber: number, column: string, value: string): Promise<void> {
  invalidateLeadsCache()
  const sheets = getSheets()
  const tab = process.env.LEADS_TAB_NAME || T.leads
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.LEADS_SHEET_ID,
    range: `${tab}!${column}${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  })
}

export async function updateLead(rowNumber: number, fields: Partial<Record<string, string>>): Promise<void> {
  invalidateLeadsCache()
  const entries = Object.entries(fields).filter(([field, value]) => LEAD_WRITE_COLUMNS[field] && value !== undefined)
  if (entries.length === 0) return

  // Single field — use simple update (1 API call)
  if (entries.length === 1) {
    const [field, value] = entries[0]
    await updateLeadField(rowNumber, LEAD_WRITE_COLUMNS[field], value!)
    return
  }

  // Multiple fields — batch into single batchUpdate call (1 API call instead of N)
  const sheets = getSheets()
  const tab = process.env.LEADS_TAB_NAME || T.leads
  const data = entries.map(([field, value]) => ({
    range: `${tab}!${LEAD_WRITE_COLUMNS[field]}${rowNumber}`,
    values: [[value]],
  }))

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.LEADS_SHEET_ID!,
    requestBody: { valueInputOption: 'RAW', data },
  })
}

/**
 * Batch update a single field across multiple rows in one API call.
 * Uses batchUpdate to stay within Google Sheets rate limits.
 */
export async function bulkUpdateField(rowNumbers: number[], field: string, value: string): Promise<void> {
  invalidateLeadsCache()
  const col = LEAD_WRITE_COLUMNS[field]
  if (!col) throw new Error(`Unknown field: ${field}`)

  const sheets = getSheets()
  const tab = process.env.LEADS_TAB_NAME || T.leads

  // Google Sheets batchUpdate accepts multiple value ranges in one call
  const data = rowNumbers.map(rowNum => ({
    range: `${tab}!${col}${rowNum}`,
    values: [[value]],
  }))

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.LEADS_SHEET_ID!,
    requestBody: {
      valueInputOption: 'RAW',
      data,
    },
  })
}

/**
 * Clear all data in a lead row (soft-delete — preserves row numbers).
 */
export async function clearLeadRow(rowNumber: number): Promise<void> {
  const sheets = getSheets()
  const tab = process.env.LEADS_TAB_NAME || T.leads
  // Clear columns A through Z for the row
  await sheets.spreadsheets.values.clear({
    spreadsheetId: process.env.LEADS_SHEET_ID!,
    range: `${tab}!A${rowNumber}:Z${rowNumber}`,
  })
  invalidateLeadsCache()
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
}): Promise<number> {
  const sheets = getSheets()
  const tab = process.env.LEADS_TAB_NAME || T.leads
  const C = LEAD_COLUMN_MAP

  // Build a row array matching the sheet column layout
  const maxCol = Math.max(...Object.values(C)) + 1
  const row: string[] = new Array(maxCol).fill('')

  const id = `manual_${Date.now()}`
  row[C.id] = id
  row[C.created_time] = new Date().toISOString()
  row[C.campaign_name] = data.source || 'Manual Entry'
  row[C.platform] = 'Manual'
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

  const appendRes = await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.LEADS_SHEET_ID,
    range: `${tab}!A:${SHEETS.ranges.leadsEnd}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  })
  invalidateLeadsCache()

  // Extract row number from the append response (e.g. "Leads!A255:AC255" → 255)
  const updatedRange = appendRes.data.updates?.updatedRange || ''
  const rowMatch = updatedRange.match(/(\d+)$/)
  return rowMatch ? parseInt(rowMatch[1]) : 0
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
