import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getAgreementById, updateAgreement } from '@/lib/db'

// GET /api/agreements/[id] — fetch single agreement
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requireAuth(session)
    const { id } = await params

    const agreement = await getAgreementById(id)
    if (!agreement) {
      return NextResponse.json({ success: false, error: 'Agreement not found' }, { status: 404 })
    }

    // Parse fields JSON for the response
    let fields = {}
    try { fields = JSON.parse(String(agreement.fields || '{}')) } catch { fields = {} }

    return NextResponse.json({
      success: true,
      data: { ...agreement, fields },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// PATCH /api/agreements/[id] — update fields or status
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { id } = await params

    const body = await req.json()

    // Only admin can change status to GENERATED or REVIEWED
    if (body.status && body.status !== 'DRAFT' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can change agreement status' }, { status: 403 })
    }

    const updates: Record<string, unknown> = {}
    if (body.fields) updates.fields = body.fields
    if (body.status) {
      updates.status = body.status
      if (body.status === 'GENERATED') {
        updates.generated_by = user.name
        updates.generated_at = new Date().toISOString()
      }
      if (body.status === 'REVIEWED') {
        updates.reviewed_by = user.name
        updates.reviewed_at = new Date().toISOString()
      }
    }

    await updateAgreement(id, updates)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Update failed') }, { status: 500 })
  }
}
