import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { sendTemplate } from '@/lib/whatsapp'
import { sendFranchiseEmail } from '@/lib/email'
import { logSentMessage, updateLead } from '@/lib/sheets'
import { upsertContact, insertMessage, getMessages } from '@/lib/db'

/**
 * POST /api/cron/auto-send
 *
 * Replaces the n8n lead automation workflow.
 * Called by Vercel Cron every 2 minutes OR manually via dashboard.
 *
 * Flow:
 * 1. Read both tabs (AI Campaign Leads + Previous Campaign Leads)
 * 2. Filter for un-contacted leads
 * 3. Deduplicate by phone
 * 4. Assign priority (HOT/WARM/COLD)
 * 5. Send WhatsApp template to lead
 * 6. Notify sales manager
 * 7. Update Google Sheet with status + message ID
 * 8. Log to SQLite DB
 */

// --- Auth ---
const CRON_SECRET = process.env.CRON_SECRET || ''
const SALES_PHONE = '917973933630'
const TEMPLATE_NAME = 'opt_in_message'
const SALES_ALERT_TEMPLATE = 'sales_lead_alert_v2'

// Rate limit: max leads to process per run (avoid timeout on Vercel 10s limit)
const MAX_PER_RUN = 5

interface RawLead {
  row_number: number
  full_name: string
  phone: string
  phone_formatted: string
  email: string
  city: string
  state: string
  lead_status: string
  experience: string
  timeline: string
  model_interest: string
  lead_priority: string
  source_tab: 'new' | 'old'
}

// --- Google Sheets Auth ---
function getSheets() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.sheets({ version: 'v4', auth })
}

// --- Read leads from a tab ---
async function readTab(tabName: string, sourceTab: 'new' | 'old'): Promise<RawLead[]> {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.LEADS_SHEET_ID,
    range: `${tabName}!A2:AC`,
  })
  const rows = res.data.values || []

  if (sourceTab === 'new') {
    // AI Campaign Leads — columns match LEAD_COLUMN_MAP
    return rows.map((row, i) => {
      const phone = (row[16] || '').replace('p:', '')
      return {
        row_number: i + 2,
        full_name: row[15] || 'there',
        phone,
        phone_formatted: phone.replace(/\D/g, '').replace(/^0+/, ''),
        email: row[17] || '',
        city: row[18] || '',
        state: row[19] || '',
        lead_status: row[21] || '',
        experience: row[13] || '',
        timeline: row[14] || '',
        model_interest: row[12] || '',
        lead_priority: '',
        source_tab: 'new',
      }
    })
  } else {
    // Previous Campaign Leads — different column layout, needs normalization
    // From n8n: full_name, phone_number, email, city, state, lead_status are same positions
    // But experience/timeline fields have different names
    return rows.map((row, i) => {
      const phone = (row[16] || '').replace('p:', '')
      // Normalize old column names (from n8n Normalize Old Columns node)
      const rawExperience = row[13] || '' // "do_you_have_an_existing_food_business_or_experience?"
      const rawTimeline = row[14] || '' // "type_interested_to_continue"
      const timeline = rawTimeline.toLowerCase().includes('interested') ? 'within_30_days' : 'just_exploring_for_now'

      return {
        row_number: i + 2,
        full_name: row[15] || 'there',
        phone,
        phone_formatted: phone.replace(/\D/g, '').replace(/^0+/, ''),
        email: row[17] || '',
        city: row[18] || '',
        state: row[19] || '',
        lead_status: row[21] || '',
        experience: rawExperience,
        timeline,
        model_interest: row[12] || '',
        lead_priority: '',
        source_tab: 'old',
      }
    })
  }
}

// --- Calculate priority (matches n8n logic exactly) ---
function calcPriority(experience: string, timeline: string): string {
  const hasExperience = experience.toLowerCase().includes('yes')
  const isUrgent = timeline.includes('within_30_days')
  const isSoon = timeline.includes('1-3_months')

  if (isUrgent && hasExperience) return 'HOT'
  if (isUrgent || isSoon || hasExperience) return 'WARM'
  return 'COLD'
}

// --- Update the correct tab ---
async function markContacted(lead: RawLead, waMessageId: string) {
  const sheets = getSheets()
  const tabName = lead.source_tab === 'old'
    ? (process.env.OLD_LEADS_TAB_NAME || 'Previous campaign leads')
    : (process.env.LEADS_TAB_NAME || 'AI Campaign Leads')

  // Update: lead_status (col V), wa_message_id (col Y), lead_priority (col Z)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.LEADS_SHEET_ID!,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: `${tabName}!V${lead.row_number}`, values: [['Contacted']] },
        { range: `${tabName}!Y${lead.row_number}`, values: [[waMessageId]] },
        { range: `${tabName}!Z${lead.row_number}`, values: [[lead.lead_priority]] },
      ],
    },
  })
}

export async function POST(request: NextRequest) {
  // Auth: accept either Vercel CRON_SECRET or a valid session cookie
  const authHeader = request.headers.get('authorization')
  const cronSecret = authHeader?.replace('Bearer ', '')

  // Allow: Vercel cron (CRON_SECRET), or manual trigger with ?test=true for testing
  const isVercelCron = CRON_SECRET && cronSecret === CRON_SECRET
  const url = new URL(request.url)
  const isTest = url.searchParams.get('test') === 'true'
  const testPhone = url.searchParams.get('phone') || ''

  // In production, require CRON_SECRET. For testing, allow manual calls.
  if (!isVercelCron && !isTest) {
    // Check for session-based auth (manual trigger from dashboard)
    const { getSession } = await import('@/lib/auth')
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const results: Array<{
      phone: string
      name: string
      status: string
      wa_message_id?: string
      email_sent?: boolean
      email_error?: string
      error?: string
    }> = []

    // 1. Read both tabs
    const newTabName = process.env.LEADS_TAB_NAME || 'AI Campaign Leads'
    const oldTabName = process.env.OLD_LEADS_TAB_NAME || 'Previous campaign leads'

    const [newLeads, oldLeads] = await Promise.all([
      readTab(newTabName, 'new'),
      readTab(oldTabName, 'old'),
    ])

    // 2. Merge
    const allLeads = [...newLeads, ...oldLeads]

    // 3. Filter: not contacted, has phone, not test
    const uncontacted = allLeads.filter(lead => {
      const status = lead.lead_status.toLowerCase()
      if (status === 'contacted' || status === 'converted' || status === 'lost' || status === 'replied') return false
      if (!lead.phone_formatted || lead.phone_formatted.length < 10) return false
      if (lead.full_name.toLowerCase().includes('test lead')) return false
      return true
    })

    // 4. Deduplicate by phone (keep first occurrence)
    const seen = new Set<string>()
    const unique: RawLead[] = []
    for (const lead of uncontacted) {
      const key = lead.phone_formatted.slice(-10) // last 10 digits
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(lead)
      }
    }

    // If test mode, only process the test phone
    let toProcess = unique
    if (isTest && testPhone) {
      const cleanTest = testPhone.replace(/\D/g, '').slice(-10)
      toProcess = unique.filter(l => l.phone_formatted.slice(-10) === cleanTest)
      if (toProcess.length === 0) {
        return NextResponse.json({
          success: true,
          message: `No uncontacted lead found for phone ${testPhone}. Found ${unique.length} total uncontacted leads.`,
          uncontacted_count: unique.length,
          results: [],
        })
      }
    }

    // 5. Cap at MAX_PER_RUN to stay within Vercel timeout
    const batch = toProcess.slice(0, MAX_PER_RUN)

    if (batch.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No new leads to process',
        stats: {
          new_tab: newLeads.length,
          old_tab: oldLeads.length,
          uncontacted: unique.length,
          processed: 0,
        },
      })
    }

    // 6. Process each lead
    for (const lead of batch) {
      lead.lead_priority = calcPriority(lead.experience, lead.timeline)

      try {
        // Double-check: skip if we already sent to this phone (prevents duplicates
        // when Google Sheet update is slow and cron runs again before status propagates)
        const existingMsgs = await getMessages(lead.phone_formatted, 10, 0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const alreadySent = (existingMsgs || []).some(
          (m: any) => m.direction === 'sent' && m.template_used === TEMPLATE_NAME
        )
        if (alreadySent) {
          // Also mark sheet if it wasn't updated
          try { await markContacted(lead, 'already-sent') } catch {}
          results.push({
            phone: lead.phone_formatted,
            name: lead.full_name,
            status: 'skipped',
            error: 'Already sent (DB check)',
          })
          continue
        }

        // Send WhatsApp template to lead
        const refId = `TBWX-${lead.row_number}`
        const waResult = await sendTemplate(
          lead.phone_formatted,
          TEMPLATE_NAME,
          [{ type: 'text', text: lead.full_name }, { type: 'text', text: refId }]
        )

        if (!waResult.success) {
          results.push({
            phone: lead.phone_formatted,
            name: lead.full_name,
            status: 'failed',
            error: waResult.error,
          })
          continue
        }

        const waMessageId = waResult.message_id || ''

        // Notify sales manager (continue on fail — don't block lead processing)
        try {
          await sendTemplate(
            SALES_PHONE,
            SALES_ALERT_TEMPLATE,
            [
              { type: 'text', text: lead.full_name },
              { type: 'text', text: lead.phone_formatted },
              { type: 'text', text: `${lead.city}${lead.state ? ', ' + lead.state : ''}` },
            ]
          )
        } catch {
          // Sales notification failure shouldn't stop lead processing
        }

        // Update Google Sheet — mark as contacted in the correct tab
        await markContacted(lead, waMessageId)

        // Log to SQLite DB (inbox)
        await upsertContact(lead.phone_formatted, {
          name: lead.full_name,
          is_lead: true,
          city: lead.city,
        })

        await insertMessage({
          phone: lead.phone_formatted,
          direction: 'sent',
          text: `[Template: ${TEMPLATE_NAME}] Welcome message sent`,
          timestamp: new Date().toISOString(),
          sent_by: 'auto-send',
          wa_message_id: waMessageId,
          status: 'sent',
          template_used: TEMPLATE_NAME,
        })

        // Log to Google Sheets (backward compat with old sent messages log)
        await logSentMessage({
          phone: lead.phone_formatted,
          name: lead.full_name,
          message: `[Auto] Template: ${TEMPLATE_NAME}`,
          sent_by: 'auto-send',
          wa_message_id: waMessageId,
          status: 'sent',
          template_used: TEMPLATE_NAME,
        })

        // Send franchise email with deck + menu (continue on fail)
        let emailSent = false
        let emailError = ''
        if (lead.email && lead.email.includes('@')) {
          try {
            const emailResult = await sendFranchiseEmail(lead.email, lead.full_name)
            emailSent = emailResult.success
            if (!emailResult.success) emailError = emailResult.error || 'Unknown'

            if (emailResult.success) {
              await insertMessage({
                phone: lead.phone_formatted,
                direction: 'sent',
                text: `[Email] Franchise deck + menu sent to ${lead.email}`,
                timestamp: new Date().toISOString(),
                sent_by: 'auto-send',
                wa_message_id: emailResult.message_id || '',
                status: 'sent',
                template_used: 'franchise_email',
              })
            }
          } catch (err) {
            emailError = err instanceof Error ? err.message : 'Email failed'
          }
        }

        results.push({
          phone: lead.phone_formatted,
          name: lead.full_name,
          status: 'sent',
          wa_message_id: waMessageId,
          email_sent: emailSent,
          email_error: emailError || undefined,
        })
      } catch (err) {
        results.push({
          phone: lead.phone_formatted,
          name: lead.full_name,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        new_tab: newLeads.length,
        old_tab: oldLeads.length,
        uncontacted: unique.length,
        processed: batch.length,
        sent: results.filter(r => r.status === 'sent').length,
        failed: results.filter(r => r.status !== 'sent').length,
      },
      results,
    })
  } catch (err) {
    console.error('[auto-send] Error:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}

// GET — returns status info (useful for dashboard)
export async function GET() {
  return NextResponse.json({
    name: 'auto-send',
    description: 'Automatically sends WhatsApp to new leads from Google Sheets',
    template: TEMPLATE_NAME,
    sales_phone: SALES_PHONE,
    max_per_run: MAX_PER_RUN,
    schedule: 'Every 2 minutes (Vercel Cron)',
  })
}
