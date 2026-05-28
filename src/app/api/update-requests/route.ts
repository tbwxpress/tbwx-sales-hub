import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { createUpdateRequests, listRequestsForAdmin } from '@/lib/update-requests'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const { agent_id, lead_rows, due_date, reason } = body
    if (!agent_id || !Array.isArray(lead_rows) || lead_rows.length === 0 || !due_date) {
      return NextResponse.json(
        { success: false, error: 'agent_id, lead_rows[], and due_date are required' },
        { status: 400 }
      )
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(due_date))) {
      return NextResponse.json({ success: false, error: 'due_date must be YYYY-MM-DD' }, { status: 400 })
    }

    const agent = await getUserById(agent_id)
    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 })
    }

    const ids = await createUpdateRequests({
      agent_id,
      agent_name: agent.name,
      requested_by: user.id,
      lead_rows: lead_rows.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)),
      due_date,
      reason: typeof reason === 'string' ? reason : undefined,
    })
    return NextResponse.json({ success: true, data: { ids, count: ids.length } })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed to create update requests') },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }
    const status = req.nextUrl.searchParams.get('status') as
      'PENDING' | 'ANSWERED' | 'CANCELLED' | null
    const overdue = req.nextUrl.searchParams.get('overdue') === 'true'
    const rows = await listRequestsForAdmin({
      status: status ?? undefined,
      overdue,
    })
    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed to list update requests') },
      { status: 500 }
    )
  }
}
