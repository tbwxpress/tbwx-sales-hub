import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeadByRow } from '@/lib/sheets'
import { getAutoMessageStatus } from '@/lib/db'

/**
 * GET /api/leads/[id]/verify-message
 *
 * Checks the delivery status of n8n's automated first message for a lead.
 * Uses the wa_message_id stored in the Google Sheet (column Y) by n8n,
 * then looks up delivery status from our SQLite DB (populated by Meta webhooks).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requireAuth(session)
    const { id } = await params
    const rowNum = parseInt(id)

    // Get the lead to find their wa_message_id (set by n8n) and phone
    const lead = await getLeadByRow(rowNum)
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 })
    }

    const waMessageId = lead.wa_message_id
    const phone = lead.phone?.replace(/\D/g, '')

    if (!waMessageId) {
      return NextResponse.json({
        success: true,
        data: {
          auto_message_sent: false,
          status: 'none',
          message: 'No automated message has been sent to this lead yet',
        },
      })
    }

    // Check our SQLite DB for the message status (updated by Meta webhook)
    const dbStatus = await getAutoMessageStatus(waMessageId, phone)

    return NextResponse.json({
      success: true,
      data: {
        auto_message_sent: true,
        wa_message_id: waMessageId,
        status: dbStatus.status,
        timestamp: dbStatus.timestamp,
        template_used: dbStatus.template_used,
        source: dbStatus.source,
        message: statusMessage(dbStatus.status),
      },
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to verify message' },
      { status: 500 }
    )
  }
}

function statusMessage(status: string): string {
  switch (status) {
    case 'read': return 'Message was delivered and read by the lead'
    case 'delivered': return 'Message was delivered to the lead\'s phone'
    case 'sent': return 'Message was sent but delivery not yet confirmed'
    case 'failed': return 'Message failed to deliver'
    case 'none': return 'No automated message found'
    default: return 'Message status unknown'
  }
}
