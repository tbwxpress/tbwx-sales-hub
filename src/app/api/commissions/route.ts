import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth, requireAdmin } from '@/lib/auth'
import { getUsers } from '@/lib/users'
import { getLeads } from '@/lib/sheets'
import {
  getCommissionSettings,
  setCommissionSettings,
  getCommissionedLeadRowSet,
  getPaymentsByCloser,
  getAllPayments,
  recordCommissionPayment,
  markPaymentPaid,
  deletePayment,
} from '@/lib/commissions'

interface PendingLead {
  row_number: number
  full_name: string
  phone: string
  city: string
  converted_at: string
}

interface CloserSummary {
  user_id: string
  name: string
  email: string
  pending_count: number
  pending_amount: number
  paid_count: number
  paid_amount: number
  pending_leads: PendingLead[]
}

// GET /api/commissions
//   - admin: returns settings, all closers' summaries, and full history
//   - closer: returns settings + their own summary + their own history
export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const [settings, users, leads] = await Promise.all([
      getCommissionSettings(),
      getUsers(),
      getLeads(),
    ])

    const closers = users.filter(u => u.in_lead_pool)
    const isAdmin = user.role === 'admin'
    const visibleClosers = isAdmin ? closers : closers.filter(c => c.id === user.id)

    const allPayments = await getAllPayments()

    const summaries: CloserSummary[] = []
    for (const c of visibleClosers) {
      const alreadyCommissioned = await getCommissionedLeadRowSet(c.id)
      const convertedLeads = leads
        .filter(l => l.lead_status === 'CONVERTED' && l.assigned_to === c.name)
        .map(l => ({
          row_number: l.row_number,
          full_name: l.full_name || '',
          phone: l.phone,
          city: l.city || '',
          converted_at: l.next_followup || l.created_time || '',
        }))

      const pendingLeads = convertedLeads.filter(l => !alreadyCommissioned.has(l.row_number))
      const pendingAmount = pendingLeads.length * settings.amount_per_conversion

      const myPayments = allPayments.filter(p => p.closer_user_id === c.id)
      const paidCount = myPayments.filter(p => p.paid).reduce((acc, p) => acc + p.lead_rows.length, 0)
      const paidAmount = myPayments.filter(p => p.paid).reduce((acc, p) => acc + p.amount, 0)

      summaries.push({
        user_id: c.id,
        name: c.name,
        email: c.email,
        pending_count: pendingLeads.length,
        pending_amount: pendingAmount,
        paid_count: paidCount,
        paid_amount: paidAmount,
        pending_leads: pendingLeads,
      })
    }

    const visiblePayments = isAdmin
      ? allPayments
      : allPayments.filter(p => p.closer_user_id === user.id)

    return NextResponse.json({
      success: true,
      data: {
        settings,
        summaries,
        payments: visiblePayments,
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// POST /api/commissions — record a payment snapshot
// Body: { closer_user_id, lead_rows[], notes?, paid? }
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const { closer_user_id, lead_rows, notes, paid } = await req.json()
    if (!closer_user_id || !Array.isArray(lead_rows) || lead_rows.length === 0) {
      return NextResponse.json({ success: false, error: 'closer_user_id and non-empty lead_rows required' }, { status: 400 })
    }
    const rows = lead_rows.map(Number).filter(Number.isFinite)
    if (rows.length === 0) return NextResponse.json({ success: false, error: 'No valid lead_rows' }, { status: 400 })

    const settings = await getCommissionSettings()
    const amount = rows.length * settings.amount_per_conversion

    // Period bounds = today (admin can adjust later via notes)
    const today = new Date().toISOString().split('T')[0]

    // Validate no double-counting
    const already = await getCommissionedLeadRowSet(closer_user_id)
    const alreadyDup = rows.filter(r => already.has(r))
    if (alreadyDup.length > 0) {
      return NextResponse.json({ success: false, error: `Some leads already have a commission record: ${alreadyDup.join(', ')}` }, { status: 409 })
    }

    const id = await recordCommissionPayment({
      closer_user_id,
      period_start: today,
      period_end: today,
      lead_rows: rows,
      amount,
      paid: !!paid,
      notes,
    })

    return NextResponse.json({ success: true, data: { id, amount } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// PATCH /api/commissions — { id, paid } OR { settings: { amount_per_conversion?, currency? } }
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const body = await req.json()
    if (body.settings) {
      await setCommissionSettings(body.settings)
      const settings = await getCommissionSettings()
      return NextResponse.json({ success: true, data: { settings } })
    }
    if (typeof body.id === 'number' && typeof body.paid === 'boolean') {
      await markPaymentPaid(body.id, body.paid)
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ success: false, error: 'Provide settings, or { id, paid }' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// DELETE /api/commissions?id=NNN
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)
    const url = new URL(req.url)
    const id = parseInt(url.searchParams.get('id') || '', 10)
    if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })
    await deletePayment(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// Suppress unused-warn for getPaymentsByCloser (kept for future per-closer view)
void getPaymentsByCloser
