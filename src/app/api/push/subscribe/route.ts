import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import { upsertPushSubscription, deletePushSubscription } from '@/lib/db'

// POST /api/push/subscribe — body: { endpoint, keys: { p256dh, auth } }
// DELETE /api/push/subscribe — body: { endpoint }
// Stores or removes a Web Push subscription tied to the authed user.

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const body = await req.json().catch(() => null) as
      | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      | null

    if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return NextResponse.json(
        { success: false, error: 'endpoint, keys.p256dh, keys.auth required' },
        { status: 400 },
      )
    }

    const userAgent = req.headers.get('user-agent') || ''
    await upsertPushSubscription({
      user_id: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      user_agent: userAgent.slice(0, 255),
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to subscribe') }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const body = await req.json().catch(() => null) as { endpoint?: string } | null
    if (!body?.endpoint) {
      return NextResponse.json({ success: false, error: 'endpoint required' }, { status: 400 })
    }
    await deletePushSubscription(body.endpoint, user.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to unsubscribe') }, { status: 500 })
  }
}
