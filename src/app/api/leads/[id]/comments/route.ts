import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { listLeadComments, addLeadComment } from '@/lib/db'

// GET /api/leads/[id]/comments — threaded comments for a lead (any authenticated user).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requireAuth(session)
    const { id } = await params
    const leadRow = parseInt(id)
    if (isNaN(leadRow)) {
      return NextResponse.json({ error: 'Invalid lead id' }, { status: 400 })
    }
    const comments = await listLeadComments(leadRow)
    return NextResponse.json({ comments })
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to load comments') }, { status: 500 })
  }
}

// POST /api/leads/[id]/comments — add a comment (any authenticated user).
// Body: { body: string, mentions?: string[] }. Mentions notify each user id.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { id } = await params
    const leadRow = parseInt(id)
    if (isNaN(leadRow)) {
      return NextResponse.json({ error: 'Invalid lead id' }, { status: 400 })
    }
    const reqBody = await req.json()
    const body = String(reqBody?.body || '').trim()
    if (!body) {
      return NextResponse.json({ error: 'body is required' }, { status: 400 })
    }
    const mentions: string[] = Array.isArray(reqBody?.mentions)
      ? Array.from(new Set((reqBody.mentions as unknown[]).map((m) => String(m)))).slice(0, 20)
      : []
    const comment = await addLeadComment(leadRow, {
      authorId: user.id,
      authorName: user.name,
      body,
      mentions,
    })
    return NextResponse.json({ comment })
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to add comment') }, { status: 500 })
  }
}
