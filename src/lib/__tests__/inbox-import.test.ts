import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { Client } from '@libsql/client'

/**
 * /api/inbox/sync used to rewrite every lead contact and re-check every sheet
 * message one statement at a time, every 2 minutes (Sep-Oct 2026 CPU
 * incident). importInboxSheetData must write only real changes, in one batch,
 * and stop at the per-run cap. Runs against a real in-memory SQLite.
 */

type DbModule = typeof import('../db')
let dbm: DbModule
let db: Client

const prevDbUrl = process.env.TURSO_DATABASE_URL
afterAll(() => {
  if (prevDbUrl === undefined) delete process.env.TURSO_DATABASE_URL
  else process.env.TURSO_DATABASE_URL = prevDbUrl
})

beforeAll(async () => {
  vi.resetModules()
  process.env.TURSO_DATABASE_URL = ':memory:'
  dbm = await import('../db')
  db = await dbm.ensureInit()
})

const count = async (sql: string) => Number((await db.execute(sql)).rows[0].n)

const input = {
  leadContacts: [
    { phone: '+91 98765 43210', name: 'Asha', lead_row: 11, lead_id: 'l:11', city: 'Pune' },
    { phone: '9876500001', name: 'Ravi', lead_row: 12, lead_id: 'l:12', city: '' },
  ],
  messages: [
    { phone: '919876543210', name: 'Asha', direction: 'received' as const, text: 'hi', timestamp: '2026-10-01T10:00:00.000Z', wa_message_id: 'wamid.1', status: 'received' },
    { phone: '919876543210', name: 'Asha', direction: 'sent' as const, text: 'hello', timestamp: '2026-10-01T10:05:00.000Z', wa_message_id: 'wamid.2', sent_by: 'Closer', status: 'sent', template_used: '' },
    // duplicate id inside the same sheet read
    { phone: '919876543210', name: 'Asha', direction: 'sent' as const, text: 'hello', timestamp: '2026-10-01T10:05:00.000Z', wa_message_id: 'wamid.2', status: 'sent' },
    // no id: cannot be deduped, so it is skipped
    { phone: '919876543210', name: 'Asha', direction: 'received' as const, text: '??', timestamp: '2026-10-01T10:06:00.000Z', wa_message_id: '', status: 'received' },
    // brand-new thread from a number with no contact yet
    { phone: '919811122233', name: 'Walk-in', direction: 'received' as const, text: 'menu?', timestamp: '2026-10-01T11:00:00.000Z', wa_message_id: 'wamid.3', status: 'received' },
  ],
}

describe('importInboxSheetData', () => {
  it('imports new contacts and messages once, normalising phones', async () => {
    const r = await dbm.importInboxSheetData({ ...input, maxWrites: 1000 })
    expect(r).toEqual({ contacts_created: 3, contacts_updated: 0, messages_imported: 3, truncated: false })
    expect(await count("SELECT COUNT(*) AS n FROM contacts WHERE phone IN ('919876543210', '919876500001', '919811122233')")).toBe(3)
    expect(await count('SELECT COUNT(*) AS n FROM messages')).toBe(3)
    const asha = (await db.execute("SELECT name, is_lead, lead_row, city FROM contacts WHERE phone = '919876543210'")).rows[0]
    expect(asha).toMatchObject({ name: 'Asha', is_lead: 1, lead_row: 11, city: 'Pune' })
  })

  it('writes NOTHING on a repeat run with the same data (the old loop rewrote every row)', async () => {
    const r = await dbm.importInboxSheetData({ ...input, maxWrites: 1000 })
    expect(r).toEqual({ contacts_created: 0, contacts_updated: 0, messages_imported: 0, truncated: false })
    expect(await count('SELECT COUNT(*) AS n FROM messages')).toBe(3)
  })

  it('updates only the fields that changed', async () => {
    const r = await dbm.importInboxSheetData({
      leadContacts: [{ phone: '9876500001', name: 'Ravi K', lead_row: 12, lead_id: 'l:12', city: '' }],
      messages: [],
      maxWrites: 1000,
    })
    expect(r.contacts_updated).toBe(1)
    const ravi = (await db.execute("SELECT name, lead_id FROM contacts WHERE phone = '919876500001'")).rows[0]
    expect(ravi).toMatchObject({ name: 'Ravi K', lead_id: 'l:12' })
  })

  it('stops at the per-run cap and reports truncation; the next run finishes the rest', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      phone: '919811122233', name: 'Walk-in', direction: 'received' as const, text: `m${i}`,
      timestamp: `2026-10-02T10:0${i}:00.000Z`, wa_message_id: `wamid.cap.${i}`, status: 'received',
    }))
    const first = await dbm.importInboxSheetData({ leadContacts: [], messages: many, maxWrites: 4 })
    expect(first.truncated).toBe(true)
    expect(first.messages_imported).toBe(4)
    const second = await dbm.importInboxSheetData({ leadContacts: [], messages: many, maxWrites: 100 })
    expect(second).toMatchObject({ messages_imported: 6, truncated: false })
    expect(await count("SELECT COUNT(*) AS n FROM messages WHERE wa_message_id LIKE 'wamid.cap.%'")).toBe(10)
  })
})
