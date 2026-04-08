import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { insertAgreement, getAgreementsForLead, getAllAgreements } from '@/lib/db'

// GET /api/agreements — list agreements (by phone or all for admin)
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const phone = new URL(req.url).searchParams.get('phone')

    if (phone) {
      const agreements = await getAgreementsForLead(phone)
      return NextResponse.json({ success: true, data: agreements })
    }

    // Admin: get all agreements
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only for listing all agreements' }, { status: 403 })
    }
    const all = await getAllAgreements()
    return NextResponse.json({ success: true, data: all })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// POST /api/agreements — create a draft agreement
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const body = await req.json()
    const { lead_phone, lead_row, doc_type, fields } = body

    if (!lead_phone || !doc_type) {
      return NextResponse.json({ success: false, error: 'lead_phone and doc_type required' }, { status: 400 })
    }
    if (!['FBA', 'FRANCHISE_AGREEMENT'].includes(doc_type)) {
      return NextResponse.json({ success: false, error: 'doc_type must be FBA or FRANCHISE_AGREEMENT' }, { status: 400 })
    }

    // Validate critical fields
    if (fields) {
      if (fields.franchisee_pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(fields.franchisee_pan)) {
        return NextResponse.json({ success: false, error: 'Invalid PAN format (expected: ABCDE1234F)' }, { status: 400 })
      }
      if (fields.franchisee_uid && !/^\d{12}$/.test(fields.franchisee_uid)) {
        return NextResponse.json({ success: false, error: 'Invalid Aadhar/UID (expected: 12 digits)' }, { status: 400 })
      }
    }

    const id = `AGR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    await insertAgreement({
      id,
      lead_phone,
      lead_row: lead_row || undefined,
      doc_type,
      fields: fields || {},
      generated_by: user.name,
    })

    return NextResponse.json({ success: true, id })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to create agreement') }, { status: 500 })
  }
}
