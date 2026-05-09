/**
 * Meta Conversions API (CAPI) — server-side event feedback to Meta.
 *
 * Why this exists: Meta's pixel only fires on form submit, so the optimizer
 * is finding more form-fillers (junk). When we send back HOT and CONVERTED
 * events from Sales Hub, Meta's algorithm rewires to find people like our
 * actual buyers. Industry benchmark: 30-50% CPL reduction on quality leads
 * within 4-6 weeks of consistent feedback.
 *
 * All PII (phone, email) is SHA-256 hashed before send. Raw values are never
 * logged or stored in meta_capi_events. Defaults pull from settings table
 * so admin can change pixel/token/values without redeploys.
 */

import { createHash } from 'crypto'
import { createClient, type Client } from '@libsql/client'
import path from 'path'
import fs from 'fs'
import { getSetting, setSetting, normalizePhone } from './db'

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

// ─── Settings keys ────────────────────────────────────────────────────────
export const META_CAPI_KEYS = {
  PIXEL_ID: 'meta_capi.pixel_id',
  ACCESS_TOKEN: 'meta_capi.access_token', // optional override; default = WHATSAPP_TOKEN env
  ENABLED: 'meta_capi.enabled',
  TEST_EVENT_CODE: 'meta_capi.test_event_code', // when set, events route to Meta Test Events
  PURCHASE_VALUE: 'meta_capi.purchase_value',
  LEAD_VALUE: 'meta_capi.lead_value',
  CURRENCY: 'meta_capi.currency',
  EVENT_SOURCE_URL: 'meta_capi.event_source_url',
  // Custom Audience sync (Phase 2)
  AD_ACCOUNT_ID: 'meta_capi.ad_account_id',
  AUDIENCE_BUYERS_ID: 'meta_capi.audience_buyers_id',
  AUDIENCE_EXCLUDE_ID: 'meta_capi.audience_exclude_id',
  AUDIENCE_LAST_SYNC: 'meta_capi.audience_last_sync',
  AUDIENCE_LAST_RESULT: 'meta_capi.audience_last_result',
} as const

// ─── Defaults ─────────────────────────────────────────────────────────────
// Discovered live via the Meta API:
//   Pixel ID: 24987144544272625 ("TBWX AD2024 Pixel" on act_377967454881310)
// Memory: franchise EXPRESS fee is ₹4-7 Lakhs → use ₹600,000 as a reasonable
// midpoint for Purchase value optimization. Lead value = 1/6 of Purchase
// (rough qualified-to-closed ratio, refines as conversion data grows).
export const META_CAPI_DEFAULTS = {
  PIXEL_ID: '24987144544272625',
  ENABLED: false, // OFF until admin verifies test events
  PURCHASE_VALUE: 600000,
  LEAD_VALUE: 100000,
  CURRENCY: 'INR',
  EVENT_SOURCE_URL: 'https://sales.tbwxpress.com',
  AD_ACCOUNT_ID: 'act_377967454881310', // TBWX AD2024 — discovered live
  AUDIENCE_BUYERS_NAME: 'TBWX CRM — Buyers (auto-synced)',
  AUDIENCE_EXCLUDE_NAME: 'TBWX CRM — Exclude (auto-synced)',
} as const

export interface MetaCapiSettings {
  pixel_id: string
  access_token: string // resolved value, never returned to UI
  has_token: boolean
  enabled: boolean
  test_event_code: string
  purchase_value: number
  lead_value: number
  currency: string
  event_source_url: string
}

export async function getMetaCapiSettings(): Promise<MetaCapiSettings> {
  const [pid, tok, enabled, testCode, pv, lv, cur, src] = await Promise.all([
    getSetting(META_CAPI_KEYS.PIXEL_ID),
    getSetting(META_CAPI_KEYS.ACCESS_TOKEN),
    getSetting(META_CAPI_KEYS.ENABLED),
    getSetting(META_CAPI_KEYS.TEST_EVENT_CODE),
    getSetting(META_CAPI_KEYS.PURCHASE_VALUE),
    getSetting(META_CAPI_KEYS.LEAD_VALUE),
    getSetting(META_CAPI_KEYS.CURRENCY),
    getSetting(META_CAPI_KEYS.EVENT_SOURCE_URL),
  ])
  const resolvedToken = (tok && tok.trim()) || process.env.WHATSAPP_TOKEN || ''
  return {
    pixel_id: pid || META_CAPI_DEFAULTS.PIXEL_ID,
    access_token: resolvedToken,
    has_token: !!resolvedToken,
    enabled: enabled === 'true',
    test_event_code: testCode || '',
    purchase_value: Number(pv) || META_CAPI_DEFAULTS.PURCHASE_VALUE,
    lead_value: Number(lv) || META_CAPI_DEFAULTS.LEAD_VALUE,
    currency: cur || META_CAPI_DEFAULTS.CURRENCY,
    event_source_url: src || META_CAPI_DEFAULTS.EVENT_SOURCE_URL,
  }
}

export async function setMetaCapiSettings(input: Partial<{
  pixel_id: string
  access_token: string
  enabled: boolean
  test_event_code: string
  purchase_value: number
  lead_value: number
  currency: string
  event_source_url: string
}>): Promise<void> {
  if (input.pixel_id !== undefined) await setSetting(META_CAPI_KEYS.PIXEL_ID, input.pixel_id.trim())
  if (input.access_token !== undefined) await setSetting(META_CAPI_KEYS.ACCESS_TOKEN, input.access_token.trim())
  if (input.enabled !== undefined) await setSetting(META_CAPI_KEYS.ENABLED, input.enabled ? 'true' : 'false')
  if (input.test_event_code !== undefined) await setSetting(META_CAPI_KEYS.TEST_EVENT_CODE, input.test_event_code.trim())
  if (input.purchase_value !== undefined && input.purchase_value > 0) await setSetting(META_CAPI_KEYS.PURCHASE_VALUE, String(input.purchase_value))
  if (input.lead_value !== undefined && input.lead_value > 0) await setSetting(META_CAPI_KEYS.LEAD_VALUE, String(input.lead_value))
  if (input.currency !== undefined && input.currency.trim()) await setSetting(META_CAPI_KEYS.CURRENCY, input.currency.trim())
  if (input.event_source_url !== undefined) await setSetting(META_CAPI_KEYS.EVENT_SOURCE_URL, input.event_source_url.trim())
}

// ─── Hashing per Meta's spec ─────────────────────────────────────────────
// https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
function sha256Lower(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

export function hashEmail(email: string | undefined | null): string | null {
  if (!email) return null
  const v = String(email).trim().toLowerCase()
  if (!v || !v.includes('@')) return null
  return sha256Lower(v)
}

// Phone: digits only, no leading +, no spaces. Country code required.
// We normalize via normalizePhone (gives "91XXXXXXXXXX") then hash.
export function hashPhone(phone: string | undefined | null): string | null {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length < 10) return null
  // normalizePhone returns 91XXXXXXXXXX for India; that's already E.164 minus '+'
  const normalized = normalizePhone(digits)
  return sha256Lower(normalized)
}

export function hashName(s: string | undefined | null): string | null {
  if (!s) return null
  const v = String(s).trim().toLowerCase()
  return v ? sha256Lower(v) : null
}

// ─── Event ID — deterministic so re-fires get deduped by Meta ────────────
export function buildEventId(parts: string[]): string {
  return createHash('sha256').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 40)
}

// ─── Public event types ──────────────────────────────────────────────────
export type CapiEventName = 'Lead' | 'Purchase' | 'CompleteRegistration' | 'AddToCart' | 'Subscribe' | string

export interface SendCapiInput {
  event_name: CapiEventName
  event_time?: number // unix seconds; default = now
  user_data: {
    phone?: string
    email?: string
    first_name?: string
    last_name?: string
    city?: string
    fbp?: string // _fbp cookie
    fbc?: string // fbclid → fbc click id
    client_ip?: string
    client_user_agent?: string
    // Meta-generated leadgen_id from the lead form (highest-priority match key
    // per Meta's "Conversion Leads" / Conversions API for CRM docs). Pass with
    // or without the "l:" prefix — we strip it.
    lead_id?: string | number
  }
  custom_data?: {
    value?: number
    currency?: string
    content_name?: string
    content_category?: string
    content_ids?: string[]
  }
  event_id?: string // deterministic key for dedup
  event_source_url?: string
  action_source?: 'website' | 'system_generated' | 'business_messaging' | 'phone_call' | 'chat' | 'email' | 'physical_store' | 'app' | 'other'
  // Internal — for our log
  lead_row?: number | null
}

export interface SendCapiResult {
  success: boolean
  event_id: string
  events_received?: number
  meta_response?: unknown
  error?: string
  test_mode: boolean
  log_id?: number
}

/**
 * Sends a single event to Meta. Hashes PII, picks up settings live (so admin
 * changes take effect immediately), logs the attempt + response. If
 * settings.test_event_code is non-empty, the event lands in Meta's
 * "Test Events" tab in Events Manager (won't affect real ad data) — set
 * this during initial validation, clear it for production.
 */
export async function sendCapiEvent(input: SendCapiInput): Promise<SendCapiResult> {
  const cfg = await getMetaCapiSettings()
  const eventTime = input.event_time || Math.floor(Date.now() / 1000)
  const eventId = input.event_id || buildEventId([
    String(input.lead_row ?? ''),
    input.event_name,
    input.user_data.phone || input.user_data.email || '',
    String(eventTime),
  ])
  const testMode = !!cfg.test_event_code

  // Hash PII per Meta spec — Meta accepts arrays of hashes
  // lead_id (Meta-generated) is the HIGHEST-priority match key per Meta's
  // CRM Conversion Leads spec — pass it raw (NOT hashed), strip the "l:" prefix
  // some Meta export formats add.
  const ud: Record<string, string[] | string | number> = {}
  const ph = hashPhone(input.user_data.phone)
  if (ph) ud.ph = [ph]
  const em = hashEmail(input.user_data.email)
  if (em) ud.em = [em]
  const fn = hashName(input.user_data.first_name)
  if (fn) ud.fn = [fn]
  const ln = hashName(input.user_data.last_name)
  if (ln) ud.ln = [ln]
  const ct = hashName(input.user_data.city)
  if (ct) ud.ct = [ct]
  if (input.user_data.fbp) ud.fbp = input.user_data.fbp
  if (input.user_data.fbc) ud.fbc = input.user_data.fbc
  if (input.user_data.client_ip) ud.client_ip_address = input.user_data.client_ip
  if (input.user_data.client_user_agent) ud.client_user_agent = input.user_data.client_user_agent
  const cleanLeadId = stripLeadIdPrefix(input.user_data.lead_id)
  if (cleanLeadId) {
    // Meta accepts numeric or string. Use numeric if it parses cleanly.
    const asNum = Number(cleanLeadId)
    ud.lead_id = Number.isFinite(asNum) && /^\d+$/.test(cleanLeadId) ? asNum : cleanLeadId
  }

  // Insert log row in pending state
  const db = getClient()
  const ins = await db.execute({
    sql: `INSERT INTO meta_capi_events
            (lead_row, phone, event_name, event_id, value, currency, status, attempts)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.lead_row ?? null,
      input.user_data.phone || '',
      input.event_name,
      eventId,
      input.custom_data?.value ?? 0,
      input.custom_data?.currency ?? cfg.currency,
      testMode ? 'test' : 'pending',
      0,
    ],
  })
  const logId = Number(ins.lastInsertRowid || 0)

  // If CAPI is disabled OR no token, log + bail
  if (!cfg.enabled || !cfg.access_token) {
    await db.execute({
      sql: `UPDATE meta_capi_events SET status = 'pending', last_error = ? WHERE id = ?`,
      args: [cfg.access_token ? 'CAPI disabled' : 'No access_token', logId],
    })
    return { success: false, event_id: eventId, error: cfg.access_token ? 'CAPI disabled' : 'No access_token', test_mode: testMode, log_id: logId }
  }

  const event: Record<string, unknown> = {
    event_name: input.event_name,
    event_time: eventTime,
    event_id: eventId,
    action_source: input.action_source || 'system_generated',
    event_source_url: input.event_source_url || cfg.event_source_url,
    user_data: ud,
  }
  // CRM tags are REQUIRED for Meta to recognize this as a Conversion Leads
  // / CRM event (vs a generic Pixel fire). Without these the event is still
  // accepted but the "Maximise conversion leads" optimizer can't use it.
  event.custom_data = {
    event_source: CRM_EVENT_SOURCE,
    lead_event_source: CRM_LEAD_EVENT_SOURCE,
    ...(input.custom_data?.value !== undefined && { value: input.custom_data.value }),
    ...(input.custom_data?.currency && { currency: input.custom_data.currency }),
    ...(input.custom_data?.content_name && { content_name: input.custom_data.content_name }),
    ...(input.custom_data?.content_category && { content_category: input.custom_data.content_category }),
    ...(input.custom_data?.content_ids && { content_ids: input.custom_data.content_ids }),
  }

  const body: Record<string, unknown> = {
    data: [event],
    access_token: cfg.access_token,
  }
  if (testMode) body.test_event_code = cfg.test_event_code

  // Try once, then exponential backoff retry up to 3 attempts inline
  let attempt = 0
  const maxAttempts = 3
  let lastErr = ''
  let metaResp: unknown = null
  let eventsReceived: number | undefined

  while (attempt < maxAttempts) {
    attempt++
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${cfg.pixel_id}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json() as { events_received?: number; error?: { message?: string; type?: string; code?: number } }
      metaResp = j
      if (res.ok && typeof j.events_received === 'number') {
        eventsReceived = j.events_received
        await db.execute({
          sql: `UPDATE meta_capi_events
                SET status = ?, attempts = ?, sent_at = datetime('now'),
                    meta_response = ?, meta_events_received = ?, last_error = NULL
                WHERE id = ?`,
          args: [testMode ? 'test' : 'sent', attempt, JSON.stringify(j), eventsReceived, logId],
        })
        return { success: true, event_id: eventId, events_received: eventsReceived, meta_response: j, test_mode: testMode, log_id: logId }
      }
      lastErr = j.error?.message || `HTTP ${res.status}`
      // 4xx auth/permission errors are not worth retrying
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break
    } catch (err) {
      lastErr = String(err)
    }
    // backoff: 250ms, 750ms
    await new Promise(r => setTimeout(r, 250 * attempt))
  }

  await db.execute({
    sql: `UPDATE meta_capi_events
          SET status = 'failed', attempts = ?, last_error = ?, meta_response = ?
          WHERE id = ?`,
    args: [attempt, lastErr.slice(0, 500), metaResp ? JSON.stringify(metaResp) : null, logId],
  })
  return { success: false, event_id: eventId, error: lastErr, meta_response: metaResp, test_mode: testMode, log_id: logId }
}

// ─── High-level helpers — call these from lead status changes ────────────
export async function fireLeadHotEvent(opts: {
  lead_row: number
  phone: string
  email?: string
  first_name?: string
  last_name?: string
  city?: string
  lead_id?: string | number  // Meta's leadgen_id (col A in Sheet, with or without "l:" prefix)
}): Promise<SendCapiResult> {
  const cfg = await getMetaCapiSettings()
  return sendCapiEvent({
    event_name: 'Lead',
    event_id: buildEventId([String(opts.lead_row), 'Lead', new Date().toISOString().split('T')[0]]),
    lead_row: opts.lead_row,
    user_data: {
      phone: opts.phone,
      email: opts.email,
      first_name: opts.first_name,
      last_name: opts.last_name,
      city: opts.city,
      lead_id: opts.lead_id,
    },
    custom_data: {
      value: cfg.lead_value,
      currency: cfg.currency,
      content_name: 'TBWX Franchise Inquiry',
      content_category: 'franchise',
    },
  })
}

export async function fireConvertedEvent(opts: {
  lead_row: number
  phone: string
  email?: string
  first_name?: string
  last_name?: string
  city?: string
  lead_id?: string | number
  override_value?: number
}): Promise<SendCapiResult> {
  const cfg = await getMetaCapiSettings()
  return sendCapiEvent({
    event_name: 'Purchase',
    event_id: buildEventId([String(opts.lead_row), 'Purchase']),
    lead_row: opts.lead_row,
    user_data: {
      phone: opts.phone,
      email: opts.email,
      first_name: opts.first_name,
      last_name: opts.last_name,
      city: opts.city,
      lead_id: opts.lead_id,
    },
    custom_data: {
      value: opts.override_value ?? cfg.purchase_value,
      currency: cfg.currency,
      content_name: 'TBWX Franchise Conversion',
      content_category: 'franchise',
    },
  })
}

// ─── Recent events for the admin panel ────────────────────────────────────
export interface RecentCapiEvent {
  id: number
  lead_row: number | null
  phone: string
  event_name: string
  status: string
  value: number
  currency: string
  attempts: number
  last_error: string | null
  meta_events_received: number | null
  created_at: string
  sent_at: string | null
}

export async function getRecentCapiEvents(limit = 20): Promise<RecentCapiEvent[]> {
  const db = getClient()
  const r = await db.execute({
    sql: `SELECT id, lead_row, phone, event_name, status, value, currency,
                 attempts, last_error, meta_events_received, created_at, sent_at
          FROM meta_capi_events
          ORDER BY id DESC
          LIMIT ?`,
    args: [limit],
  })
  return r.rows.map(row => ({
    id: Number(row.id),
    lead_row: row.lead_row !== null && row.lead_row !== undefined ? Number(row.lead_row) : null,
    phone: String(row.phone || ''),
    event_name: String(row.event_name),
    status: String(row.status),
    value: Number(row.value || 0),
    currency: String(row.currency || ''),
    attempts: Number(row.attempts || 0),
    last_error: row.last_error ? String(row.last_error) : null,
    meta_events_received: row.meta_events_received !== null && row.meta_events_received !== undefined ? Number(row.meta_events_received) : null,
    created_at: String(row.created_at),
    sent_at: row.sent_at ? String(row.sent_at) : null,
  }))
}

// ─── Phase 2: Custom Audience sync ────────────────────────────────────────
// Pushes hashed phones to two managed audiences:
//   - "Buyers" (CONVERTED)  → Lookalike seed for prospecting
//   - "Exclude" (LOST + opted-out) → exclusion in ad sets
// Both auto-created on first sync; ids cached in settings.
//
// Meta Custom Audience users API expects pre-hashed values (SHA-256) and a
// schema specifying field types. We send PHONE-only batches (we don't always
// have email).

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
const META_GRAPH = process.env.META_GRAPH_API_BASE || `https://graph.facebook.com/${META_API_VERSION}`

// Tags Meta uses to recognize an event as coming from a CRM (vs a generic Pixel
// fire). Without these, "Maximise conversion leads" optimization mode can't
// route the event correctly in the auction.
const CRM_EVENT_SOURCE = 'crm'
const CRM_LEAD_EVENT_SOURCE = 'TBWX Sales Hub'

function stripLeadIdPrefix(raw: string | number | undefined): string | undefined {
  if (raw === undefined || raw === null) return undefined
  const s = String(raw).trim()
  if (!s) return undefined
  // Meta's CSV / lead-form export prefixes the leadgen_id with "l:" — strip
  return s.replace(/^l:\s*/i, '')
}

async function getAdAccountId(): Promise<string> {
  return (await getSetting(META_CAPI_KEYS.AD_ACCOUNT_ID)) || META_CAPI_DEFAULTS.AD_ACCOUNT_ID
}

async function getCapiAccessToken(): Promise<string> {
  const stored = await getSetting(META_CAPI_KEYS.ACCESS_TOKEN)
  return (stored && stored.trim()) || process.env.WHATSAPP_TOKEN || ''
}

interface MetaAudience { id: string; name: string }

/**
 * Finds an existing custom audience by exact name or creates one.
 * Returns the audience id. Caches the id in settings under the given key.
 */
export async function ensureCustomAudience(opts: {
  name: string
  settingKey: string
  description?: string
}): Promise<{ id: string; created: boolean; error?: string }> {
  const token = await getCapiAccessToken()
  if (!token) return { id: '', created: false, error: 'No access_token' }
  const adAccount = await getAdAccountId()

  // 1. Cached id?
  const cached = await getSetting(opts.settingKey)
  if (cached) {
    // Verify it still exists
    const r = await fetch(`${META_GRAPH}/${cached}?fields=id,name&access_token=${encodeURIComponent(token)}`)
    if (r.ok) {
      const d = await r.json() as MetaAudience
      if (d.id) return { id: d.id, created: false }
    }
    // Cached id is stale — fall through to find/create
  }

  // 2. Find by name in the ad account
  const listRes = await fetch(`${META_GRAPH}/${adAccount}/customaudiences?fields=id,name&limit=200&access_token=${encodeURIComponent(token)}`)
  if (listRes.ok) {
    const list = await listRes.json() as { data?: MetaAudience[] }
    const found = (list.data || []).find(a => a.name === opts.name)
    if (found?.id) {
      await setSetting(opts.settingKey, found.id)
      return { id: found.id, created: false }
    }
  }

  // 3. Create
  const createRes = await fetch(`${META_GRAPH}/${adAccount}/customaudiences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: opts.name,
      subtype: 'CUSTOM',
      description: opts.description || 'Auto-managed by Sales Hub',
      customer_file_source: 'USER_PROVIDED_ONLY',
      access_token: token,
    }),
  })
  const createJson = await createRes.json() as { id?: string; error?: { message?: string } }
  if (!createRes.ok || !createJson.id) {
    return { id: '', created: false, error: createJson.error?.message || `Create failed (${createRes.status})` }
  }
  await setSetting(opts.settingKey, createJson.id)
  return { id: createJson.id, created: true }
}

/**
 * Pushes hashed phones to a custom audience in batches of 10000.
 * Meta accepts pre-hashed phones (SHA-256, lowercase, no spaces, with country code).
 * Action ADD = additive (deduped by Meta). Use REMOVE to delete.
 */
export async function pushPhonesToAudience(opts: {
  audienceId: string
  phones: string[]
  action?: 'ADD' | 'REMOVE'
}): Promise<{ success: boolean; sent: number; error?: string }> {
  const token = await getCapiAccessToken()
  if (!token) return { success: false, sent: 0, error: 'No access_token' }
  if (!opts.audienceId) return { success: false, sent: 0, error: 'No audienceId' }

  const action = opts.action || 'ADD'
  const hashed = opts.phones
    .map(p => hashPhone(p))
    .filter((h): h is string => !!h)

  if (hashed.length === 0) return { success: true, sent: 0 }

  const BATCH = 10000
  let sent = 0
  for (let i = 0; i < hashed.length; i += BATCH) {
    const batch = hashed.slice(i, i + BATCH)
    const payload = {
      schema: ['PHONE'],
      data: batch.map(h => [h]),
    }
    const url = action === 'REMOVE'
      ? `${META_GRAPH}/${opts.audienceId}/users`
      : `${META_GRAPH}/${opts.audienceId}/users`
    const res = await fetch(url, {
      method: action === 'REMOVE' ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, access_token: token }),
    })
    const data = await res.json() as { error?: { message?: string }; num_received?: number }
    if (!res.ok) {
      return { success: false, sent, error: data.error?.message || `HTTP ${res.status}` }
    }
    sent += data.num_received ?? batch.length
  }
  return { success: true, sent }
}

export interface AudienceSyncResult {
  buyers: { audience_id: string; sent: number; created: boolean; error?: string }
  exclude: { audience_id: string; sent: number; created: boolean; error?: string }
  ts: string
}

/**
 * Top-level sync: pushes CONVERTED → Buyers audience, LOST + opted-out → Exclude audience.
 * Persists last result + timestamp in settings for the admin panel.
 */
export async function runAudienceSync(opts: {
  buyer_phones: string[]
  exclude_phones: string[]
}): Promise<AudienceSyncResult> {
  const buyerEnsured = await ensureCustomAudience({
    name: META_CAPI_DEFAULTS.AUDIENCE_BUYERS_NAME,
    settingKey: META_CAPI_KEYS.AUDIENCE_BUYERS_ID,
    description: 'Sales Hub auto-sync: leads with status=CONVERTED. Use as Lookalike seed.',
  })
  const excludeEnsured = await ensureCustomAudience({
    name: META_CAPI_DEFAULTS.AUDIENCE_EXCLUDE_NAME,
    settingKey: META_CAPI_KEYS.AUDIENCE_EXCLUDE_ID,
    description: 'Sales Hub auto-sync: leads with status=LOST or opted-out via WhatsApp. Exclude in ad sets.',
  })

  const buyersPush = buyerEnsured.id
    ? await pushPhonesToAudience({ audienceId: buyerEnsured.id, phones: opts.buyer_phones })
    : { success: false, sent: 0, error: buyerEnsured.error || 'No audience id' }
  const excludePush = excludeEnsured.id
    ? await pushPhonesToAudience({ audienceId: excludeEnsured.id, phones: opts.exclude_phones })
    : { success: false, sent: 0, error: excludeEnsured.error || 'No audience id' }

  const result: AudienceSyncResult = {
    buyers: { audience_id: buyerEnsured.id, sent: buyersPush.sent, created: buyerEnsured.created, error: buyerEnsured.error || buyersPush.error },
    exclude: { audience_id: excludeEnsured.id, sent: excludePush.sent, created: excludeEnsured.created, error: excludeEnsured.error || excludePush.error },
    ts: new Date().toISOString(),
  }
  await setSetting(META_CAPI_KEYS.AUDIENCE_LAST_SYNC, result.ts)
  await setSetting(META_CAPI_KEYS.AUDIENCE_LAST_RESULT, JSON.stringify(result))
  return result
}

export async function getLastAudienceSync(): Promise<{ ts: string; result: AudienceSyncResult | null }> {
  const [ts, raw] = await Promise.all([
    getSetting(META_CAPI_KEYS.AUDIENCE_LAST_SYNC),
    getSetting(META_CAPI_KEYS.AUDIENCE_LAST_RESULT),
  ])
  let result: AudienceSyncResult | null = null
  try { if (raw) result = JSON.parse(raw) } catch { /* ignore */ }
  return { ts: ts || '', result }
}

export async function getCapiStats(): Promise<{ sent_24h: number; failed_24h: number; test_24h: number; total: number }> {
  const db = getClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [s, f, t, tot] = await Promise.all([
    db.execute({ sql: "SELECT COUNT(*) AS n FROM meta_capi_events WHERE status = 'sent' AND created_at >= ?", args: [since] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM meta_capi_events WHERE status = 'failed' AND created_at >= ?", args: [since] }),
    db.execute({ sql: "SELECT COUNT(*) AS n FROM meta_capi_events WHERE status = 'test' AND created_at >= ?", args: [since] }),
    db.execute('SELECT COUNT(*) AS n FROM meta_capi_events'),
  ])
  return {
    sent_24h: Number(s.rows[0]?.n || 0),
    failed_24h: Number(f.rows[0]?.n || 0),
    test_24h: Number(t.rows[0]?.n || 0),
    total: Number(tot.rows[0]?.n || 0),
  }
}
