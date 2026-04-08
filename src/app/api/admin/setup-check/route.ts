import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { apiError } from '@/lib/api-error'
import { WHATSAPP } from '@/config/client'

interface CheckResult {
  label: string
  status: 'ok' | 'warn' | 'error'
  message: string
}

type CheckFn = () => Promise<CheckResult>

async function runCheck(label: string, fn: CheckFn): Promise<CheckResult> {
  try {
    return await fn()
  } catch (err) {
    return { label, status: 'error', message: apiError(err, `${label} check failed`) }
  }
}

async function checkWhatsApp(): Promise<CheckResult[]> {
  const static_results: CheckResult[] = [
    {
      label: 'WA Phone Number ID',
      status: process.env.WHATSAPP_PHONE_NUMBER_ID ? 'ok' : 'error',
      message: process.env.WHATSAPP_PHONE_NUMBER_ID ? 'Configured' : 'WHATSAPP_PHONE_NUMBER_ID not set',
    },
    {
      label: 'WA Token',
      status: process.env.WHATSAPP_TOKEN ? 'ok' : 'error',
      message: process.env.WHATSAPP_TOKEN ? 'Configured' : 'WHATSAPP_TOKEN not set',
    },
    {
      label: 'WA WABA ID',
      status: process.env.WHATSAPP_WABA_ID ? 'ok' : 'error',
      message: process.env.WHATSAPP_WABA_ID ? 'Configured' : 'WHATSAPP_WABA_ID not set',
    },
    {
      label: 'Meta App Secret',
      status: process.env.META_APP_SECRET ? 'ok' : 'error',
      message: process.env.META_APP_SECRET ? 'Configured (webhook signature enabled)' : 'META_APP_SECRET not set — webhooks unprotected!',
    },
    {
      label: 'Webhook Verify Token',
      status: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ? 'ok' : 'warn',
      message: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
        ? `Set: ${process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN}`
        : 'Using default "saleshub-webhook-verify" (change this!)',
    },
  ]

  const results = [...static_results]

  if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    const connectionResult = await runCheck('WA API Connection', async () => {
      const res = await fetch(
        `${WHATSAPP.apiBase}/${process.env.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name&access_token=${process.env.WHATSAPP_TOKEN}`,
        { signal: AbortSignal.timeout(5000) }
      )
      const data = await res.json()
      if (data.error) {
        return { label: 'WA API Connection', status: 'error', message: `API error: ${data.error.message}` }
      }
      return { label: 'WA API Connection', status: 'ok', message: `Connected — ${data.verified_name || ''} (${data.display_phone_number || 'N/A'})` }
    })
    results.push(connectionResult)
  }

  return results
}

async function checkGoogleSheets(): Promise<CheckResult[]> {
  const results: CheckResult[] = [
    { label: 'Google Client ID', status: process.env.GOOGLE_CLIENT_ID ? 'ok' : 'error', message: process.env.GOOGLE_CLIENT_ID ? 'Configured' : 'GOOGLE_CLIENT_ID not set' },
    { label: 'Google Client Secret', status: process.env.GOOGLE_CLIENT_SECRET ? 'ok' : 'error', message: process.env.GOOGLE_CLIENT_SECRET ? 'Configured' : 'GOOGLE_CLIENT_SECRET not set' },
    { label: 'Google Refresh Token', status: process.env.GOOGLE_REFRESH_TOKEN ? 'ok' : 'error', message: process.env.GOOGLE_REFRESH_TOKEN ? 'Configured' : 'GOOGLE_REFRESH_TOKEN not set' },
    { label: 'Leads Sheet ID', status: process.env.LEADS_SHEET_ID ? 'ok' : 'error', message: process.env.LEADS_SHEET_ID ? 'Configured' : 'LEADS_SHEET_ID not set' },
    { label: 'Hub Sheet ID', status: process.env.HUB_SHEET_ID ? 'ok' : 'warn', message: process.env.HUB_SHEET_ID ? 'Configured' : 'HUB_SHEET_ID not set (users/quick-replies may not work)' },
  ]

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN && process.env.LEADS_SHEET_ID) {
    const connectionResult = await runCheck('Sheets Connection', async () => {
      const { getLeads } = await import('@/lib/sheets')
      const leads = await getLeads()
      return { label: 'Sheets Connection', status: 'ok', message: `Connected — ${leads.length} leads found in sheet` }
    })
    results.push(connectionResult)
  }

  return results
}

async function checkAuth(): Promise<CheckResult[]> {
  const jwtSecret = process.env.JWT_SECRET || ''
  const jwtResult: CheckResult = !jwtSecret
    ? { label: 'JWT Secret', status: 'error', message: 'JWT_SECRET not set — login will not work!' }
    : jwtSecret.length < 32
      ? { label: 'JWT Secret', status: 'warn', message: 'JWT_SECRET is set but short — use at least 32 chars' }
      : { label: 'JWT Secret', status: 'ok', message: 'Configured' }

  return [
    jwtResult,
    {
      label: 'CRON Secret',
      status: process.env.CRON_SECRET ? 'ok' : 'warn',
      message: process.env.CRON_SECRET ? 'Configured' : 'CRON_SECRET not set — auto-send cron is unprotected',
    },
  ]
}

async function checkDatabase(): Promise<CheckResult[]> {
  const checks: Array<{ label: string; run: CheckFn }> = [
    {
      label: 'Database',
      run: async () => {
        const { getContacts } = await import('@/lib/db')
        const contacts = await getContacts()
        return { label: 'Database', status: 'ok', message: `Connected — ${contacts.length} contacts` }
      },
    },
    {
      label: 'Users',
      run: async () => {
        const { getUsers } = await import('@/lib/users')
        const users = await getUsers()
        return {
          label: 'Users',
          status: users.length > 0 ? 'ok' : 'warn',
          message: users.length > 0
            ? `${users.length} user${users.length !== 1 ? 's' : ''} (${users.filter(u => u.role === 'admin').length} admin)`
            : 'No users — run: npm run seed-admin',
        } as CheckResult
      },
    },
  ]

  return Promise.all(checks.map(c => runCheck(c.label, c.run)))
}

function checkBrand(): CheckResult[] {
  return [
    { label: 'Brand Name', status: 'ok', message: process.env.NEXT_PUBLIC_BRAND_NAME || 'TBWX Sales Hub (default)' },
    { label: 'Brand Short', status: 'ok', message: process.env.NEXT_PUBLIC_BRAND_SHORT || 'TBWX (default)' },
    {
      label: 'Brand Logo',
      status: process.env.NEXT_PUBLIC_BRAND_LOGO ? 'ok' : 'warn',
      message: process.env.NEXT_PUBLIC_BRAND_LOGO || '/logo-tbwx.png (default — swap this for client!)',
    },
    {
      label: 'Brand Tagline',
      status: process.env.NEXT_PUBLIC_BRAND_TAGLINE ? 'ok' : 'warn',
      message: process.env.NEXT_PUBLIC_BRAND_TAGLINE || 'Just Waffle It. (default — update for client)',
    },
    {
      label: 'App URL',
      status: process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost') ? 'ok' : 'warn',
      message: process.env.NEXT_PUBLIC_APP_URL || 'Not set (localhost assumed)',
    },
  ]
}

export async function GET() {
  return runCheck('setup-check', async () => {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      // Return as a thrown error so runCheck catches it — but we need a proper 403, so throw with a marker
      throw Object.assign(new Error('Admin only'), { status: 403 })
    }

    const [wa, sheets, auth, db] = await Promise.all([
      checkWhatsApp(),
      checkGoogleSheets(),
      checkAuth(),
      checkDatabase(),
    ])
    const brand = checkBrand()

    const allChecks = [...auth, ...wa, ...sheets, ...db, ...brand]
    const errorCount = allChecks.filter(c => c.status === 'error').length
    const warnCount = allChecks.filter(c => c.status === 'warn').length

    return NextResponse.json({
      success: true,
      data: {
        overall: errorCount === 0 ? (warnCount === 0 ? 'healthy' : 'warnings') : 'errors',
        error_count: errorCount,
        warn_count: warnCount,
        sections: { auth, whatsapp: wa, sheets, database: db, brand },
      },
    }) as unknown as CheckResult
  }).then(result => {
    // runCheck returns a CheckResult on error — detect that and return proper HTTP responses
    if (result && 'status' in result && result.status === 'error') {
      return NextResponse.json({ success: false, error: result.message }, { status: 500 })
    }
    return result as unknown as NextResponse
  })
}
