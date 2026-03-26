/**
 * Returns a safe error message for API responses.
 * In production: generic message to avoid leaking internals.
 * In development: full error message for debugging.
 */
export function apiError(err: unknown, fallback = 'Internal server error'): string {
  if (process.env.NODE_ENV === 'production') return fallback
  return err instanceof Error ? err.message : fallback
}
