import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads } from '@/lib/sheets'
import { createDelegation, getActiveDelegationForLead, insertLeadEdit } from '@/lib/db'
import { getUserById } from '@/lib/users'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { id } = await params
    const lead_row = parseInt(id)
    if (isNaN(lead_row)) {
      return NextResponse.json({ success: false, error: 'Invalid lead id' }, { status: 400 })
    }

    const body = await req.json()
    const { to_agent_id, message, expires_at } = body as {
      to_agent_id: string
      message?: string
      expires_at?: string
    }

    if (!to_agent_id) {
      return NextResponse.json({ success: false, error: 'to_agent_id is required' }, { status: 400 })
    }
    if (to_agent_id === user.id) {
      return NextResponse.json({ success: false, error: 'Cannot delegate a lead to yourself' }, { status: 400 })
    }

    // Lookup lead — verify it exists and agent is authorized
    const allLeads = await getLeads()
    const lead = allLeads.find(l => l.row_number === lead_row)
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 })
    }

    // Agents can only delegate leads assigned to them
    if (user.role === 'agent') {
      if (lead.assigned_to !== user.name) {
        return NextResponse.json(
          { success: false, error: 'You can only delegate leads assigned to you' },
          { status: 403 }
        )
      }
    }

    // Check for existing active delegation
    const existing = await getActiveDelegationForLead(lead_row)
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: `This lead already has an active delegation to ${existing.to_agent_name}. End it first.`,
        },
        { status: 409 }
      )
    }

    // Lookup to_agent
    const to_agent = await getUserById(to_agent_id)
    if (!to_agent || !to_agent.active) {
      return NextResponse.json({ success: false, error: 'Target agent not found or inactive' }, { status: 400 })
    }

    const auto_accept = user.role === 'admin'

    const delegation = await createDelegation({
      lead_row,
      phone: lead.phone || '',
      from_agent_id: user.id,
      from_agent_name: user.name,
      to_agent_id: to_agent.id,
      to_agent_name: to_agent.name,
      message: message || '',
      expires_at: expires_at || undefined,
      auto_accept,
    })

    // Audit log
    const expiresLabel = expires_at ? ` until ${expires_at}` : ''
    await insertLeadEdit({
      lead_row,
      phone: lead.phone || '',
      field_name: 'delegation',
      old_value: '',
      new_value: `requested ${to_agent.name}${expiresLabel}`,
      changed_by: user.name,
      changed_by_id: user.id,
    })

    return NextResponse.json({ success: true, data: delegation })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to create delegation') }, { status: 500 })
  }
}
