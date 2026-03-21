import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getContacts, searchMessages } from '@/lib/db'

// GET /api/inbox — list all conversations
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    requireAuth(session)

    const search = req.nextUrl.searchParams.get('search')

    if (search) {
      const results = await searchMessages(search)
      return NextResponse.json({ success: true, data: results })
    }

    const contacts = await getContacts()
    return NextResponse.json({ success: true, data: contacts })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to fetch inbox' },
      { status: 500 }
    )
  }
}
