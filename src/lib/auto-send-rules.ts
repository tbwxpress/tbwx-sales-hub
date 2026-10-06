/**
 * Decision rules for the auto-send cron (src/app/api/cron/auto-send). They
 * live here, not in the route, so they can be unit-tested: a Next.js route
 * module may only export its HTTP handlers.
 */

/** Failed opt-in sends allowed per enquiry before auto-send gives up and alerts the manager. */
export const MAX_OPTIN_ATTEMPTS = 3

/** Someone who enquires again inside this many days does not get a second opt-in. */
export const OPTIN_RESEND_WINDOW_DAYS = 7

/**
 * Auto-send fires the FIRST touch on a lead nobody has handled yet. Only NEW
 * qualifies (or a blank status on the legacy sheet tab, which means the same).
 * Every other status, including ARCHIVED and stages an admin created, is a
 * place in someone's pipeline that auto-send would wrongly reset to DECK_SENT.
 * Merged duplicates are copies of another lead and are never messaged.
 */
export function isAutoSendEligible(lead: { lead_status?: string; merged_into?: number | null }): boolean {
  if (lead.merged_into) return false
  const status = String(lead.lead_status || '').trim().toUpperCase()
  return status === '' || status === 'NEW'
}

const DAY_MS = 86_400_000

// Message timestamps are ISO (UTC); Meta enquiry times carry an offset, so
// compare as instants. Unparseable values fall back to a string compare.
function atOrAfter(ts: string, cutoff: string): boolean {
  const a = Date.parse(ts)
  const b = Date.parse(cutoff)
  if (Number.isFinite(a) && Number.isFinite(b)) return a >= b
  return ts >= cutoff
}

interface SentLite {
  template_used?: unknown
  status?: unknown
  timestamp?: unknown
}

/**
 * Has `template` already gone to this phone, for the purposes of the current
 * enquiry? True when it was sent:
 *   - after the latest enquiry (the per-enquiry rule: a repeat months later
 *     gets the message again), or
 *   - within the last OPTIN_RESEND_WINDOW_DAYS, whatever the enquiry, so a
 *     person who submits the form twice in a week gets it once, not twice.
 * With no enquiry cutoff, any earlier send counts.
 */
export function templateAlreadySent(
  sent: SentLite[],
  template: string,
  opts: { enquiryCutoff?: string; now?: Date; ignoreFailed?: boolean } = {},
): boolean {
  const cutoff = String(opts.enquiryCutoff || '')
  const windowStart = new Date((opts.now ?? new Date()).getTime() - OPTIN_RESEND_WINDOW_DAYS * DAY_MS).toISOString()
  return sent.some(m => {
    if (m.template_used !== template) return false
    if (opts.ignoreFailed && m.status === 'failed') return false
    if (!cutoff) return true
    const ts = String(m.timestamp || '')
    return atOrAfter(ts, cutoff) || atOrAfter(ts, windowStart)
  })
}

/** A WhatsApp Cloud API message id, as opposed to one of our placeholders. */
export function isRealWaMessageId(id: string | undefined | null): boolean {
  return String(id || '').startsWith('wamid.')
}

/**
 * What to write to a lead's wa_message_id when auto-send marks it contacted,
 * or undefined to leave the column alone. A placeholder ('already-sent',
 * 'deck-already-sent') must never replace a real WhatsApp id: that id is how
 * delivery status and replies are traced back to the send.
 */
export function waMessageIdToWrite(existing: string | undefined, incoming: string): string | undefined {
  if (isRealWaMessageId(incoming)) return incoming
  return isRealWaMessageId(existing) ? undefined : incoming
}
