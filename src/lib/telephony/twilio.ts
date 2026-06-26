// Twilio implementation of TelephonyProvider.
//
// Uses the Twilio REST API directly via fetch (no SDK / no extra dependency).
// The bridge works in two hops:
//   1. We create a Call to the AGENT's phone (From = our Twilio number).
//   2. When the agent answers, Twilio fetches our /api/calls/twiml endpoint,
//      which returns <Dial record=...> to the LEAD — recording the bridge.
//
// Trial-account note: a trial Twilio account can only call VERIFIED numbers and
// presents a US caller id. The code is identical for a paid/India account — only
// the env values change.

import type { RecordedBridgeArgs, TelephonyProvider } from './index'

const TWILIO_API = 'https://api.twilio.com/2010-04-01'

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

export class TwilioProvider implements TelephonyProvider {
  readonly name = 'twilio'

  async startRecordedBridge(args: RecordedBridgeArgs): Promise<{ callSid: string }> {
    const sid = env('TWILIO_ACCOUNT_SID')
    const token = env('TWILIO_AUTH_TOKEN')
    const from = env('TWILIO_PHONE_NUMBER')
    const secret = process.env.CALL_WEBHOOK_SECRET || ''

    const twimlUrl = new URL(`${args.callbackBaseUrl}/api/calls/twiml`)
    twimlUrl.searchParams.set('lead', args.leadPhone)
    twimlUrl.searchParams.set('ref', args.ref)
    if (secret) twimlUrl.searchParams.set('k', secret)

    const statusUrl = new URL(`${args.callbackBaseUrl}/api/calls/call-status`)
    statusUrl.searchParams.set('ref', args.ref)
    if (secret) statusUrl.searchParams.set('k', secret)

    const body = new URLSearchParams({
      To: args.agentPhone,
      From: from,
      Url: twimlUrl.toString(),
      Method: 'GET',
      StatusCallback: statusUrl.toString(),
      StatusCallbackMethod: 'POST',
    })
    // status_callback_event repeats — append after construction
    body.append('StatusCallbackEvent', 'completed')

    const res = await fetch(`${TWILIO_API}/Accounts/${sid}/Calls.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(`Twilio call failed (${res.status}): ${json?.message || JSON.stringify(json)}`)
    }
    return { callSid: json.sid as string }
  }
}

/** Fetch a Twilio recording's audio as a Buffer (Basic-auth protected). */
export async function fetchTwilioRecording(recordingUrl: string): Promise<Buffer> {
  const sid = env('TWILIO_ACCOUNT_SID')
  const token = env('TWILIO_AUTH_TOKEN')
  // Twilio recording URLs serve .mp3 when the extension is appended.
  const url = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`
  const res = await fetch(url, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') },
  })
  if (!res.ok) throw new Error(`Failed to fetch recording (${res.status})`)
  const arr = await res.arrayBuffer()
  return Buffer.from(arr)
}
