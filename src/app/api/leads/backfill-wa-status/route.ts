import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads } from '@/lib/sheets'
import { insertMessage, upsertContact } from '@/lib/db'

/**
 * POST /api/leads/backfill-wa-status
 *
 * Admin-only endpoint that reads ALL leads from Google Sheets and:
 * 1. For leads WITH wa_message_id: inserts a message record into SQLite
 *    (so the dashboard WA column shows a checkmark)
 * 2. Returns a list of leads WITHOUT wa_message_id (sales guy needs to
 *    contact them manually)
 *
 * This is idempotent — insertMessage skips duplicates by wa_message_id.
 */
export async function POST() {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    if (user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    const leads = await getLeads()

    let synced = 0
    let skipped = 0
    let alreadyExists = 0
    const missing: Array<{
      row_number: number
      full_name: string
      phone: string
      city: string
      lead_status: string
      created_time: string
    }> = []

    for (const lead of leads) {
      const phone = lead.phone?.replace(/\D/g, '')
      if (!phone) {
        skipped++
        continue
      }

      // Ensure contact exists in SQLite
      await upsertContact(phone, {
        name: lead.full_name,
        is_lead: true,
        lead_row: lead.row_number,
        city: lead.city,
      })

      if (lead.wa_message_id) {
        // Insert the n8n auto-message into SQLite
        const result = await insertMessage({
          phone,
          direction: 'sent',
          text: '[Automated franchise inquiry template sent by n8n]',
          timestamp: lead.created_time || new Date().toISOString(),
          sent_by: 'n8n',
          wa_message_id: lead.wa_message_id,
          status: 'sent',
          template_used: 'franchise_lead_welcome_v3',
        })

        if (result === null) {
          alreadyExists++
        } else {
          synced++
        }
      } else {
        // No wa_message_id — n8n never sent to this lead
        // Skip terminal statuses (CONVERTED/LOST) — they don't need follow-up
        if (!['CONVERTED', 'LOST'].includes(lead.lead_status)) {
          missing.push({
            row_number: lead.row_number,
            full_name: lead.full_name,
            phone: lead.phone,
            city: lead.city,
            lead_status: lead.lead_status,
            created_time: lead.created_time,
          })
        } else {
          skipped++
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        total_leads: leads.length,
        synced,
        already_exists: alreadyExists,
        skipped,
        missing_count: missing.length,
        missing,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Backfill failed' },
      { status: 500 }
    )
  }
}
