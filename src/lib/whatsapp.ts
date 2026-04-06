import { WHATSAPP } from '@/config/client'

const WHATSAPP_API = WHATSAPP.apiBase

interface SendResult {
  success: boolean
  message_id?: string
  error?: string
}

export async function sendTextMessage(phone: string, text: string): Promise<SendResult> {
  // phone should be in format like 919876543210 (no +)
  const cleanPhone = phone.replace(/\D/g, '')

  try {
    const res = await fetch(
      `${WHATSAPP_API}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'text',
          text: { body: text },
        }),
      }
    )

    const data = await res.json()

    if (data.messages?.[0]?.id) {
      return { success: true, message_id: data.messages[0].id }
    }

    return { success: false, error: data.error?.message || 'Unknown error' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function sendTemplate(
  phone: string,
  templateName: string,
  parameters?: { type: string; text: string }[]
): Promise<SendResult> {
  const cleanPhone = phone.replace(/\D/g, '')

  const components: Record<string, unknown>[] = []
  if (parameters?.length) {
    components.push({
      type: 'body',
      parameters: parameters.map(p => ({ type: p.type, text: p.text })),
    })
  }

  try {
    const payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        ...(components.length ? { components } : {}),
      },
    }
    const res = await fetch(
      `${WHATSAPP_API}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    const data = await res.json()

    if (data.messages?.[0]?.id) {
      return { success: true, message_id: data.messages[0].id }
    }

    return { success: false, error: data.error?.message || JSON.stringify(data) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

// Check delivery status of a message via WhatsApp Cloud API
export async function getMessageStatus(waMessageId: string): Promise<{
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'unknown'
  timestamp?: string
  error?: string
}> {
  if (!waMessageId || !waMessageId.startsWith('wamid.')) {
    return { status: 'unknown', error: 'Invalid message ID' }
  }

  try {
    const res = await fetch(
      `${WHATSAPP_API}/${waMessageId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        },
      }
    )

    if (!res.ok) {
      // Meta doesn't expose a per-message status GET endpoint in Cloud API,
      // so we fall back to checking our local DB for the status
      return { status: 'unknown', error: 'Status not available via API' }
    }

    const data = await res.json()
    return {
      status: data.status || 'unknown',
      timestamp: data.timestamp,
    }
  } catch (err) {
    return { status: 'unknown', error: err instanceof Error ? err.message : 'Network error' }
  }
}

// Check if we're within the 24-hour messaging window
// by looking at the last received message timestamp
export function isWithin24Hours(lastReceivedAt: string): boolean {
  if (!lastReceivedAt) return false
  const received = new Date(lastReceivedAt).getTime()
  const now = Date.now()
  return (now - received) < 24 * 60 * 60 * 1000
}