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
