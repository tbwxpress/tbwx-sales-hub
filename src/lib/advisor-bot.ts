// Deterministic auto-replies to standard template BUTTON taps — a rules bot,
// not an LLM. Free-text messages always stay with humans; the bot only answers
// a known button, inside the fresh 24h service window the tap just opened
// (free-form text is allowed there — no template needed).
//
// Behaviour (per Gavish, 2026-07-18):
//  - "Talk to advisor" / "Call me back" / "Message me here" →
//      in-hours:  "connecting you with an advisor shortly" + qualifying Qs
//      off-hours (Sunday, or before 10:00 / after 18:30 IST):
//                 "advisors are away — we'll reach back as soon as available"
//                 + the same qualifying Qs
//  - The qualifying questions (city / budget / timeline) filter casual leads
//    so the team focuses on serious ones — answers arrive as normal inbound
//    text for the owner to read.
//  - The thread stays UNREAD for the agent (bot replies never mark the
//    customer's message read), so it still pins to the top of the inbox.
//
// Safety rails: kill-switch setting `bot.enabled` ('false' disables), max one
// bot reply per phone per 6h, and never replies to anything but the known
// button set.

import { getMessages, insertMessage, getSetting } from './db'
import { sendTextMessage } from './whatsapp'

export const BOT_SENDER = 'bot'
const COOLDOWN_MS = 6 * 60 * 60 * 1000

// Buttons that mean "I want a human". Compared lowercased + trimmed.
const ADVISOR_BUTTONS = new Set(['talk to advisor', 'call me back', 'message me here'])

// Business hours: Mon–Sat 10:00–18:30 IST.
export function isOffHoursIst(now = Date.now()): boolean {
  const ist = new Date(now + 5.5 * 60 * 60 * 1000)
  const day = ist.getUTCDay() // 0 = Sunday (in IST because of the shift)
  if (day === 0) return true
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return minutes < 10 * 60 || minutes >= 18 * 60 + 30
}

const QUALIFY =
  'Meanwhile, 3 quick details will help us serve you faster:\n' +
  '1️⃣ Which city are you planning for?\n' +
  '2️⃣ Investment comfort — our franchise is ₹4–7 lakh all-in. Does that fit your budget?\n' +
  '3️⃣ How soon do you want to start?\n\n' +
  'Reply right here — your advisor will come fully prepared. 🧇'

const IN_HOURS_ACK =
  'Great! Connecting you with a TBWX franchise advisor — you will hear from us shortly. 🙌\n\n'

const OFF_HOURS_ACK =
  'Thanks for reaching out! Our advisors are currently away (we are available Mon–Sat, 10 AM – 6:30 PM IST). ' +
  'Your request is noted and an advisor will get back to you as soon as we are available. 🙏\n\n'

/**
 * Reply to a known button tap if the rails allow. Returns true if a bot
 * message was sent. `buttonText` must be the button title (any casing);
 * pass '' for non-button messages and this is a no-op.
 */
export async function maybeBotReply(phone: string, buttonText: string): Promise<boolean> {
  const key = (buttonText || '').trim().toLowerCase()
  if (!ADVISOR_BUTTONS.has(key)) return false

  // Kill-switch (default ON — set bot.enabled='false' to disable).
  try {
    if ((await getSetting('bot.enabled')) === 'false') return false
  } catch { /* setting read failure → stay enabled */ }

  // Cooldown: at most one bot reply per phone per 6h.
  try {
    const recent = await getMessages(phone, 30, 0)
    const now = Date.now()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentBot = (recent || []).some((m: any) =>
      m.sent_by === BOT_SENDER && now - new Date(String(m.timestamp || '')).getTime() < COOLDOWN_MS
    )
    if (recentBot) return false
  } catch { /* if the check fails, err on silence */ return false }

  const body = (isOffHoursIst() ? OFF_HOURS_ACK : IN_HOURS_ACK) + QUALIFY
  const result = await sendTextMessage(phone, body)
  if (!result.success) {
    console.error('[advisor-bot] send failed:', result.error)
    return false
  }

  await insertMessage({
    phone,
    direction: 'sent',
    text: body,
    timestamp: new Date().toISOString(),
    sent_by: BOT_SENDER,
    wa_message_id: result.message_id || '',
    status: 'sent',
    read: true,
  })
  console.log(`[advisor-bot] replied to "${key}" for ${phone} (${isOffHoursIst() ? 'off-hours' : 'in-hours'})`)
  return true
}
