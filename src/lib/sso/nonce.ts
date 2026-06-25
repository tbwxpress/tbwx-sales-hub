// Single-use guard for SSO token jti's. In-memory (module-scoped) — sufficient
// for Sales Hub's single Docker container: a replay must reuse the same jti
// within the token's ~60s lifetime AND hit the same process. Tokens are also
// exp-bound, so this just closes the within-window replay gap.

const consumed = new Map<string, number>() // jti -> expiry epoch ms

export function consumeJti(jti: string, expEpochSec: number): boolean {
  const now = Date.now()
  // Opportunistic cleanup of expired entries.
  if (consumed.size > 500) {
    for (const [k, exp] of consumed) if (exp <= now) consumed.delete(k)
  }
  if (consumed.has(jti)) return false // already used -> reject
  consumed.set(jti, expEpochSec * 1000)
  return true
}
