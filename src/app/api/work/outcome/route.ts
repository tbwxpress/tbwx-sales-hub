import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { applyWorkOutcome, getWorkQueue, getWorkStats } from '@/lib/work'

// POST /api/work/outcome
// Body: { leadRow, outcome, channel, note?, alsoWhatsapp? }
// Applies the playbook (status + follow-up + routing + audit), then returns the
// next card + refreshed stats.
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const sessionUser = requireAuth(session)
    const user = await getUserById(sessionUser.id)
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const body = await req.json()
    const leadRow = Number(body?.leadRow)
    const outcome = String(body?.outcome || '')
    const channel = String(body?.channel || '')
    if (!Number.isFinite(leadRow) || !outcome || !channel) {
      return NextResponse.json({ success: false, error: 'leadRow, outcome and channel are required' }, { status: 400 })
    }
    if (!['call', 'whatsapp', 'template', 'system'].includes(channel)) {
      return NextResponse.json({ success: false, error: `Invalid channel "${channel}"` }, { status: 400 })
    }

    const result = await applyWorkOutcome({
      userId: user.id,
      userName: user.name,
      leadRow,
      outcome,
      channel: channel as 'call' | 'whatsapp' | 'template' | 'system',
      note: typeof body?.note === 'string' ? body.note : undefined,
      alsoWhatsapp: Boolean(body?.alsoWhatsapp),
    })

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error || 'Outcome failed' }, { status: 400 })
    }

    const [{ cards }, stats] = await Promise.all([
      getWorkQueue(user, { limit: 1 }),
      getWorkStats(user),
    ])

    return NextResponse.json({
      ok: true,
      routedTo: result.routedTo,
      next: cards[0] ?? null,
      stats,
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to apply outcome') }, { status: 500 })
  }
}
