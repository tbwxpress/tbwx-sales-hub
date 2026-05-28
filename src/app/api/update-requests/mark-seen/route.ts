import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { setAdminLastSeen, getAdminLastSeen, countAnsweredSince } from '@/lib/update-requests'
import { apiError } from '@/lib/api-error'

export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }
    const lastSeen = await getAdminLastSeen()
    const count = await countAnsweredSince(lastSeen)
    return NextResponse.json({ success: true, data: { count } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function POST() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }
    await setAdminLastSeen(new Date().toISOString())
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
