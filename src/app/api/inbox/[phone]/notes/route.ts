import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { insertNote, getNotes } from '@/lib/db'

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
    return NextResponse.json({ success: true, id })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed to save note') },
      { status: 500 }
    )
  }
}
