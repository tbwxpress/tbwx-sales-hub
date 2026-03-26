import { google } from 'googleapis'
import type { Lead, LeadStatus, User, QuickReply, Message } from './types'
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
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.LEADS_SHEET_ID,
    range: `${tab}!A${rowNumber}:${SHEETS.ranges.leadsEnd}${rowNumber}`,
  })
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

export async function getLeads(): Promise<Lead[]> {
  const sheets = getSheets()
  const tab = process.env.LEADS_TAB_NAME || T.leads
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.LEADS_SHEET_ID,
    range: `${tab}!A2:${SHEETS.ranges.leadsEnd}`,
  })
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

export async function updateLeadField(rowNumber: number, column: string, value: string): Promise<void> {
  const sheets = getSheets()
  const tab = process.env.LEADS_TAB_NAME || T.leads
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.LEADS_SHEET_ID,
    range: `${tab}!${column}${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  })
}

// Re-export for backward compatibility — now sourced from config
export const LEAD_COLUMNS = LEAD_WRITE_COLUMNS

export async function updateLead(rowNumber: number, fields: Partial<Record<string, string>>): Promise<void> {
  const entries = Object.entries(fields).filter(([field, value]) => LEAD_COLUMNS[field] && value !== undefined)
  if (entries.length === 0) return

  // Single field — use simple update (1 API call)
  if (entries.length === 1) {
    const [field, value] = entries[0]
    await updateLeadField(rowNumber, LEAD_COLUMNS[field], value!)
    return
  }

  // Multiple fields — batch into single batchUpdate call (1 API call instead of N)
  const sheets = getSheets()
  const tab = process.env.LEADS_TAB_NAME || T.leads
  const data = entries.map(([field, value]) => ({
    range: `${tab}!${LEAD_COLUMNS[field]}${rowNumber}`,
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
  const col = LEAD_COLUMNS[field]
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

  // Extract row number from the append response (e.g. "Leads!A255:AC255" → 255)
  const updatedRange = appendRes.data.updates?.updatedRange || ''
  const rowMatch = updatedRange.match(/(\d+)$/)
  return rowMatch ? parseInt(rowMatch[1]) : 0
}

// --- Messages ---

export async function getReceivedMessages(phone?: string): Promise<Message[]> {
  const sheets = getSheets()
  const repliesTab = process.env.REPLIES_TAB_NAME || T.replies
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.LEADS_SHEET_ID,
    range: `${repliesTab}!${SHEETS.ranges.repliesRange}`,
  })
  const rows = res.data.values || []
  let messages = rows
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
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '')
    messages = messages.filter(m => m.phone.replace(/\D/g, '').includes(cleanPhone) || cleanPhone.includes(m.phone.replace(/\D/g, '')))
  }
  return messages
}

export async function getSentMessages(phone?: string): Promise<Message[]> {
  const sheets = getSheets()
  const sentTab = process.env.SENT_MESSAGES_TAB_NAME || T.sentMessages
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.HUB_SHEET_ID,
    range: `${sentTab}!${SHEETS.ranges.sentRange}`,
  })
  const rows = res.data.values || []
  let messages = rows.map(row => ({
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
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '')
    messages = messages.filter(m => m.phone.replace(/\D/g, '').includes(cleanPhone) || cleanPhone.includes(m.phone.replace(/\D/g, '')))
  }
  return messages
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
}

// --- Users ---
// DEPRECATED — users now in DB, see src/lib/users.ts
// These functions remain for backward compatibility only.

export async function getUsers(): Promise<User[]> {
  const sheets = getSheets()
  const usersTab = process.env.USERS_TAB_NAME || T.users
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.HUB_SHEET_ID,
    range: `${usersTab}!${SHEETS.ranges.usersRange}`,
  })
  const rows = res.data.values || []
  return rows.map(row => ({
    id: row[0] || '',
    name: row[1] || '',
    email: row[2] || '',
    password_hash: row[3] || '',
    role: (row[4] || 'agent') as User['role'],
    can_assign: row[5] === 'TRUE',
    active: row[6] !== 'FALSE',
  }))
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const users = await getUsers()
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null
}

export async function createUser(user: Omit<User, 'id'>): Promise<string> {
  const sheets = getSheets()
  const usersTab = process.env.USERS_TAB_NAME || T.users
  const id = `u_${Date.now()}`
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.HUB_SHEET_ID,
    range: `${usersTab}!A:G`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        id,
        user.name,
        user.email,
        user.password_hash,
        user.role,
        user.can_assign ? 'TRUE' : 'FALSE',
        user.active ? 'TRUE' : 'FALSE',
      ]],
    },
  })
  return id
}

export async function updateUser(userId: string, fields: Partial<User>): Promise<void> {
  const sheets = getSheets()
  const usersTab = process.env.USERS_TAB_NAME || T.users
  const users = await getUsers()
  const userIndex = users.findIndex(u => u.id === userId)
  if (userIndex === -1) throw new Error('User not found')

  const rowNum = userIndex + 2
  const user = { ...users[userIndex], ...fields }

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.HUB_SHEET_ID,
    range: `${usersTab}!A${rowNum}:G${rowNum}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        user.id, user.name, user.email, user.password_hash, user.role,
        user.can_assign ? 'TRUE' : 'FALSE',
        user.active ? 'TRUE' : 'FALSE',
      ]],
    },
  })
}

// --- Quick Replies ---

export async function getQuickReplies(): Promise<QuickReply[]> {
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
}

// --- Stats ---

export async function getLeadStats(filterAgent?: string): Promise<{
  total: number
  new: number
  contacted: number
  replied: number
  interested: number
  hot: number
  converted: number
  lost: number
  unassigned: number
  overdue_followups: number
}> {
  let leads = await getLeads()

  // If agent name provided, only count their assigned leads (not unassigned)
  if (filterAgent) {
    leads = leads.filter(l => l.assigned_to === filterAgent)
  }

  const now = new Date()
  return {
    total: leads.length,
    new: leads.filter(l => l.lead_status === 'NEW' || l.lead_status === 'DECK_SENT').length,
    contacted: leads.filter(l => l.lead_status === 'CONTACTED' || (l.lead_status as string) === 'Contacted').length,
    replied: leads.filter(l => l.lead_status === 'REPLIED').length,
    interested: leads.filter(l => l.lead_status === 'INTERESTED').length,
    hot: leads.filter(l => l.lead_status === 'HOT' || l.lead_priority === 'HOT').length,
    converted: leads.filter(l => l.lead_status === 'CONVERTED').length,
    lost: leads.filter(l => l.lead_status === 'LOST').length,
    unassigned: leads.filter(l => !l.assigned_to).length,
    overdue_followups: leads.filter(l => {
      if (!l.next_followup || l.lead_status === 'CONVERTED' || l.lead_status === 'LOST') return false
      return new Date(l.next_followup) < now
    }).length,
  }
}
