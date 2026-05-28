import { ensureInit, serializeRows } from './db'

export type UpdateRequestStatus = 'PENDING' | 'ANSWERED' | 'CANCELLED'

export interface UpdateRequest {
  id: number
  lead_row: number
  agent_id: string
  agent_name: string
  requested_by: string
  reason: string | null
  due_date: string
  status: UpdateRequestStatus
  created_at: string
  answered_at: string | null
  answer_note_id: number | null
  cancelled_at: string | null
  cancelled_by: string | null
}

export async function createUpdateRequests(input: {
  agent_id: string
  agent_name: string
  requested_by: string
  lead_rows: number[]
  due_date: string
  reason?: string
}): Promise<number[]> {
  const db = await ensureInit()
  const createdAt = new Date().toISOString()
  const reason = input.reason?.trim() ? input.reason.trim().slice(0, 500) : null
  const ids: number[] = []
  for (const lead_row of input.lead_rows) {
    const result = await db.execute({
      sql: `INSERT INTO update_requests
        (lead_row, agent_id, agent_name, requested_by, reason, due_date, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      args: [lead_row, input.agent_id, input.agent_name, input.requested_by, reason, input.due_date, createdAt],
    })
    ids.push(Number(result.lastInsertRowid))
  }
  return ids
}

export async function getRequestById(id: number): Promise<UpdateRequest | null> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM update_requests WHERE id = ?`,
    args: [id],
  })
  const rows = serializeRows(result.rows)
  return rows[0] ? (rows[0] as unknown as UpdateRequest) : null
}

export async function listPendingForAgent(agent_id: string): Promise<UpdateRequest[]> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM update_requests
          WHERE agent_id = ? AND status = 'PENDING'
          ORDER BY due_date ASC, created_at ASC`,
    args: [agent_id],
  })
  return serializeRows(result.rows) as unknown as UpdateRequest[]
}

export async function getPendingForLeadAndAgent(
  lead_row: number,
  agent_id: string
): Promise<UpdateRequest | null> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM update_requests
          WHERE lead_row = ? AND agent_id = ? AND status = 'PENDING'
          ORDER BY created_at ASC LIMIT 1`,
    args: [lead_row, agent_id],
  })
  const rows = serializeRows(result.rows)
  return rows[0] ? (rows[0] as unknown as UpdateRequest) : null
}

export async function listRequestsForAdmin(opts: {
  status?: UpdateRequestStatus
  overdue?: boolean
} = {}): Promise<UpdateRequest[]> {
  const db = await ensureInit()
  const today = new Date().toISOString().slice(0, 10)

  if (opts.overdue) {
    const result = await db.execute({
      sql: `SELECT * FROM update_requests
            WHERE status = 'PENDING' AND due_date < ?
            ORDER BY due_date ASC, created_at ASC`,
      args: [today],
    })
    return serializeRows(result.rows) as unknown as UpdateRequest[]
  }

  if (opts.status) {
    const order = opts.status === 'ANSWERED'
      ? 'answered_at DESC'
      : opts.status === 'CANCELLED'
        ? 'cancelled_at DESC'
        : 'due_date ASC, created_at ASC'
    const result = await db.execute({
      sql: `SELECT * FROM update_requests WHERE status = ? ORDER BY ${order}`,
      args: [opts.status],
    })
    return serializeRows(result.rows) as unknown as UpdateRequest[]
  }

  const result = await db.execute({
    sql: `SELECT * FROM update_requests ORDER BY created_at DESC`,
  })
  return serializeRows(result.rows) as unknown as UpdateRequest[]
}

export async function cancelRequest(id: number, cancelled_by: string): Promise<void> {
  const db = await ensureInit()
  const existing = await getRequestById(id)
  if (!existing) throw new Error('Request not found')
  if (existing.status !== 'PENDING') {
    throw new Error(`Cannot cancel request in status ${existing.status}`)
  }
  await db.execute({
    sql: `UPDATE update_requests
          SET status = 'CANCELLED', cancelled_at = ?, cancelled_by = ?
          WHERE id = ?`,
    args: [new Date().toISOString(), cancelled_by, id],
  })
}
