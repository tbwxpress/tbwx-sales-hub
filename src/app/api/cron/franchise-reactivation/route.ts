import { NextRequest, NextResponse } from 'next/server'
import { getSetting } from '@/lib/db'

// Legacy hardcoded schedule from the May 2026 blast.
// Dates that fall on these keys still fire regardless of the recurring setting.
const SCHEDULE: Record<string, 'd0' | 'd5' | 'd7'> = {
  '2026-05-11': 'd0',
  '2026-05-16': 'd5',
  '2026-05-17': 'd7',
}

// Monthly recurring day-of-month → wave key (only active when 'reactivation.recurring' === 'true')
const RECURRING_DOM: Record<number, 'd0' | 'd5' | 'd7'> = {
  1: 'd0',
  6: 'd5',
  8: 'd7',
}

function todayInIST(): string {
  // WhatsApp campaign deadline is India local (IST = UTC+5:30)
  const offsetMs = 5.5 * 60 * 60 * 1000
  return new Date(Date.now() + offsetMs).toISOString().slice(0, 10)
}

function domInIST(): number {
  const offsetMs = 5.5 * 60 * 60 * 1000
  return new Date(Date.now() + offsetMs).getUTCDate()
}

async function callReactivation(
  origin: string,
  secret: string,
  key: 'd0' | 'd5' | 'd7',
  dryRun: boolean,
) {
  const res = await fetch(`${origin}/api/admin/franchise-reactivation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ template: key, dryRun }),
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
  const origin = process.env.PUBLIC_BASE_URL || req.nextUrl.origin

  // Read optional settings (non-critical — if DB fails, fall back to legacy behavior)
  let recurringEnabled = false
  let dryRun = false
  try {
    const [recurringVal, dryRunVal] = await Promise.all([
      getSetting('reactivation.recurring'),
      getSetting('reactivation.dry_run'),
    ])
    recurringEnabled = recurringVal === 'true'
    dryRun = dryRunVal === 'true'
  } catch {
    // Settings unavailable — behave identically to today (legacy mode)
  }

  // --- Legacy hardcoded schedule (always checked) ---
  const legacyKey = SCHEDULE[date]
  if (legacyKey) {
    const result = await callReactivation(origin, secret, legacyKey, dryRun)
    return NextResponse.json({
      success: true,
      mode: dryRun ? 'dry_run' : 'live',
      source: 'legacy_schedule',
      date,
      sent_template: legacyKey,
      downstream: result,
    })
  }

  // --- Monthly recurring mode (only when setting is exactly 'true') ---
  if (recurringEnabled) {
    const dom = domInIST()
    const recurringKey = RECURRING_DOM[dom]
    if (recurringKey) {
      const result = await callReactivation(origin, secret, recurringKey, dryRun)
      return NextResponse.json({
        success: true,
        mode: dryRun ? 'dry_run' : 'live',
        source: 'recurring_monthly',
        date,
        day_of_month: dom,
        sent_template: recurringKey,
        downstream: result,
      })
    }
  }

  return NextResponse.json({
    success: true,
    skipped: true,
    reason: `No campaign scheduled for ${date}`,
    date,
    recurring_enabled: recurringEnabled,
  })
}

export async function GET(req: NextRequest) {
  // Allow GET for cron services that send GET (n8n, etc.)
  return POST(req)
}

export const dynamic = 'force-dynamic'
