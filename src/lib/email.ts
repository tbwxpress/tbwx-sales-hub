import { google } from 'googleapis'

/**
 * RFC 2047 encoded-word for non-ASCII header values. Raw UTF-8 in a Subject
 * header renders as mojibake ("—" → "Ã¢Â€Â") in most clients — every sender
 * in this app must wrap subjects with this. ASCII passes through untouched.
 */
export function encodeSubject(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

function getGmail() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN })
  return google.gmail({ version: 'v1', auth })
}

interface SendEmailResult {
  success: boolean
  message_id?: string
  error?: string
}

// ─── Daily Digest Email ─────────────────────────────────────────────────

export interface DigestData {
  date: string
  newLeads: number
  hotLeads: number
  overdueTotal: number
  overdueByAgent: { agent: string; count: number }[]
  repliedWaiting: number
  oldestRepliedName?: string
  oldestRepliedHours?: number
  pipelineInterested: number
  pipelineNegotiation: number
  callsLogged: number
  conversionsToday: number
  topPriorityAction?: string
}

export async function sendDigestEmail(
  to: string,
  cc: string,
  data: DigestData
): Promise<SendEmailResult> {
  const senderName = 'TBWX Sales Hub'
  const senderEmail = process.env.EMAIL_SENDER || 'ai@tbwxpress.com'
  const subject = `TBWX Daily Briefing — ${data.date}`

  const overdueLines = data.overdueByAgent.length > 0
    ? data.overdueByAgent.map(a => `  ${a.agent}: ${a.count} overdue`).join('\n')
    : '  None — all clear!'

  const body = `TBWX Daily Briefing — ${data.date}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEW overnight: ${data.newLeads} leads${data.hotLeads > 0 ? ` (${data.hotLeads} HOT)` : ''}
OVERDUE follow-ups: ${data.overdueTotal}
${overdueLines}
REPLIED waiting: ${data.repliedWaiting} leads${data.oldestRepliedName ? ` (oldest: ${data.oldestRepliedName}, ${data.oldestRepliedHours}h ago)` : ''}
Pipeline: ${data.pipelineInterested} Interested, ${data.pipelineNegotiation} Negotiation
Calls logged today: ${data.callsLogged}
Conversions today: ${data.conversionsToday}

${data.topPriorityAction ? `TOP PRIORITY: ${data.topPriorityAction}` : ''}

— TBWX Sales Hub (sales.tbwxpress.com)
`

  const headers = [
    `From: ${senderName} <${senderEmail}>`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${encodeSubject(subject)}`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    body,
  ].join('\r\n')

  const encodedMessage = Buffer.from(headers)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  try {
    const gmail = getGmail()
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    })
    return { success: true, message_id: res.data.id || undefined }
  } catch (err) {
    console.error('[DigestEmail] Send error:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Email send failed' }
  }
}

export async function sendFranchiseEmail(
  toEmail: string,
  leadName: string,
): Promise<SendEmailResult> {
  if (!toEmail || !toEmail.includes('@')) {
    return { success: false, error: 'Invalid email address' }
  }

  const senderName = 'TBWX Sales Team'
  const senderEmail = process.env.EMAIL_SENDER || 'ai@tbwxpress.com'
  const subject = `${leadName}, your TBWX franchise overview`

  // Auto-sent to NEW leads on arrival. Show official pricing + deck only — never expose
  // promotional offers (e.g. early-bird) here, those go via targeted WhatsApp campaigns.
  const body = `Hi ${leadName},

Thank you for showing interest in TBWX (The Belgian Waffle Xpress) — India's fastest-growing waffle brand, with 40+ outlets across 22+ cities and growing.

The TBWX franchise:
- Investment: ₹4-7 lakhs total (franchise fee + setup, equipment, initial stock)
- Format: 100+ sq ft express outlet, delivery-first model
- Staff: 2-4 people
- Average ROI: 8-12 months
- Full support: brand kit, SOPs, training, supply chain, ongoing operations

View our franchise deck: https://tbwxpress.com/FranchiseDeck

Reply to this email or WhatsApp us to schedule a quick call: https://wa.me/917814605490?text=Hi%2C%20I%20received%20your%20franchise%20overview%20email



Thanks,
TBWX Sales Team
The Belgian Waffle Xpress
`

  const rawEmail = [
    `From: ${senderName} <${senderEmail}>`,
    `To: ${toEmail}`,
    `Subject: ${encodeSubject(subject)}`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    body,
  ].join('\r\n')

  const encodedMessage = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  try {
    const gmail = getGmail()
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    })

    return {
      success: true,
      message_id: res.data.id || undefined,
    }
  } catch (err) {
    console.error('[Email] Send error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Email send failed',
    }
  }
}

// ─── FBA Pack — Location Booking Confirmation ────────────────────────────────
// One fixed-format email from the Sales Team, addressed jointly to TBWX
// Management and the partner, CC gsquareco@. The machine composes it so the
// format cannot drift (the old agent-composed FBA emails arrived as three-line
// WhatsApp pastes with "signed copy.pdf" attachments).

export interface FbaAttachment {
  filename: string
  contentType: string
  data: Buffer
}

export interface FbaPackEmailInput {
  partnerName: string
  partnerEmail: string
  city: string
  address: string
  franchiseFee: string
  bookingAmount: string
  utr: string
  /** 0 = standard signing — NO royalty line appears at all. */
  waiveMonths: number
  remarks: string
  agentName: string
  agentPhone: string
  inviteUrl: string | null
  attachments: FbaAttachment[]
}

/** ~20MB practical cap under Gmail's 25MB raw limit (base64 inflates ~37%). */
export const FBA_MAX_TOTAL_BYTES = 18 * 1024 * 1024

export async function sendFbaPackEmail(input: FbaPackEmailInput): Promise<SendEmailResult> {
  // Sender: ai@ mailbox "dressed" via a verified send-as alias. Until the
  // bookings@ alias exists in Workspace, FBA_FROM_EMAIL stays ai@ — flipping
  // the env to bookings@tbwxpress.com needs no redeploy. Display name is the
  // team, reply flows to sales@.
  const senderName = 'TBWX Sales Team'
  const senderEmail = process.env.FBA_FROM_EMAIL || process.env.EMAIL_SENDER || 'ai@tbwxpress.com'
  const managementTo = process.env.FBA_MGMT_TO || 'tbwxpress@gmail.com'
  const cc = process.env.FBA_CC || 'gsquareco@tbwxpress.com'
  const replyTo = process.env.FBA_REPLY_TO || 'sales@tbwxpress.com'

  const subject = `The Belgian Waffle Xpress — Location Booking Confirmation | ${input.city}`

  const royaltyLine =
    input.waiveMonths > 0
      ? `Royalty            : 5% as per agreement — first ${input.waiveMonths} month${input.waiveMonths > 1 ? 's' : ''} waived\n`
      : ''
  const remarksLine = input.remarks ? `Notes              : ${input.remarks}\n` : ''
  const inviteBlock = input.inviteUrl
    ? `\nNext step for ${input.partnerName.split(' ')[0]}: create your TBWX account and track your outlet's journey — from paperwork to grand opening — here:\n${input.inviteUrl}\n`
    : ''

  const body = `To TBWX Management and ${input.partnerName},

The Sales Team is pleased to confirm the location booking below. The signed Franchise Booking Agreement (FBA) and payment proof are attached.

Partner             : ${input.partnerName}
Location            : ${input.city}
Shop address        : ${input.address}
Franchise fee       : ${input.franchiseFee}
Booking received    : ${input.bookingAmount}${input.utr ? ` (UTR: ${input.utr})` : ''}
${royaltyLine}${remarksLine}${inviteBlock}
Welcome to the TBWX family!

Warm regards,
${input.agentName}
The Belgian Waffle Xpress — Sales Team
${input.agentPhone ? `Phone: ${input.agentPhone}\n` : ''}Email: sales@tbwxpress.com
`

  const boundary = `fba${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const parts: string[] = [
    `From: ${senderName} <${senderEmail}>`,
    `To: ${managementTo}, ${input.partnerEmail}`,
    `Cc: ${cc}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${encodeSubject(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(body, 'utf8').toString('base64'),
  ]
  for (const att of input.attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.contentType}; name="${att.filename}"`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      att.data.toString('base64')
    )
  }
  parts.push(`--${boundary}--`)

  try {
    const gmail = getGmail()
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: Buffer.from(parts.join('\r\n'))
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, ''),
      },
    })
    return { success: true, message_id: res.data.id ?? undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Send failed' }
  }
}
