import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getContacts, searchMessages, getContactsForAgent } from '@/lib/db'
import { getAgentVisiblePhones } from '@/lib/visibility'

// GET /api/inbox — list conversations (paginated, role-scoped)
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const search = req.nextUrl.searchParams.get('search')
    const limit = Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '200', 10) || 200, 1)
    const offset = Math.max(parseInt(req.nextUrl.searchParams.get('offset') || '0', 10) || 0, 0)

    const visiblePhones = await getAgentVisiblePhones(user)

    if (search) {
      const results = await searchMessages(search)
      if (visiblePhones === null) {
        return NextResponse.json({ success: true, data: results })
      }
      const visible10 = new Set(
        visiblePhones.map(p => String(p).replace(/\D/g, '').slice(-10))
      )
      const filtered = results.filter((r: any) => {
        const phone10 = String(r.phone || '').replace(/\D/g, '').slice(-10)
        return visible10.has(phone10)
      })
      return NextResponse.json({ success: true, data: filtered })
    }

    if (visiblePhones === null) {
      // Admin: full list, paginated in memory for UI parity
      const all = await getContacts()
      const page = all.slice(offset, offset + limit)
      return NextResponse.json({
        success: true,
        data: page,
        meta: { total: all.length, hasMore: all.length > offset + limit, offset, limit },
      })
    }

    const { contacts, total, hasMore } = await getContactsForAgent(visiblePhones, { limit, offset })
    return NextResponse.json({
      success: true,
      data: contacts,
      meta: { total, hasMore, offset, limit },
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed to fetch inbox') },
      { status: 500 }
    )
  }
}
