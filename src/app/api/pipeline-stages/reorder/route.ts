import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { reorderPipelineStages } from '@/lib/db'

// POST /api/pipeline-stages/reorder — rewrite sort_order from an ordered key
// list (ADMIN ONLY). Body: { order: string[] }.
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    const body = await req.json()
    const order = body?.order
    if (!Array.isArray(order) || order.some(k => typeof k !== 'string')) {
      return NextResponse.json({ error: 'order must be an array of stage keys' }, { status: 400 })
    }
    await reorderPipelineStages(order as string[])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to reorder pipeline stages') }, { status: 500 })
  }
}
