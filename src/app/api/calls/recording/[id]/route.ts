import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getCallRecordingById } from '@/lib/db'
import { fetchTwilioRecording } from '@/lib/telephony/twilio'

export const runtime = 'nodejs'

// GET /api/calls/recording/[id] — auth-gated audio proxy. Streams the provider's
// recording so the browser can play it without ever seeing telephony credentials.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    requireAuth(session)

    const { id } = await params
    const rec = await getCallRecordingById(Number(id))
    if (!rec || !rec.recording_url) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    const audio = await fetchTwilioRecording(String(rec.recording_url))
    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'private, max-age=3600',
        'Content-Length': String(audio.length),
      },
    })
  } catch (err) {
    console.error('[calls/recording/[id]] error:', err)
    return NextResponse.json({ error: 'Failed to load recording' }, { status: 500 })
  }
}
