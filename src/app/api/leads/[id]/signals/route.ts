import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { upsertLeadSignal, getLeadSignal, getLastReceivedMessageByPhone } from '@/lib/db'
import { getLeadByRow } from '@/lib/sheets'
import { leadScore } from '@/lib/scoring'
import type { Lead } from '@/lib/types'
import {
  SENTIMENT_KEYS,
  CAPITAL_KEYS,
  OBJECTION_KEYS,
  DECISION_MAKER_KEYS,
  PERSONA_KEYS,
  NEXT_STEP_KEYS,
} from '@/config/sales-signals'

const last10 = (p: string | undefined | null) => String(p || '').replace(/\D/g, '').slice(-10)

// Validate a single signal value: a valid taxonomy key passes through; an
// explicit `null` CLEARS the field; junk/missing → undefined (skip — never wipes
// an existing value). This is the same shape upsertLeadSignal expects.
function clearable(keys: Set<string>, v: unknown): string | null | undefined {
  if (v === null) return null
  return typeof v === 'string' && keys.has(v) ? v : undefined
}

// Ownership gate — IDENTICAL to the leads PATCH route: an agent may only touch a
// lead assigned to them (or unassigned if can_assign). Admins/can_edit pass. The
// shared scorer re-ranks off these signals, so an unscoped write would let one
// rep poison another's queue. Returns a 404/403 NextResponse to short-circuit, or
// null to proceed.
async function gateLead(
  user: { role?: string; name?: string; can_assign?: boolean },
  leadRow: number,
): Promise<{ block: NextResponse } | { lead: Lead }> {
  const lead = await getLeadByRow(leadRow)
  if (!lead) {
    return { block: NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 }) }
  }
  if (user.role === 'agent') {
    const isMine = lead.assigned_to === user.name
    const isUnassigned = !lead.assigned_to
    if (!isMine && !(user.can_assign && isUnassigned)) {
      return { block: NextResponse.json({ success: false, error: 'Not authorized to modify this lead' }, { status: 403 }) }
    }
  }
  return { lead }
}

// GET /api/leads/[id]/signals — current captured signals + the signal-aware AI
// score for this lead. Scoped by the same ownership gate as writes so it can't
// leak another rep's signals/score.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { id } = await params
    const leadRow = parseInt(id)
    if (Number.isNaN(leadRow)) {
      return NextResponse.json({ success: false, error: 'Invalid lead id' }, { status: 400 })
    }
    const gate = await gateLead(user, leadRow)
    if ('block' in gate) return gate.block

    const signals = await getLeadSignal(leadRow)
    const lastRecvMap = await getLastReceivedMessageByPhone()
    const ai = leadScore(gate.lead, signals, { lastReceivedAt: lastRecvMap.get(last10(gate.lead.phone))?.last_received_at })
    return NextResponse.json({ success: true, signals, ai })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to load signals') }, { status: 500 })
  }
}

// POST /api/leads/[id]/signals — Free-mode rep sets / corrects / clears captured
// signals. Same ownership gate as the leads PATCH route. Each field is validated
// against its taxonomy (junk dropped); an explicit null clears it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { id } = await params
    const leadRow = parseInt(id)
    if (Number.isNaN(leadRow)) {
      return NextResponse.json({ success: false, error: 'Invalid lead id' }, { status: 400 })
    }
    const gate = await gateLead(user, leadRow)
    if ('block' in gate) return gate.block

    const body = await req.json()
    const patch = {
      sentiment: clearable(SENTIMENT_KEYS, body.sentiment),
      capital_readiness: clearable(CAPITAL_KEYS, body.capital_readiness),
      objection: clearable(OBJECTION_KEYS, body.objection),
      decision_maker: clearable(DECISION_MAKER_KEYS, body.decision_maker),
      buyer_persona: clearable(PERSONA_KEYS, body.buyer_persona),
      next_step: clearable(NEXT_STEP_KEYS, body.next_step),
    }

    // Only write (and stamp updated_by/at) when the rep actually changed something
    // — a real key OR an explicit null-clear. An all-junk/empty body is a no-op.
    const hasSignal = Object.values(patch).some((v) => v !== undefined)
    if (hasSignal) {
      await upsertLeadSignal(leadRow, { ...patch, updated_by: user.name })
    }
    // `ok` matches the documented contract; `success` matches the app's API convention.
    return NextResponse.json({ ok: true, success: true, signals: await getLeadSignal(leadRow) })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to save signals') }, { status: 500 })
  }
}
