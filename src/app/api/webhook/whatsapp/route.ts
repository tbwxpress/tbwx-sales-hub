import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { upsertContact, insertMessage, updateMessageStatus, getMessages, getContact, getDripState, upsertDripState, getWaNumber, markMessagesRead, setSetting } from '@/lib/db'
import { sendTemplate } from '@/lib/whatsapp'
import { logSentMessage, getLeadByRow } from '@/lib/sheets'
import { getMarketingFirstTemplateName } from '@/lib/template-settings'
import { notifyQuiet } from '@/lib/notifications'
import { getUsers } from '@/lib/users'
import { isNegativeReply } from '@/lib/negative-replies'
import { extractMessageText, isMainLineId, waTsToIso, historyDirection } from '@/lib/coexistence'

// Who a coexistence line belongs to, for message attribution. Cached briefly —
// the webhook fires per message and the mapping changes ~never.
const waNumberAgentCache = new Map<string, { agent: string; at: number }>()
async function agentForLine(phoneNumberId: string): Promise<string> {
  if (!phoneNumberId) return ''
  const hit = waNumberAgentCache.get(phoneNumberId)
  if (hit && Date.now() - hit.at < 60_000) return hit.agent
  let agent = ''
  try {
    const row = await getWaNumber(phoneNumberId)
    agent = String(row?.agent_name || row?.verified_name || '') || ''
  } catch { /* unmapped line — attribution falls back below */ }
  const resolved = agent || 'WA App'
  waNumberAgentCache.set(phoneNumberId, { agent: resolved, at: Date.now() })
  return resolved
}

// Button response classification for follow-up templates
const POSITIVE_BUTTONS = [
  'yes, tell me more', "yes, let's talk", "i'm interested",
  // franchise_reactivation_d0/d5/d7
  'yes, lock my price', 'call me back',
]
const DELAY_BUTTONS = ['not right now', 'maybe later']
const OPTOUT_BUTTONS = [
  'not interested', 'stop messages',
  // franchise_reactivation_d0/d5/d7
  'stop',
]

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
        const value = change.value || {}
        // Which of our numbers this event happened on. Coexistence lines
        // (agents' WhatsApp-Business-app numbers) share this webhook with the
        // main Cloud-API line; the metadata block tells them apart.
        const linePhoneNumberId = String(value?.metadata?.phone_number_id || '')
        const isMainLine = isMainLineId(linePhoneNumberId, process.env.WHATSAPP_PHONE_NUMBER_ID)

        // Coexistence mirror events — agent app sends, 180-day history import,
        // app contact names. Each handler is self-contained + non-throwing.
        if (change.field === 'smb_message_echoes') {
          await handleMessageEchoes(value, linePhoneNumberId)
          continue
        }
        if (change.field === 'history') {
          await handleHistorySync(value, linePhoneNumberId)
          continue
        }
        if (change.field === 'smb_app_state_sync') {
          await handleStateSync(value)
          continue
        }
        if (change.field !== 'messages') continue
        const messages = value.messages || []
        const contacts = value.contacts || []

        for (const msg of messages) {
          const phone = msg.from // e.g. "919876543210"
          const contactInfo = contacts.find((c: { wa_id: string }) => c.wa_id === phone)
          const contactName = contactInfo?.profile?.name || ''

          // Get message text based on type (shared with echo/history ingestion)
          const text = extractMessageText(msg)

          // Ensure contact exists
          await upsertContact(phone, { name: contactName })

          // If this is a media message, download + store the binary so we can render
          // it in Inbox (and forward later) without depending on Meta's signed URL TTL.
          let mediaInfo: { type: string; id: string; mime: string; filename: string; path: string } | null = null
          const mediaTypes = ['image', 'video', 'audio', 'document', 'sticker'] as const
          if (mediaTypes.includes(msg.type as typeof mediaTypes[number])) {
            try {
              const m = (msg as Record<string, { id?: string; mime_type?: string; filename?: string; caption?: string }>)[msg.type]
              if (m?.id) {
                const { downloadInboundMedia } = await import('@/lib/media')
                const dl = await downloadInboundMedia({
                  mediaId: m.id,
                  waMessageId: msg.id || `noid-${Date.now()}`,
                  mimeFromWebhook: m.mime_type,
                  filename: m.filename,
                })
                if (dl.success && dl.path) {
                  mediaInfo = {
                    type: msg.type,
                    id: m.id,
                    mime: dl.mime || m.mime_type || '',
                    filename: m.filename || '',
                    path: dl.path,
                  }
                } else {
                  console.error(`[Webhook] media download failed for ${msg.type} ${m.id}:`, dl.error)
                }
              }
            } catch (e) {
              console.error('[Webhook] media download error (non-critical):', e)
            }
          }

          // Insert message
          await insertMessage({
            phone,
            direction: 'received',
            text,
            timestamp: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
            wa_message_id: msg.id || '',
            status: 'received',
            read: false,
            media_type: mediaInfo?.type || '',
            media_id: mediaInfo?.id || '',
            media_mime: mediaInfo?.mime || '',
            media_filename: mediaInfo?.filename || '',
            media_path: mediaInfo?.path || '',
            via_number_id: linePhoneNumberId,
          })

          // Inbound on a coexistence line: tell the line's owner (they may not
          // have their phone in hand; the Hub thread is live either way).
          if (!isMainLine) {
            try {
              const agentName = await agentForLine(linePhoneNumberId)
              if (agentName && agentName !== 'WA App') {
                const allUsers = await getUsers()
                const lineOwner = allUsers.find(u => u.name === agentName && u.active)
                if (lineOwner) {
                  await notifyQuiet({
                    user_id: lineOwner.id,
                    type: 'lead_replied',
                    title: `${contactName || phone} messaged your WhatsApp line`,
                    body: (text || '').slice(0, 80),
                    ref_phone: phone,
                  })
                }
              }
            } catch { /* best effort */ }
          }

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

            // Template buttons only exist on main-line sends; never fire the
            // classifier off a coexistence-line chat.
            if (isMainLine && buttonText && (POSITIVE_BUTTONS.includes(buttonText) || DELAY_BUTTONS.includes(buttonText) || OPTOUT_BUTTONS.includes(buttonText))) {
              const { updateLead } = await import('@/lib/sheets')
              const contact = await getContact(phone)

              const { insertStatusChange } = await import('@/lib/db')
              const { getLeadByRow } = await import('@/lib/sheets')

              if (POSITIVE_BUTTONS.includes(buttonText)) {
                // Lead is interested — mark HOT, pause drip, alert agent
                if (contact?.lead_row) {
                  const prev = await getLeadByRow(Number(contact.lead_row))
                  await updateLead(Number(contact.lead_row), {
                    lead_status: 'HOT',
                    lead_priority: 'HOT',
                    next_followup: new Date().toISOString().split('T')[0],
                    notes: `[Auto] Lead tapped "${buttonText}" on follow-up — marked HOT`,
                  })
                  if (prev && prev.lead_status !== 'HOT') {
                    await insertStatusChange({
                      lead_row: Number(contact.lead_row), phone,
                      old_status: prev.lead_status || '', new_status: 'HOT',
                      changed_by: 'System (Webhook)', source: 'webhook',
                    })
                  }
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
                  const prev = await getLeadByRow(Number(contact.lead_row))
                  await updateLead(Number(contact.lead_row), {
                    lead_status: 'DELAYED',
                    next_followup: followup30.toISOString().split('T')[0],
                    notes: `[Auto] Lead tapped "${buttonText}" — delayed 30 days`,
                  })
                  if (prev && prev.lead_status !== 'DELAYED') {
                    await insertStatusChange({
                      lead_row: Number(contact.lead_row), phone,
                      old_status: prev.lead_status || '', new_status: 'DELAYED',
                      changed_by: 'System (Webhook)', source: 'webhook',
                    })
                  }
                }
                await upsertDripState(phone, {
                  paused_at: new Date().toISOString(),
                  pause_reason: `Delayed: "${buttonText}"`,
                })
                console.log(`[Webhook] Auto-classified ${phone} as DELAYED — button: "${buttonText}"`)

              } else if (OPTOUT_BUTTONS.includes(buttonText)) {
                // Lead opted out — mark LOST, permanently stop all messaging
                if (contact?.lead_row) {
                  const prev = await getLeadByRow(Number(contact.lead_row))
                  await updateLead(Number(contact.lead_row), {
                    lead_status: 'LOST',
                    notes: `[Auto] Lead tapped "${buttonText}" — opted out, no further messages`,
                  })
                  if (prev && prev.lead_status !== 'LOST') {
                    await insertStatusChange({
                      lead_row: Number(contact.lead_row), phone,
                      old_status: prev.lead_status || '', new_status: 'LOST',
                      changed_by: 'System (Webhook)', source: 'webhook',
                      reason: 'opted_out',
                    })
                  }
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

              // Audit-log the REPLIED transition (only if we actually changed it)
              if (shouldUpdateStatus && lead && lead.lead_status !== 'REPLIED') {
                try {
                  const { insertStatusChange } = await import('@/lib/db')
                  await insertStatusChange({
                    lead_row: Number(contact.lead_row),
                    phone,
                    old_status: lead.lead_status || '',
                    new_status: 'REPLIED',
                    changed_by: 'System (Webhook)',
                    source: 'webhook',
                  })
                } catch { /* non-critical */ }
              }

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

                    // Flag a possible negative reply so the owner can review it.
                    // Alert only — we never auto-mark the lead LOST here (the
                    // free-text matcher is conservative but not infallible); the
                    // inbox surfaces a one-click "Mark Lost?" suggestion instead.
                    if (isNegativeReply(text)) {
                      await notifyQuiet({
                        user_id: owner.id,
                        type: 'negative_reply',
                        title: `⚠️ Possible negative reply — ${lead.full_name || phone}`,
                        body: previewText,
                        ref_phone: phone,
                        ref_lead_row: Number(contact.lead_row),
                      })
                      console.log(`[Webhook] Possible negative reply from ${phone}: "${previewText}"`)
                    }
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

            // Auto-deck is a MAIN-line automation. A lead chatting with an
            // agent's coexistence number must never get a robot template from
            // the main number mid-conversation.
            if (isMainLine && (isOptInButton || isInteractiveOptIn || isTextOptIn || isFirstReply)) {
              // Resolve marketing template from DB settings (admin-configurable)
              const MARKETING_FIRST_TEMPLATE = await getMarketingFirstTemplateName()

              // Check we haven't already sent the deck to this number.
              // Failed sends don't count — if the first deck attempt failed,
              // the lead's next message triggers a retry so they still get it.
              const allMsgs = await getMessages(phone, 200, 0)
              const alreadySentDeck = (allMsgs || []).some(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (m: any) => m.direction === 'sent' && m.template_used === MARKETING_FIRST_TEMPLATE && m.status !== 'failed'
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

                  // Stamp the pipeline truthfully: DECK_SENT now means the deck
                  // actually went out. Only bump a fresh lead — never regress a
                  // stage a human (or auto-send) already moved forward.
                  try {
                    const stampContact = await getContact(phone)
                    if (stampContact?.lead_row) {
                      const prevLead = await getLeadByRow(Number(stampContact.lead_row))
                      const cur = String(prevLead?.lead_status || '').toUpperCase()
                      if (!cur || cur === 'NEW') {
                        const { updateLead } = await import('@/lib/sheets')
                        await updateLead(Number(stampContact.lead_row), { lead_status: 'DECK_SENT' })
                        const { insertStatusChange } = await import('@/lib/db')
                        await insertStatusChange({
                          lead_row: Number(stampContact.lead_row),
                          phone,
                          old_status: prevLead?.lead_status || 'NEW',
                          new_status: 'DECK_SENT',
                          changed_by: 'auto-deck',
                          changed_by_id: '',
                          source: 'webhook',
                        })
                      }
                    }
                  } catch { /* status stamp non-critical */ }
                }
              }
            }
          } catch (autoErr) {
            console.error('[Webhook] Auto-response error (non-critical):', autoErr)
            // Non-critical — don't break webhook
          }

          // Advisor bot: deterministic ack + qualifying questions on the
          // "I want a human" buttons (Talk to advisor / Call me back / Message
          // me here) — off-hours aware. Known buttons only; free text is never
          // bot-answered. Rails (kill-switch, 6h cooldown) live in the lib.
          try {
            const tapText =
              msg.type === 'button' ? (msg.button?.text || '') :
              msg.type === 'interactive' ? (msg.interactive?.button_reply?.title || '') : ''
            if (tapText && isMainLine) {
              const { maybeBotReply } = await import('@/lib/advisor-bot')
              await maybeBotReply(phone, tapText)
            }
          } catch (botErr) {
            console.error('[Webhook] Advisor-bot error (non-critical):', botErr)
          }

          // Level-2 qualifier: free-text ANSWERS to the bot's qualifying
          // questions get AI-extracted into lead fields / signals / priority.
          // Extraction only — never sends anything to the customer.
          try {
            // Qualifier interprets free text as answers to the MAIN-line bot's
            // questions — a human chat on an agent's line is not that context.
            if (msg.type === 'text' && isMainLine) {
              const { maybeQualifyReply } = await import('@/lib/qualifier')
              await maybeQualifyReply(phone)
            }
          } catch (qualErr) {
            console.error('[Webhook] Qualifier error (non-critical):', qualErr)
          }
        }

        // Handle message status updates (delivered, read, etc.)
        // Capture error details on failed deliveries for debugging.
        const statuses = value.statuses || []
        for (const status of statuses) {
          if (!status.id) continue
          const err = Array.isArray(status.errors) && status.errors.length ? status.errors[0] : null
          const errCode = err?.code != null ? String(err.code) : ''
          const errTitle = err?.title || err?.message || err?.error_data?.details || ''
          if (status.status === 'failed' && (errCode || errTitle)) {
            console.error(`[Webhook] msg ${status.id} failed: code=${errCode} reason="${errTitle}"`)
          }
          await updateMessageStatus(status.id, status.status || '', errCode, errTitle)
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

// ---------- Coexistence mirror handlers ----------

// Agent sent a message from the WhatsApp Business app on a coexistence line.
// Mirror it into the thread as that agent's outbound and mark the thread read —
// they handled it on their phone, so don't leave a stale unread in the Hub.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleMessageEchoes(value: any, linePhoneNumberId: string) {
  try {
    const echoes = value.message_echoes || []
    if (!echoes.length) return
    const agentName = await agentForLine(linePhoneNumberId)
    for (const echo of echoes) {
      try {
        const customerPhone = String(echo.to || '')
        if (!customerPhone.replace(/\D/g, '')) continue
        await upsertContact(customerPhone, {})
        await insertMessage({
          phone: customerPhone,
          direction: 'sent',
          text: extractMessageText(echo),
          timestamp: waTsToIso(echo.timestamp),
          sent_by: agentName,
          wa_message_id: echo.id || '',
          status: 'sent',
          read: true,
          via_number_id: linePhoneNumberId,
          channel: 'app_echo',
        })
        await markMessagesRead(customerPhone)
      } catch (echoErr) {
        console.error('[Webhook] echo ingest error (non-critical):', echoErr)
      }
    }
  } catch (err) {
    console.error('[Webhook] smb_message_echoes error (non-critical):', err)
  }
}

// 180-day history import for a freshly onboarded coexistence line. Chunks
// arrive out of order across 3 phases; every message dedupes on wa_message_id
// so overlaps with live webhooks are safe. History media stays as placeholder
// text — months of attachments aren't worth mirroring into the media store.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleHistorySync(value: any, linePhoneNumberId: string) {
  try {
    const chunks = value.history || []
    if (!chunks.length) return
    const agentName = await agentForLine(linePhoneNumberId)
    let inserted = 0
    let seen = 0
    let skippedThreads = 0
    let meta: { phase?: unknown; chunk_order?: unknown; progress?: unknown } = {}
    for (const chunk of chunks) {
      meta = chunk.metadata || meta
      const threads = chunk.threads || []
      for (const thread of threads) {
        const customerWaId = String(thread.id || '')
        // 1:1 customer threads only — group/system JIDs never map to a lead.
        const digits = customerWaId.replace(/\D/g, '')
        if (digits.length < 10 || customerWaId.includes('@') || customerWaId.includes('-')) {
          skippedThreads++
          continue
        }
        try { await upsertContact(customerWaId, {}) } catch { /* non-critical */ }
        for (const m of thread.messages || []) {
          seen++
          try {
            const direction = historyDirection(m.from, customerWaId)
            const res = await insertMessage({
              phone: customerWaId,
              direction,
              text: extractMessageText(m),
              timestamp: waTsToIso(m.timestamp),
              sent_by: direction === 'sent' ? agentName : '',
              wa_message_id: m.id || '',
              status: direction === 'sent' ? 'sent' : 'received',
              read: true, // historical — never floods the inbox unread queue
              via_number_id: linePhoneNumberId,
              channel: 'history',
            })
            if (res !== null) inserted++
          } catch (msgErr) {
            console.error('[Webhook] history msg ingest error (non-critical):', msgErr)
          }
        }
      }
    }
    // Progress breadcrumb the admin page polls (best effort).
    try {
      await setSetting(`coex.history.${linePhoneNumberId}`, JSON.stringify({
        phase: meta.phase ?? null,
        chunk_order: meta.chunk_order ?? null,
        progress: meta.progress ?? null,
        last_chunk_at: new Date().toISOString(),
        last_chunk_inserted: inserted,
        last_chunk_seen: seen,
      }))
    } catch { /* non-critical */ }
    console.log(`[Webhook] history chunk line=${linePhoneNumberId} phase=${String(meta.phase)} order=${String(meta.chunk_order)} progress=${String(meta.progress)}: +${inserted}/${seen} msgs, ${skippedThreads} non-1:1 threads skipped`)
  } catch (err) {
    console.error('[Webhook] history sync error (non-critical):', err)
  }
}

// The app's saved contact names. Fill blanks only — never overwrite a name the
// lead sync or an agent already set in the Hub.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleStateSync(value: any) {
  try {
    const entries = value.state_sync || []
    for (const entry of entries) {
      try {
        if (entry.type !== 'contact') continue
        const action = String(entry.action || 'add').toLowerCase()
        if (action === 'remove' || action === 'delete') continue
        const phone = String(entry.contact?.phone_number || '')
        const name = String(entry.contact?.full_name || entry.contact?.first_name || '').trim()
        if (!phone.replace(/\D/g, '') || !name) continue
        const existing = await getContact(phone)
        if (existing?.name) continue
        await upsertContact(phone, { name })
      } catch (entryErr) {
        console.error('[Webhook] state_sync entry error (non-critical):', entryErr)
      }
    }
  } catch (err) {
    console.error('[Webhook] smb_app_state_sync error (non-critical):', err)
  }
}
