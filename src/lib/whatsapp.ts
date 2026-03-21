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
    console.log('[WA Template] Sending:', JSON.stringify(payload, null, 2))

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
    console.log('[WA Template] Response:', JSON.stringify(data, null, 2))

    if (data.messages?.[0]?.id) {
      return { success: true, message_id: data.messages[0].id }
    }

    return { success: false, error: data.error?.message || JSON.stringify(data) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
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