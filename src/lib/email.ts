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
      ? `Royalty         : First ${input.waiveMonths} month${input.waiveMonths > 1 ? 's' : ''} waived` + '\n'
      : ''
  const remarksLine = input.remarks ? `Notes           : ${input.remarks}` + '\n' : ''
  const inviteBlock = input.inviteUrl
    ? '\n' + `Next step for ${input.partnerName.split(' ')[0]}: create your TBWX account and track your outlet's journey here:` + '\n' + input.inviteUrl + '\n'
    : ''

  // Plain-text fallback for old clients; the HTML part is what most people see.
  const textBody = `To TBWX Management and ${input.partnerName},

The Sales Team is pleased to confirm the location booking below. The signed Franchise Booking Agreement (FBA) and payment proof are attached.

Partner         : ${input.partnerName}
Location        : ${input.city}
Shop address    : ${input.address}
Franchise fee   : ${input.franchiseFee}
Booking received: ${input.bookingAmount}${input.utr ? ` (UTR: ${input.utr})` : ''}
${royaltyLine}${remarksLine}${inviteBlock}
Welcome to the TBWX family!

Warm regards,
${input.agentName}
The Belgian Waffle Xpress â€” Sales Team
${input.agentPhone ? `Phone: ${input.agentPhone}` + '\n' : ''}Email: sales@tbwxpress.com
`

  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const detailRow = (label: string, value: string) =>
    `<tr><td style="padding:8px 16px 8px 0;color:#8a7f70;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:8px 0;color:#1a1209;font-size:14px;font-weight:600;">${value}</td></tr>`

  const htmlRows = [
    detailRow('Partner', esc(input.partnerName)),
    detailRow('Location', esc(input.city)),
    detailRow('Shop address', esc(input.address)),
    detailRow('Franchise fee', esc(input.franchiseFee)),
    detailRow(
      'Booking received',
      `${esc(input.bookingAmount)}${input.utr ? ` <span style="color:#8a7f70;font-weight:400;">(UTR: ${esc(input.utr)})</span>` : ''}`
    ),
    input.waiveMonths > 0
      ? detailRow('Royalty', `First ${input.waiveMonths} month${input.waiveMonths > 1 ? 's' : ''} waived`)
      : '',
    input.remarks ? detailRow('Notes', esc(input.remarks)) : '',
  ].join('')

  const inviteHtml = input.inviteUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px;"><tr><td align="center" style="font-family:Arial,sans-serif;"><p style="margin:0 0 12px;color:#4a4036;font-size:13px;">Next step for ${esc(input.partnerName.split(' ')[0])} &mdash; create your TBWX account and follow your outlet&rsquo;s journey, from paperwork to grand opening:</p><a href="${input.inviteUrl}" style="display:inline-block;background:#F5C518;color:#1A1209;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 30px;border-radius:999px;border:2px solid #1A1209;box-shadow:3px 3px 0 #1A1209;">Create your TBWX account &rarr;</a></td></tr></table>`
    : ''

  const agentPhoneHtml = input.agentPhone
    ? `<p style="margin:6px 0 0;color:#4a4036;font-size:12px;">Phone: ${esc(input.agentPhone)}</p>`
    : ''

  const logoUrl = process.env.FBA_LOGO_URL || 'https://sop.tbwxpress.com/tbwx-logo.png'
  const htmlBody = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#FEF6D8;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FEF6D8;padding:28px 12px;"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFDF5;border:2px solid #1A1209;border-radius:14px;box-shadow:6px 6px 0 #1A1209;"><tr><td style="padding:24px 32px 0;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td width="56" style="vertical-align:middle;"><img src="${logoUrl}" width="48" height="48" alt="TBWX" style="display:block;border:0;" /></td><td style="vertical-align:middle;padding-left:12px;font-family:Georgia,serif;color:#1A1209;font-size:20px;font-weight:bold;letter-spacing:0.3px;">The Belgian Waffle Xpress</td></tr></table></td></tr><tr><td style="padding:16px 32px 0;"><span style="display:inline-block;background:#F5C518;border:2px solid #1A1209;border-radius:999px;padding:5px 16px;font-family:Arial,sans-serif;color:#1A1209;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">Location Booking Confirmation</span></td></tr><tr><td style="padding:22px 32px 0;font-family:Arial,sans-serif;"><p style="margin:0 0 14px;color:#1A1209;font-size:14px;">To <strong>TBWX Management</strong> and <strong>${esc(input.partnerName)}</strong>,</p><p style="margin:0 0 22px;color:#4a4036;font-size:14px;line-height:1.55;">The Sales Team is pleased to confirm the location booking below. The signed Franchise Booking Agreement (FBA) and payment proof are attached to this email.</p><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#FEF6D8;border:2px solid #1A1209;border-radius:10px;"><tr><td style="padding:16px 20px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family:Arial,sans-serif;">${htmlRows}</table></td></tr></table>${inviteHtml}<p style="margin:26px 0 0;color:#1A1209;font-size:14px;font-weight:600;">Welcome to the TBWX family! &#128591;</p></td></tr><tr><td style="padding:24px 32px 28px;font-family:Arial,sans-serif;"><div style="border-top:2px dashed #d8ccb2;padding-top:18px;"><p style="margin:0;color:#1A1209;font-size:14px;font-weight:bold;">${esc(input.agentName)}</p><p style="margin:2px 0 0;color:#8a7f70;font-size:12px;">The Belgian Waffle Xpress &mdash; Sales Team</p>${agentPhoneHtml}<p style="margin:2px 0 0;color:#4a4036;font-size:12px;">Email: sales@tbwxpress.com</p></div></td></tr></table><p style="font-family:Arial,sans-serif;color:#a89c8a;font-size:11px;margin:16px 0 0;">Sent by the TBWX Sales Team &middot; replies go to sales@tbwxpress.com</p></td></tr></table></body></html>`

  const mixed = `fba${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const alt = `alt${Math.random().toString(36).slice(2, 10)}`
  const parts: string[] = [
    `From: ${senderName} <${senderEmail}>`,
    `To: ${managementTo}, ${input.partnerEmail}`,
    `Cc: ${cc}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${encodeSubject(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    ``,
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    ``,
    `--${alt}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(textBody, 'utf8').toString('base64'),
    `--${alt}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(htmlBody, 'utf8').toString('base64'),
    `--${alt}--`,
  ]
  for (const att of input.attachments) {
    parts.push(
      `--${mixed}`,
      `Content-Type: ${att.contentType}; name="${att.filename}"`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      att.data.toString('base64')
    )
  }
  parts.push(`--${mixed}--`)

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
