import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// POST /api/cron/cleanup-media
// Deletes media files older than RETENTION_DAYS (default 60).
// Safe to run daily. Auth: Vercel CRON_SECRET bearer token.
const CRON_SECRET = process.env.CRON_SECRET
const MEDIA_DIR = process.env.MEDIA_DIR || path.resolve(process.cwd(), 'data', 'media')
const RETENTION_DAYS = parseInt(process.env.MEDIA_RETENTION_DAYS || '60', 10)

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const provided = authHeader?.replace('Bearer ', '')
    if (CRON_SECRET && provided !== CRON_SECRET) {
      const { getSession, requireAuth, requireAdmin } = await import('@/lib/auth')
      const session = await getSession()
      const user = requireAuth(session)
      requireAdmin(user)
    }

    if (!fs.existsSync(MEDIA_DIR)) {
      return NextResponse.json({ success: true, data: { scanned: 0, deleted: 0, freed_bytes: 0 } })
    }

    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    const files = fs.readdirSync(MEDIA_DIR)
    let scanned = 0, deleted = 0, freedBytes = 0
    for (const name of files) {
      const full = path.join(MEDIA_DIR, name)
      try {
        const st = fs.statSync(full)
        if (!st.isFile()) continue
        scanned++
        if (st.mtimeMs < cutoff) {
          freedBytes += st.size
          fs.unlinkSync(full)
          deleted++
        }
      } catch { /* skip unreadable */ }
    }

    return NextResponse.json({
      success: true,
      data: { scanned, deleted, freed_bytes: freedBytes, retention_days: RETENTION_DAYS },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}

export async function GET() {
  if (!fs.existsSync(MEDIA_DIR)) {
    return NextResponse.json({ retention_days: RETENTION_DAYS, files: 0, total_bytes: 0 })
  }
  const files = fs.readdirSync(MEDIA_DIR)
  let total = 0, count = 0
  for (const name of files) {
    try {
      const st = fs.statSync(path.join(MEDIA_DIR, name))
      if (st.isFile()) { count++; total += st.size }
    } catch { /* skip */ }
  }
  return NextResponse.json({ retention_days: RETENTION_DAYS, files: count, total_bytes: total })
}
