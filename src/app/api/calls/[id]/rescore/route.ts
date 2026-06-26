import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAdmin } from '@/lib/auth'
import { apiError } from '@/lib/api-error'
import { getCallRecordingById, updateCallRecordingByCallSid } from '@/lib/db'
import { fetchTwilioRecording } from '@/lib/telephony/twilio'
import { scoreCallAudio } from '@/lib/call-scoring'

export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_SCORE_BYTES = 15 * 1024 * 1024

// POST /api/calls/[id]/rescore — re-run AI scoring on a stored recording
// (e.g. one stuck at recorded_unscored after a Gemini hiccup). Admin only.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    requireAdmin(session)

    const { id } = await params
    const rec = await getCallRecordingById(Number(id))
    if (!rec || !rec.recording_url) {
      return NextResponse.json({ success: false, error: 'No recording to score' }, { status: 404 })
    }
    if (!rec.call_sid) {
      return NextResponse.json({ success: false, error: 'Missing call id' }, { status: 400 })
    }

    const audio = await fetchTwilioRecording(String(rec.recording_url))
    if (audio.length > MAX_SCORE_BYTES) {
      return NextResponse.json({ success: false, error: 'Recording too large to score' }, { status: 413 })
    }

    const card = await scoreCallAudio(audio)
    await updateCallRecordingByCallSid(String(rec.call_sid), {
      status: 'completed',
      transcript: card.transcript,
      report_card: JSON.stringify(card),
      overall_score: card.overall_score,
    })

    return NextResponse.json({ success: true, overall_score: card.overall_score })
  } catch (err) {
    // Check the raw message before apiError() sanitizes it in production.
    const raw = err instanceof Error ? err.message : ''
    const status = /admin/i.test(raw) ? 403 : 500
    return NextResponse.json({ success: false, error: apiError(err, 'Re-score failed') }, { status })
  }
}
