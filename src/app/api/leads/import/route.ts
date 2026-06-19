import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { bulkInsertLeads, type BulkLeadRow } from '@/lib/db'

// POST /api/leads/import — bulk CSV import (ADMIN ONLY).
// Body: { rows: object[], dedupe: 'skip' | 'update' }.
// Writes to SQLite only (not the Google Sheet). Returns the bulkInsertLeads result.
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    const body = await req.json()
    const rows = body?.rows
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: 'rows must be an array' }, { status: 400 })
    }
    const dedupe = body?.dedupe === 'update' ? 'update' : 'skip'
    const result = await bulkInsertLeads(rows as BulkLeadRow[], { dedupe })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Import failed') }, { status: 500 })
  }
}
