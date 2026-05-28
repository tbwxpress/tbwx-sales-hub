import { describe, it, expect, beforeEach } from 'vitest'
import { createUpdateRequests, getRequestById, listPendingForAgent, getPendingForLeadAndAgent, listRequestsForAdmin, cancelRequest, autoAnswerForNote } from '../update-requests'
import { ensureInit } from '../db'

beforeEach(async () => {
  const db = await ensureInit()
  await db.execute({
    sql: `DELETE FROM update_requests WHERE agent_id IN ('user_happy','agent_a','agent_b','agent_c','agent_d','agent_e','agent_f','agent_g','agent_h','agent_z')`,
  })
})

describe('createUpdateRequests', () => {
  it('inserts one row per lead with PENDING status', async () => {
    const ids = await createUpdateRequests({
      agent_id: 'user_happy',
      agent_name: 'Happy',
      requested_by: 'admin_1',
      lead_rows: [101, 102, 103],
      due_date: '2026-06-01',
      reason: 'quarterly check-in',
    })
    expect(ids).toHaveLength(3)
    const first = await getRequestById(ids[0])
    expect(first?.status).toBe('PENDING')
    expect(first?.lead_row).toBe(101)
    expect(first?.due_date).toBe('2026-06-01')
    expect(first?.reason).toBe('quarterly check-in')
  })

  it('handles empty reason as null', async () => {
    const ids = await createUpdateRequests({
      agent_id: 'user_happy',
      agent_name: 'Happy',
      requested_by: 'admin_1',
      lead_rows: [200],
      due_date: '2026-06-01',
      reason: '',
    })
    const row = await getRequestById(ids[0])
    expect(row?.reason).toBeNull()
  })
})

describe('listPendingForAgent', () => {
  it('returns only PENDING for the given agent, sorted by due_date asc', async () => {
    await createUpdateRequests({
      agent_id: 'agent_a', agent_name: 'A', requested_by: 'admin_1',
      lead_rows: [300], due_date: '2026-06-05',
    })
    await createUpdateRequests({
      agent_id: 'agent_a', agent_name: 'A', requested_by: 'admin_1',
      lead_rows: [301], due_date: '2026-06-01',
    })
    await createUpdateRequests({
      agent_id: 'agent_b', agent_name: 'B', requested_by: 'admin_1',
      lead_rows: [302], due_date: '2026-06-01',
    })

    const aList = await listPendingForAgent('agent_a')
    expect(aList.map(r => r.lead_row)).toEqual([301, 300])

    const bList = await listPendingForAgent('agent_b')
    expect(bList.map(r => r.lead_row)).toEqual([302])
  })
})

describe('getPendingForLeadAndAgent', () => {
  it('returns the oldest pending request for that (lead, agent) pair, or null', async () => {
    const [id1] = await createUpdateRequests({
      agent_id: 'agent_c', agent_name: 'C', requested_by: 'admin_1',
      lead_rows: [400], due_date: '2026-06-10',
    })
    // Add a second one (rare but possible)
    await createUpdateRequests({
      agent_id: 'agent_c', agent_name: 'C', requested_by: 'admin_1',
      lead_rows: [400], due_date: '2026-07-10',
    })
    const r = await getPendingForLeadAndAgent(400, 'agent_c')
    expect(r?.id).toBe(id1)  // oldest by created_at
    expect(r?.status).toBe('PENDING')

    const missing = await getPendingForLeadAndAgent(999, 'agent_c')
    expect(missing).toBeNull()
  })
})

describe('listRequestsForAdmin', () => {
  it('filters by status', async () => {
    const pending = await listRequestsForAdmin({ status: 'PENDING' })
    expect(pending.every(r => r.status === 'PENDING')).toBe(true)
  })

  it('"overdue" returns only PENDING where due_date < today', async () => {
    await createUpdateRequests({
      agent_id: 'agent_d', agent_name: 'D', requested_by: 'admin_1',
      lead_rows: [500], due_date: '2020-01-01',
    })
    const overdue = await listRequestsForAdmin({ overdue: true })
    expect(overdue.some(r => r.lead_row === 500)).toBe(true)
    expect(overdue.every(r => r.status === 'PENDING')).toBe(true)
  })
})

describe('cancelRequest', () => {
  it('flips status to CANCELLED and records who/when', async () => {
    const [id] = await createUpdateRequests({
      agent_id: 'agent_e', agent_name: 'E', requested_by: 'admin_1',
      lead_rows: [600], due_date: '2026-06-15',
    })
    await cancelRequest(id, 'admin_1')
    const r = await getRequestById(id)
    expect(r?.status).toBe('CANCELLED')
    expect(r?.cancelled_by).toBe('admin_1')
    expect(r?.cancelled_at).toBeTruthy()
  })

  it('refuses to cancel an already-answered request', async () => {
    const [id] = await createUpdateRequests({
      agent_id: 'agent_f', agent_name: 'F', requested_by: 'admin_1',
      lead_rows: [700], due_date: '2026-06-15',
    })
    const db = await ensureInit()
    await db.execute({
      sql: `UPDATE update_requests SET status = 'ANSWERED', answered_at = ?, answer_note_id = 1 WHERE id = ?`,
      args: [new Date().toISOString(), id],
    })

    await expect(cancelRequest(id, 'admin_1')).rejects.toThrow(/cannot cancel/i)
  })
})

describe('autoAnswerForNote', () => {
  it('closes the oldest pending request and stores the note id', async () => {
    const [id] = await createUpdateRequests({
      agent_id: 'agent_g', agent_name: 'G', requested_by: 'admin_1',
      lead_rows: [800], due_date: '2026-06-20',
    })
    const closed = await autoAnswerForNote({
      lead_row: 800,
      agent_id: 'agent_g',
      note_id: 42,
      note_text: 'Called him, sending the deck tomorrow.',
    })
    expect(closed?.id).toBe(id)
    const r = await getRequestById(id)
    expect(r?.status).toBe('ANSWERED')
    expect(r?.answer_note_id).toBe(42)
    expect(r?.answered_at).toBeTruthy()
  })

  it('ignores notes shorter than 5 trimmed chars', async () => {
    await createUpdateRequests({
      agent_id: 'agent_h', agent_name: 'H', requested_by: 'admin_1',
      lead_rows: [900], due_date: '2026-06-20',
    })
    const closed = await autoAnswerForNote({
      lead_row: 900, agent_id: 'agent_h', note_id: 50, note_text: 'ok',
    })
    expect(closed).toBeNull()
  })

  it('returns null when no pending request exists', async () => {
    const closed = await autoAnswerForNote({
      lead_row: 9999, agent_id: 'agent_z', note_id: 99, note_text: 'Hello there',
    })
    expect(closed).toBeNull()
  })
})
