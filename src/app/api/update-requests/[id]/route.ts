import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { cancelRequest } from '@/lib/update-requests'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }

    const { id } = await params
    const numericId = Number(id)
    if (!Number.isFinite(numericId)) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
    }
    const body = await req.json().catch(() => ({}))
    if (body.status !== 'CANCELLED') {
      return NextResponse.json(
        { success: false, error: "Only { status: 'CANCELLED' } is supported" },
        { status: 400 }
      )
    }

    await cancelRequest(numericId, user.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed to cancel request') },
      { status: 500 }
    )
  }
}
