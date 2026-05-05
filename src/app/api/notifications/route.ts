import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import {
  getNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/notifications'

// GET /api/notifications?include_read=1&limit=50
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const url = new URL(req.url)
    const includeRead = url.searchParams.get('include_read') === '1'
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const [items, unread] = await Promise.all([
      getNotifications(user.id, { includeRead, limit: Number.isFinite(limit) ? limit : 50 }),
      countUnreadNotifications(user.id),
    ])
    return NextResponse.json({ success: true, data: { items, unread } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// PATCH /api/notifications — { id, read } OR { mark_all: true }
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const body = await req.json()

    if (body.mark_all === true) {
      const n = await markAllNotificationsRead(user.id)
      return NextResponse.json({ success: true, data: { marked: n } })
    }

    if (typeof body.id === 'number') {
      await markNotificationRead(body.id, user.id)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, error: 'id or mark_all required' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
