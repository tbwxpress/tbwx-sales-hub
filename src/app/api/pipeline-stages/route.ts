import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getPipelineStages, createPipelineStage } from '@/lib/db'

// GET /api/pipeline-stages — active stages by default; ?all=1 includes inactive.
// Public to any logged-in user (read).
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    requireAuth(session)
    const includeInactive = new URL(req.url).searchParams.get('all') === '1'
    const stages = await getPipelineStages({ includeInactive })
    return NextResponse.json({ stages })
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to load pipeline stages') }, { status: 500 })
  }
}

// POST /api/pipeline-stages — create a stage (ADMIN ONLY).
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    const body = await req.json()
    const label = String(body?.label || '').trim()
    if (!label) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 })
    }
    const stage = await createPipelineStage({ label, color: body?.color })
    return NextResponse.json({ stage })
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to create pipeline stage') }, { status: 500 })
  }
}
