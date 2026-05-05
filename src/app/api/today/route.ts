import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads } from '@/lib/sheets'
import { getUserByEmail } from '@/lib/users'
import { getMessages } from '@/lib/db'
import { getTelecallerVisibleLeadRows, getAssignmentsByTelecaller } from '@/lib/telecaller'
import { getOptedOutPhones } from '@/lib/db'
import { STATUS_MIGRATION } from '@/config/client'

interface FeedItem {
  kind: 'hot_stale' | 'overdue_followup' | 'telecaller_handoff' | 'unread_reply' | 'new_assignment'
  priority: number // lower = more urgent
  title: string
  subtitle: string
  ref_phone: string
  ref_lead_row: number
  status: string
  age_hours?: number
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    // Resolve live telecaller flag (don't trust JWT)
    const live = await getUserByEmail(user.email)
    const isTelecaller = !!live?.is_telecaller
    const isAdmin = user.role === 'admin'

    // Fetch all leads, migrate statuses
    let leads = await getLeads()
    leads = leads.map(l => ({
      ...l,
      lead_status: (STATUS_MIGRATION[l.lead_status] || l.lead_status) as typeof l.lead_status,
    }))

    // Scope leads to user
    if (isTelecaller && live) {
      const optedOut = await getOptedOutPhones()
      const visible = await getTelecallerVisibleLeadRows({
        telecallerUserId: live.id,
        leads: leads.map(l => ({ row_number: l.row_number, lead_status: l.lead_status, phone: l.phone })),
        optedOutPhones: optedOut,
      })
      leads = leads.filter(l => visible.has(l.row_number))
    } else if (!isAdmin) {
      // Closer / regular agent
      leads = leads.filter(l => l.assigned_to === user.name)
    }

    const now = Date.now()
    const todayStr = new Date().toISOString().split('T')[0]
    const items: FeedItem[] = []

    // For each lead in scope, look at recent messages to know "last contacted"
    // Avoid hammering DB — bulk-query message timestamps once per phone via getMessages
    // For an MVP we tolerate the per-lead query.
    for (const lead of leads) {
      // Skip terminal-ish statuses
      if (['CONVERTED', 'LOST', 'ARCHIVED'].includes(lead.lead_status)) continue

      // 1. Overdue follow-up
      if (lead.next_followup) {
        const followupDate = new Date(lead.next_followup)
        if (!Number.isNaN(followupDate.getTime()) && followupDate < new Date(todayStr)) {
          const daysOver = Math.max(1, Math.round((Date.now() - followupDate.getTime()) / (24 * 3600 * 1000)))
          items.push({
            kind: 'overdue_followup',
            priority: 20 + Math.min(10, daysOver), // older = lower priority bump
            title: `${lead.full_name || lead.phone} — follow-up overdue ${daysOver}d`,
            subtitle: `Status: ${lead.lead_status} · Priority: ${lead.lead_priority || '—'}`,
            ref_phone: lead.phone,
            ref_lead_row: lead.row_number,
            status: lead.lead_status,
          })
        }
      }

      // 2. HOT lead with no recent contact (4h+)
      if (lead.lead_status === 'HOT' || lead.lead_priority === 'HOT') {
        try {
          const msgs = await getMessages(lead.phone, 1, 0)
          const last = msgs?.[0]
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lastTs = last?.timestamp ? new Date((last as any).timestamp).getTime() : 0
          const ageMs = lastTs ? now - lastTs : Infinity
          if (ageMs > FOUR_HOURS_MS) {
            const ageHours = isFinite(ageMs) ? Math.round(ageMs / (60 * 60 * 1000)) : 999
            items.push({
              kind: 'hot_stale',
              priority: 1, // top
              title: `🔥 ${lead.full_name || lead.phone} — HOT, no contact ${ageHours}h+`,
              subtitle: `Status: ${lead.lead_status} · ${lead.city || 'unknown city'}`,
              ref_phone: lead.phone,
              ref_lead_row: lead.row_number,
              status: lead.lead_status,
              age_hours: ageHours,
            })
          }
        } catch { /* skip */ }
      }

      // 3. Unread reply (lead's last message is inbound and within 24h)
      try {
        const msgs = await getMessages(lead.phone, 1, 0)
        const last = msgs?.[0]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dir = (last as any)?.direction
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ts = (last as any)?.timestamp ? new Date((last as any).timestamp).getTime() : 0
        if (dir === 'received' && ts && (now - ts) < TWENTY_FOUR_HOURS_MS) {
          items.push({
            kind: 'unread_reply',
            priority: 5,
            title: `💬 ${lead.full_name || lead.phone} replied`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            subtitle: ((last as any).text || '').slice(0, 80) || `Status: ${lead.lead_status}`,
            ref_phone: lead.phone,
            ref_lead_row: lead.row_number,
            status: lead.lead_status,
          })
        }
      } catch { /* skip */ }
    }

    // 4. Telecaller hand-offs — leads where current user is the *owner* and a telecaller has been assigned recently
    // (Only for closers, not telecallers themselves)
    if (!isTelecaller && live) {
      const allLeads = await getLeads()
      const ownedRows = allLeads.filter(l => l.assigned_to === user.name).map(l => l.row_number)
      const ownedRowSet = new Set(ownedRows)
      // pull all telecaller assignments tied to my leads
      const tcAssignments = await getAssignmentsByTelecaller('') // empty = no match; instead use bulk
      // Simpler: re-query directly
      const { createClient } = await import('@libsql/client')
      const dbUrl = process.env.TURSO_DATABASE_URL || 'file:data/inbox.db'
      const authToken = process.env.TURSO_AUTH_TOKEN || undefined
      const db = createClient({ url: dbUrl, authToken })
      const r = await db.execute(`SELECT lead_row, telecaller_user_id, assigned_at FROM lead_telecaller_assignments`)
      for (const row of r.rows) {
        const lr = Number(row.lead_row)
        if (!ownedRowSet.has(lr)) continue
        const lead = allLeads.find(l => l.row_number === lr)
        if (!lead || ['CONVERTED', 'LOST', 'ARCHIVED'].includes(lead.lead_status)) continue
        items.push({
          kind: 'telecaller_handoff',
          priority: 8,
          title: `🤝 Telecaller working ${lead.full_name || lead.phone}`,
          subtitle: `Status: ${lead.lead_status} · check call notes before contacting`,
          ref_phone: lead.phone,
          ref_lead_row: lr,
          status: lead.lead_status,
        })
      }
      // suppress unused-warn for tcAssignments
      void tcAssignments
    }

    // Sort by priority (low = top), then age desc
    items.sort((a, b) => a.priority - b.priority || (b.age_hours || 0) - (a.age_hours || 0))

    return NextResponse.json({ success: true, data: { items, count: items.length } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
