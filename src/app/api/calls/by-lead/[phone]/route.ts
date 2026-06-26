import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { apiError } from '@/lib/api-error'
import { getCallRecordingsByPhone } from '@/lib/db'

export const runtime = 'nodejs'

// GET /api/calls/by-lead/[phone] — recorded calls for a lead, newest first,
// with the report_card JSON parsed for the UI.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const session = await getSession()
    requireAuth(session)

    const { phone } = await params
    const rows = await getCallRecordingsByPhone(phone)

    const data = rows.map((r) => {
      let report_card: unknown = null
      if (r.report_card) {
        try { report_card = JSON.parse(String(r.report_card)) } catch { /* leave null */ }
      }
      // Overwrite the raw JSON string with the parsed object for the UI.
      return { ...r, report_card }
    })

    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
