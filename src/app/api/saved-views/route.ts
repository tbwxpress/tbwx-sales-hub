import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { listSavedViews, createSavedView } from '@/lib/db'

export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const views = await listSavedViews(user.id)
    return NextResponse.json({ views })
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to load saved views') }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const body = await req.json()
    const name = String(body?.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    const scope = body?.scope === 'shared' ? 'shared' : 'private'
    if (scope === 'shared' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can create shared views' }, { status: 403 })
    }
    const view = await createSavedView(user.id, {
      name,
      scope,
      filters: body?.filters || {},
      isDefault: Boolean(body?.isDefault),
    })
    return NextResponse.json({ view })
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to create saved view') }, { status: 500 })
  }
}
