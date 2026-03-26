import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getDripLeads, upsertDripState, insertMessage, upsertContact } from '@/lib/db'
import { getLeads } from '@/lib/sheets'
import { DRIP_SEQUENCES, DRIP_PAUSE_STATUSES, DRIP_DELAY_STATUSES, WHATSAPP } from '@/config/client'

// POST /api/cron/drip — process drip sequences
export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const leads = await getLeads()
    const dripLeads = await getDripLeads()
    const results: { phone: string; action: string; template?: string }[] = []
    const now = new Date()

    // Initialize drip for newly eligible leads (DECK_SENT or CALL_DONE with no drip state)
    for (const lead of leads) {
      const phone = lead.phone.replace(/\D/g, '').slice(-10)
      const fullPhone = lead.phone.replace(/\D/g, '')
      const sequence = DRIP_SEQUENCES[lead.lead_status]

      if (!sequence) continue // Not a drip-eligible status

      // Check if drip state exists (match by last 10 digits)
      const existingDrip = dripLeads.find(d => String(d.phone || '').slice(-10) === phone)

      if (!existingDrip) {
        // Check if lead should be paused
        if (DRIP_PAUSE_STATUSES.includes(lead.lead_status) || DRIP_DELAY_STATUSES.includes(lead.lead_status)) continue

        // Initialize drip for this lead
        await upsertDripState(fullPhone.length >= 10 ? `91${phone}` : phone, {
          sequence: lead.lead_status,
          current_step: 0,
          enabled: true,
        })
        results.push({ phone, action: 'initialized' })
        continue
      }
    }

    // Process active drip sequences
    const activeDrips = await getDripLeads() // Re-fetch after initializations

    for (const drip of activeDrips) {
      const dripPhone = String(drip.phone || '')
      const phone10 = dripPhone.slice(-10)

      // Find matching lead
      const lead = leads.find(l => l.phone.replace(/\D/g, '').slice(-10) === phone10)
      if (!lead) continue

      // Check if lead status has changed to a pause status
      if (DRIP_PAUSE_STATUSES.includes(lead.lead_status)) {
        await upsertDripState(dripPhone, {
          paused_at: now.toISOString(),
          pause_reason: `Status changed to ${lead.lead_status}`,
        })
        results.push({ phone: phone10, action: 'paused', template: lead.lead_status })
        continue
      }

      if (DRIP_DELAY_STATUSES.includes(lead.lead_status)) {
        await upsertDripState(dripPhone, {
          paused_at: now.toISOString(),
          pause_reason: 'Lead delayed',
        })
        results.push({ phone: phone10, action: 'delayed' })
        continue
      }

      // Check if sequence matches current status (status may have changed)
      const currentSequence = DRIP_SEQUENCES[lead.lead_status]
      if (!currentSequence) continue

      // If status changed to a different drip-eligible status, reset sequence
      if (String(drip.sequence) !== lead.lead_status) {
        await upsertDripState(dripPhone, {
          sequence: lead.lead_status,
          current_step: 0,
          last_sent_at: null,
        })
        continue
      }

      const stepIndex = Number(drip.current_step || 0)
      const steps = currentSequence.steps

      if (stepIndex >= steps.length) {
        // Sequence complete
        results.push({ phone: phone10, action: 'sequence_complete' })
        continue
      }

      const step = steps[stepIndex]
      const lastSent = drip.last_sent_at ? new Date(String(drip.last_sent_at)) : null
      const sequenceStart = new Date(String(drip.created_at))

      // Calculate if enough days have passed
      const daysSinceStart = Math.floor((now.getTime() - sequenceStart.getTime()) / (1000 * 60 * 60 * 24))

      if (daysSinceStart < step.day) {
        continue // Not time yet for this step
      }

      // Also check minimum 24h since last send
      if (lastSent) {
        const hoursSinceLastSend = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60)
        if (hoursSinceLastSend < 20) continue // Wait at least 20h between messages
      }

      // Send the template
      const phoneToSend = dripPhone.startsWith('91') ? dripPhone : `91${phone10}`

      try {
        const waRes = await fetch(
          `${WHATSAPP.apiBase}/${WHATSAPP.phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${WHATSAPP.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: phoneToSend,
              type: 'template',
              template: {
                name: step.template,
                language: { code: 'en' },
                components: [
                  {
                    type: 'body',
                    parameters: [
                      { type: 'text', text: lead.full_name || 'there' },
                    ],
                  },
                ],
              },
            }),
          }
        )

        const waData = await waRes.json()

        if (waData.messages?.[0]?.id) {
          // Log message to DB
          await upsertContact(phoneToSend, { name: lead.full_name, is_lead: true, city: lead.city })
          await insertMessage({
            phone: phoneToSend,
            direction: 'sent',
            text: `[Drip ${stepIndex + 1}/${steps.length}] ${step.description}`,
            timestamp: now.toISOString(),
            sent_by: 'System (Drip)',
            wa_message_id: waData.messages[0].id,
            status: 'sent',
            template_used: step.template,
          })

          // Update drip state
          await upsertDripState(dripPhone, {
            current_step: stepIndex + 1,
            last_sent_at: now.toISOString(),
          })

          results.push({ phone: phone10, action: 'sent', template: step.template })
        } else {
          results.push({ phone: phone10, action: 'failed', template: `Error: ${JSON.stringify(waData.error || waData)}` })
        }
      } catch (sendErr) {
        results.push({ phone: phone10, action: 'error', template: String(sendErr) })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        processed: results.length,
        results,
        timestamp: now.toISOString(),
      },
    })
  } catch (err) {
    console.error('[drip-cron] Error:', err)
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
