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
