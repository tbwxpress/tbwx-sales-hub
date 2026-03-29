import { NextRequest, NextResponse } from 'next/server'
import { insertVoiceAgentCall, updateVoiceAgentCall, getVoiceAgentCallBySid, normalizePhone } from '@/lib/db'

// POST /api/voice-agent/log — Called by voice agent server when a call completes
// This is a PUBLIC endpoint (no auth required) — called from voice agent container
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phone, lead_id, call_sid, status, duration_seconds, interest_level, preferred_city, callback_time, questions, summary, transcript } = body

    if (!phone) {
      return NextResponse.json({ error: 'phone is required' }, { status: 400 })
    }

    // Check if this call_sid already exists (update vs insert)
    if (call_sid) {
      const existing = await getVoiceAgentCallBySid(call_sid)
      if (existing) {
        await updateVoiceAgentCall(call_sid, {
          status,
          duration_seconds,
          interest_level,
          preferred_city,
          callback_time,
          questions,
          summary,
          transcript,
        })
        return NextResponse.json({ success: true, action: 'updated', call_sid })
      }
    }

    // Insert new call record
    const id = await insertVoiceAgentCall({
      phone: normalizePhone(phone),
      lead_id,
      call_sid,
      status,
      duration_seconds,
      interest_level,
      preferred_city,
      callback_time,
      questions,
      summary,
      transcript,
    })

    return NextResponse.json({ success: true, action: 'created', id, call_sid })
  } catch (err) {
    console.error('Voice agent log error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
