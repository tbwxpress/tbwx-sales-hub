import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads, updateLead } from '@/lib/sheets'

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

    // Set next_followup to 3 days from now if status is being changed and not CONVERTED/LOST
    if (body.lead_status && !['CONVERTED', 'LOST'].includes(body.lead_status) && !body.next_followup) {
      const nextDate = new Date()
      nextDate.setDate(nextDate.getDate() + 3)
      body.next_followup = nextDate.toISOString().split('T')[0]
    }

    // Clear next_followup if marking as CONVERTED or LOST
    if (body.lead_status === 'CONVERTED' || body.lead_status === 'LOST') {
      body.next_followup = ''
    }

    await updateLead(rowNum, body)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Update failed' }, { status: 500 })
  }
}
