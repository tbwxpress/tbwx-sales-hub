import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A send claim marks a lead as messaged. When the WhatsApp send behind it
 * failed, the claim used to stay, so the lead was never messaged again. These
 * cover handing the claim back and counting failed attempts (auto-send gives
 * up after 3 and alerts the manager).
 */

// In-memory stand-in for processed_events (PRIMARY KEY on event_id) and a
// small messages table.
const events = new Set<string>()
let messages: Array<{ phone: string; direction: string; sent_by: string; timestamp: string }> = []

const execute = vi.fn(async (q: string | { sql: string; args?: unknown[] }) => {
  const sql = (typeof q === 'string' ? q : q?.sql || '').replace(/\s+/g, ' ').trim()
  const args = (typeof q === 'string' ? [] : q?.args || []) as unknown[]
  if (sql.startsWith('INSERT OR IGNORE INTO processed_events')) {
    const id = String(args[0])
    if (events.has(id)) return { rowsAffected: 0, rows: [] }
    events.add(id)
    return { rowsAffected: 1, rows: [] }
  }
  if (sql.startsWith('DELETE FROM processed_events WHERE event_id = ?')) {
    const had = events.delete(String(args[0]))
    return { rowsAffected: had ? 1 : 0, rows: [] }
  }
  if (sql.startsWith('SELECT COUNT(*) AS n FROM processed_events WHERE substr(event_id, 1, ?) = ?')) {
    const prefix = String(args[1])
    return { rows: [{ n: [...events].filter(e => e.startsWith(prefix)).length }], rowsAffected: 0 }
  }
  if (sql.startsWith('SELECT sent_by FROM messages')) {
    const [norm, raw, since] = args.map(String)
    const rows = messages.filter(m =>
      (m.phone === norm || m.phone === raw) && m.direction === 'sent' && m.timestamp >= since)
    return { rows, rowsAffected: 0 }
  }
  return { rowsAffected: 0, rows: [] }
})

vi.mock('@libsql/client', () => ({
  createClient: () => ({
    execute,
    executeMultiple: vi.fn(async () => {}),
    batch: vi.fn(async () => []),
    transaction: vi.fn(),
    close: vi.fn(),
  }),
}))

describe('releaseEvent', () => {
  beforeEach(() => { events.clear(); execute.mockClear() })

  it('a released claim can be claimed again: a failed send gets retried', async () => {
    const { claimEvent } = await import('../db')
    const { releaseEvent } = await import('../leads-db-extra')
    const key = 'optin:lead:4200:l:abc'
    expect(await claimEvent(key, 'auto_send_optin')).toBe(true)
    expect(await claimEvent(key, 'auto_send_optin')).toBe(false) // concurrent run still blocked
    expect(await releaseEvent(key)).toBe(true)                    // send failed → hand it back
    expect(await claimEvent(key, 'auto_send_optin')).toBe(true)   // next run retries
  })

  it('releasing one claim leaves the others alone', async () => {
    const { claimEvent } = await import('../db')
    const { releaseEvent } = await import('../leads-db-extra')
    await claimEvent('optin:lead:1:x')
    await claimEvent('optin:lead:2:y')
    await releaseEvent('optin:lead:1:x')
    expect(await claimEvent('optin:lead:2:y')).toBe(false)
  })

  it('is a no-op for an empty id', async () => {
    const { releaseEvent } = await import('../leads-db-extra')
    expect(await releaseEvent('')).toBe(false)
    expect(execute).not.toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining('DELETE') }))
  })

  it('never throws when the database errors', async () => {
    const { releaseEvent } = await import('../leads-db-extra')
    execute.mockRejectedValueOnce(new Error('db down'))
    await expect(releaseEvent('optin:lead:1:x')).resolves.toBe(false)
  })
})

describe('send-failure counting', () => {
  beforeEach(() => { events.clear(); execute.mockClear() })

  it('counts attempts 1, 2, 3 per claim key', async () => {
    const { recordSendFailure, countSendFailures } = await import('../leads-db-extra')
    const key = 'optin:lead:4200:l:abc'
    expect(await countSendFailures(key)).toBe(0)
    expect(await recordSendFailure(key)).toBe(1)
    expect(await recordSendFailure(key)).toBe(2)
    expect(await recordSendFailure(key)).toBe(3)
    expect(await countSendFailures(key)).toBe(3)
  })

  it("does not mix up two leads' failures, or block the claim itself", async () => {
    const { claimEvent } = await import('../db')
    const { recordSendFailure, countSendFailures } = await import('../leads-db-extra')
    await recordSendFailure('optin:lead:1:a')
    await recordSendFailure('optin:lead:1:a')
    expect(await countSendFailures('optin:lead:2:b')).toBe(0)
    expect(await claimEvent('optin:lead:1:a')).toBe(true)
  })
})

describe('isAutomatedSender / hasManualMessageSince', () => {
  beforeEach(() => { messages = [] })

  it('treats every system job and bot as automated, and people as people', async () => {
    const { isAutomatedSender } = await import('../leads-db-extra')
    for (const s of ['', 'auto-send', 'bot', 'n8n', 'auto: missed-call', 'System (Auto)', 'System (Drip)', 'System (Reactivation)']) {
      expect(isAutomatedSender(s)).toBe(true)
    }
    for (const s of ['Anmol', 'Happy', 'Autumn']) expect(isAutomatedSender(s)).toBe(false)
  })

  it('finds an agent message inside the window and ignores drip sends', async () => {
    const { hasManualMessageSince } = await import('../leads-db-extra')
    messages = [
      { phone: '919876543210', direction: 'sent', sent_by: 'System (Drip)', timestamp: '2026-12-09T10:00:00Z' },
      { phone: '919876543210', direction: 'sent', sent_by: 'Anmol', timestamp: '2026-12-01T10:00:00Z' },
    ]
    expect(await hasManualMessageSince('919876543210', '2026-12-07T00:00:00Z')).toBe(false) // agent msg too old
    messages.push({ phone: '919876543210', direction: 'sent', sent_by: 'Anmol', timestamp: '2026-12-08T10:00:00Z' })
    expect(await hasManualMessageSince('919876543210', '2026-12-07T00:00:00Z')).toBe(true)
  })
})
