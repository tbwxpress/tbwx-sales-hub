import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { insertCallLog, getCallLogs } from '@/lib/db'

// GET /api/inbox/[phone]/calls — get call logs for a contact
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const session = await getSession()
    requireAuth(session)
    const { phone } = await params
    const logs = await getCallLogs(phone)
    return NextResponse.json({ success: true, data: logs })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed') },
      { status: 500 }
    )
  }
}

// POST /api/inbox/[phone]/calls — log a new call
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { phone } = await params
    const { duration, outcome, notes } = await req.json()

    const id = await insertCallLog({
      phone,
      duration,
      outcome,
      notes,
      logged_by: user.name,
    })

    return NextResponse.json({ success: true, data: { id } })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed to log call') },
      { status: 500 }
    )
  }
}
