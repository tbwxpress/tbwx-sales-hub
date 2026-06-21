import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import { getPaymentFollowup, getPaymentFollowupUpdates } from '@/lib/db'

// GET /api/payment-followups/[id]/history
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    // Owner-private: payment followups are admin-only at every layer.
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }

    const { id } = await params
    const followupId = parseInt(id)
    if (isNaN(followupId)) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
    }

    const followup = await getPaymentFollowup(followupId)
    if (!followup) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    const history = await getPaymentFollowupUpdates(followupId)
    return NextResponse.json({ success: true, data: history })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to fetch history') }, { status: 500 })
  }
}
