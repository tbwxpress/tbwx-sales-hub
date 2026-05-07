import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import { uploadMediaToMeta, sendMediaMessage, inferMediaTypeFromMime } from '@/lib/media'
import { insertMessage, upsertContact, normalizePhone } from '@/lib/db'
import { logSentMessage } from '@/lib/sheets'

// POST /api/whatsapp/send-media
// multipart/form-data fields:
//   - file: the binary
//   - phone: recipient (E.164 or local)
//   - caption (optional): text caption (image/video/document only)
//   - contact_name (optional): for sheet log
//
// Pipeline:
//   1. Save file to /app/data/media/ for archival + future Inbox render
//   2. Upload to Meta /{phone_number_id}/media → get media_id
//   3. Send via /messages with media_id
//   4. Log in messages table + Google Sheet
const MEDIA_DIR = process.env.MEDIA_DIR || path.resolve(process.cwd(), 'data', 'media')
const MAX_BYTES = parseInt(process.env.MAX_MEDIA_BYTES || String(25 * 1024 * 1024), 10) // 25MB default

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const form = await req.formData()
    const file = form.get('file')
    const phoneRaw = String(form.get('phone') || '')
    const caption = String(form.get('caption') || '')
    const contactName = String(form.get('contact_name') || '')

    if (!(file instanceof Blob) || !file.size) {
      return NextResponse.json({ success: false, error: 'No file' }, { status: 400 })
    }
    if (!phoneRaw) {
      return NextResponse.json({ success: false, error: 'phone required' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: `File too large (max ${MAX_BYTES} bytes)` }, { status: 400 })
    }

    const phone = normalizePhone(phoneRaw)
    const mime = file.type || 'application/octet-stream'
    const mediaType = inferMediaTypeFromMime(mime)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filename = (file as any).name ? String((file as any).name) : `upload-${Date.now()}`
    const buffer = Buffer.from(await file.arrayBuffer())

    // 1. Upload to Meta
    const upload = await uploadMediaToMeta({ buffer, filename, mime })
    if (!upload.success || !upload.media_id) {
      return NextResponse.json({ success: false, error: upload.error || 'Upload to Meta failed' }, { status: 502 })
    }

    // 2. Send WhatsApp message
    const send = await sendMediaMessage({
      to: phone,
      type: mediaType,
      media_id: upload.media_id,
      caption: caption || undefined,
      filename: mediaType === 'document' ? filename : undefined,
    })
    if (!send.success || !send.message_id) {
      return NextResponse.json({ success: false, error: send.error || 'Send failed' }, { status: 502 })
    }

    // 3. Persist locally for Inbox render + future forwards
    let storedFilename = ''
    try {
      if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true })
      const safeId = send.message_id.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
      const ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8)
      storedFilename = `${safeId}.${ext}`
      fs.writeFileSync(path.join(MEDIA_DIR, storedFilename), buffer)
    } catch (e) {
      console.error('[send-media] local write failed:', e)
    }

    // 4. Ensure contact + insert message log
    await upsertContact(phone, { name: contactName || undefined })
    await insertMessage({
      phone,
      direction: 'sent',
      text: caption || `[${mediaType.charAt(0).toUpperCase()}${mediaType.slice(1)}]`,
      timestamp: new Date().toISOString(),
      sent_by: user.name,
      wa_message_id: send.message_id,
      status: 'sent',
      read: true,
      media_type: mediaType,
      media_id: upload.media_id,
      media_mime: mime,
      media_filename: filename,
      media_path: storedFilename,
    })

    // 5. Sheet log (best-effort)
    try {
      await logSentMessage({
        phone,
        name: contactName || phone,
        message: caption ? `[${mediaType}] ${caption}` : `[${mediaType}] ${filename}`,
        sent_by: user.name,
        wa_message_id: send.message_id,
        status: 'sent',
        template_used: '',
      })
    } catch { /* non-critical */ }

    return NextResponse.json({
      success: true,
      data: { message_id: send.message_id, media_id: upload.media_id, media_type: mediaType, stored: !!storedFilename },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
