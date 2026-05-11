import { NextRequest, NextResponse } from 'next/server'

const SCHEDULE: Record<string, 'd0' | 'd5' | 'd7'> = {
  '2026-05-11': 'd0',
  '2026-05-16': 'd5',
  '2026-05-17': 'd7',
}

function todayInIST(): string {
  // WhatsApp campaign deadline is India local (IST = UTC+5:30)
  const offsetMs = 5.5 * 60 * 60 * 1000
  return new Date(Date.now() + offsetMs).toISOString().slice(0, 10)
}

async function callReactivation(origin: string, secret: string, key: 'd0' | 'd5' | 'd7') {
  const res = await fetch(`${origin}/api/admin/franchise-reactivation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ template: key, dryRun: false }),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const date = todayInIST()
  const key = SCHEDULE[date]
  if (!key) {
    return NextResponse.json({ success: true, skipped: true, reason: `No campaign scheduled for ${date}`, date })
  }

  const origin = process.env.PUBLIC_BASE_URL
    || req.nextUrl.origin
  const result = await callReactivation(origin, secret, key)
  return NextResponse.json({ success: true, date, sent_template: key, downstream: result })
}

export async function GET(req: NextRequest) {
  // Allow GET for cron services that send GET (n8n, etc.)
  return POST(req)
}

export const dynamic = 'force-dynamic'
