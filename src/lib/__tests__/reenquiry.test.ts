import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Lead } from '../types'

/**
 * A person who fills the form again months later used to become a SECOND lead:
 * the old record kept the WhatsApp thread and the agent, the new one held the
 * fresh answers and nobody worked it — and the pair read as a duplicate. The
 * repeat must land on the record that already has the history.
 */

interface Existing {
  row_number: number
  phone: string
  lead_status: string
  assigned_to: string
  enquiry_count: number
}

let existing: Existing[] = []
const writes: Array<{ sql: string; args: unknown[] }> = []

const execute = vi.fn(async (q: string | { sql: string; args?: unknown[] }) => {
  const sql = typeof q === 'string' ? q : q?.sql || ''
  const args = (typeof q === 'string' ? [] : q?.args || []) as unknown[]
  if (sql.includes('FROM leads WHERE merged_into IS NULL')) return { rows: existing, rowsAffected: 0 }
  writes.push({ sql, args })
  return { rowsAffected: 1, rows: [] }
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

const lead = (over: Partial<Lead> = {}): Lead => ({
  row_number: 200500,
  id: 'l:new-enquiry-999',
  created_time: '2026-12-01T10:00:00+05:30',
  campaign_name: 'Claude AI Campaign',
  full_name: 'Repeat Enquirer',
  phone: '919876543210',
  email: '', city: '', state: '',
  model_interest: 'rs_10_lakh+_(multi-outlet)',
  experience: 'yes_—_currently_running_a_food_outlet',
  timeline: 'within_30_days',
  platform: 'ig',
  lead_status: 'NEW',
  attempted_contact: '', first_call_date: '', wa_message_id: '',
  lead_priority: '', assigned_to: '', next_followup: '', notes: '',
  form_name: 'TBWX Franchise Partners — Rs 5 Lakh+ (v3)',
  ...over,
} as Lead)

const sqlFor = (fragment: string) => writes.filter(w => w.sql.includes(fragment))

describe('dbApplyReEnquiries', () => {
  beforeEach(() => { writes.length = 0; execute.mockClear() })

  it('updates the original lead and archives the duplicate row', async () => {
    existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'NO_RESPONSE', assigned_to: 'Anmol', enquiry_count: 1 }]
    const { dbApplyReEnquiries } = await import('../leads-db')
    const res = await dbApplyReEnquiries([lead()])

    expect(res.updated).toBe(1)
    const archive = sqlFor('merged_into = ?')[0]
    expect(archive.args[0]).toBe(4200)      // points at the original
    expect(archive.args[1]).toBe(200500)    // the new row is the one archived
    const update = sqlFor('UPDATE leads SET id = ?')[0]
    expect(update.args).toContain('l:new-enquiry-999')
    expect(update.args[update.args.length - 1]).toBe(4200) // the original is what changed
  })

  it('revives a cold lead to NEW so the agent works it again', async () => {
    existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'LOST', assigned_to: 'Happy', enquiry_count: 1 }]
    const { dbApplyReEnquiries } = await import('../leads-db')
    await dbApplyReEnquiries([lead()])
    expect(sqlFor('UPDATE leads SET id = ?')[0].sql).toContain("lead_status = 'NEW'")
  })

  it('never downgrades a live conversation — Final Negotiation keeps its stage', async () => {
    existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'FINAL_NEGOTIATION', assigned_to: 'Anmol', enquiry_count: 2 }]
    const { dbApplyReEnquiries } = await import('../leads-db')
    await dbApplyReEnquiries([lead()])
    const update = sqlFor('UPDATE leads SET id = ?')[0]
    expect(update.sql).not.toContain("lead_status = 'NEW'")
    expect(update.sql).toContain("lead_priority = 'HOT'") // surfaced, not reset
  })

  it('leaves the assigned agent alone', async () => {
    existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'NO_RESPONSE', assigned_to: 'Anmol', enquiry_count: 1 }]
    const { dbApplyReEnquiries } = await import('../leads-db')
    await dbApplyReEnquiries([lead()])
    expect(sqlFor('UPDATE leads SET id = ?')[0].sql).not.toContain('assigned_to')
  })

  it('stamps last_enquiry_at and counts the repeat', async () => {
    existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'REPLIED', assigned_to: 'Happy', enquiry_count: 1 }]
    const { dbApplyReEnquiries } = await import('../leads-db')
    await dbApplyReEnquiries([lead()])
    const update = sqlFor('UPDATE leads SET id = ?')[0]
    expect(update.sql).toContain('enquiry_count = COALESCE(enquiry_count, 1) + 1')
    expect(update.args).toContain('2026-12-01T10:00:00+05:30')
  })

  it('records a status change the agent can see', async () => {
    existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'LOST', assigned_to: 'Happy', enquiry_count: 1 }]
    const { dbApplyReEnquiries } = await import('../leads-db')
    await dbApplyReEnquiries([lead()])
    const audit = sqlFor('INSERT INTO lead_status_changes')[0]
    // args: [lead_row, phone, old_status, new_status, reason]
    expect(audit.args[0]).toBe(4200)
    expect(audit.args[2]).toBe('LOST')
    expect(audit.args[3]).toBe('NEW')
    expect(String(audit.args[4])).toContain('Re-enquired 2026-12-01')
    expect(String(audit.args[4])).toContain('Claude AI Campaign')
  })

  it('does nothing for a genuinely new phone number', async () => {
    existing = [{ row_number: 4200, phone: '919999999999', lead_status: 'NEW', assigned_to: 'Anmol', enquiry_count: 1 }]
    const { dbApplyReEnquiries } = await import('../leads-db')
    const res = await dbApplyReEnquiries([lead()])
    expect(res.updated).toBe(0)
    expect(writes).toHaveLength(0)
  })

  it('never treats a lead as its own duplicate', async () => {
    existing = [{ row_number: 200500, phone: '919876543210', lead_status: 'NEW', assigned_to: '', enquiry_count: 1 }]
    const { dbApplyReEnquiries } = await import('../leads-db')
    const res = await dbApplyReEnquiries([lead({ row_number: 200500 })])
    expect(res.updated).toBe(0)
  })

  it('folds into the OLDEST record when the phone already appears twice', async () => {
    existing = [
      { row_number: 5100, phone: '919876543210', lead_status: 'NEW', assigned_to: 'Happy', enquiry_count: 1 },
      { row_number: 4200, phone: '919876543210', lead_status: 'REPLIED', assigned_to: 'Anmol', enquiry_count: 1 },
    ]
    const { dbApplyReEnquiries } = await import('../leads-db')
    await dbApplyReEnquiries([lead()])
    expect(sqlFor('merged_into = ?')[0].args[0]).toBe(4200)
  })
})
