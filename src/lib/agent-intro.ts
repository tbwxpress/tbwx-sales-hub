/**
 * Agent-intro auto-message — introduces the ASSIGNED agent to an engaged
 * lead, on the agent's behalf, with their direct calling number.
 *
 * Fires from the webhook while the lead's 24h service window is open (we
 * are literally processing their inbound message), and only when ALL hold:
 *   - the admin switch `agent_intro.enabled` is 'true'   (default OFF)
 *   - the lead has an assigned agent with a saved phone number
 *   - the deck already went out (the intro is touch #2, never the opener)
 *   - the intro was never sent before (template_used marker dedupe)
 *   - the lead hasn't opted out
 */

const MARKER = 'agent_intro'

/**
 * Copy is deliberately two-speed (per Gavish): the DEFAULT expectation is
 * "your advisor will reach out" (so every lead doesn't dial at once and
 * swamp the agent), while high-intent leads in a hurry get an explicit
 * fast lane — the agent's direct number — so they never wait and slip away.
 */
export function buildAgentIntroText(leadName: string, agentName: string, agentPhone: string): string {
  const first = (leadName || '').trim().split(/\s+/)[0] || 'there'
  return (
    `Hi ${first}! I'm ${agentName}, your dedicated TBWX franchise advisor — your enquiry is with me now and I'll personally reach out to you.\n\n` +
    `In a hurry to discuss the TBWX franchise right away? Call or WhatsApp me directly on ${agentPhone}.\n\n` +
    `Otherwise sit back — I'll be in touch shortly. — ${agentName}, TBWX`
  )
}

// Lightweight urgency detector (English + Hinglish): a hurried lead gets the
// intro IMMEDIATELY, even before the deck-first discipline would allow it.
const URGENT_PATTERNS = [
  'call me', 'call now', 'call kar', 'call karo', 'callback', 'call back',
  'urgent', 'asap', 'right away', 'immediately', 'right now',
  'abhi', 'jaldi', 'turant', 'baat kar', 'baat karni', 'speak now',
  'talk now', 'need to talk', 'want to talk', 'can we talk', 'call please',
]

export function isUrgentText(text: string): boolean {
  const t = (text || '').toLowerCase()
  return URGENT_PATTERNS.some(p => t.includes(p))
}

export async function maybeSendAgentIntro(params: { phone: string; leadRow: number; text?: string }): Promise<boolean> {
  const { phone, leadRow, text: inboundText } = params
  try {
    const { getSetting, getMessages, insertMessage, getOptedOutPhones, normalizePhone } = await import('./db')

    const enabled = await getSetting('agent_intro.enabled')
    if (enabled !== 'true') return false

    const { getLeadByRow } = await import('./sheets')
    const lead = await getLeadByRow(leadRow)
    if (!lead?.assigned_to) return false
    if ((lead.full_name || '').toLowerCase().includes('test lead')) return false

    const optedOut = await getOptedOutPhones()
    if (optedOut.has(normalizePhone(phone))) return false

    const { getUsers } = await import('./users')
    const agent = (await getUsers()).find(u => u.name === lead.assigned_to && u.active)
    const agentPhone = (agent?.phone || '').trim()
    if (!agent || !agentPhone) return false

    const msgs = await getMessages(phone, 200, 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sent = (msgs || []).filter((m: any) => m.direction === 'sent')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (sent.some((m: any) => m.template_used === MARKER)) return false

    // Touch #2 discipline: the deck conversation must already be under way —
    // the human introduction never replaces the opener. EXCEPTION: a lead
    // whose message signals urgency ("call me", "jaldi", …) gets the intro
    // immediately — a hurried high-intent lead must never wait.
    const urgent = isUrgentText(inboundText || '')
    if (!urgent) {
      const { getMarketingFirstTemplateName } = await import('./template-settings')
      const deckTemplate = await getMarketingFirstTemplateName()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!sent.some((m: any) => m.template_used === deckTemplate && m.status !== 'failed')) return false
    }

    const text = buildAgentIntroText(lead.full_name, agent.name, agentPhone)
    const { sendTextMessage } = await import('./whatsapp')
    const res = await sendTextMessage(phone, text)
    if (!res.success) return false

    await insertMessage({
      phone,
      direction: 'sent',
      text,
      timestamp: new Date().toISOString(),
      sent_by: 'System (Auto)',
      wa_message_id: res.message_id || '',
      status: 'sent',
      template_used: MARKER,
      read: true,
    })
    console.log(`[agent-intro] Sent intro for lead ${leadRow} on behalf of ${agent.name}`)
    return true
  } catch (err) {
    console.error('[agent-intro] failed (non-critical):', err)
    return false
  }
}
