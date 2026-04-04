import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getDripSequences, upsertDripSequence, deleteDripSequence } from '@/lib/db'

// GET /api/drip/sequences — list all sequences
export async function GET() {
  try {
    const session = await getSession()
    requireAuth(session)
    const sequences = await getDripSequences()
    return NextResponse.json({ success: true, data: sequences })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// POST /api/drip/sequences — create/update a sequence (admin only)
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const body = await req.json()
    const { id, name, priority_band, steps, active } = body

    if (!id || !name || !priority_band || !steps) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }
    if (!['HOT', 'WARM', 'COLD'].includes(priority_band)) {
      return NextResponse.json({ success: false, error: 'priority_band must be HOT, WARM, or COLD' }, { status: 400 })
    }

    const stepsStr = typeof steps === 'string' ? steps : JSON.stringify(steps)
    await upsertDripSequence({ id, name, priority_band, steps: stepsStr, active: active !== false })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// DELETE /api/drip/sequences — delete a sequence (admin only)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const { id } = await req.json()
    if (!id) return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 })

    await deleteDripSequence(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
