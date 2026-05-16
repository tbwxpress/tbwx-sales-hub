import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getPendingDelegationsFor, getActiveDelegationsFor } from '@/lib/db'

// GET /api/delegations?to_me=true&status=pending|active
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const url = new URL(req.url)
    const toMe = url.searchParams.get('to_me') === 'true'
    const status = url.searchParams.get('status') || 'pending'

    if (toMe) {
      if (status === 'active') {
        const delegations = await getActiveDelegationsFor(user.id)
        return NextResponse.json({ success: true, data: delegations })
      }
      const delegations = await getPendingDelegationsFor(user.id)
      return NextResponse.json({ success: true, data: delegations })
    }

    return NextResponse.json({ success: true, data: [] })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
