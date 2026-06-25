// GET /sso/callback?token=<jwt>&redirect=<path>
//
// Relying-party endpoint for the SOP -> Sales Hub cockpit SSO bridge. Verifies
// the short-lived signed token minted by sop.tbwxpress.com/sso/authorize, then
// issues Sales Hub's OWN native session (the same createSession + cookie the
// password login uses). FAIL-CLOSED: only an existing, active ADMIN may enter —
// we NEVER auto-provision a user. Purely additive: the existing
// /api/auth/login + every agent/voice/webhook/cron path are untouched.
//
// Redirects use RELATIVE Location headers: behind Traefik, req.url's origin is
// the container's internal address, so absolute URLs from it would be wrong.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSession } from '@/lib/auth'
import { getUserByEmail } from '@/lib/users'
import { verifySso } from '@/lib/sso/jwt'
import { consumeJti } from '@/lib/sso/nonce'

export const dynamic = 'force-dynamic'

/** Only allow same-site relative redirects (no open redirect). Default /admin. */
function safeRedirect(raw: string | null): string {
  if (!raw) return '/admin'
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/admin'
  return raw
}

/** 307 redirect with a RELATIVE Location (proxy-safe). */
function redirectTo(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path } })
}
const fail = (reason: string) => redirectTo(`/login?sso=${reason}`)

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') ?? ''
  const dest = safeRedirect(url.searchParams.get('redirect'))

  const secret = process.env.SSO_JWT_SECRET
  if (!secret) return fail('unavailable')

  const claims = verifySso(token, secret, 'saleshub')
  if (!claims) return fail('invalid')
  if (!consumeJti(claims.jti, claims.exp)) return fail('replay')

  // FAIL-CLOSED authorization. The SOP role claim is IGNORED for authz; we match
  // strictly by email against Sales Hub's own user table and require an active
  // admin. A SOP token for any non-admin (or unknown email) is rejected.
  const email = (claims.email ?? '').trim()
  if (!email) return fail('denied')
  const user = await getUserByEmail(email)
  if (!user || !user.active || user.role !== 'admin') return fail('denied')

  // Issue Sales Hub's OWN native session — identical to the password-login path.
  await createSession({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    can_assign: user.can_assign,
    can_edit_leads: user.can_edit_leads,
    is_telecaller: user.is_telecaller,
  })

  // Mark that this session arrived via the SOP bridge so the header can show a
  // "Back to SOP" link (Phase 2). Direct password logins never get this cookie.
  const sopUrl = process.env.SOP_URL || 'https://sop.tbwxpress.com'
  const cookieStore = await cookies()
  cookieStore.set('saleshub_from_sop', sopUrl, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })

  return redirectTo(dest)
}
