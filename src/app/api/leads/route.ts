import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads, getLeadStats, createLead } from '@/lib/sheets'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    requireAuth(session)

    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const assigned = url.searchParams.get('assigned')
    const search = url.searchParams.get('search')
    const statsOnly = url.searchParams.get('stats')

    if (statsOnly === 'true') {
      // Agents see only their own stats; admins see everything
      const agentFilter = session!.role === 'agent' ? session!.name : undefined
      const stats = await getLeadStats(agentFilter)
      return NextResponse.json({ success: true, data: stats })
    }

    let leads = await getLeads()

    // Agents only see their assigned leads (not unassigned)
    if (session!.role === 'agent') {
      leads = leads.filter(l => l.assigned_to === session!.name)
    }

    if (status) {
      leads = leads.filter(l => l.lead_status === status || l.lead_priority === status)
    }
    if (assigned) {
      leads = leads.filter(l => l.assigned_to === assigned)
    }
    if (search) {
      const s = search.toLowerCase()
      leads = leads.filter(l =>
        l.full_name.toLowerCase().includes(s) ||
        l.phone.includes(s) ||
        l.city.toLowerCase().includes(s) ||
        l.email.toLowerCase().includes(s)
      )
    }

    // Sort: newest first
    leads.sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime())

    return NextResponse.json({ success: true, data: leads })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Failed to fetch leads' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    requireAuth(session)

    const body = await req.json()

    if (!body.full_name || !body.phone) {
      return NextResponse.json({ success: false, error: 'Name and phone are required' }, { status: 400 })
    }

    // Clean phone number
    const phone = body.phone.replace(/\D/g, '')
    if (phone.length < 10) {
      return NextResponse.json({ success: false, error: 'Invalid phone number' }, { status: 400 })
    }

    // Check for duplicate phone
    const existing = await getLeads()
    const cleanPhone = phone.slice(-10)
    const duplicate = existing.find(l => l.phone.replace(/\D/g, '').slice(-10) === cleanPhone)
    if (duplicate) {
      return NextResponse.json({
        success: false,
        error: `Lead already exists: ${duplicate.full_name} (row ${duplicate.row_number})`,
      }, { status: 409 })
    }

    const rowNumber = await createLead({
      full_name: body.full_name,
      phone: phone,
      email: body.email || '',
      city: body.city || '',
      state: body.state || '',
      model_interest: body.model_interest || '',
      lead_priority: body.lead_priority || 'WARM',
      assigned_to: body.assigned_to || '',
      notes: body.notes || '',
      source: body.source || 'Manual Entry',
    })

    return NextResponse.json({ success: true, data: { row_number: rowNumber } })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Failed to create lead' }, { status: 500 })
  }
}
