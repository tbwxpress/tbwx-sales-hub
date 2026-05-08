import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth, requireAdmin } from '@/lib/auth'
import { sendCapiEvent } from '@/lib/meta-capi'

// POST /api/admin/meta-capi-test
// Fires a synthetic Lead event for the admin to verify in Events Manager.
// Useful before flipping `enabled` ON for real lead status changes.
//
// Body (optional): { phone, email, value, test_event_code_override }
// If test_event_code is set in settings (or passed here), the event lands in
// Meta's "Test Events" tab — won't pollute production data.
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const body = await req.json().catch(() => ({}))
    const phone = String(body.phone || '917973933630')
    const email = String(body.email || 'test@tbwxpress.com')
    const value = Number(body.value || 100000)

    const result = await sendCapiEvent({
      event_name: 'Lead',
      event_id: `TBWX_TEST_${Date.now()}`,
      user_data: { phone, email, first_name: 'Test', last_name: 'Lead', city: 'Mumbai' },
      custom_data: {
        value,
        currency: 'INR',
        content_name: 'TBWX CAPI Test Event',
        content_category: 'franchise',
      },
      action_source: 'system_generated',
    })

    return NextResponse.json({ success: result.success, data: result })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
