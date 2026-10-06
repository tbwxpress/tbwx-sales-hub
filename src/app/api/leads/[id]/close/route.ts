import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeadByRow, updateLead } from '@/lib/sheets'
import { insertNote, insertStatusChange, recordLeadClose } from '@/lib/db'
import { prependNote } from '@/lib/notes'
import { LOST_REASONS } from '@/config/client'

/**
 * POST /api/leads/[id]/close — mark a lead CONVERTED or LOST.
 *
 * Same rules as moving a lead to a won/lost stage through PATCH
 * /api/leads/[id]: a LOST close must carry a LOST_REASONS key, the transition
 * is written to the status audit log, and the SLA close is recorded. Only the
 * agent the lead is assigned to, or an admin, may close it.
 *
 * Body: { outcome: 'CONVERTED' | 'LOST', lost_reason?: <LOST_REASONS key>,
 *         lost_reason_note?: string, reason?: string }
 * `reason` is the older free-text field: accepted as the key when it is one,
 * otherwise kept as the note.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const { id } = await params
    const rowNumber = Number(id)
    if (!rowNumber || rowNumber < 2) {
      return NextResponse.json({ success: false, error: 'Invalid lead row' }, { status: 400 })
    }

    const body = await req.json()
    const outcome = body?.outcome

    if (!outcome || !['CONVERTED', 'LOST'].includes(outcome)) {
      return NextResponse.json({ success: false, error: 'Outcome must be CONVERTED or LOST' }, { status: 400 })
    }

    const lead = await getLeadByRow(rowNumber)
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 })
    }
    if (user.role !== 'admin' && lead.assigned_to !== user.name) {
      return NextResponse.json({ success: false, error: 'Not authorized to close this lead' }, { status: 403 })
    }

    const legacyReason = typeof body.reason === 'string' ? body.reason.trim() : ''
    const lostReason = typeof body.lost_reason === 'string' && body.lost_reason.trim()
      ? body.lost_reason.trim()
      : (LOST_REASONS[legacyReason] ? legacyReason : '')
    const lostReasonNote = typeof body.lost_reason_note === 'string' && body.lost_reason_note.trim()
      ? body.lost_reason_note.trim()
      : (legacyReason && legacyReason !== lostReason ? legacyReason : '')

    if (outcome === 'LOST' && !LOST_REASONS[lostReason]) {
      return NextResponse.json(
        {
          success: false,
          error: 'A lost reason is required to mark this lead LOST',
          code: 'LOST_REASON_REQUIRED',
          reasons: LOST_REASONS,
        },
        { status: 422 },
      )
    }

    const updates: Record<string, string> = { lead_status: outcome, next_followup: '' }
    const lostLabel = outcome === 'LOST' ? LOST_REASONS[lostReason] : ''
    if (outcome === 'LOST') {
      // Prepend, never replace: the existing notes carry the lead's source
      // attribution (src:/page:), which a close reason must not erase.
      updates.notes = prependNote(String(lead.notes || ''), `LOST: ${lostLabel}${lostReasonNote ? ` (${lostReasonNote})` : ''}`)
    }

    await updateLead(rowNumber, updates)

    const phone = lead.phone || (typeof body.phone === 'string' ? body.phone : '')

    if (lead.lead_status !== outcome) {
      await insertStatusChange({
        lead_row: rowNumber,
        phone,
        old_status: lead.lead_status,
        new_status: outcome,
        changed_by: user.name,
        changed_by_id: user.id,
        source: 'manual',
        reason: lostReason,
      })
    }

    if (phone) {
      try {
        await recordLeadClose(phone, outcome)
      } catch { /* SLA tracking is non-critical */ }

      // Human-readable trace on the lead's timeline.
      const noteText = outcome === 'CONVERTED'
        ? 'Lead CONVERTED — marked as won'
        : `[LOST] ${lostLabel}${lostReasonNote ? ` — ${lostReasonNote}` : ''}`
      await insertNote({ phone, note: noteText, created_by: user.name }).catch(() => { /* non-critical */ })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed to close lead') },
      { status: 500 }
    )
  }
}
