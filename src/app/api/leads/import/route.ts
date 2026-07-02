import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { bulkInsertLeads, upsertContact, type BulkLeadRow } from '@/lib/db'

// POST /api/leads/import — bulk CSV import (ADMIN ONLY).
// Body: { rows: object[], dedupe: 'skip' | 'update', send_welcome?: boolean }.
//
// send_welcome (default false):
//   true  — campaign_name is forced to 'CSV Import' (or the CSV-provided value if it
//            isn't 'manual entry'), making the row eligible for the auto-send welcome cron.
//   false — campaign_name is forced to 'Manual Entry' so the auto-send cron skips these
//            leads (it excludes campaign_name === 'manual entry' case-insensitively).
//
// After inserts, a contacts row is upserted per new lead so inbound WhatsApp can auto-link.
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    const body = await req.json()
    const rows = body?.rows
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: 'rows must be an array' }, { status: 400 })
    }
    const dedupe = body?.dedupe === 'update' ? 'update' : 'skip'
    const sendWelcome = body?.send_welcome === true

    // Rewrite campaign_name per send_welcome flag before handing rows to bulkInsertLeads.
    const normalizedRows: BulkLeadRow[] = (rows as BulkLeadRow[]).map((row) => {
      const existing = (row.campaign_name || '').trim()
      let campaign_name: string
      if (sendWelcome) {
        // Keep the CSV-provided campaign name unless it's 'manual entry' (which would
        // get the lead excluded from auto-send). Fall back to 'CSV Import'.
        campaign_name = existing.toLowerCase() === 'manual entry' || existing === ''
          ? 'CSV Import'
          : existing
      } else {
        // Force exclusion from auto-send cron regardless of what the CSV says.
        campaign_name = 'Manual Entry'
      }
      return { ...row, campaign_name }
    })

    const result = await bulkInsertLeads(normalizedRows, { dedupe })

    // Upsert a contacts row for each newly inserted lead so inbound WhatsApp messages
    // can auto-link and auto-set REPLIED status. Non-fatal per-row.
    const phoneToRow = result.insertedPhoneToRow
    for (const [phone, lead_row] of Object.entries(phoneToRow)) {
      try {
        // Find the corresponding row to get name/city for the contact record.
        const matchedRow = normalizedRows.find(
          (r) => {
            const raw = String(r.phone || '').trim().replace(/\D/g, '').replace(/^0+/, '')
            const norm = raw.length >= 10 ? `91${raw.slice(-10)}` : raw
            return norm === phone
          }
        )
        await upsertContact(phone, {
          name: matchedRow?.full_name || '',
          is_lead: true,
          lead_row,
          city: matchedRow?.city || '',
        })
      } catch {
        // Non-fatal — contact upsert failure doesn't invalidate the lead insert
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Import failed') }, { status: 500 })
  }
}
