import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { mergeLeads } from '@/lib/db'

// POST /api/leads/merge — merge duplicate source leads into a target (ADMIN ONLY).
// Body: { targetRow: number, sourceRows: number[] }. Safe + reversible.
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    const body = await req.json()
    const targetRow = Number(body?.targetRow)
    if (!Number.isFinite(targetRow)) {
      return NextResponse.json({ error: 'targetRow is required' }, { status: 400 })
    }
    const sourceRows: number[] = Array.isArray(body?.sourceRows)
      ? body.sourceRows.map(Number).filter((n: number) => Number.isFinite(n))
      : []
    if (sourceRows.length === 0) {
      return NextResponse.json({ error: 'sourceRows must be a non-empty array' }, { status: 400 })
    }
    const result = await mergeLeads(targetRow, sourceRows, user.name || user.id)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to merge leads') }, { status: 500 })
  }
}
