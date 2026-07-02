import { NextRequest, NextResponse } from 'next/server'
import { updateCallRecordingByCallSid, getCallRecordingByCallSid, recordFirstResponse } from '@/lib/db'
import { webhookSecretOk } from '@/lib/telephony'
import { fetchTwilioRecording } from '@/lib/telephony/twilio'
import { scoreCallAudio } from '@/lib/call-scoring'
import { getLeadByRow, getLeads, updateLead } from '@/lib/sheets'

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

  // SLA first-response + lead call-tracking — non-critical, never 500 the webhook.
  // Only fires when the recording has actual audio (duration > 0).
  if (duration > 0) {
    try {
      const rec = await getCallRecordingByCallSid(callSid)
      if (rec) {
        const recLeadRow = rec.lead_row != null ? Number(rec.lead_row) : null
        const recPhone = String(rec.lead_phone || '')

        // Resolve the lead — prefer lead_row, fall back to phone match.
        let lead = recLeadRow ? await getLeadByRow(recLeadRow) : null
        if (!lead && recPhone) {
          const normPhone = recPhone.replace(/\D/g, '').slice(-10)
          const all = await getLeads()
          lead = all.find(l => String(l.phone).replace(/\D/g, '').slice(-10) === normPhone) ?? null
        }

        if (lead?.created_time) {
          await recordFirstResponse(lead.phone, lead.created_time)
        }

        // Mark attempted_contact + first_call_date if not already set.
        const rowToUpdate = recLeadRow ?? lead?.row_number ?? null
        if (rowToUpdate && lead) {
          const patch: Record<string, string> = {}
          if (lead.attempted_contact !== 'Yes') patch.attempted_contact = 'Yes'
          if (!lead.first_call_date) patch.first_call_date = new Date().toISOString().split('T')[0]
          if (Object.keys(patch).length > 0) {
            await updateLead(rowToUpdate, patch)
          }
        }
      }
    } catch (slaErr) {
      console.error('[calls/recording-status] SLA/lead update failed (non-fatal):', slaErr)
    }
  }

  return NextResponse.json({ ok: true })
}
