import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getSession, requireAuth, requireAdmin } from '@/lib/auth'
import { getLeads, getReceivedMessages, getSentMessages } from '@/lib/sheets'
import { upsertContact, insertMessage } from '@/lib/db'

// POST /api/inbox/sync — sync existing Google Sheets data into SQLite
export async function POST() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    let contactsCreated = 0
    let messagesImported = 0

    // 1. Import leads as contacts (only those who received a template)
    const allLeads = await getLeads()
    const leads = allLeads.filter(l => l.wa_message_id) // Only leads who got the WhatsApp template
    for (const lead of leads) {
      if (!lead.phone) continue
      const phone = lead.phone.replace(/\D/g, '')
      if (!phone) continue

      await upsertContact(phone, {
        name: lead.full_name,
        is_lead: true,
        lead_row: lead.row_number,
        lead_id: lead.id,
        city: lead.city,
      })
      contactsCreated++
    }

    // 2. Import received messages
    const received = await getReceivedMessages()
    for (const msg of received) {
      const phone = msg.phone.replace(/\D/g, '')
      if (!phone) continue

      // Ensure contact exists
      await upsertContact(phone, { name: msg.name })

      const inserted = await insertMessage({
        phone,
        direction: 'received',
        text: msg.text,
        timestamp: msg.timestamp,
        wa_message_id: msg.wa_message_id,
        status: 'received',
        read: true, // Mark existing messages as read
      })
      if (inserted) messagesImported++
    }

    // 3. Import sent messages
    const sent = await getSentMessages()
    for (const msg of sent) {
      const phone = msg.phone.replace(/\D/g, '')
      if (!phone) continue

      // Ensure contact exists
      await upsertContact(phone, { name: msg.name })

      const inserted = await insertMessage({
        phone,
        direction: 'sent',
        text: msg.text,
        timestamp: msg.timestamp,
        sent_by: msg.sent_by,
        wa_message_id: msg.wa_message_id,
        status: msg.status,
        template_used: msg.template_used,
        read: true,
      })
      if (inserted) messagesImported++
    }

    return NextResponse.json({
      success: true,
      data: {
        contacts_created: contactsCreated,
        messages_imported: messagesImported,
        total_leads: allLeads.length,
        leads_with_template: leads.length,
        leads_skipped: allLeads.length - leads.length,
        total_received: received.length,
        total_sent: sent.length,
      }
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Sync failed') },
      { status: 500 }
    )
  }
}
