// Provider-agnostic telephony layer.
//
// Today this is backed by Twilio (trial). Tomorrow it can be TeleCMI / Exotel
// without touching any caller: implement the TelephonyProvider interface in a
// new file and switch on TELEPHONY_PROVIDER. Everything downstream of this
// boundary (recording storage, transcription, AI scoring, the lead-page UI) is
// provider-independent.

import { TwilioProvider } from './twilio'

export interface RecordedBridgeArgs {
  /** The telecaller's own phone — rung first. E.164, e.g. +919876543210 */
  agentPhone: string
  /** The lead's phone — dialled once the agent answers. E.164. */
  leadPhone: string
  /** Lead display name (optional, used only for logging). */
  leadName?: string
  /** Public base URL Twilio's webhooks call back to (no trailing slash). */
  callbackBaseUrl: string
  /** Opaque correlation id we round-trip through the webhooks. */
  ref: string
}

export interface TelephonyProvider {
  readonly name: string
  /**
   * Place a recorded bridge: ring the agent, then dial the lead and record the
   * conversation. Returns the provider's call id (call_sid) for correlation.
   */
  startRecordedBridge(args: RecordedBridgeArgs): Promise<{ callSid: string }>
}

let _provider: TelephonyProvider | null = null

export function getTelephonyProvider(): TelephonyProvider {
  if (_provider) return _provider
  const which = (process.env.TELEPHONY_PROVIDER || 'twilio').toLowerCase()
  switch (which) {
    case 'twilio':
      _provider = new TwilioProvider()
      break
    // case 'telecmi': _provider = new TeleCMIProvider(); break   // ← drop-in later
    default:
      throw new Error(`Unknown TELEPHONY_PROVIDER: ${which}`)
  }
  return _provider
}

/** Normalize an Indian number to E.164 (+91XXXXXXXXXX). Leaves +-prefixed
 * international numbers untouched. Rejects free-text input that merely happens
 * to contain digits. */
export function toE164India(phone: string): string {
  const trimmed = String(phone || '').trim()
  // Only phone-ish characters allowed — guards against "call me at 9876543210".
  if (!/^[+()\d\s-]+$/.test(trimmed)) throw new Error(`Not a phone number: "${phone}"`)
  if (trimmed.startsWith('+')) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  const last10 = digits.slice(-10)
  if (last10.length !== 10) throw new Error(`Cannot format phone to E.164: "${phone}"`)
  return `+91${last10}`
}

/** Fail-closed check for the public telephony webhooks. If CALL_WEBHOOK_SECRET
 * is unset, NO request is authorized (prevents silently-open webhooks). */
export function webhookSecretOk(searchParams: URLSearchParams): boolean {
  const secret = process.env.CALL_WEBHOOK_SECRET
  if (!secret) return false
  return searchParams.get('k') === secret
}
