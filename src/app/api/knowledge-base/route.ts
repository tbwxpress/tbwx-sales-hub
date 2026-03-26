import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getKnowledgeBase, createKnowledgeBaseEntry, updateKnowledgeBaseEntry, deleteKnowledgeBaseEntry } from '@/lib/sheets'

export async function GET() {
  try {
    const session = await getSession()
    requireAuth(session)
    const entries = await getKnowledgeBase()
    return NextResponse.json({ success: true, data: entries })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Only admins can add entries' }, { status: 403 })
    }
    const { category, title, content, link } = await req.json()

    if (!title || !content) {
      return NextResponse.json({ success: false, error: 'Title and content required' }, { status: 400 })
    }

    const id = await createKnowledgeBaseEntry({ category: category || 'General', title, content, link: link || '', created_by: user.name })
    return NextResponse.json({ success: true, data: { id } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Only admins can edit entries' }, { status: 403 })
    }
    const { id, category, title, content, link } = await req.json()

    if (!id) {
      return NextResponse.json({ success: false, error: 'Entry ID required' }, { status: 400 })
    }
    if (!title || !content) {
      return NextResponse.json({ success: false, error: 'Title and content required' }, { status: 400 })
    }

    await updateKnowledgeBaseEntry(id, { category, title, content, link })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Only admins can delete entries' }, { status: 403 })
    }
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ success: false, error: 'Entry ID required' }, { status: 400 })
    }
    await deleteKnowledgeBaseEntry(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
