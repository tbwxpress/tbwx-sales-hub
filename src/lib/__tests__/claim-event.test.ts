import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The bug this guards against: Meta redelivers a webhook when our ack is slow,
 * and every delivery used to re-run the sends because each one READ "not sent
 * yet" before any of them had WRITTEN. One lead got the same intro 10 times in
 * 1.4 seconds. claimEvent must let exactly one caller through, even when all
 * callers arrive at once.
 */

// In-memory stand-in for the real table: INSERT OR IGNORE on a PRIMARY KEY.
const claimed = new Set<string>()
// db.ts calls execute() both ways: with a plain SQL string (migrations) and
// with { sql, args } (everything parameterised). Accept both.
const execute = vi.fn(async (q: string | { sql: string; args?: unknown[] }) => {
  const sql = typeof q === 'string' ? q : q?.sql || ''
  const args = typeof q === 'string' ? [] : q?.args || []
  if (sql.startsWith('INSERT OR IGNORE INTO processed_events')) {
    const id = String((args || [])[0])
    if (claimed.has(id)) return { rowsAffected: 0 }
    claimed.add(id)
    return { rowsAffected: 1 }
  }
  if (sql.trim().startsWith('DELETE FROM processed_events')) {
    const n = claimed.size
    claimed.clear()
    return { rowsAffected: n }
  }
  return { rowsAffected: 0 }
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

describe('claimEvent', () => {
  beforeEach(() => { claimed.clear(); execute.mockClear() })

  it('lets the first caller through and blocks repeats', async () => {
    const { claimEvent } = await import('../db')
    expect(await claimEvent('wa:msg:abc', 'inbound_message')).toBe(true)
    expect(await claimEvent('wa:msg:abc', 'inbound_message')).toBe(false)
    expect(await claimEvent('wa:msg:abc', 'inbound_message')).toBe(false)
  })

  it('lets exactly one of ten SIMULTANEOUS claims through (the real failure)', async () => {
    const { claimEvent } = await import('../db')
    const results = await Promise.all(
      Array.from({ length: 10 }, () => claimEvent('wa:msg:same', 'inbound_message')),
    )
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('treats different events independently', async () => {
    const { claimEvent } = await import('../db')
    expect(await claimEvent('agent_intro:lead:1')).toBe(true)
    expect(await claimEvent('agent_intro:lead:2')).toBe(true)
    expect(await claimEvent('agent_intro:lead:1')).toBe(false)
  })

  it('fails OPEN when the claim errors — a bookkeeping outage must not mute replies', async () => {
    execute.mockRejectedValueOnce(new Error('db down'))
    const { claimEvent } = await import('../db')
    expect(await claimEvent('wa:msg:xyz')).toBe(true)
  })

  it('allows an empty id through rather than swallowing the event', async () => {
    const { claimEvent } = await import('../db')
    expect(await claimEvent('')).toBe(true)
  })
})
