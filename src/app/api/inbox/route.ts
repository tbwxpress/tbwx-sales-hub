import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getContacts, searchMessages, getContactsForAgent } from '@/lib/db'
import { getLeads } from '@/lib/sheets'

// GET /api/inbox — list all conversations (agent-scoped)
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const search = req.nextUrl.searchParams.get('search')

    if (search) {
      const results = await searchMessages(search)
      // For agents, filter search results to only their assigned leads
      if (user.role === 'agent') {
        const leads = await getLeads()
        const assignedPhones = leads
          .filter(l => l.assigned_to === user.name)
          .map(l => l.phone.replace(/\D/g, '').slice(-10))
        const filtered = results.filter((r: any) => {
          const phone10 = String(r.phone || '').replace(/\D/g, '').slice(-10)
          return assignedPhones.includes(phone10)
        })
        return NextResponse.json({ success: true, data: filtered })
      }
      return NextResponse.json({ success: true, data: results })
    }

    // Agents see only their assigned leads' conversations
    if (user.role === 'agent') {
      const leads = await getLeads()
      const assignedPhones = leads
        .filter(l => l.assigned_to === user.name)
        .map(l => l.phone)
      const contacts = await getContactsForAgent(assignedPhones)
      return NextResponse.json({ success: true, data: contacts })
    }

    // Admins see everything
    const contacts = await getContacts()
    return NextResponse.json({ success: true, data: contacts })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to fetch inbox' },
      { status: 500 }
    )
  }
}
