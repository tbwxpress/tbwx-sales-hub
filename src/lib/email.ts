import { google } from 'googleapis'

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
    `Subject: ${subject}`,
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
  const subject = `${leadName}, Franchise Opportunity - The Belgian Waffle Xpress`

  const body = `Hi ${leadName},

Thank you for showing interest in TBWX (The Belgian Waffle Xpress).

We are by far the most franchise friendly waffle brand based out of Chandigarh.

We'd love to discuss this exciting franchise opportunity and how you can be a part of our growing dessert cafe network.

Please find our official franchise pitch deck, which outlines the brand vision, investment details, and support structure:
https://drive.google.com/drive/folders/1JPSdGLXL8WeeF3PVWMd93HQOKx5roJdN

Our Menu:
https://drive.google.com/drive/folders/1tFnHQGPiy5j1mr6ympqQGM1Rko_jfcgp

After reviewing it, feel free to share a convenient time for a quick call so we can take this discussion forward.

Thanks,
TBWX Sales Team
The Belgian Waffle Xpress
`

  const rawEmail = [
    `From: ${senderName} <${senderEmail}>`,
    `To: ${toEmail}`,
    `Subject: ${subject}`,
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
