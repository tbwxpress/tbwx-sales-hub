import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getLeads } from '@/lib/sheets'
import { getTasks } from '@/lib/db'
import { getSession, requireAuth } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSession()
    requireAuth(session)
    const leads = await getLeads()
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    // Count leads by status
    const todayLeads = leads.filter(l => l.created_time?.startsWith(todayStr))
    const replied = leads.filter(l => l.lead_status === 'REPLIED')
    const hot = leads.filter(l => l.lead_priority === 'HOT')
    const converted = leads.filter(l => l.lead_status === 'CONVERTED')
    const lost = leads.filter(l => l.lead_status === 'LOST')

    // Stale leads: no activity for 14+ days
    const stale = leads.filter(l => {
      if (['CONVERTED', 'LOST'].includes(l.lead_status)) return false
      const updated = l.next_followup || l.created_time
      if (!updated) return false
      const daysSince = (now.getTime() - new Date(updated).getTime()) / (1000 * 60 * 60 * 24)
      return daysSince >= 14
    })

    // Pending tasks
    const pendingTasks = await getTasks({ completed: false })
    const overdueTasks = pendingTasks.filter(t => {
      const r = t as Record<string, unknown>
      return new Date(r.due_at as string) < now
    })

    return NextResponse.json({
      success: true,
      data: {
        date: todayStr,
        new_leads_today: todayLeads.length,
        total_leads: leads.length,
        replied: replied.length,
        hot: hot.length,
        converted: converted.length,
        lost: lost.length,
        stale: stale.length,
        pending_tasks: pendingTasks.length,
        overdue_tasks: overdueTasks.length,
      }
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Report failed') },
      { status: 500 }
    )
  }
}
