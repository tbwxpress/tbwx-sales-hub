import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getQuickReplies, createQuickReply, updateQuickReply, deleteQuickReply } from '@/lib/sheets'

export async function GET() {
  try {
    const session = await getSession()
    requireAuth(session)
    const qrs = await getQuickReplies()
    return NextResponse.json({ success: true, data: qrs })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { category, title, message } = await req.json()

    if (!title || !message) {
      return NextResponse.json({ success: false, error: 'Title and message required' }, { status: 400 })
    }

    const id = await createQuickReply({ category: category || 'General', title, message, created_by: user.name })
    return NextResponse.json({ success: true, data: { id } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    requireAuth(session)
    const { id, category, title, message } = await req.json()

    if (!id) {
      return NextResponse.json({ success: false, error: 'Quick reply ID required' }, { status: 400 })
    }
    if (!title || !message) {
      return NextResponse.json({ success: false, error: 'Title and message required' }, { status: 400 })
    }

    await updateQuickReply(id, { category, title, message })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    requireAuth(session)
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ success: false, error: 'Quick reply ID required' }, { status: 400 })
    }
    await deleteQuickReply(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
