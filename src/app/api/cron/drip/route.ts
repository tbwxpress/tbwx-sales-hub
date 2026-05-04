import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getDripLeads, getDripSequences, upsertDripState, insertMessage, upsertContact } from '@/lib/db'
import { getLeads } from '@/lib/sheets'
import { DRIP_PAUSE_STATUSES, DRIP_DELAY_STATUSES, WHATSAPP } from '@/config/client'

// Default sequences (used if no DB sequences configured)
// Uses interactive button templates for auto-classification
const DEFAULT_SEQUENCES: Record<string, { steps: { day: number; template: string; description: string }[] }> = {
  HOT: {
    steps: [
      { day: 1, template: 'followup_value_hook', description: 'ROI & earnings hook with Yes/Not now buttons' },
      { day: 3, template: 'followup_social_proof', description: 'Partner success story with Yes/Later/Not interested buttons' },
      { day: 7, template: 'followup_last_chance', description: 'Final check-in with Interested/Stop buttons' },
    ],
  },
  WARM: {
    steps: [
      { day: 3, template: 'followup_value_hook', description: 'ROI & earnings hook with Yes/Not now buttons' },
      { day: 7, template: 'followup_social_proof', description: 'Partner success story with Yes/Later/Not interested buttons' },
      { day: 14, template: 'followup_last_chance', description: 'Final check-in with Interested/Stop buttons' },
    ],
  },
  COLD: {
    steps: [
      { day: 7, template: 'followup_value_hook', description: 'ROI & earnings hook with Yes/Not now buttons' },
      { day: 14, template: 'followup_social_proof', description: 'Partner success story with Yes/Later/Not interested buttons' },
      { day: 21, template: 'followup_last_chance', description: 'Final check-in with Interested/Stop buttons' },
    ],
  },
}

// Statuses eligible for drip (lead has been contacted but not yet engaged deeply)
const DRIP_ELIGIBLE_STATUSES = ['DECK_SENT', 'CALL_DONE_INTERESTED']

// Auto-resume: days since last manual message before resuming drip
const RESUME_DAYS: Record<string, number> = { HOT: 3, WARM: 5, COLD: 7 }

/**
 * POST /api/cron/drip — Priority-based drip sequences
 *
 * Matches leads to sequences by priority band (HOT/WARM/COLD) instead of status.
 * Auto-resumes paused drips if no manual message for N days.
 */
export async function POST(req: NextRequest) {
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

    // Load configured sequences from DB, fall back to defaults
    const dbSequences = await getDripSequences()
    const sequences: Record<string, { steps: { day: number; template: string; description: string }[] }> = { ...DEFAULT_SEQUENCES }
    for (const seq of dbSequences) {
      if (seq.active && seq.steps) {
        try {
          const band = String(seq.priority_band)
          const steps = JSON.parse(String(seq.steps))
          if (Array.isArray(steps) && steps.length > 0) {
            sequences[band] = { steps }
          }
        } catch { /* skip malformed */ }
      }
    }

    // Initialize drip for newly eligible leads
    for (const lead of leads) {
      const phone = lead.phone.replace(/\D/g, '').slice(-10)
      const fullPhone = lead.phone.replace(/\D/g, '')
      const normalizedPhone = fullPhone.length >= 10 ? `91${phone}` : phone

      // Must be in a drip-eligible status
      if (!DRIP_ELIGIBLE_STATUSES.includes(lead.lead_status)) continue
      if (DRIP_PAUSE_STATUSES.includes(lead.lead_status) || DRIP_DELAY_STATUSES.includes(lead.lead_status)) continue

      // Must have a priority and a matching sequence
      const priority = lead.lead_priority || 'WARM'
      if (!sequences[priority]) continue

      // Check if drip state exists
      const existingDrip = dripLeads.find(d => String(d.phone || '').slice(-10) === phone)
      if (existingDrip) continue // Already initialized

      await upsertDripState(normalizedPhone, {
        sequence: priority,
        current_step: 0,
        enabled: true,
      })
      results.push({ phone, action: 'initialized' })
    }

    // Process active drip sequences (include paused for auto-resume evaluation)
    const activeDrips = await getDripLeads(true)

    for (const drip of activeDrips) {
      const dripPhone = String(drip.phone || '')
      const phone10 = dripPhone.slice(-10)

      const lead = leads.find(l => l.phone.replace(/\D/g, '').slice(-10) === phone10)
      if (!lead) continue

      // Pause if lead status changed to a terminal/pause status
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

      // Auto-resume: if paused (lead replied) but no manual message for N days
      if (drip.paused_at && String(drip.pause_reason || '').includes('replied')) {
        const priority = lead.lead_priority || 'WARM'
        const resumeAfterDays = RESUME_DAYS[priority] || 5
        const pausedAt = new Date(String(drip.paused_at))
        const daysSincePause = (now.getTime() - pausedAt.getTime()) / 86400000

        if (daysSincePause >= resumeAfterDays) {
          await upsertDripState(dripPhone, {
            paused_at: null,
            pause_reason: null,
          })
          results.push({ phone: phone10, action: 'auto-resumed' })
          continue // Will process on next cron run
        }
        continue // Still paused
      }

      // Skip if paused for other reasons
      if (drip.paused_at) continue

      // Never message opted-out leads
      if (drip.opted_out === 1) continue

      // Match sequence by priority band
      const priority = String(drip.sequence) || lead.lead_priority || 'WARM'
      const currentSequence = sequences[priority]
      if (!currentSequence) continue

      // If priority changed, update sequence reference
      if (lead.lead_priority && String(drip.sequence) !== lead.lead_priority && sequences[lead.lead_priority]) {
        await upsertDripState(dripPhone, { sequence: lead.lead_priority })
        continue // Will process with new sequence on next run
      }

      const stepIndex = Number(drip.current_step || 0)
      const steps = currentSequence.steps

      if (stepIndex >= steps.length) {
        results.push({ phone: phone10, action: 'sequence_complete' })
        continue
      }

      const step = steps[stepIndex]
      const sequenceStart = new Date(String(drip.created_at))
      const daysSinceStart = Math.floor((now.getTime() - sequenceStart.getTime()) / 86400000)

      if (daysSinceStart < step.day) continue // Not time yet

      // Minimum 20h between messages
      const lastSent = drip.last_sent_at ? new Date(String(drip.last_sent_at)) : null
      if (lastSent) {
        const hoursSinceLast = (now.getTime() - lastSent.getTime()) / 3600000
        if (hoursSinceLast < 20) continue
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
          await upsertContact(phoneToSend, { name: lead.full_name, is_lead: true, city: lead.city })
          await insertMessage({
            phone: phoneToSend,
            direction: 'sent',
            text: `[Drip ${priority} ${stepIndex + 1}/${steps.length}] ${step.description}`,
            timestamp: now.toISOString(),
            sent_by: 'System (Drip)',
            wa_message_id: waData.messages[0].id,
            status: 'sent',
            template_used: step.template,
          })

          await upsertDripState(dripPhone, {
            current_step: stepIndex + 1,
            last_sent_at: now.toISOString(),
          })

          results.push({ phone: phone10, action: 'sent', template: `${priority}:${step.template}` })
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
        sequences_loaded: Object.keys(sequences),
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
