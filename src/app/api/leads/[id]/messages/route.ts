import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads, getConversation } from '@/lib/sheets'

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

    const messages = await getConversation(lead.phone)
    return NextResponse.json({ success: true, data: messages })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
