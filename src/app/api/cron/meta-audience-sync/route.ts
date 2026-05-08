import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { runAudienceSync, getLastAudienceSync } from '@/lib/meta-capi'
import { getLeads } from '@/lib/sheets'
import { getOptedOutPhones } from '@/lib/db'

const CRON_SECRET = process.env.CRON_SECRET

// POST /api/cron/meta-audience-sync
//   - Pulls all CONVERTED phones from Sheet → pushes to "Buyers" audience
//   - Pulls all LOST phones + opted-out phones from drip_state → "Exclude"
//   - Auth: CRON_SECRET bearer OR admin session
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const provided = authHeader?.replace('Bearer ', '')
    const isCron = CRON_SECRET && provided === CRON_SECRET
    if (!isCron) {
      const { getSession, requireAuth, requireAdmin } = await import('@/lib/auth')
      const session = await getSession()
      const user = requireAuth(session)
      requireAdmin(user)
    }

    const [leads, optedOutSet] = await Promise.all([getLeads(), getOptedOutPhones()])

    const buyerPhones: string[] = []
    const excludePhones: string[] = []

    for (const l of leads) {
      const ph = l.phone || ''
      if (!ph) continue
      if (l.lead_status === 'CONVERTED') {
        buyerPhones.push(ph)
      } else if (l.lead_status === 'LOST') {
        excludePhones.push(ph)
      }
    }
    // Add opted-out phones to exclude (already 91XXXXXXXXXX format)
    for (const p of optedOutSet) {
      excludePhones.push(p)
    }

    const result = await runAudienceSync({
      buyer_phones: Array.from(new Set(buyerPhones)),
      exclude_phones: Array.from(new Set(excludePhones)),
    })

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// GET — last sync status (for admin panel)
export async function GET() {
  try {
    const { getSession, requireAuth, requireAdmin } = await import('@/lib/auth')
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const last = await getLastAudienceSync()
    return NextResponse.json({ success: true, data: last })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
