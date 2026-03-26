import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getMessages, getContact, markMessagesRead } from '@/lib/db'
import { getLeads } from '@/lib/sheets'

// GET /api/inbox/[phone] — get conversation for a contact
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const { phone } = await params

    // Agents can only view assigned leads (+ unassigned if can_assign)
    if (user.role === 'agent') {
      const leads = await getLeads()
      const visiblePhones = leads
        .filter(l => l.assigned_to === user.name || (user.can_assign && !l.assigned_to))
        .map(l => l.phone.replace(/\D/g, '').slice(-10))
      const phone10 = phone.replace(/\D/g, '').slice(-10)
      if (!visiblePhones.includes(phone10)) {
        return NextResponse.json({ success: false, error: 'Not assigned to you' }, { status: 403 })
      }
    }

    const contact = await getContact(phone)
    const messages = await getMessages(phone, 200)

    // Mark all messages as read when opening conversation
    await markMessagesRead(phone)

    return NextResponse.json({
      success: true,
      data: { contact, messages }
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to fetch messages' },
      { status: 500 }
    )
  }
}
