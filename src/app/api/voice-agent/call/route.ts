import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { insertVoiceAgentCall, normalizePhone } from '@/lib/db'
import { getLeads, updateLead } from '@/lib/sheets'

const VOICE_AGENT_URL = process.env.VOICE_AGENT_URL || 'https://voice.tbwxpress.com'

// POST /api/voice-agent/call — Trigger an AI call to a lead (requires auth)
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { phone, name, lead_id } = body

    if (!phone || !name) {
      return NextResponse.json({ error: 'phone and name are required' }, { status: 400 })
    }

    // Format phone for voice agent (needs +91 prefix)
    const digits = phone.replace(/\D/g, '').slice(-10)
    const formattedPhone = `+91${digits}`

    // Call the voice agent API
    const response = await fetch(`${VOICE_AGENT_URL}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: formattedPhone,
        name,
        lead_id: lead_id || '',
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      return NextResponse.json({ error: result.error || 'Voice agent call failed' }, { status: response.status })
    }

    // Record the initiated call in our DB
    const normalized = normalizePhone(phone)
    const id = await insertVoiceAgentCall({
      phone: normalized,
      lead_id: lead_id || '',
      call_sid: result.call_sid || '',
      status: 'initiated',
    })

    // Update lead status to CALLING in Google Sheets
    try {
      const leads = await getLeads()
      const lead = leads.find(l => normalizePhone(l.phone) === normalized)
      if (lead && !['HOT', 'FINAL_NEGOTIATION', 'CONVERTED', 'LOST'].includes(lead.lead_status)) {
        await updateLead(lead.row_number, { lead_status: 'NO_RESPONSE' })
      }
    } catch { /* Non-critical — don't block the call */ }

    return NextResponse.json({
      success: true,
      id,
      call_sid: result.call_sid,
      triggered_by: session.name,
    })
  } catch (err) {
    console.error('Voice agent call trigger error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
