import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { updateLead } from '@/lib/sheets'
import { insertNote } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const rowNumber = Number(id)
    if (!rowNumber || rowNumber < 2) {
      return NextResponse.json({ success: false, error: 'Invalid lead row' }, { status: 400 })
    }

    const body = await req.json()
    const { outcome, reason, phone } = body

    if (!outcome || !['CONVERTED', 'LOST'].includes(outcome)) {
      return NextResponse.json({ success: false, error: 'Outcome must be CONVERTED or LOST' }, { status: 400 })
    }

    // Update lead status in Google Sheets
    const updates: Record<string, string> = { lead_status: outcome }
    if (reason) updates.notes = `LOST: ${reason}`

    await updateLead(rowNumber, updates)

    // Log a note about the closure
    if (phone) {
      const noteText = outcome === 'CONVERTED'
        ? 'Lead CONVERTED — marked as won'
        : `Lead LOST — Reason: ${reason || 'Not specified'}`
      await insertNote({ phone, note: noteText, created_by: 'system' })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed to close lead') },
      { status: 500 }
    )
  }
}
