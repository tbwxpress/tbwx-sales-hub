import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { migratePhoneNumbers } from '@/lib/db'

// POST /api/migrate/phone-dedup — merge duplicate contacts with different phone formats
export async function POST() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }

    const result = await migratePhoneNumbers()
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
