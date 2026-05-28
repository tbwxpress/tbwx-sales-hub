import { describe, it, expect } from 'vitest'
import { createUpdateRequests, getRequestById } from '../update-requests'

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
