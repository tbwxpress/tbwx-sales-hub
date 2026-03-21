import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getUnreadCount } from '@/lib/db'

// GET /api/inbox/unread — get total unread message count
export async function GET() {
  try {
    const session = await getSession()
    requireAuth(session)

    const count = await getUnreadCount()
    return NextResponse.json({ success: true, data: { count } })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
