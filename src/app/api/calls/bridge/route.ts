import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSession, requireAuth } from '@/lib/auth'
import { apiError } from '@/lib/api-error'
import { insertCallRecording } from '@/lib/db'
import { getTelephonyProvider, toE164India } from '@/lib/telephony'

export const runtime = 'nodejs'

// POST /api/calls/bridge — start a recorded click-to-call bridge.
// Rings the telecaller's own phone, then connects them to the lead and records.
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const body = await req.json()
    const { lead_row, lead_phone, lead_name, agent_phone } = body || {}

    if (!lead_phone) return NextResponse.json({ error: 'lead_phone is required' }, { status: 400 })
    if (!agent_phone) return NextResponse.json({ error: 'agent_phone (your phone) is required' }, { status: 400 })

    let leadE164: string
    let agentE164: string
    try {
      leadE164 = toE164India(lead_phone)
      agentE164 = toE164India(agent_phone)
    } catch (e) {
      return NextResponse.json({ error: apiError(e, 'Invalid phone number') }, { status: 400 })
    }

    const ref = randomUUID().slice(0, 12)
    const callbackBaseUrl = (process.env.PUBLIC_BASE_URL || 'https://sales.tbwxpress.com').replace(/\/$/, '')

    const provider = getTelephonyProvider()
    const { callSid } = await provider.startRecordedBridge({
      agentPhone: agentE164,
      leadPhone: leadE164,
      leadName: lead_name || '',
      callbackBaseUrl,
      ref,
    })

    const id = await insertCallRecording({
      lead_row: typeof lead_row === 'number' ? lead_row : (lead_row ? Number(lead_row) : null),
      lead_phone,
      lead_name: lead_name || '',
      agent_name: user.name,
      agent_phone: agentE164,
      ref,
      call_sid: callSid,
      status: 'initiated',
    })

    return NextResponse.json({ success: true, id, call_sid: callSid, provider: provider.name })
  } catch (err) {
    console.error('[calls/bridge] error:', err)
    return NextResponse.json({ error: apiError(err, 'Failed to start call') }, { status: 500 })
  }
}
