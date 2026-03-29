import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getVoiceAgentCalls } from '@/lib/db'

// GET /api/voice-agent/calls/[phone] — Get AI call history for a phone number
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { phone } = await params
    const calls = await getVoiceAgentCalls(phone)

    return NextResponse.json({ calls })
  } catch (err) {
    console.error('Voice agent calls fetch error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
