import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import { uploadMediaToMeta, sendMediaMessage, inferMediaTypeFromMime } from '@/lib/media'
import { insertMessage, upsertContact, normalizePhone } from '@/lib/db'
import { logSentMessage } from '@/lib/sheets'
import { createClient } from '@libsql/client'

// POST /api/whatsapp/forward-media
// Body: { source_wa_message_id: string, to_phone: string, caption?: string, contact_name?: string }
// Re-uploads the locally-stored media to Meta (since Meta media_ids can expire)
// and sends to the new recipient. Logs as a fresh sent message.
const MEDIA_DIR = process.env.MEDIA_DIR || path.resolve(process.cwd(), 'data', 'media')

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const { source_wa_message_id, to_phone, caption, contact_name } = await req.json()
    if (!source_wa_message_id || !to_phone) {
      return NextResponse.json({ success: false, error: 'source_wa_message_id and to_phone required' }, { status: 400 })
    }

    // Look up the source message
    const dbUrl = process.env.TURSO_DATABASE_URL || 'file:data/inbox.db'
    const authToken = process.env.TURSO_AUTH_TOKEN || undefined
    const db = createClient({ url: dbUrl, authToken })
    const r = await db.execute({
      sql: `SELECT media_type, media_mime, media_filename, media_path
            FROM messages WHERE wa_message_id = ? LIMIT 1`,
      args: [source_wa_message_id],
    })
    if (r.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'source message not found' }, { status: 404 })
    }
    const row = r.rows[0]
    const mediaPath = String(row.media_path || '')
    const mime = String(row.media_mime || 'application/octet-stream')
    const filename = String(row.media_filename || mediaPath || 'forward')
    if (!mediaPath) {
      return NextResponse.json({ success: false, error: 'source has no media' }, { status: 400 })
    }

    // Read local file (Meta media_id may have expired so we always re-upload)
    const safe = path.basename(mediaPath)
    const fullPath = path.join(MEDIA_DIR, safe)
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ success: false, error: 'media file expired or removed' }, { status: 410 })
    }
    const buffer = fs.readFileSync(fullPath)

    // Re-upload to Meta and send
    const upload = await uploadMediaToMeta({ buffer, filename, mime })
    if (!upload.success || !upload.media_id) {
      return NextResponse.json({ success: false, error: upload.error || 'Re-upload failed' }, { status: 502 })
    }
    const mediaType = inferMediaTypeFromMime(mime)
    const send = await sendMediaMessage({
      to: normalizePhone(to_phone),
      type: mediaType,
      media_id: upload.media_id,
      caption: typeof caption === 'string' && caption.trim() ? caption.trim() : undefined,
      filename: mediaType === 'document' ? filename : undefined,
    })
    if (!send.success || !send.message_id) {
      return NextResponse.json({ success: false, error: send.error || 'Send failed' }, { status: 502 })
    }

    // Save a fresh local copy keyed by the new wa_message_id so future
    // renders + forwards work for the new bubble too
    let newStored = ''
    try {
      const safeId = send.message_id.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
      const ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8)
      newStored = `${safeId}.${ext}`
      fs.writeFileSync(path.join(MEDIA_DIR, newStored), buffer)
    } catch (e) {
      console.error('[forward-media] copy write failed:', e)
    }

    const recipient = normalizePhone(to_phone)
    await upsertContact(recipient, { name: contact_name || undefined })
    await insertMessage({
      phone: recipient,
      direction: 'sent',
      text: caption ? String(caption) : `[Forwarded ${mediaType}]`,
      timestamp: new Date().toISOString(),
      sent_by: user.name,
      wa_message_id: send.message_id,
      status: 'sent',
      read: true,
      media_type: mediaType,
      media_id: upload.media_id,
      media_mime: mime,
      media_filename: filename,
      media_path: newStored,
    })

    try {
      await logSentMessage({
        phone: recipient,
        name: contact_name || recipient,
        message: `[Forwarded ${mediaType}] ${filename}`,
        sent_by: user.name,
        wa_message_id: send.message_id,
        status: 'sent',
        template_used: '',
      })
    } catch { /* non-critical */ }

    return NextResponse.json({
      success: true,
      data: { message_id: send.message_id, media_type: mediaType, to: recipient },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
