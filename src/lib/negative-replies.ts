/**
 * Negative-reply detector for the WhatsApp inbox triage.
 *
 * Conservative by design: we match meaningful opt-out / disinterest phrases,
 * NOT a bare "no" (too many false positives — "no problem", "no worries", a
 * phone number with "no." in it, etc.). Used to surface a one-click
 * "Mark Lost?" suggestion in the inbox and to alert the lead owner from the
 * webhook. It must never auto-change a lead's status on its own.
 */

// Curated phrase list. All lowercase; matching is case-insensitive.
// Keep phrases specific enough that a normal positive reply won't trip them.
export const NEGATIVE_REPLY_PHRASES: readonly string[] = [
  'not interested',
  'no longer interested',
  "don't call",
  'do not call',
  'dont call',
  'stop calling',
  'stop messaging',
  'stop texting',
  'unsubscribe',
  'remove me',
  'remove my number',
  'remove my contact',
  'wrong number',
  'not looking',
  "i'm not looking",
  'no thanks',
  'no thank you',
  'already bought',
  'already purchased',
  'already taken',
  'already done',
  'do not contact',
  "don't contact",
  'dont contact',
  'do not message',
  "don't message",
  'leave me alone',
  'not required',
  'no need',
  'not needed',
  'please stop',
  'stop sending',
  'opt out',
  'opt-out',
] as const

/**
 * Returns true when `text` contains a curated negative-reply phrase.
 * Case-insensitive, whitespace-normalized substring match. Conservative:
 * never matches a bare "no".
 */
export function isNegativeReply(text: string): boolean {
  if (!text) return false
  // Lowercase and collapse runs of whitespace so "stop   calling" still matches.
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!normalized) return false
  return NEGATIVE_REPLY_PHRASES.some(phrase => normalized.includes(phrase))
}
