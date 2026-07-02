import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { logSentMessage, updateLead, getLeadByRow, getLeads, getReceivedMessages } from '@/lib/sheets'
import { sendTextMessage, sendTemplate, isWithin24Hours } from '@/lib/whatsapp'
import { WHATSAPP } from '@/config/client'
import { recordFirstResponse } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const { phone, message, lead_row, template_name, template_params } = await req.json()
    if (!phone) {
      return NextResponse.json({ success: false, error: 'Phone number required' }, { status: 400 })
    }

    let result

    if (template_name) {
      // Send template message
      result = await sendTemplate(phone, template_name, template_params)
    } else if (message) {
      // Check 24-hour window
      const received = await getReceivedMessages(phone)
      const lastReceived = received.length > 0 ? received[received.length - 1].timestamp : ''

      if (!isWithin24Hours(lastReceived)) {
        return NextResponse.json({
          success: false,
          error: 'Outside 24-hour window. Use a template message instead.',
          needs_template: true
        }, { status: 400 })
      }

      result = await sendTextMessage(phone, message)
    } else {
      return NextResponse.json({ success: false, error: 'Message or template required' }, { status: 400 })
    }

    if (result.success) {
      // Find lead name (reads single row, not all leads)
      let leadName = ''
      if (lead_row) {
        const lead = await getLeadByRow(lead_row)
        leadName = lead?.full_name || ''
      }

      // Log the sent message
      await logSentMessage({
        phone,
        name: leadName,
        message: message || `[Template: ${template_name}]`,
        sent_by: user.name,
        wa_message_id: result.message_id || '',
        status: 'sent',
        template_used: template_name || '',
      })

      // Update lead's followup date (never regress advanced statuses)
      let followupLead = null
      if (lead_row) {
        followupLead = await getLeadByRow(lead_row)
        const nextDate = new Date()
        nextDate.setDate(nextDate.getDate() + WHATSAPP.autoFollowupDays)
        const updateFields: Record<string, string> = {
          next_followup: nextDate.toISOString().split('T')[0],
        }
        // Only set DECK_SENT if lead is still NEW
        if (!followupLead || followupLead.lead_status === 'NEW') {
          updateFields.lead_status = WHATSAPP.autoSentStatus
        }
        await updateLead(lead_row, updateFields)
      }

      // Record first-response SLA — non-critical, must never fail the send.
      try {
        let slaLead = followupLead
        if (!slaLead) {
          // No lead_row supplied — match by last-10 digits of phone
          const normPhone = String(phone).replace(/\D/g, '').slice(-10)
          const all = await getLeads()
          slaLead = all.find(l => String(l.phone).replace(/\D/g, '').slice(-10) === normPhone) ?? null
        }
        if (slaLead?.created_time) {
          await recordFirstResponse(slaLead.phone, slaLead.created_time)
        }
      } catch (slaErr) {
        console.error('[whatsapp/send] recordFirstResponse failed (non-fatal):', slaErr)
      }
    }

    return NextResponse.json({ success: result.success, data: { message_id: result.message_id }, error: result.error })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Send failed') }, { status: 500 })
  }
}
