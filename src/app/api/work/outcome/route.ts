import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { applyWorkOutcome, getWorkQueue, getWorkStats } from '@/lib/work'
import { SENTIMENT_KEYS, OBJECTION_KEYS, CAPITAL_KEYS, DECISION_MAKER_KEYS, PERSONA_KEYS, NEXT_STEP_KEYS } from '@/config/sales-signals'
import { LOST_REASONS } from '@/config/client'

const LOST_REASON_KEYS = new Set(Object.keys(LOST_REASONS))

// Accept a chip value only if it's a known key (ignore junk); missing/'' → undefined
// (= "not captured", so it never overwrites a previously-set signal).
const pick = (v: unknown, keys: Set<string>): string | undefined =>
  typeof v === 'string' && keys.has(v) ? v : undefined

// POST /api/work/outcome
// Body: { leadRow, outcome, channel, note?, alsoWhatsapp?, objection?, sentiment?,
//         capital_readiness?, decision_maker?, buyer_persona?, next_step?, connected? }
// Applies the playbook (status + follow-up + routing + audit + structured signals),
// then returns the next card + refreshed stats + a WhatsApp nudge after no-answer.
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

    const lost_reason = pick(body?.lost_reason, LOST_REASON_KEYS)
    const lost_reason_note =
      lost_reason && typeof body?.lost_reason_note === 'string'
        ? body.lost_reason_note.slice(0, 500)
        : undefined

    const result = await applyWorkOutcome({
      userId: user.id,
      userName: user.name,
      leadRow,
      outcome,
      channel: channel as 'call' | 'whatsapp' | 'template' | 'system',
      note: typeof body?.note === 'string' ? body.note : undefined,
      alsoWhatsapp: Boolean(body?.alsoWhatsapp),
      objection: pick(body?.objection, OBJECTION_KEYS),
      sentiment: pick(body?.sentiment, SENTIMENT_KEYS),
      capital_readiness: pick(body?.capital_readiness, CAPITAL_KEYS),
      decision_maker: pick(body?.decision_maker, DECISION_MAKER_KEYS),
      buyer_persona: pick(body?.buyer_persona, PERSONA_KEYS),
      next_step: pick(body?.next_step, NEXT_STEP_KEYS),
      connected: typeof body?.connected === 'boolean' ? body.connected : undefined,
      lost_reason,
      lost_reason_note,
      route_to_closer: typeof body?.route_to_closer === 'string' ? body.route_to_closer : undefined,
    })

    if (!result.ok) {
      if (result.error === 'LOST_REASON_REQUIRED') {
        return NextResponse.json({ success: false, code: 'LOST_REASON_REQUIRED' }, { status: 422 })
      }
      if (result.error === 'CLOSER_CHOICE_REQUIRED') {
        // Qualified handoff needs an explicit closer pick — return the options.
        return NextResponse.json(
          { success: false, code: 'CLOSER_CHOICE_REQUIRED', closers: result.closers || [] },
          { status: 422 },
        )
      }
      return NextResponse.json({ success: false, error: result.error || 'Outcome failed' }, { status: 400 })
    }

    const [{ cards }, stats] = await Promise.all([
      getWorkQueue(user, { limit: 1 }),
      getWorkStats(user),
    ])

    return NextResponse.json({
      ok: true,
      routedTo: result.routedTo,
      suggest_whatsapp: result.suggest_whatsapp ?? false,
      next: cards[0] ?? null,
      stats,
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to apply outcome') }, { status: 500 })
  }
}
