import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getMessages, getContact, markMessagesRead } from '@/lib/db'
import { getAgentVisiblePhones } from '@/lib/visibility'

// GET /api/inbox/[phone] — get conversation for a contact (role-scoped)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const { phone } = await params

    const visiblePhones = await getAgentVisiblePhones(user)
    if (visiblePhones !== null) {
      const phone10 = phone.replace(/\D/g, '').slice(-10)
      const visible10 = new Set(
        visiblePhones.map(p => String(p).replace(/\D/g, '').slice(-10))
      )
      if (!visible10.has(phone10)) {
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
      { success: false, error: apiError(err, 'Failed to fetch messages') },
      { status: 500 }
    )
  }
}
