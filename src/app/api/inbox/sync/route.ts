import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth, requireAdmin } from '@/lib/auth'
import { getLeads, getReceivedMessages, getSentMessages } from '@/lib/sheets'
import { getSetting, setSetting, importInboxSheetData } from '@/lib/db'
import { withCronLock } from '@/lib/cron-guard'

// Sep-Oct 2026 CPU incident: the admin inbox called this every 2 minutes, and
// every call rewrote every lead contact and re-checked every sheet message, one
// synchronous SQLite statement at a time. That blocked the Node process for
// everyone. Now:
//  - throttled server-side: at most one real run per 5 minutes across all tabs
//    and admins (the last successful run is stored in `settings`). The manual
//    "Sync" button passes ?force=1 to bypass the throttle;
//  - one run at a time (withCronLock; a concurrent call gets 409);
//  - only real changes are written, in ONE transaction, capped per run
//    (importInboxSheetData in lib/db.ts). The rest is picked up next run.
const LAST_RUN_KEY = 'inbox_sync.last_success_ms'
const MIN_INTERVAL_MS = 5 * 60 * 1000
const MAX_WRITES_PER_RUN = 1000

// POST /api/inbox/sync — sync existing Google Sheets data into SQLite
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const force = req.nextUrl.searchParams.get('force') === '1'
    if (!force) {
      const last = Number((await getSetting(LAST_RUN_KEY).catch(() => null)) || 0)
      const ageMs = Date.now() - last
      if (last > 0 && ageMs < MIN_INTERVAL_MS) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: 'synced recently',
          next_in_s: Math.ceil((MIN_INTERVAL_MS - ageMs) / 1000),
        })
      }
    }

    return await withCronLock('inbox-sync', { budgetMs: 60_000 }, async () => {
      // 1. Leads as contacts (only those who received a template)
      const allLeads = await getLeads()
      const leads = allLeads.filter(l => l.wa_message_id) // Only leads who got the WhatsApp template

      // 2 + 3. Received and sent messages from the sheet tabs
      const [received, sent] = await Promise.all([getReceivedMessages(), getSentMessages()])

      const result = await importInboxSheetData({
        leadContacts: leads.map(l => ({
          phone: l.phone || '',
          name: l.full_name,
          lead_row: l.row_number,
          lead_id: l.id,
          city: l.city,
        })),
        messages: [
          ...received.map(m => ({
            phone: m.phone,
            name: m.name,
            direction: 'received' as const,
            text: m.text,
            timestamp: m.timestamp,
            wa_message_id: m.wa_message_id,
            status: 'received',
          })),
          ...sent.map(m => ({
            phone: m.phone,
            name: m.name,
            direction: 'sent' as const,
            text: m.text,
            timestamp: m.timestamp,
            wa_message_id: m.wa_message_id,
            sent_by: m.sent_by,
            status: m.status,
            template_used: m.template_used,
          })),
        ],
        maxWrites: MAX_WRITES_PER_RUN,
      })

      // A truncated run leaves work behind; don't throttle the next one.
      if (!result.truncated) {
        await setSetting(LAST_RUN_KEY, String(Date.now())).catch(() => { /* non-critical */ })
      }

      return NextResponse.json({
        success: true,
        data: {
          contacts_created: result.contacts_created,
          contacts_updated: result.contacts_updated,
          messages_imported: result.messages_imported,
          truncated: result.truncated,
          total_leads: allLeads.length,
          leads_with_template: leads.length,
          leads_skipped: allLeads.length - leads.length,
          total_received: received.length,
          total_sent: sent.length,
        }
      })
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Sync failed') },
      { status: 500 }
    )
  }
}
