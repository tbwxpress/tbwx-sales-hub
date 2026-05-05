import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { upsertContact, insertMessage, updateMessageStatus, getMessages, getContact, getDripState, upsertDripState } from '@/lib/db'
import { sendTemplate } from '@/lib/whatsapp'
import { logSentMessage, getLeadByRow } from '@/lib/sheets'
import { getMarketingFirstTemplateName } from '@/lib/template-settings'
import { notifyQuiet } from '@/lib/notifications'
import { getUsers } from '@/lib/users'

// Button response classification for follow-up templates
const POSITIVE_BUTTONS = ['yes, tell me more', "yes, let's talk", "i'm interested"]
const DELAY_BUTTONS = ['not right now', 'maybe later']
const OPTOUT_BUTTONS = ['not interested', 'stop messages']

// WhatsApp webhook verification (GET)
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode')
  const token = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'saleshub-webhook-verify'

  if (mode === 'subscribe' && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// WhatsApp incoming message webhook (POST)
export async function POST(req: NextRequest) {
  try {
    // Verify Meta webhook signature (HMAC-SHA256) — REQUIRED
    const appSecret = process.env.META_APP_SECRET
    if (!appSecret) {
      console.error('[Webhook] META_APP_SECRET not set — rejecting all webhook requests')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }
    const signature = req.headers.get('x-hub-signature-256')
    if (!signature) {
      console.warn('[Webhook] Missing x-hub-signature-256 header — rejecting')
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }
    const rawBody = await req.clone().text()
    const expectedSig = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
    if (signature !== expectedSig) {
      console.warn('[Webhook] Invalid signature — rejecting')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const body = await req.json()

    // Meta sends webhook payloads with this structure
    const entries = body.entry || []

    for (const entry of entries) {
      const changes = entry.changes || []

      for (const change of changes) {
        if (change.field !== 'messages') continue
        const value = change.value || {}
        const messages = value.messages || []
        const contacts = value.contacts || []

        for (const msg of messages) {
          const phone = msg.from // e.g. "919876543210"
          const contactInfo = contacts.find((c: { wa_id: string }) => c.wa_id === phone)
          const contactName = contactInfo?.profile?.name || ''

          // Get message text based on type
          let text = ''
          switch (msg.type) {
            case 'text':
              text = msg.text?.body || ''
              break
            case 'image':
              text = '[Image] ' + (msg.image?.caption || '')
              break
            case 'video':
              text = '[Video] ' + (msg.video?.caption || '')
              break
            case 'audio':
              text = '[Audio message]'
              break
            case 'document':
              text = '[Document] ' + (msg.document?.filename || '')
              break
            case 'location':
              text = `[Location: ${msg.location?.latitude}, ${msg.location?.longitude}]`
              break
            case 'sticker':
              text = '[Sticker]'
              break
            case 'reaction':
              text = `[Reaction: ${msg.reaction?.emoji || ''}]`
              break
            case 'button':
              text = msg.button?.text || '[Button reply]'
              break
            case 'interactive':
              text = msg.interactive?.button_reply?.title ||
                     msg.interactive?.list_reply?.title ||
                     '[Interactive reply]'
              break
            default:
              text = `[${msg.type || 'Unknown'} message]`
          }

          // Ensure contact exists
          await upsertContact(phone, { name: contactName })

          // Insert message
          await insertMessage({
            phone,
            direction: 'received',
            text,
            timestamp: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
            wa_message_id: msg.id || '',
            status: 'received',
            read: false,
          })

          // Auto-pause drip sequence when lead replies
          try {
            const dripState = await getDripState(phone)
            if (dripState && dripState.enabled === 1 && !dripState.paused_at) {
              await upsertDripState(phone, {
                paused_at: new Date().toISOString(),
                pause_reason: 'Lead replied',
              })
              console.log(`[Webhook] Paused drip for ${phone} — lead replied`)
            }
          } catch {
            // Non-critical — don't break webhook if drip pause fails
          }

          // Auto-classify leads from follow-up template button responses
          // Buttons from followup_value_hook, followup_social_proof, followup_last_chance
          try {
            const buttonText = (
              msg.type === 'interactive' ? (msg.interactive?.button_reply?.title || '') :
              msg.type === 'button' ? (msg.button?.text || '') : ''
            ).toLowerCase().trim()

            if (buttonText && (POSITIVE_BUTTONS.includes(buttonText) || DELAY_BUTTONS.includes(buttonText) || OPTOUT_BUTTONS.includes(buttonText))) {
              const { updateLead } = await import('@/lib/sheets')
              const contact = await getContact(phone)

              if (POSITIVE_BUTTONS.includes(buttonText)) {
                // Lead is interested — mark HOT, pause drip, alert agent
                if (contact?.lead_row) {
                  await updateLead(Number(contact.lead_row), {
                    lead_status: 'HOT',
                    lead_priority: 'HOT',
                    next_followup: new Date().toISOString().split('T')[0],
                    notes: `[Auto] Lead tapped "${buttonText}" on follow-up — marked HOT`,
                  })
                }
                await upsertDripState(phone, {
                  paused_at: new Date().toISOString(),
                  pause_reason: `Positive response: "${buttonText}"`,
                })
                // Alert the assigned agent via WhatsApp
                const managerPhone = process.env.MANAGER_PHONE || '917973933630'
                const leadName = contact?.name || phone
                await sendTemplate(managerPhone, 'sales_lead_alert', [
                  { type: 'text', text: `HOT LEAD ALERT: ${leadName} (${phone}) tapped "${buttonText}" — follow up NOW` },
                ])
                console.log(`[Webhook] Auto-classified ${phone} as HOT — button: "${buttonText}"`)

              } else if (DELAY_BUTTONS.includes(buttonText)) {
                // Lead wants to wait — mark DELAYED, follow up in 30 days
                const followup30 = new Date()
                followup30.setDate(followup30.getDate() + 30)
                if (contact?.lead_row) {
                  await updateLead(Number(contact.lead_row), {
                    lead_status: 'DELAYED',
                    next_followup: followup30.toISOString().split('T')[0],
                    notes: `[Auto] Lead tapped "${buttonText}" — delayed 30 days`,
                  })
                }
                await upsertDripState(phone, {
                  paused_at: new Date().toISOString(),
                  pause_reason: `Delayed: "${buttonText}"`,
                })
                console.log(`[Webhook] Auto-classified ${phone} as DELAYED — button: "${buttonText}"`)

              } else if (OPTOUT_BUTTONS.includes(buttonText)) {
                // Lead opted out — mark LOST, permanently stop all messaging
                if (contact?.lead_row) {
                  await updateLead(Number(contact.lead_row), {
                    lead_status: 'LOST',
                    notes: `[Auto] Lead tapped "${buttonText}" — opted out, no further messages`,
                  })
                }
                await upsertDripState(phone, {
                  enabled: false,
                  paused_at: new Date().toISOString(),
                  pause_reason: `Opted out: "${buttonText}"`,
                  opted_out: true,
                  opted_out_at: new Date().toISOString(),
                })
                console.log(`[Webhook] Auto-classified ${phone} as LOST (opted out) — button: "${buttonText}"`)
              }

              // For DELAY/OPTOUT we stop here (they won't get the deck — lead is paused or opted out).
              // For POSITIVE we let control fall through so the deck-send block below also fires
              // (a positive button tap is exactly when we want to deliver the deck).
              if (DELAY_BUTTONS.includes(buttonText) || OPTOUT_BUTTONS.includes(buttonText)) {
                continue
              }
            }
          } catch (classifyErr) {
            console.error('[Webhook] Auto-classify error (non-critical):', classifyErr)
          }

          // Auto-update lead status to REPLIED + schedule follow-up
          // ONLY if lead is in an early stage — never regress advanced statuses
          try {
            const { updateLead, getLeads } = await import('@/lib/sheets')
            const contact = await getContact(phone)
            if (contact && contact.is_lead && contact.lead_row) {
              const leads = await getLeads()
              const lead = leads.find(l => l.row_number === Number(contact.lead_row))
              const earlyStatuses = ['NEW', 'DECK_SENT', 'NO_RESPONSE']
              const shouldUpdateStatus = !lead || earlyStatuses.includes(lead.lead_status)

              const followup = new Date()
              followup.setDate(followup.getDate() + 1)
              const updateFields: Record<string, string> = {
                next_followup: followup.toISOString().split('T')[0],
              }
              if (shouldUpdateStatus) {
                updateFields.lead_status = 'REPLIED'
              }
              await updateLead(Number(contact.lead_row), updateFields)

              // Notify the lead's owner (assigned agent) that a reply came in
              if (lead?.assigned_to) {
                try {
                  const allUsers = await getUsers()
                  const owner = allUsers.find(u => u.name === lead.assigned_to && u.active)
                  if (owner) {
                    const previewText = (text || '').slice(0, 80)
                    await notifyQuiet({
                      user_id: owner.id,
                      type: 'lead_replied',
                      title: `${lead.full_name || phone} replied`,
                      body: previewText,
                      ref_phone: phone,
                      ref_lead_row: Number(contact.lead_row),
                    })
                  }
                } catch { /* best effort */ }
              }
            }
          } catch {
            // Non-critical — don't break webhook if sheet update fails
          }

          // Auto-send franchise deck on opt-in button tap or first reply
          try {
            const isOptInButton = msg.type === 'button' && (msg.button?.text || '').toLowerCase().includes('yes')
            const isInteractiveOptIn = msg.type === 'interactive' &&
              (msg.interactive?.button_reply?.title || '').toLowerCase().includes('yes')
            const isTextOptIn = msg.type === 'text' && /^(yes|yeah|yep|sure|ok|interested|send)/i.test(text.trim())

            // Check if this is their first message (no prior messages in DB)
            const priorMessages = await getMessages(phone, 5, 0)
            // Count only received messages before this one
            const priorReceived = (priorMessages || []).filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (m: any) => m.direction === 'received' && m.wa_message_id !== msg.id
            )
            const isFirstReply = priorReceived.length === 0

            if (isOptInButton || isInteractiveOptIn || isTextOptIn || isFirstReply) {
              // Resolve marketing template from DB settings (admin-configurable)
              const MARKETING_FIRST_TEMPLATE = await getMarketingFirstTemplateName()

              // Check we haven't already sent the deck to this number
              const allMsgs = await getMessages(phone, 200, 0)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const alreadySentDeck = (allMsgs || []).some(
                (m: any) => m.direction === 'sent' && m.template_used === MARKETING_FIRST_TEMPLATE
              )

              if (!alreadySentDeck) {
                // Find lead name for the template parameter (use DB contact's lead_row instead of fetching ALL leads)
                let leadName = contactName || 'there'
                try {
                  const contact = await getContact(phone)
                  if (contact?.lead_row) {
                    const lead = await getLeadByRow(Number(contact.lead_row))
                    if (lead?.full_name) leadName = lead.full_name
                  }
                } catch { /* use contactName fallback */ }

                const result = await sendTemplate(phone, MARKETING_FIRST_TEMPLATE, [
                  { type: 'text', text: leadName },
                ])

                if (result.success) {
                  // Log in SQLite DB (shows in Sales Hub inbox)
                  await insertMessage({
                    phone,
                    direction: 'sent',
                    text: `[Template: ${MARKETING_FIRST_TEMPLATE}] Franchise deck & investment details sent automatically`,
                    timestamp: new Date().toISOString(),
                    sent_by: 'System (Auto)',
                    wa_message_id: result.message_id || '',
                    status: 'sent',
                    template_used: MARKETING_FIRST_TEMPLATE,
                    read: true,
                  })

                  // Log in Google Sheets
                  await logSentMessage({
                    phone,
                    name: leadName,
                    message: '[Auto] Franchise deck sent after opt-in/first reply',
                    sent_by: 'System (Auto)',
                    wa_message_id: result.message_id || '',
                    status: 'sent',
                    template_used: MARKETING_FIRST_TEMPLATE,
                  })

                  console.log(`[Webhook] Auto-sent franchise deck to ${phone}`)
                }
              }
            }
          } catch (autoErr) {
            console.error('[Webhook] Auto-response error (non-critical):', autoErr)
            // Non-critical — don't break webhook
          }
        }

        // Handle message status updates (delivered, read, etc.)
        const statuses = value.statuses || []
        for (const status of statuses) {
          if (status.id) {
            await updateMessageStatus(status.id, status.status || '')
          }
        }
      }
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Webhook error:', err)
    // Still return 200 to avoid Meta retrying
    return NextResponse.json({ success: true })
  }
}
