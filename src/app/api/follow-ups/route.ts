import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads } from '@/lib/sheets'

export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    let leads = await getLeads()

    // Filter to active leads with followups
    leads = leads.filter(l =>
      l.next_followup &&
      l.lead_status !== 'CONVERTED' &&
      l.lead_status !== 'LOST'
    )

    // Agents see assigned leads + unassigned (if can_assign)
    if (user.role === 'agent') {
      leads = leads.filter(l => l.assigned_to === user.name || (user.can_assign && !l.assigned_to))
    }

    const now = new Date()
    const overdue = leads.filter(l => new Date(l.next_followup) < now)
      .sort((a, b) => new Date(a.next_followup).getTime() - new Date(b.next_followup).getTime())
    const upcoming = leads.filter(l => new Date(l.next_followup) >= now)
      .sort((a, b) => new Date(a.next_followup).getTime() - new Date(b.next_followup).getTime())

    return NextResponse.json({
      success: true,
      data: {
        overdue,
        upcoming,
        overdue_count: overdue.length,
        upcoming_count: upcoming.length,
      }
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
