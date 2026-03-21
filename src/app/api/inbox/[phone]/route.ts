import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getMessages, getContact, markMessagesRead } from '@/lib/db'

// GET /api/inbox/[phone] — get conversation for a contact
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const session = await getSession()
    requireAuth(session)

    const { phone } = await params
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
