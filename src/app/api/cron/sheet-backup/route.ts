import { NextRequest, NextResponse } from 'next/server'
import { runFullBackup } from '@/lib/sheet-backup'

/**
 * POST /api/cron/sheet-backup
 * Backs up lead notes, call logs, and (incrementally) messages to Google Sheet tabs,
 * so the sheet stays a complete backup of the app's local data.
 * Triggered by a host crontab (Bearer CRON_SECRET) or manually by an admin.
 */
const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')?.replace('Bearer ', '')
  const isCron = CRON_SECRET && auth === CRON_SECRET
  if (!isCron) {
    const { getSession, requireAuth } = await import('@/lib/auth')
    const session = await getSession()
    try {
      const user = requireAuth(session)
      if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  try {
    const result = await runFullBackup()
    return NextResponse.json({ success: true, ...result, at: new Date().toISOString() })
  } catch (err) {
    console.error('[sheet-backup] failed:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'backup failed' },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'sheet-backup',
    description: 'Backs up lead notes, call logs, and messages to Google Sheet backup tabs',
  })
}
