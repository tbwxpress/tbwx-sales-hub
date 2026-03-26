import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getUnreadCount, getUnreadCountForAgent } from '@/lib/db'
import { getLeads } from '@/lib/sheets'

// GET /api/inbox/unread — get total unread message count (agent-scoped)
export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    if (user.role === 'agent') {
      const leads = await getLeads()
      const visiblePhones = leads
        .filter(l => l.assigned_to === user.name || (user.can_assign && !l.assigned_to))
        .map(l => l.phone)
      const count = await getUnreadCountForAgent(visiblePhones)
      return NextResponse.json({ success: true, data: { count } })
    }

    const count = await getUnreadCount()
    return NextResponse.json({ success: true, data: { count } })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed') },
      { status: 500 }
    )
  }
}
