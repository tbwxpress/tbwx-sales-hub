import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads, updateLead } from '@/lib/sheets'
import { logAssignment } from '@/lib/db'
import { LEAD_STATUSES } from '@/config/client'

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
    return NextResponse.json({ success: true, data: lead })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { id } = await params
    const rowNum = parseInt(id)
    const body = await req.json()

    // Only admin or users with can_assign can change assigned_to
    if (body.assigned_to && user.role !== 'admin' && !user.can_assign) {
      return NextResponse.json({ success: false, error: 'Not authorized to assign leads' }, { status: 403 })
    }

    // Validate status if provided
    if (body.lead_status && !(LEAD_STATUSES as readonly string[]).includes(body.lead_status)) {
      return NextResponse.json({ success: false, error: `Invalid status: ${body.lead_status}` }, { status: 400 })
    }

    // Status-specific follow-up intervals
    if (body.lead_status && !body.next_followup) {
      const FOLLOWUP_DAYS: Record<string, number> = {
        NEW: 1, DECK_SENT: 1, REPLIED: 0, CALLING: 1,
        CALL_DONE: 2, INTERESTED: 2, NEGOTIATION: 2, DELAYED: 7,
      }
      const days = FOLLOWUP_DAYS[body.lead_status]
      if (days !== undefined) {
        const nextDate = new Date()
        nextDate.setDate(nextDate.getDate() + days)
        body.next_followup = nextDate.toISOString().split('T')[0]
      } else if (body.lead_status === 'CONVERTED' || body.lead_status === 'LOST') {
        body.next_followup = ''
      }
    }

    // Log assignment changes
    if (body.assigned_to !== undefined) {
      const leads = await getLeads()
      const lead = leads.find(l => l.row_number === rowNum)
      await logAssignment({
        lead_row: rowNum,
        phone: lead?.phone || '',
        from_agent: lead?.assigned_to || '',
        to_agent: body.assigned_to,
        assigned_by: user.name,
      })
    }

    await updateLead(rowNum, body)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Update failed' }, { status: 500 })
  }
}
