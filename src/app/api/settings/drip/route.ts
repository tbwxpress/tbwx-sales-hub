import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getSetting, setSetting } from '@/lib/db'

// Master switch for the drip engine cron. The cron route (/api/cron/drip)
// refuses to send unless this is exactly 'true' — sending WhatsApp drips to
// every eligible lead is an outward-facing action the owner opts into.
const SETTING_KEY = 'drip.enabled'

// GET /api/settings/drip — Get the drip master-switch state
export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const value = await getSetting(SETTING_KEY)
    return NextResponse.json({ drip_enabled: value === 'true' })
  } catch (err) {
    console.error('Settings fetch error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/settings/drip — Toggle drip sending on/off (admin only)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const { enabled } = body

    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
    }

    await setSetting(SETTING_KEY, String(enabled))

    return NextResponse.json({ success: true, drip_enabled: enabled })
  } catch (err) {
    console.error('Settings update error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
