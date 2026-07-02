import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

if (!process.env.JWT_SECRET) throw new Error('FATAL: JWT_SECRET environment variable is required')
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET)
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'saleshub_session'
const PUBLIC_PATHS = [
  '/login',
  // SOP cockpit SSO landing. It verifies the signed token itself, then mints a
  // native session — so it must be reachable without an existing session.
  // Additive; does not change any other gate.
  '/sso/callback',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/webhook/whatsapp',
  '/api/voice-agent/log',
  // Telephony webhooks — the provider (Twilio) calls these with no session.
  // Each enforces the CALL_WEBHOOK_SECRET shared key itself. The other
  // /api/calls/* routes (bridge, recording proxy, by-lead) stay session-gated.
  '/api/calls/twiml',
  '/api/calls/recording-status',
  '/api/calls/call-status',
  // Cron endpoints — they enforce CRON_SECRET bearer auth themselves OR fall back to admin session
  '/api/cron/auto-send',
  '/api/cron/sheet-backup',
  '/api/cron/cleanup-media',
  '/api/cron/meta-audience-sync',
  '/api/cron/meta-daily-report',
  '/api/cron/franchise-reactivation',
  '/api/cron/expire-delegations',
  // These four were built but never whitelisted, so the external scheduler's
  // Bearer CRON_SECRET calls died with 401 at the middleware — the drip engine
  // and reply alerts never ran in production. Each handler fails closed when
  // CRON_SECRET is unset.
  '/api/cron/drip',
  '/api/cron/reply-alert',
  '/api/cron/work-autobounce',
  '/api/cron/morning-briefing',
  '/api/cron/weekly-report',
  // Reactivation admin endpoint — enforces CRON_SECRET bearer auth itself
  '/api/admin/franchise-reactivation',
  // Public key is safe to expose; the SW fetches it before login on cold start.
  '/api/push/vapid-public-key',
  // Service worker file itself
  '/sw.js',
  '/manifest.webmanifest',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow static files and public assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.webp')
  ) {
    return NextResponse.next()
  }

  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    // Defense-in-depth admin gate: admin pages/APIs require the admin role claim.
    // Client-side guards remain as redundancy.
    //
    // Owner-private surfaces (Payment Followups, Commissions, Agreements) are
    // hidden + server-blocked for non-admins until the owner exposes them:
    //   - Pages → redirect non-admins to /dashboard
    //   - APIs  → return 403 JSON
    const ADMIN_PAGE_PREFIXES = ['/admin', '/payment-followups', '/commissions']
    const ADMIN_API_PREFIXES = ['/api/admin', '/api/payment-followups', '/api/commissions', '/api/agreements']
    const isAdminPage = ADMIN_PAGE_PREFIXES.some(p => pathname.startsWith(p))
    const isAdminApi = ADMIN_API_PREFIXES.some(p => pathname.startsWith(p))
    if (isAdminPage || isAdminApi) {
      if (payload.role !== 'admin') {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
        }
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
    }
    return NextResponse.next()
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ success: false, error: 'Session expired' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
