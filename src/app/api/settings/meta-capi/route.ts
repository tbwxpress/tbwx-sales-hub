import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth, requireAdmin } from '@/lib/auth'
import { getMetaCapiSettings, setMetaCapiSettings, getRecentCapiEvents, getCapiStats } from '@/lib/meta-capi'

// GET — returns settings (token never returned, only has_token boolean)
//        + recent events + 24h stats
export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const [settings, recent, stats] = await Promise.all([
      getMetaCapiSettings(),
      getRecentCapiEvents(20),
      getCapiStats(),
    ])
    // Strip token from response
    const safe = {
      pixel_id: settings.pixel_id,
      enabled: settings.enabled,
      has_token: settings.has_token,
      test_event_code: settings.test_event_code,
      purchase_value: settings.purchase_value,
      lead_value: settings.lead_value,
      currency: settings.currency,
      event_source_url: settings.event_source_url,
    }
    return NextResponse.json({ success: true, data: { settings: safe, recent, stats } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// PATCH — admin updates settings
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const body = await req.json()
    const allowed: (keyof typeof body)[] = [
      'pixel_id', 'access_token', 'enabled', 'test_event_code',
      'purchase_value', 'lead_value', 'currency', 'event_source_url',
    ]
    const partial: Record<string, unknown> = {}
    for (const k of allowed) if (k in body) partial[k as string] = body[k]
    await setMetaCapiSettings(partial)
    const settings = await getMetaCapiSettings()
    const safe = {
      pixel_id: settings.pixel_id,
      enabled: settings.enabled,
      has_token: settings.has_token,
      test_event_code: settings.test_event_code,
      purchase_value: settings.purchase_value,
      lead_value: settings.lead_value,
      currency: settings.currency,
      event_source_url: settings.event_source_url,
    }
    return NextResponse.json({ success: true, data: { settings: safe } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
