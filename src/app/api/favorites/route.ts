import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { listFavorites, addFavorite, removeFavorite } from '@/lib/db'

const VALID_KINDS = new Set(['lead', 'view'])

// GET /api/favorites — the current user's favorites.
export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const favorites = await listFavorites(user.id)
    return NextResponse.json({ favorites })
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to load favorites') }, { status: 500 })
  }
}

// POST /api/favorites — star a lead or view. Body: { kind, ref }. Idempotent.
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const body = await req.json()
    const kind = String(body?.kind || '')
    const ref = String(body?.ref ?? '')
    if (!VALID_KINDS.has(kind)) {
      return NextResponse.json({ error: "kind must be 'lead' or 'view'" }, { status: 400 })
    }
    if (!ref) {
      return NextResponse.json({ error: 'ref is required' }, { status: 400 })
    }
    await addFavorite(user.id, kind, ref)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to add favorite') }, { status: 500 })
  }
}

// DELETE /api/favorites — unstar. Body: { kind, ref }.
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const body = await req.json()
    const kind = String(body?.kind || '')
    const ref = String(body?.ref ?? '')
    if (!VALID_KINDS.has(kind)) {
      return NextResponse.json({ error: "kind must be 'lead' or 'view'" }, { status: 400 })
    }
    if (!ref) {
      return NextResponse.json({ error: 'ref is required' }, { status: 400 })
    }
    await removeFavorite(user.id, kind, ref)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to remove favorite') }, { status: 500 })
  }
}
