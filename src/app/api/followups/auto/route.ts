import { NextResponse } from 'next/server'
import { getLeads } from '@/lib/sheets'
import { getMessages } from '@/lib/db'
import { sendTemplate } from '@/lib/whatsapp'

// POST /api/followups/auto — automated follow-up check (called by n8n cron)
export async function POST() {
  try {
    const leads = await getLeads()
    const now = Date.now()
    let followup3d = 0
    let followup6d = 0
    let skipped = 0

    for (const lead of leads) {
      if (!lead.phone || !lead.wa_message_id) continue
      if (['CONVERTED', 'LOST', 'REPLIED', 'HOT'].includes(lead.lead_status)) continue

      const phone = lead.phone.replace(/\D/g, '')
      if (!phone) continue

      // Get messages from local DB
      const messages = await getMessages(phone, 200)

      // Check if lead has replied at all
      const hasReplied = messages.some((m: Record<string, unknown>) => m.direction === 'received')
      if (hasReplied) { skipped++; continue }

      // Find the last sent template message
      const sentMsgs = messages
        .filter((m: Record<string, unknown>) => m.direction === 'sent')
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          new Date(b.timestamp as string).getTime() - new Date(a.timestamp as string).getTime()
        )

      if (sentMsgs.length === 0) { skipped++; continue }

      const lastSentAt = new Date((sentMsgs[0] as Record<string, unknown>).timestamp as string).getTime()
      const daysSinceLastSent = (now - lastSentAt) / (1000 * 60 * 60 * 24)

      // Count how many templates we've sent total
      const templatesSent = sentMsgs.filter((m: Record<string, unknown>) =>
        (m.template_used as string)?.length > 0
      ).length

      if (daysSinceLastSent >= 3 && daysSinceLastSent < 6 && templatesSent < 2) {
        // 3-day follow-up — send autoresponse_1 again
        const firstName = (lead.full_name || 'there').split(' ')[0]
        const result = await sendTemplate(phone, 'autoresponse_1', [{ type: 'text', text: firstName }])
        if (result.success) followup3d++
      } else if (daysSinceLastSent >= 6 && templatesSent < 3) {
        // 6-day final follow-up
        const firstName = (lead.full_name || 'there').split(' ')[0]
        const result = await sendTemplate(phone, 'autoresponse_1', [{ type: 'text', text: firstName }])
        if (result.success) followup6d++
      } else {
        skipped++
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        followup_3day: followup3d,
        followup_6day: followup6d,
        skipped,
      }
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Follow-up failed' },
      { status: 500 }
    )
  }
}
