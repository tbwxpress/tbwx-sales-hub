// Verifier for the SOP cockpit SSO bridge (Sales Hub is a relying party).
// Mirror of the signer in the SOP app (tbwx-ops/src/lib/sso/jwt.ts): same shared
// SSO_JWT_SECRET, HS256, short-lived (~60s), single-use (jti), audience-bound.
// We only VERIFY here — Sales Hub never mints SSO tokens.

import { createHmac, timingSafeEqual } from 'node:crypto'

export type SsoClaims = {
  sub: string
  email?: string | null
  name?: string | null
  role?: string | null
  outletId?: string | null
  outletCode?: string | null
  actingStaffId?: string | null
  aud: string
  jti: string
  iat: number
  exp: number
}

export function verifySso(token: string, secret: string, expectedAud: string): SsoClaims | null {
  if (!token || !secret) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, b, sig] = parts
  const expected = createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url')
  const a = Buffer.from(sig)
  const e = Buffer.from(expected)
  if (a.length !== e.length || !timingSafeEqual(a, e)) return null
  let claims: SsoClaims
  try {
    claims = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  const now = Math.floor(Date.now() / 1000)
  if (typeof claims.exp !== 'number' || claims.exp < now) return null
  if (claims.aud !== expectedAud) return null
  if (!claims.sub || !claims.jti) return null
  return claims
}
