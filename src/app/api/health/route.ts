import { NextResponse } from 'next/server'

/**
 * GET /api/health — Application health check
 *
 * Tests: DB connectivity, Sheets API, basic app health.
 * Used by uptime monitors (UptimeRobot, Better Uptime, etc.)
 * No auth required — returns minimal info publicly.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {}
  const start = Date.now()

  // 1. Database connectivity
  try {
    const dbStart = Date.now()
    const { getSetting } = await import('@/lib/db')
    await getSetting('_health_check') // lightweight query
    checks.database = { ok: true, ms: Date.now() - dbStart }
  } catch (err) {
    checks.database = { ok: false, error: err instanceof Error ? err.message : 'DB unreachable' }
  }

  // 2. Google Sheets connectivity (use cache — don't burn API quota)
  try {
    const sheetsStart = Date.now()
    const { getLeads } = await import('@/lib/sheets')
    const leads = await getLeads()
    checks.sheets = { ok: true, ms: Date.now() - sheetsStart }
    checks.leads_count = { ok: leads.length > 0, ms: 0 }
  } catch (err) {
    checks.sheets = { ok: false, error: err instanceof Error ? err.message : 'Sheets unreachable' }
  }

  const allOk = Object.values(checks).every(c => c.ok)
  const totalMs = Date.now() - start

  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    uptime: process.uptime(),
    checks,
    total_ms: totalMs,
    version: process.env.npm_package_version || 'unknown',
    timestamp: new Date().toISOString(),
  }, { status: allOk ? 200 : 503 })
}
