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

export function buildAgentIntroText(leadName: string, agentName: string, agentPhone: string): string {
  const first = (leadName || '').trim().split(/\s+/)[0] || 'there'
  return (
    `Hi ${first}! I'm ${agentName}, your dedicated TBWX franchise advisor — I'll be personally handling your enquiry from here.\n\n` +
    `You can call or WhatsApp me directly anytime on ${agentPhone}.\n\n` +
    `Or just tell me a good time today and I'll call you. — ${agentName}, TBWX`
  )
}

export async function maybeSendAgentIntro(params: { phone: string; leadRow: number }): Promise<boolean> {
  const { phone, leadRow } = params
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
    // the human introduction never replaces the opener.
    const { getMarketingFirstTemplateName } = await import('./template-settings')
    const deckTemplate = await getMarketingFirstTemplateName()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!sent.some((m: any) => m.template_used === deckTemplate && m.status !== 'failed')) return false

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
