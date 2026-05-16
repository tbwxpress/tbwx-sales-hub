import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth, requireAdmin } from '@/lib/auth'
import {
  createPaymentFollowup,
  getAllPaymentFollowups,
  getPaymentFollowupsForAgent,
  insertLeadEdit,
} from '@/lib/db'
import { getUserById } from '@/lib/users'

// POST /api/payment-followups — admin only
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const body = await req.json()
    const { lead_row, phone, franchise_name, amount, due_date, assigned_to_id, notes, currency } = body

    if (!franchise_name || typeof franchise_name !== 'string' || !franchise_name.trim()) {
      return NextResponse.json({ success: false, error: 'franchise_name is required' }, { status: 400 })
    }
    if (!assigned_to_id) {
      return NextResponse.json({ success: false, error: 'assigned_to_id is required' }, { status: 400 })
    }

    const assignedAgent = await getUserById(assigned_to_id)
    if (!assignedAgent || !assignedAgent.active) {
      return NextResponse.json({ success: false, error: 'Assigned agent not found or inactive' }, { status: 400 })
    }

    const followup = await createPaymentFollowup({
      lead_row: lead_row ?? null,
      phone: phone || '',
      franchise_name: franchise_name.trim(),
      amount: amount ?? 0,
      currency: currency || '₹',
      due_date: due_date || null,
      assigned_to_id,
      assigned_to_name: assignedAgent.name,
      created_by_id: user.id,
      created_by_name: user.name,
      notes: notes || '',
    })

    // If linked to a lead, audit-log it
    if (lead_row) {
      await insertLeadEdit({
        lead_row,
        phone: phone || '',
        field_name: 'payment_followup',
        old_value: '',
        new_value: `Created followup for ${franchise_name.trim()} assigned to ${assignedAgent.name}`,
        changed_by: user.name,
        changed_by_id: user.id,
      })
    }

    return NextResponse.json({ success: true, data: followup }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to create followup') }, { status: 500 })
  }
}

// GET /api/payment-followups?status=&assigned_to_id=&days=
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const url = new URL(req.url)
    const status = url.searchParams.get('status') || undefined
    const days = url.searchParams.get('days') ? Number(url.searchParams.get('days')) : undefined

    let data
    if (user.role === 'admin') {
      const agent_id = url.searchParams.get('assigned_to_id') || undefined
      data = await getAllPaymentFollowups({ status, agent_id, days })
    } else {
      // Agents only see their own
      data = await getPaymentFollowupsForAgent(user.id, { status })
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to fetch followups') }, { status: 500 })
  }
}
