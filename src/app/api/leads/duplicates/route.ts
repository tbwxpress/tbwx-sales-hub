import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { findDuplicateLeads } from '@/lib/db'

// GET /api/leads/duplicates — groups of leads sharing a normalized phone (ADMIN ONLY).
export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    const groups = await findDuplicateLeads()
    return NextResponse.json({ groups })
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to load duplicates') }, { status: 500 })
  }
}
