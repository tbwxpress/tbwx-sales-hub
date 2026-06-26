import { NextRequest, NextResponse } from 'next/server'
import { updateCallRecordingByCallSid } from '@/lib/db'
import { webhookSecretOk } from '@/lib/telephony'
import { fetchTwilioRecording } from '@/lib/telephony/twilio'
import { scoreCallAudio } from '@/lib/call-scoring'

export const runtime = 'nodejs'
export const maxDuration = 120 // download + Gemini scoring of a longer call

// Skip AI scoring above this size: protects memory and stays under Gemini's
// inline-audio limit (~20MB). The recording is still saved + playable.
const MAX_SCORE_BYTES = 15 * 1024 * 1024

// POST /api/calls/recording-status — Twilio posts here when a recording is ready.
// We download the audio, run Gemini transcription + QA scoring, and store the
// report card on the call_recordings row (matched by CallSid).
//
// Public webhook: gated by the CALL_WEBHOOK_SECRET shared key (?k=...).
export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  if (!webhookSecretOk(url.searchParams)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  // Twilio sends application/x-www-form-urlencoded.
  let form: URLSearchParams
  try {
    const raw = await req.text()
    form = new URLSearchParams(raw)
  } catch {
    return NextResponse.json({ error: 'bad body' }, { status: 400 })
  }

  const callSid = form.get('CallSid') || ''
  const recordingSid = form.get('RecordingSid') || ''
  const recordingUrl = form.get('RecordingUrl') || ''
  const duration = parseInt(form.get('RecordingDuration') || '0', 10) || 0

  if (!recordingUrl || !callSid) {
    return NextResponse.json({ error: 'missing CallSid/RecordingUrl' }, { status: 400 })
  }

  // Persist the recording immediately so it's never lost even if scoring fails.
  await updateCallRecordingByCallSid(callSid, {
    recording_sid: recordingSid,
    recording_url: recordingUrl,
    duration_seconds: duration,
    status: 'recorded_unscored',
  })

  // Transcribe + score. Failures are non-fatal — the recording stays playable.
  try {
    const audio = await fetchTwilioRecording(recordingUrl)
    if (audio.length > MAX_SCORE_BYTES) {
      console.warn(`[calls/recording-status] recording ${audio.length}B exceeds scoring limit — saved unscored`)
      return NextResponse.json({ ok: true, scored: false, reason: 'too_large' })
    }
    const card = await scoreCallAudio(audio)
    await updateCallRecordingByCallSid(callSid, {
      status: 'completed',
      transcript: card.transcript,
      report_card: JSON.stringify(card),
      overall_score: card.overall_score,
    })
  } catch (err) {
    console.error('[calls/recording-status] scoring failed:', err)
    // Leave status = recorded_unscored; the audio is still available to review.
  }

  return NextResponse.json({ ok: true })
}
