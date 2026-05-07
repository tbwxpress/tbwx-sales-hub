import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { readStoredMedia } from '@/lib/media'
import { createClient } from '@libsql/client'

// GET /api/media/[id]
// id = wa_message_id (or media_path filename — accepts both for flexibility)
// Returns the binary with appropriate Content-Type. Auth required.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requireAuth(session)

    const { id } = await ctx.params
    if (!id) return new NextResponse('id required', { status: 400 })

    // Look up the message row by wa_message_id OR by media_path (flexibility)
    const dbUrl = process.env.TURSO_DATABASE_URL || 'file:data/inbox.db'
    const authToken = process.env.TURSO_AUTH_TOKEN || undefined
    const db = createClient({ url: dbUrl, authToken })
    const r = await db.execute({
      sql: `SELECT media_path, media_mime, media_filename FROM messages
            WHERE wa_message_id = ? OR media_path = ?
            LIMIT 1`,
      args: [id, id],
    })
    if (r.rows.length === 0) return new NextResponse('not found', { status: 404 })
    const row = r.rows[0]
    const mediaPath = String(row.media_path || '')
    if (!mediaPath) return new NextResponse('no media', { status: 404 })

    const file = readStoredMedia(mediaPath)
    if (!file) {
      // File expired or was cleaned up by the cron. Return 410 so the UI can show
      // "media expired" instead of a broken image.
      return new NextResponse('media expired or deleted', { status: 410 })
    }

    const mime = String(row.media_mime || 'application/octet-stream')
    const filename = String(row.media_filename || mediaPath)

    return new NextResponse(file.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(file.buffer.length),
        'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=86400',
      },
    })
  } catch (err) {
    return new NextResponse(String(err), { status: 500 })
  }
}
