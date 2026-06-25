import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads } from '@/lib/sheets'
import { getUserByEmail, isLockedGuidedAgent } from '@/lib/users'
import { getLastMessageByPhone, getOptedOutPhones } from '@/lib/db'
import { getTelecallerVisibleLeadRows, getAllAssignments } from '@/lib/telecaller'
import { STATUS_MIGRATION } from '@/config/client'

interface FeedItem {
  kind: 'hot_stale' | 'overdue_followup' | 'upcoming_followup' | 'telecaller_handoff' | 'unread_reply' | 'new_assignment'
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

    // Server lock: locked-guided agents (guided_inbox) get the rail + Inbox only.
    if (user.role === 'agent' && await isLockedGuidedAgent(user.id)) {
      return NextResponse.json({ success: false, error: 'Not available in guided mode' }, { status: 403 })
    }

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

    // One bulk read of the latest message per phone — replaces the per-lead N+1.
    const lastMsgByPhone = await getLastMessageByPhone()
    const last10 = (p: string) => p.replace(/\D/g, '').slice(-10)

    const now = Date.now()
    const todayStr = new Date().toISOString().split('T')[0]
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    const sevenDaysLater = new Date(now + sevenDaysMs)
    const items: FeedItem[] = []

    // For each lead in scope, use the latest message (from the single bulk
    // getLastMessageByPhone() read above) to derive "last contacted" + unread reply.
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

      // 1b. Upcoming follow-up (today or within 7 days, not overdue)
      if (lead.next_followup) {
        const followupDate = new Date(lead.next_followup)
        if (
          !Number.isNaN(followupDate.getTime()) &&
          followupDate >= new Date(todayStr) &&
          followupDate <= sevenDaysLater
        ) {
          const daysUntil = Math.round((followupDate.getTime() - now) / (24 * 3600 * 1000))
          items.push({
            kind: 'upcoming_followup',
            priority: 40 + daysUntil,
            title: `${lead.full_name || lead.phone} — follow-up ${daysUntil <= 0 ? 'today' : `in ${daysUntil}d`}`,
            subtitle: `Status: ${lead.lead_status} · Priority: ${lead.lead_priority || '—'}`,
            ref_phone: lead.phone,
            ref_lead_row: lead.row_number,
            status: lead.lead_status,
          })
        }
      }

      // Latest message for this lead (from the single bulk read above).
      const lastMsg = lastMsgByPhone.get(last10(lead.phone))

      // 2. HOT lead with no recent contact (4h+)
      if (lead.lead_status === 'HOT' || lead.lead_priority === 'HOT') {
        const lastTs = lastMsg?.timestamp ? new Date(lastMsg.timestamp).getTime() : 0
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
      }

      // 3. Unread reply (lead's last message is inbound and within 24h)
      {
        const dir = lastMsg?.direction
        const ts = lastMsg?.timestamp ? new Date(lastMsg.timestamp).getTime() : 0
        if (dir === 'received' && ts && (now - ts) < TWENTY_FOUR_HOURS_MS) {
          items.push({
            kind: 'unread_reply',
            priority: 5,
            title: `💬 ${lead.full_name || lead.phone} replied`,
            subtitle: (lastMsg?.text || '').slice(0, 80) || `Status: ${lead.lead_status}`,
            ref_phone: lead.phone,
            ref_lead_row: lead.row_number,
            status: lead.lead_status,
          })
        }
      }
    }

    // 4. Telecaller hand-offs — leads where current user is the *owner* and a telecaller has been assigned recently
    // (Only for closers, not telecallers themselves)
    if (!isTelecaller && live) {
      const allLeads = await getLeads()
      const ownedRowSet = new Set(
        allLeads.filter(l => l.assigned_to === user.name).map(l => l.row_number)
      )
      // All telecaller assignments in one query via the shared DB client
      // (was creating a fresh libsql client per request).
      const tcAssignments = await getAllAssignments()
      for (const a of tcAssignments) {
        const lr = a.lead_row
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
    }

    // Sort by priority (low = top), then age desc
    items.sort((a, b) => a.priority - b.priority || (b.age_hours || 0) - (a.age_hours || 0))

    return NextResponse.json({ success: true, data: { items, count: items.length } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
