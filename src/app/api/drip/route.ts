import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getDripState, toggleDrip, getBulkDripState } from '@/lib/db'

// GET /api/drip — get drip state for a lead or all leads
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    requireAuth(session)

    const phone = req.nextUrl.searchParams.get('phone')

    if (phone) {
      const state = await getDripState(phone)
      return NextResponse.json({ success: true, data: state })
    }

    // Bulk: return all drip states
    const states = await getBulkDripState()
    return NextResponse.json({ success: true, data: states })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// PATCH /api/drip — toggle drip for a lead
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    requireAuth(session)

    const { phone, enabled } = await req.json()
    if (!phone || enabled === undefined) {
      return NextResponse.json({ success: false, error: 'Phone and enabled required' }, { status: 400 })
    }

    await toggleDrip(phone, enabled)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
