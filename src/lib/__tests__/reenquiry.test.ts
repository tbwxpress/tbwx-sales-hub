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
  created_time?: string
  last_enquiry_at?: string
  campaign_name?: string
  notes?: string
}

let existing: Existing[] = []
// Rows already folded on an earlier pass: the archive UPDATE matches nothing.
let alreadyMerged = new Set<number>()
const writes: Array<{ sql: string; args: unknown[] }> = []

const execute = vi.fn(async (q: string | { sql: string; args?: unknown[] }) => {
  const sql = typeof q === 'string' ? q : q?.sql || ''
  const args = (typeof q === 'string' ? [] : q?.args || []) as unknown[]
  if (sql.includes('FROM leads WHERE merged_into IS NULL')) return { rows: existing, rowsAffected: 0 }
  writes.push({ sql, args })
  if (sql.includes('SET merged_into = ?') && alreadyMerged.has(Number(args[1]))) return { rowsAffected: 0, rows: [] }
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
// The UPDATE that refreshes the surviving (master) lead.
const masterUpdates = () => sqlFor('enquiry_count = COALESCE(enquiry_count, 1) + 1')
const masterUpdate = () => masterUpdates()[0]
// Value bound to `column = ?` in the master update.
const argFor = (column: string) => {
  const u = masterUpdate()
  const placeholders = u.sql.slice(u.sql.indexOf('SET ') + 4, u.sql.indexOf(' WHERE')).split(', ')
  let i = 0
  for (const p of placeholders) {
    if (p === `${column} = ?`) return u.args[i]
    if (p.includes('?')) i++
  }
  return undefined
}

describe('dbApplyReEnquiries', () => {
  beforeEach(() => { writes.length = 0; execute.mockClear(); alreadyMerged = new Set() })

  it('updates the original lead and archives the duplicate row', async () => {
    existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'NO_RESPONSE', assigned_to: 'Anmol', enquiry_count: 1 }]
    const { dbApplyReEnquiries } = await import('../leads-db')
    const res = await dbApplyReEnquiries([lead()])

    expect(res.updated).toBe(1)
    const archive = sqlFor('merged_into = ?')[0]
    expect(archive.args[0]).toBe(4200)      // points at the original
    expect(archive.args[1]).toBe(200500)    // the new row is the one archived
    const update = masterUpdate()
    expect(update.args[update.args.length - 1]).toBe(4200) // the original is what changed
  })

  it('keeps the original Meta lead id and records the new one in the notes', async () => {
    existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'NO_RESPONSE', assigned_to: 'Anmol', enquiry_count: 1, notes: 'src:hero | page:/franchise' }]
    const { dbApplyReEnquiries } = await import('../leads-db')
    await dbApplyReEnquiries([lead()])
    expect(masterUpdate().sql).not.toMatch(/(^|[\s,])id = \?/)
    const notes = String(argFor('notes'))
    expect(notes).toContain('l:new-enquiry-999')
    expect(notes).toContain('src:hero | page:/franchise') // attribution survives
  })

  it('revives a cold lead to NEW so the agent works it again', async () => {
    existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'LOST', assigned_to: 'Happy', enquiry_count: 1 }]
    const { dbApplyReEnquiries } = await import('../leads-db')
    await dbApplyReEnquiries([lead()])
    expect(masterUpdate().sql).toContain("lead_status = 'NEW'")
  })

  it('never downgrades a live conversation — Final Negotiation keeps its stage', async () => {
    existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'FINAL_NEGOTIATION', assigned_to: 'Anmol', enquiry_count: 2 }]
    const { dbApplyReEnquiries } = await import('../leads-db')
    await dbApplyReEnquiries([lead()])
    const update = masterUpdate()
    expect(update.sql).not.toContain("lead_status = 'NEW'")
    expect(update.sql).toContain("lead_priority = 'HOT'") // surfaced, not reset
  })

  it('leaves the assigned agent alone', async () => {
    existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'NO_RESPONSE', assigned_to: 'Anmol', enquiry_count: 1 }]
    const { dbApplyReEnquiries } = await import('../leads-db')
    await dbApplyReEnquiries([lead()])
    expect(masterUpdate().sql).not.toContain('assigned_to')
  })

  it('stamps last_enquiry_at and counts the repeat', async () => {
    existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'REPLIED', assigned_to: 'Happy', enquiry_count: 1 }]
    const { dbApplyReEnquiries } = await import('../leads-db')
    await dbApplyReEnquiries([lead()])
    const update = masterUpdate()
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
      { row_number: 5100, phone: '919876543210', lead_status: 'NEW', assigned_to: 'Happy', enquiry_count: 1, created_time: '2026-07-01T00:00:00Z' },
      { row_number: 4200, phone: '919876543210', lead_status: 'REPLIED', assigned_to: 'Anmol', enquiry_count: 1, created_time: '2026-05-01T00:00:00Z' },
    ]
    const { dbApplyReEnquiries } = await import('../leads-db')
    await dbApplyReEnquiries([lead()])
    expect(sqlFor('merged_into = ?')[0].args[0]).toBe(4200)
  })

  it('picks the master by AGE, not row number — row numbers are band-offset per form', async () => {
    // The lead with the history came through the newer form, so it sits in the
    // 200000 band; the low-numbered row is a newer enquiry on the original form.
    // Ordering by row number would archive the record holding the conversation.
    existing = [
      { row_number: 200072, phone: '919876543210', lead_status: 'DECK_SENT', assigned_to: 'Anmol', enquiry_count: 1, created_time: '2026-08-25T09:00:00Z' },
      { row_number: 5421, phone: '919876543210', lead_status: 'NEW', assigned_to: '', enquiry_count: 1, created_time: '2026-08-29T09:00:00Z' },
    ]
    const { dbApplyReEnquiries } = await import('../leads-db')
    await dbApplyReEnquiries([lead({ row_number: 5999, created_time: '2026-12-01T10:00:00+05:30' })])
    const archive = sqlFor('merged_into = ?')[0]
    expect(archive.args[0]).toBe(200072) // the record with the conversation survives
    expect(archive.args[1]).toBe(5999)
  })

  describe('revive window', () => {
    it('a repeat within 7 days keeps status, owner and priority, and adds a note', async () => {
      // Agent already moved them to REPLIED; a second submit 2 days later must
      // not throw that work away.
      existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'REPLIED', assigned_to: 'Anmol', enquiry_count: 1, created_time: '2026-11-29T10:00:00+05:30' }]
      const { dbApplyReEnquiries } = await import('../leads-db')
      const res = await dbApplyReEnquiries([lead()])
      expect(res.updated).toBe(1)
      const update = masterUpdate()
      expect(update.sql).not.toContain('lead_status')
      expect(update.sql).not.toContain('lead_priority')
      expect(update.sql).not.toContain('next_followup')
      expect(String(argFor('notes'))).toContain('Re-enquired 2026-12-01 via Claude AI Campaign')
      const audit = sqlFor('INSERT INTO lead_status_changes')[0]
      expect(audit.args[3]).toBe('REPLIED') // no transition
    })

    it('a second submit minutes later does not reset a DECK_SENT lead', async () => {
      existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'DECK_SENT', assigned_to: 'Happy', enquiry_count: 1, created_time: '2026-12-01T09:50:00+05:30' }]
      const { dbApplyReEnquiries } = await import('../leads-db')
      await dbApplyReEnquiries([lead()])
      expect(masterUpdate().sql).not.toContain("lead_status = 'NEW'")
    })

    it('revives once the previous enquiry is more than 7 days old', async () => {
      existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'REPLIED', assigned_to: 'Anmol', enquiry_count: 1, created_time: '2026-11-20T10:00:00+05:30' }]
      const { dbApplyReEnquiries } = await import('../leads-db')
      await dbApplyReEnquiries([lead()])
      expect(masterUpdate().sql).toContain("lead_status = 'NEW'")
    })

    it('measures from the LATEST enquiry, not the first', async () => {
      existing = [{
        row_number: 4200, phone: '919876543210', lead_status: 'NO_RESPONSE', assigned_to: 'Anmol', enquiry_count: 2,
        created_time: '2026-08-01T10:00:00+05:30', last_enquiry_at: '2026-11-28T10:00:00+05:30',
      }]
      const { dbApplyReEnquiries } = await import('../leads-db')
      await dbApplyReEnquiries([lead()])
      expect(masterUpdate().sql).not.toContain("lead_status = 'NEW'")
    })

    it('two repeats in one batch: only the first revives, the second sees it', async () => {
      existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'LOST', assigned_to: 'Happy', enquiry_count: 1, created_time: '2026-10-01T10:00:00+05:30' }]
      const { dbApplyReEnquiries } = await import('../leads-db')
      await dbApplyReEnquiries([
        lead({ row_number: 200500, id: 'l:a', created_time: '2026-12-01T10:00:00+05:30' }),
        lead({ row_number: 200501, id: 'l:b', created_time: '2026-12-01T10:05:00+05:30' }),
      ])
      const [first, second] = masterUpdates()
      expect(first.sql).toContain("lead_status = 'NEW'")
      expect(second.sql).not.toContain('lead_status')
    })
  })

  describe('field refresh', () => {
    it('never wipes a known answer with a blank one', async () => {
      existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'LOST', assigned_to: 'Happy', enquiry_count: 1 }]
      const { dbApplyReEnquiries } = await import('../leads-db')
      await dbApplyReEnquiries([lead({ timeline: '', experience: '  ', campaign_name: '', form_answers: '', model_interest: 'rs_5_lakh' })])
      const sql = masterUpdate().sql
      expect(sql).not.toContain('timeline = ?')
      expect(sql).not.toContain('experience = ?')
      expect(sql).not.toContain('campaign_name = ?')
      expect(sql).not.toContain('form_answers = ?')
      expect(argFor('model_interest')).toBe('rs_5_lakh') // a real new answer still lands
    })

    it('a Manual Entry lead stays Manual Entry so auto-send never takes it over', async () => {
      existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'NO_RESPONSE', assigned_to: 'Apurva', enquiry_count: 1, campaign_name: 'Manual Entry' }]
      const { dbApplyReEnquiries } = await import('../leads-db')
      await dbApplyReEnquiries([lead()])
      const sql = masterUpdate().sql
      expect(sql).not.toContain('campaign_name = ?')
      expect(sql).not.toContain('assigned_to')
    })

    it('skips a row that was already folded on an earlier pass', async () => {
      existing = [{ row_number: 4200, phone: '919876543210', lead_status: 'LOST', assigned_to: 'Happy', enquiry_count: 2 }]
      alreadyMerged = new Set([200500])
      const { dbApplyReEnquiries } = await import('../leads-db')
      const res = await dbApplyReEnquiries([lead()])
      expect(res.updated).toBe(0)
      expect(masterUpdates()).toHaveLength(0) // enquiry_count not bumped twice
      expect(sqlFor('INSERT INTO lead_status_changes')).toHaveLength(0)
    })
  })
})

describe('activeLeads', () => {
  it('drops merged duplicates and keeps everything else', async () => {
    const { activeLeads } = await import('../leads-db')
    const rows = [
      { row_number: 1, merged_into: null },
      { row_number: 2, merged_into: 1 },
      { row_number: 3 },
    ]
    expect(activeLeads(rows).map(r => r.row_number)).toEqual([1, 3])
  })
})
