import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { updateSavedView, deleteSavedView } from '@/lib/db'
import type { SavedViewFilters } from '@/lib/stages'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { id } = await params
    const viewId = parseInt(id)
    if (!Number.isFinite(viewId)) {
      return NextResponse.json({ error: 'Invalid view id' }, { status: 400 })
    }
    const body = await req.json()
    const patch: { name?: string; filters?: SavedViewFilters; isDefault?: boolean; scope?: 'private' | 'shared' } = {}
    if (body?.name !== undefined) patch.name = String(body.name)
    if (body?.filters !== undefined) patch.filters = body.filters as SavedViewFilters
    if (body?.isDefault !== undefined) patch.isDefault = Boolean(body.isDefault)
    if (body?.scope !== undefined) patch.scope = body.scope === 'shared' ? 'shared' : 'private'

    const view = await updateSavedView(viewId, user.id, user.role === 'admin', patch)
    if (!view) {
      return NextResponse.json({ error: 'Saved view not found' }, { status: 404 })
    }
    return NextResponse.json({ view })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    const status = msg.includes('Not authorized') ? 403 : 500
    return NextResponse.json({ error: apiError(err, 'Failed to update saved view') }, { status })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { id } = await params
    const viewId = parseInt(id)
    if (!Number.isFinite(viewId)) {
      return NextResponse.json({ error: 'Invalid view id' }, { status: 400 })
    }
    const ok = await deleteSavedView(viewId, user.id, user.role === 'admin')
    if (!ok) {
      return NextResponse.json({ error: 'Saved view not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    const status = msg.includes('Not authorized') ? 403 : 500
    return NextResponse.json({ error: apiError(err, 'Failed to delete saved view') }, { status })
  }
}
