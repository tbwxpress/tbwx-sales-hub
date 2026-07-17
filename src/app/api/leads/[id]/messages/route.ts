import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads } from '@/lib/sheets'
import { getMessages } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requireAuth(session)
    const { id } = await params
    const rowNum = parseInt(id)

    const leads = await getLeads()
    const lead = leads.find(l => l.row_number === rowNum)
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 })
    }

    // DB is the source of truth for the conversation — the same store the
    // inbox reads. (This used to read the legacy Sheet tabs, which only ever
    // captured auto-send logs: sent bubbles showed, customer replies didn't,
    // and the 24h-window banner was wrong.)
    const messages = await getMessages(lead.phone, 500)
    return NextResponse.json({ success: true, data: messages })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
