import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { insertNote, getNotes } from '@/lib/db'
import { getLeads } from '@/lib/sheets'
import { autoAnswerForNote } from '@/lib/update-requests'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  try {
    const session = await getSession()
    requireAuth(session)
    const { phone } = await params
    const notes = await getNotes(phone)
    return NextResponse.json({ success: true, data: notes })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed to fetch notes') },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { phone } = await params
    const body = await req.json()
    const { note } = body

    if (!note?.trim()) {
      return NextResponse.json({ success: false, error: 'Note text is required' }, { status: 400 })
    }

    // Author is taken from the authenticated session, never the request body.
    // Fixes a long-standing bug where every note landed with created_by = '',
    // which made all notes invisible in agent-activity analytics.
    const id = await insertNote({ phone, note: note.trim(), created_by: user.name })

    // Best-effort: if this lead has a pending update request for this user,
    // mark it answered. Failures here must not block note creation.
    try {
      const leads = await getLeads()
      const phone10 = phone.replace(/\D/g, '').slice(-10)
      const lead = leads.find(l => l.phone.replace(/\D/g, '').slice(-10) === phone10)
      if (lead && lead.assigned_to === user.name) {
        await autoAnswerForNote({
          lead_row: lead.row_number,
          agent_id: user.id,
          note_id: id,
          note_text: note,
        })
      }
    } catch (e) {
      console.error('[notes POST] auto-answer check failed (non-fatal):', e)
    }

    return NextResponse.json({ success: true, id })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed to save note') },
      { status: 500 }
    )
  }
}
