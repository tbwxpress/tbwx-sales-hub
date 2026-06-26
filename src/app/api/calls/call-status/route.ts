import { NextRequest, NextResponse } from 'next/server'
import { updateCallRecordingByCallSid } from '@/lib/db'
import { webhookSecretOk } from '@/lib/telephony'

export const runtime = 'nodejs'

// POST /api/calls/call-status — Twilio posts the AGENT-leg call status here.
// For calls that never connected (no-answer/busy/failed/canceled) there will be
// no recording, so we record the outcome on the row. A 'completed' agent leg is
// left alone — the recording-status webhook owns that row's final state.
//
// Public webhook: gated by the CALL_WEBHOOK_SECRET shared key (?k=...).
export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  if (!webhookSecretOk(url.searchParams)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  let form: URLSearchParams
  try {
    form = new URLSearchParams(await req.text())
  } catch {
    return NextResponse.json({ error: 'bad body' }, { status: 400 })
  }

  const callSid = form.get('CallSid') || ''
  const status = form.get('CallStatus') || ''
  const duration = parseInt(form.get('CallDuration') || '0', 10) || 0

  if (callSid && status && status !== 'completed') {
    const map: Record<string, string> = {
      busy: 'busy',
      'no-answer': 'no_answer',
      failed: 'failed',
      canceled: 'canceled',
    }
    await updateCallRecordingByCallSid(callSid, {
      status: map[status] || status,
      duration_seconds: duration,
    })
  }

  return NextResponse.json({ ok: true })
}
