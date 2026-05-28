import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { listPendingForAgent } from '@/lib/update-requests'
import { getLeads } from '@/lib/sheets'

export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const rows = await listPendingForAgent(user.id)
    if (rows.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    // Decorate with lead name + city so the widget renders without an extra fetch
    const leads = await getLeads()
    const leadByRow = new Map(leads.map(l => [l.row_number, l]))
    const decorated = rows.map(r => {
      const lead = leadByRow.get(r.lead_row)
      return {
        ...r,
        lead_name: lead?.full_name || `Lead #${r.lead_row}`,
        lead_city: lead?.city || '',
        overdue: r.due_date < new Date().toISOString().slice(0, 10),
      }
    })
    return NextResponse.json({ success: true, data: decorated })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed to list my update requests') },
      { status: 500 }
    )
  }
}
