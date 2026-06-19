import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { updatePipelineStage } from '@/lib/db'

// PATCH /api/pipeline-stages/[key] — update label/color/isActive (ADMIN ONLY).
// The key is immutable and is never changed.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    const { key } = await params
    const body = await req.json()
    const patch: { label?: string; color?: string; isActive?: boolean } = {}
    if (body?.label !== undefined) patch.label = String(body.label)
    if (body?.color !== undefined) patch.color = String(body.color)
    if (body?.isActive !== undefined) patch.isActive = Boolean(body.isActive)

    const stage = await updatePipelineStage(key, patch)
    if (!stage) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
    }
    return NextResponse.json({ stage })
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to update pipeline stage') }, { status: 500 })
  }
}
