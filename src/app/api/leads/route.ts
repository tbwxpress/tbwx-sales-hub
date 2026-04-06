import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads, getLeadStats, createLead } from '@/lib/sheets'
import { computeLeadScore } from '@/lib/scoring'

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
      // Agents see own stats (+ unassigned if can_assign); admins see everything
      if (session!.role === 'agent') {
        let statsLeads = await getLeads()
        statsLeads = statsLeads.filter(l => l.assigned_to === session!.name || (session!.can_assign && !l.assigned_to))
        const now = new Date()
        const stats = {
          total: statsLeads.length,
          new: statsLeads.filter(l => l.lead_status === 'NEW').length,
          deck_sent: statsLeads.filter(l => l.lead_status === 'DECK_SENT').length,
          replied: statsLeads.filter(l => l.lead_status === 'REPLIED').length,
          no_response: statsLeads.filter(l => l.lead_status === 'NO_RESPONSE').length,
          call_done_interested: statsLeads.filter(l => l.lead_status === 'CALL_DONE_INTERESTED').length,
          hot: statsLeads.filter(l => l.lead_status === 'HOT').length,
          converted: statsLeads.filter(l => l.lead_status === 'CONVERTED').length,
          delayed: statsLeads.filter(l => l.lead_status === 'DELAYED').length,
          lost: statsLeads.filter(l => l.lead_status === 'LOST').length,
          unassigned: statsLeads.filter(l => !l.assigned_to).length,
          overdue_followups: statsLeads.filter(l => l.next_followup && new Date(l.next_followup) < now && l.lead_status !== 'CONVERTED' && l.lead_status !== 'LOST').length,
        }
        return NextResponse.json({ success: true, data: stats })
      }
      const stats = await getLeadStats()
      return NextResponse.json({ success: true, data: stats })
    }

    let leads = await getLeads()

    // Agents see assigned leads + unassigned (if can_assign)
    if (session!.role === 'agent') {
      leads = leads.filter(l => l.assigned_to === session!.name || (session!.can_assign && !l.assigned_to))
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

    // Attach computed scores
    const scoredLeads = leads.map(l => ({ ...l, lead_score: computeLeadScore(l) }))

    // Sort based on query parameter (default: score descending)
    const sort = url.searchParams.get('sort') || 'score'
    if (sort === 'newest') {
      scoredLeads.sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime())
    } else if (sort === 'oldest') {
      scoredLeads.sort((a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime())
    } else if (sort === 'followup') {
      scoredLeads.sort((a, b) => {
        if (!a.next_followup && !b.next_followup) return 0
        if (!a.next_followup) return 1
        if (!b.next_followup) return -1
        return new Date(a.next_followup).getTime() - new Date(b.next_followup).getTime()
      })
    } else {
      // Default: score descending
      scoredLeads.sort((a, b) => b.lead_score - a.lead_score)
    }

    return NextResponse.json({ success: true, data: scoredLeads })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to fetch leads') }, { status: 500 })
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
        error: 'This phone number already exists in the system.',
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
    return NextResponse.json({ success: false, error: apiError(err, 'Failed to create lead') }, { status: 500 })
  }
}
