// WhatsApp Coexistence — Meta's official "Business App + Cloud API on the same
// number" feature (launched May 2025). Agents keep chatting from the WhatsApp
// Business app on their phones; Meta mirrors every 1:1 message to our webhook:
//   - smb_message_echoes  → messages the agent sends from the app
//   - history             → up to 180 days of past chats (chunked, 3 phases)
//   - smb_app_state_sync  → the app's saved contact names
// Numbers are onboarded via Embedded Signup (featureType
// 'whatsapp_business_app_onboarding') from /admin/wa-numbers. This lib holds
// the pure payload helpers (unit-tested) + the Graph API calls.

import { WHATSAPP } from '@/config/client'

// ---------- pure helpers ----------

// A message travelled on the main Cloud-API line unless the webhook metadata
// names a different registered number. Missing metadata (old payloads, tests)
// is treated as main so existing behaviour never regresses.
export function isMainLineId(metaPhoneNumberId: string, mainPhoneNumberId?: string): boolean {
  if (!metaPhoneNumberId || !mainPhoneNumberId) return true
  return metaPhoneNumberId === mainPhoneNumberId
}

// Human-readable text for any WhatsApp message object (live, echo or history —
// they share the type/content shape). Mirrors what the inbox can render.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractMessageText(msg: any): string {
  switch (msg?.type) {
    case 'text':
      return msg.text?.body || ''
    case 'image':
      return '[Image] ' + (msg.image?.caption || '')
    case 'video':
      return '[Video] ' + (msg.video?.caption || '')
    case 'audio':
      return '[Audio message]'
    case 'document':
      return '[Document] ' + (msg.document?.filename || '')
    case 'location':
      return `[Location: ${msg.location?.latitude}, ${msg.location?.longitude}]`
    case 'sticker':
      return '[Sticker]'
    case 'reaction':
      return `[Reaction: ${msg.reaction?.emoji || ''}]`
    case 'button':
      return msg.button?.text || '[Button reply]'
    case 'interactive':
      return msg.interactive?.button_reply?.title ||
             msg.interactive?.list_reply?.title ||
             '[Interactive reply]'
    default:
      return `[${msg?.type || 'Unknown'} message]`
  }
}

// WhatsApp timestamps arrive as epoch-seconds strings; history import must not
// mis-stamp threads, so handle seconds, millis and garbage defensively.
export function waTsToIso(ts: unknown): string {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString()
  const ms = n > 1e12 ? n : n * 1000
  return new Date(ms).toISOString()
}

// Direction of a history message: WhatsApp puts the SENDER in `from`, so a
// message whose `from` matches the thread's customer wa_id was received by us;
// anything else (the business number) was sent by the agent. Compared on the
// last 10 digits to survive +91/91/0-prefix formatting drift.
export function historyDirection(msgFrom: unknown, threadCustomerWaId: unknown): 'sent' | 'received' {
  const last10 = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-10)
  const from = last10(msgFrom)
  const customer = last10(threadCustomerWaId)
  if (!from || !customer) return 'received'
  return from === customer ? 'received' : 'sent'
}

// Manual fallback when the FB JS SDK can't load: Embedded Signup as a plain
// OAuth dialog popup. Session-info events still postMessage to window.opener.
export function buildEsDialogUrl(appId: string, configId: string, graphVersion = 'v23.0'): string {
  const extras = encodeURIComponent(JSON.stringify({
    setup: {},
    featureType: 'whatsapp_business_app_onboarding',
    sessionInfoVersion: '3',
  }))
  return `https://www.facebook.com/${graphVersion}/dialog/oauth` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&config_id=${encodeURIComponent(configId)}` +
    `&response_type=code` +
    `&override_default_response_type=true` +
    `&display=popup` +
    `&extras=${extras}`
}

// ---------- Graph API ----------

export interface WabaPhoneNumber {
  id: string
  display_phone_number: string
  verified_name: string
  platform_type?: string
}

// All phone numbers currently attached to our WABA (main + coexistence ones).
export async function fetchWabaPhoneNumbers(): Promise<{ success: boolean; numbers?: WabaPhoneNumber[]; error?: string }> {
  const wabaId = process.env.WHATSAPP_WABA_ID
  if (!wabaId) return { success: false, error: 'WHATSAPP_WABA_ID not set' }
  try {
    const res = await fetch(
      `${WHATSAPP.apiBase}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,platform_type&limit=100`,
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
    )
    const data = await res.json()
    if (data.error) return { success: false, error: data.error.message || 'Graph error' }
    return { success: true, numbers: (data.data || []) as WabaPhoneNumber[] }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

// Ask Meta to start mirroring a coexistence number's app data to our webhook.
// Must be called within 24h of onboarding. 'smb_app_state_sync' = contacts,
// 'history' = up to 180 days of past messages (arrives chunked over webhooks).
export async function requestSmbSync(
  phoneNumberId: string,
  syncType: 'smb_app_state_sync' | 'history'
): Promise<{ success: boolean; request_id?: string; error?: string }> {
  try {
    const res = await fetch(`${WHATSAPP.apiBase}/${phoneNumberId}/smb_app_data`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: syncType }),
    })
    const data = await res.json()
    if (data.error) return { success: false, error: data.error.message || 'Graph error' }
    return { success: true, request_id: data.request_id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}
