import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getUnreadCount, getUnreadCountForAgent } from '@/lib/db'
import { getAgentVisiblePhones } from '@/lib/visibility'

// GET /api/inbox/unread — total unread message count (role-scoped)
export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const visiblePhones = await getAgentVisiblePhones(user)

    if (visiblePhones === null) {
      const count = await getUnreadCount()
      return NextResponse.json({ success: true, data: { count } })
    }

    const count = await getUnreadCountForAgent(visiblePhones)
    return NextResponse.json({ success: true, data: { count } })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed') },
      { status: 500 }
    )
  }
}
