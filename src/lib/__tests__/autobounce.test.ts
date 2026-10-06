import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { Client } from '@libsql/client'

/**
 * The incident this guards against (Sep-Oct 2026): the hourly auto-bounce
 * looked up messages and call logs lead by lead (thousands of synchronous
 * SQLite statements) and pinned the CPU for 9+ minutes. The scan is now one
 * set-based query. These tests run it against a REAL in-memory SQLite with the
 * production schema (ensureInit), so the SQL itself is exercised, including the
 * timestamp normalisation across 'YYYY-MM-DD HH:MM:SS', ISO 'Z' and
 * '+05:30' / '-05:00' offsets.
 */

// work.ts pulls users / notifications / sheet mirroring from modules with their
// own DB clients or network calls. Stub just those edges.
const updateLead = vi.fn<(row: number, fields: Record<string, string>) => Promise<void>>(async () => {})
const notifyQuiet = vi.fn(async () => {})
vi.mock('../sheets', () => ({ getLeads: vi.fn(async () => []), updateLead }))
vi.mock('../notifications', () => ({ notifyQuiet }))
vi.mock('../users', () => ({
  getUsers: vi.fn(async () => [
    { id: 'u-c', name: 'Closer', active: true, receives_new_leads: true, agent_role: 'closer', is_telecaller: false },
    { id: 'u-t1', name: 'Tina', active: true, receives_new_leads: true, agent_role: 'telecaller', is_telecaller: true },
    { id: 'u-t2', name: 'Tara', active: true, receives_new_leads: true, agent_role: 'telecaller', is_telecaller: true },
  ]),
}))

type DbModule = typeof import('../db')
let dbm: DbModule
let db: Client

const DAY = 86_400_000
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString()
const sqliteTs = (daysAgo: number) => iso(daysAgo).slice(0, 19).replace('T', ' ') // datetime('now') shape
// '2026-08-10T02:40:06-05:00' shape (Meta lead created_time)
const offsetTs = (daysAgo: number) => {
  const d = new Date(Date.now() - daysAgo * DAY - 5 * 3600_000)
  return d.toISOString().slice(0, 19) + '-05:00'
}

let nextRow = 1
async function lead(opts: {
  status?: string
  agent?: string
  created?: string
  merged?: number
  lastEnquiry?: string
}): Promise<{ row: number; phone: string }> {
  const row = nextRow++
  const local = String(9800000000 + row)
  const phone = `+91${local}`
  await db.execute({
    sql: `INSERT INTO leads (row_number, phone, full_name, lead_status, assigned_to, created_time, merged_into, last_enquiry_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [row, phone, `Lead ${row}`, opts.status ?? 'REPLIED', opts.agent ?? 'Closer',
      opts.created ?? iso(30), opts.merged ?? null, opts.lastEnquiry ?? ''],
  })
  await db.execute({ sql: 'INSERT OR IGNORE INTO contacts (phone) VALUES (?)', args: [`91${local}`] })
  return { row, phone: `91${local}` }
}

const msg = (phone: string, direction: 'sent' | 'received', ts: string) =>
  db.execute({ sql: 'INSERT INTO messages (phone, direction, text, timestamp) VALUES (?, ?, ?, ?)', args: [phone, direction, 'hi', ts] })

// Fixture ids, filled in beforeAll.
const L: Record<string, { row: number; phone: string }> = {}

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

  L.untouched = await lead({})                                   // stale: nothing since created 30d ago
  L.outbound = await lead({}); await msg(L.outbound.phone, 'sent', iso(2))
  L.inboundOnly = await lead({}); await msg(L.inboundOnly.phone, 'received', iso(1)) // a reply from the lead keeps the thread warm (counts as a touch)
  L.hot = await lead({ status: 'HOT' })                          // excluded status
  L.delayed = await lead({ status: 'DELAYED' })                  // excluded status
  L.merged = await lead({ merged: 1 })                           // merged duplicate
  L.otherAgent = await lead({ agent: 'Someone Else' })           // not a closer we scan
  L.called = await lead({ status: 'NO_RESPONSE' })
  await db.execute({ sql: 'INSERT INTO call_logs (phone, created_at) VALUES (?, ?)', args: [L.called.phone, sqliteTs(3)] })
  L.humanNote = await lead({})
  await db.execute({ sql: 'INSERT INTO lead_notes (phone, note, created_by, created_at) VALUES (?, ?, ?, ?)', args: [L.humanNote.phone, 'called back', 'Closer', sqliteTs(1)] })
  L.systemNote = await lead({})
  await db.execute({ sql: 'INSERT INTO lead_notes (phone, note, created_by, created_at) VALUES (?, ?, ?, ?)', args: [L.systemNote.phone, '[Auto] bounce', 'System (Mail Watcher)', sqliteTs(1)] })
  L.autoStatus = await lead({})
  await db.execute({ sql: "INSERT INTO lead_status_changes (lead_row, new_status, changed_by, source, created_at) VALUES (?, 'DECK_SENT', 'System', 'auto-send', ?)", args: [L.autoStatus.row, sqliteTs(1)] })
  L.manualStatus = await lead({})
  await db.execute({ sql: "INSERT INTO lead_status_changes (lead_row, new_status, changed_by, source, created_at) VALUES (?, 'REPLIED', 'Closer', 'manual', ?)", args: [L.manualStatus.row, sqliteTs(1)] })
  L.workEvent = await lead({})
  await db.execute({ sql: "INSERT INTO work_events (lead_row, action, created_at) VALUES (?, 'call', ?)", args: [L.workEvent.row, sqliteTs(2)] })
  L.handedToMe = await lead({})
  await db.execute({ sql: "INSERT INTO assignment_log (lead_row, from_agent, to_agent, assigned_by, created_at) VALUES (?, 'Tina', 'Closer', 'Tina', ?)", args: [L.handedToMe.row, sqliteTs(1)] })
  L.handedElsewhere = await lead({})
  await db.execute({ sql: "INSERT INTO assignment_log (lead_row, from_agent, to_agent, assigned_by, created_at) VALUES (?, 'Closer', 'Tina', 'x', ?)", args: [L.handedElsewhere.row, sqliteTs(1)] })
  L.fresh = await lead({ created: offsetTs(2) })                 // created 2d ago (with -05:00 offset)
  L.reEnquired = await lead({ created: iso(60), lastEnquiry: iso(1) })
  L.fba = await lead({})
  await db.execute({ sql: "INSERT INTO fba_packs (id, lead_phone, sent_at) VALUES ('p1', ?, ?)", args: [L.fba.phone, sqliteTs(2)] })
  L.junkDate = await lead({ created: 'created_time' })           // unparseable, no touches -> stale
  // Mixed formats on one lead: an old ISO outbound message and a recent
  // space-format call. The newest touch must win regardless of shape.
  L.mixed = await lead({ created: '2026-01-05T10:00:00+05:30' })
  await msg(L.mixed.phone, 'sent', iso(20))
  await db.execute({ sql: 'INSERT INTO call_logs (phone, created_at) VALUES (?, ?)', args: [L.mixed.phone, sqliteTs(1)] })
  // Older than `untouched`, so it sorts first.
  L.oldest = await lead({ created: iso(90) })
})

const SKIP = ['CONVERTED', 'LOST', 'ARCHIVED', 'DELAYED', 'HOT', 'FINAL_NEGOTIATION']

describe('getAutoBounceCandidates (set-based stale scan)', () => {
  it('returns exactly the leads nobody on our side touched for idleDays, oldest first', async () => {
    const { scanned, stale } = await dbm.getAutoBounceCandidates({ agents: ['Closer'], excludeStatuses: SKIP, idleDays: 7, limit: 100 })
    const rows = stale.map(s => s.row_number)

    // eligible = every 'Closer' lead minus HOT, DELAYED, merged
    const eligible = Object.entries(L).filter(([k]) => !['hot', 'delayed', 'merged', 'otherAgent'].includes(k))
    expect(scanned).toBe(eligible.length)

    expect(new Set(rows)).toEqual(new Set([
      L.untouched.row, L.systemNote.row, L.autoStatus.row,
      L.handedElsewhere.row, L.junkDate.row, L.oldest.row,
    ]))
    // Oldest touch first: the junk date has no usable time at all (0), then 90d, then the 30d ones.
    expect(rows[0]).toBe(L.junkDate.row)
    expect(rows[1]).toBe(L.oldest.row)
    expect(stale.find(s => s.row_number === L.junkDate.row)?.last_touch_at).toBe('')
    expect(stale.find(s => s.row_number === L.oldest.row)?.last_touch_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  })

  it('honours the limit', async () => {
    const { stale } = await dbm.getAutoBounceCandidates({ agents: ['Closer'], excludeStatuses: SKIP, idleDays: 7, limit: 2 })
    expect(stale.map(s => s.row_number)).toEqual([L.junkDate.row, L.oldest.row])
  })

  it('returns nothing for an empty agent list', async () => {
    expect(await dbm.getAutoBounceCandidates({ agents: [], excludeStatuses: SKIP, idleDays: 7, limit: 10 })).toEqual({ scanned: 0, stale: [] })
  })

  it('counts open leads per agent, skipping closed statuses and merged rows', async () => {
    const counts = await dbm.getOpenLeadCountsByAgent(['CONVERTED', 'LOST', 'ARCHIVED'])
    expect(counts.get('Someone Else')).toBe(1)
    // every Closer lead except the merged one (HOT and DELAYED are still open)
    expect(counts.get('Closer')).toBe(Object.keys(L).length - 2)
  })
})

describe('runAutoBounce', () => {
  it('caps reassignments per run, reports truncation, and spreads load across telecallers', async () => {
    const { runAutoBounce } = await import('../work')
    updateLead.mockClear()
    const res = await runAutoBounce({ maxBounces: 3 })
    expect(res.scanned).toBeGreaterThan(3)
    expect(res.bounced).toBe(3)
    expect(res.truncated).toBe(true) // 7 stale, cap 3
    // oldest touch first; the 30-day ties break by row number
    expect(res.details.map(d => d.lead_row)).toEqual([L.junkDate.row, L.oldest.row, L.untouched.row])
    // Least-loaded pick with in-memory load tracking: Tara/Tina alternate, not all to one.
    expect(new Set(res.details.map(d => d.to))).toEqual(new Set(['Tara', 'Tina']))
    expect(updateLead).toHaveBeenCalledTimes(3)
    expect(updateLead.mock.calls[0][1]).toMatchObject({ lead_status: 'DELAYED', assigned_to: res.details[0].to })
  })

  it('stops when the time budget is spent and says so', async () => {
    const { runAutoBounce } = await import('../work')
    updateLead.mockClear()
    const res = await runAutoBounce({ maxBounces: 50, outOfTime: () => true })
    expect(res.bounced).toBe(0)
    expect(res.truncated).toBe(true)
    expect(updateLead).not.toHaveBeenCalled()
  })
})
