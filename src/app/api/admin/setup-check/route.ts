import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { apiError } from '@/lib/api-error'

interface CheckResult {
  label: string
  status: 'ok' | 'warn' | 'error'
  message: string
}

async function checkWhatsApp(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  results.push({
    label: 'WA Phone Number ID',
    status: process.env.WHATSAPP_PHONE_NUMBER_ID ? 'ok' : 'error',
    message: process.env.WHATSAPP_PHONE_NUMBER_ID ? 'Configured' : 'WHATSAPP_PHONE_NUMBER_ID not set',
  })
  results.push({
    label: 'WA Token',
    status: process.env.WHATSAPP_TOKEN ? 'ok' : 'error',
    message: process.env.WHATSAPP_TOKEN ? `Set (${process.env.WHATSAPP_TOKEN.slice(0, 6)}…)` : 'WHATSAPP_TOKEN not set',
  })
  results.push({
    label: 'WA WABA ID',
    status: process.env.WHATSAPP_WABA_ID ? 'ok' : 'error',
    message: process.env.WHATSAPP_WABA_ID ? 'Configured' : 'WHATSAPP_WABA_ID not set',
  })
  results.push({
    label: 'Meta App Secret',
    status: process.env.META_APP_SECRET ? 'ok' : 'error',
    message: process.env.META_APP_SECRET ? 'Configured (webhook signature enabled)' : 'META_APP_SECRET not set — webhooks unprotected!',
  })
  results.push({
    label: 'Webhook Verify Token',
    status: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ? 'ok' : 'warn',
    message: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
      ? `Set: ${process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN}`
      : 'Using default "saleshub-webhook-verify" (change this!)',
  })

  // Live WA API connection test
  if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name&access_token=${process.env.WHATSAPP_TOKEN}`,
        { signal: AbortSignal.timeout(5000) }
      )
      const data = await res.json()
      if (data.error) {
        results.push({
          label: 'WA API Connection',
          status: 'error',
          message: `API error: ${data.error.message}`,
        })
      } else {
        results.push({
          label: 'WA API Connection',
          status: 'ok',
          message: `Connected — ${data.verified_name || ''} (${data.display_phone_number || 'N/A'})`,
        })
      }
    } catch (err) {
      results.push({
        label: 'WA API Connection',
        status: 'error',
        message: `Connection failed: ${apiError(err, 'timeout or network error')}`,
      })
    }
  }

  return results
}

async function checkGoogleSheets(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  results.push({ label: 'Google Client ID', status: process.env.GOOGLE_CLIENT_ID ? 'ok' : 'error', message: process.env.GOOGLE_CLIENT_ID ? 'Configured' : 'GOOGLE_CLIENT_ID not set' })
  results.push({ label: 'Google Client Secret', status: process.env.GOOGLE_CLIENT_SECRET ? 'ok' : 'error', message: process.env.GOOGLE_CLIENT_SECRET ? 'Configured' : 'GOOGLE_CLIENT_SECRET not set' })
  results.push({ label: 'Google Refresh Token', status: process.env.GOOGLE_REFRESH_TOKEN ? 'ok' : 'error', message: process.env.GOOGLE_REFRESH_TOKEN ? `Set (${process.env.GOOGLE_REFRESH_TOKEN.slice(0, 8)}…)` : 'GOOGLE_REFRESH_TOKEN not set' })
  results.push({ label: 'Leads Sheet ID', status: process.env.LEADS_SHEET_ID ? 'ok' : 'error', message: process.env.LEADS_SHEET_ID ? `${process.env.LEADS_SHEET_ID.slice(0, 10)}…` : 'LEADS_SHEET_ID not set' })
  results.push({ label: 'Hub Sheet ID', status: process.env.HUB_SHEET_ID ? 'ok' : 'warn', message: process.env.HUB_SHEET_ID ? `${process.env.HUB_SHEET_ID.slice(0, 10)}…` : 'HUB_SHEET_ID not set (users/quick-replies may not work)' })

  // Live Sheets connection test
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN && process.env.LEADS_SHEET_ID) {
    try {
      const { getLeads } = await import('@/lib/sheets')
      const leads = await getLeads()
      results.push({
        label: 'Sheets Connection',
        status: 'ok',
        message: `Connected — ${leads.length} leads found in sheet`,
      })
    } catch (err) {
      results.push({
        label: 'Sheets Connection',
        status: 'error',
        message: `Failed: ${apiError(err, 'Could not read sheet')}`,
      })
    }
  }

  return results
}

async function checkAuth(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  const jwtSecret = process.env.JWT_SECRET || ''
  if (!jwtSecret) {
    results.push({ label: 'JWT Secret', status: 'error', message: 'JWT_SECRET not set — login will not work!' })
  } else if (jwtSecret.length < 32) {
    results.push({ label: 'JWT Secret', status: 'warn', message: 'JWT_SECRET is set but short — use at least 32 chars' })
  } else {
    results.push({ label: 'JWT Secret', status: 'ok', message: `Set (${jwtSecret.length} chars)` })
  }

  results.push({
    label: 'CRON Secret',
    status: process.env.CRON_SECRET ? 'ok' : 'warn',
    message: process.env.CRON_SECRET ? 'Configured' : 'CRON_SECRET not set — auto-send cron is unprotected',
  })

  return results
}

async function checkDatabase(): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  try {
    const { getContacts } = await import('@/lib/db')
    const contacts = await getContacts()
    results.push({ label: 'Database', status: 'ok', message: `Connected — ${contacts.length} contacts` })
  } catch (err) {
    results.push({ label: 'Database', status: 'error', message: `Failed: ${apiError(err, 'DB connection error')}` })
  }

  // User count
  try {
    const { getUsers } = await import('@/lib/users')
    const users = await getUsers()
    results.push({
      label: 'Users',
      status: users.length > 0 ? 'ok' : 'warn',
      message: users.length > 0
        ? `${users.length} user${users.length !== 1 ? 's' : ''} (${users.filter(u => u.role === 'admin').length} admin)`
        : 'No users — run: npm run seed-admin',
    })
  } catch (err) {
    results.push({ label: 'Users', status: 'error', message: apiError(err, 'Could not read users') })
  }

  return results
}

function checkBrand(): CheckResult[] {
  return [
    {
      label: 'Brand Name',
      status: 'ok',
      message: process.env.NEXT_PUBLIC_BRAND_NAME || 'TBWX Sales Hub (default)',
    },
    {
      label: 'Brand Short',
      status: 'ok',
      message: process.env.NEXT_PUBLIC_BRAND_SHORT || 'TBWX (default)',
    },
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
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
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
        sections: {
          auth,
          whatsapp: wa,
          sheets,
          database: db,
          brand,
        },
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Check failed') }, { status: 500 })
  }
}
