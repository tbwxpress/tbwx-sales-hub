import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { upsertContact, insertMessage, getMessages } from '@/lib/db'
import { sendTextMessage, sendTemplate, isWithin24Hours } from '@/lib/whatsapp'
import { logSentMessage } from '@/lib/sheets'

// POST /api/inbox/send — send a message from the inbox
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const { phone, message, template_name, template_params, contact_name } = await req.json()
    if (!phone) {
      return NextResponse.json({ success: false, error: 'Phone number required' }, { status: 400 })
    }

    // Ensure contact exists
    await upsertContact(phone, { name: contact_name || '' })

    let result

    if (template_name) {
      result = await sendTemplate(phone, template_name, template_params)
    } else if (message) {
      // Check 24-hour window from local DB
      const messages = await getMessages(phone, 200)
      const receivedMsgs = messages.filter((m: Record<string, unknown>) => m.direction === 'received')
      const lastReceived = receivedMsgs.length > 0 ? (receivedMsgs[receivedMsgs.length - 1] as Record<string, unknown>).timestamp as string : ''

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
      // Insert into local DB
      await insertMessage({
        phone,
        direction: 'sent',
        text: message || `[Template: ${template_name}]`,
        timestamp: new Date().toISOString(),
        sent_by: user.name,
        wa_message_id: result.message_id || '',
        status: 'sent',
        template_used: template_name || '',
        read: true,
      })

      // Also log to Google Sheets for backward compatibility
      await logSentMessage({
        phone,
        name: contact_name || '',
        message: message || `[Template: ${template_name}]`,
        sent_by: user.name,
        wa_message_id: result.message_id || '',
        status: 'sent',
        template_used: template_name || '',
      }).catch(() => {}) // Don't fail if sheets logging fails
    }

    return NextResponse.json({
      success: result.success,
      data: { message_id: result.message_id },
      error: result.error
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Send failed' },
      { status: 500 }
    )
  }
}
