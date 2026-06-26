import { NextRequest, NextResponse } from 'next/server'
import { webhookSecretOk } from '@/lib/telephony'

export const runtime = 'nodejs'

// GET|POST /api/calls/twiml — Twilio fetches this when the AGENT answers.
// Returns TwiML that announces recording, then dials the LEAD and records the
// bridged conversation. recordingStatusCallback fires when the audio is ready.
//
// Public webhook: gated by the CALL_WEBHOOK_SECRET shared key (?k=...).
function buildTwiml(req: NextRequest): NextResponse {
  const url = new URL(req.url)
  if (!webhookSecretOk(url.searchParams)) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  const secret = process.env.CALL_WEBHOOK_SECRET || ''

  const leadPhone = url.searchParams.get('lead') || ''
  const ref = url.searchParams.get('ref') || ''
  const base = (process.env.PUBLIC_BASE_URL || 'https://sales.tbwxpress.com').replace(/\/$/, '')

  const cb = new URL(`${base}/api/calls/recording-status`)
  cb.searchParams.set('ref', ref)
  if (secret) cb.searchParams.set('k', secret)

  // Escape for XML attribute / node content.
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">This call is being recorded for quality and training purposes.</Say>
  <Dial answerOnBridge="true" record="record-from-answer-dual" recordingStatusCallback="${esc(cb.toString())}" recordingStatusCallbackEvent="completed">
    <Number>${esc(leadPhone)}</Number>
  </Dial>
</Response>`

  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function GET(req: NextRequest) {
  return buildTwiml(req)
}

export async function POST(req: NextRequest) {
  return buildTwiml(req)
}
