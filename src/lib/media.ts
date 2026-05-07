/**
 * WhatsApp media — download (inbound), upload (outbound), local storage.
 *
 * Inbound flow:
 *   1. Webhook receives a message with media: { id, mime_type, ... }
 *   2. We GET /{media_id} on the Graph API → returns a signed URL
 *   3. We GET that URL with our token → returns binary
 *   4. We save the binary to /app/data/media/{wa_message_id}.{ext}
 *   5. messages row stores media_path = relative filename
 *
 * Outbound flow:
 *   1. Agent uploads file via multipart form
 *   2. We POST to /{phone_number_id}/media (form-data) → returns { id }
 *   3. We POST to /{phone_number_id}/messages with type=image|video|...
 *      and image: { id }
 *
 * Files are served via /api/media/[wa_message_id] (auth required).
 */

import fs from 'fs'
import path from 'path'
import { WHATSAPP } from '@/config/client'

const MEDIA_DIR = process.env.MEDIA_DIR || path.resolve(process.cwd(), 'data', 'media')

export type WhatsAppMediaType = 'image' | 'video' | 'audio' | 'document' | 'sticker'

function ensureMediaDir() {
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true })
}

function extFromMime(mime: string, fallback = ''): string {
  if (!mime) return fallback
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/ogg': 'ogg',
    'audio/amr': 'amr',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
  }
  if (map[mime]) return map[mime]
  // Fall back to the part after '/' if it looks sane
  const tail = mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || ''
  return tail.slice(0, 6) || fallback
}

export interface DownloadResult {
  success: boolean
  path?: string  // relative filename inside MEDIA_DIR
  mime?: string
  size?: number
  error?: string
}

/**
 * Downloads a WhatsApp inbound media by media_id, saves to MEDIA_DIR,
 * returns the local file name (not the absolute path).
 */
export async function downloadInboundMedia(opts: {
  mediaId: string
  waMessageId: string
  mimeFromWebhook?: string
  filename?: string
}): Promise<DownloadResult> {
  try {
    if (!opts.mediaId) return { success: false, error: 'mediaId required' }
    if (!process.env.WHATSAPP_TOKEN) return { success: false, error: 'WHATSAPP_TOKEN missing' }
    ensureMediaDir()

    // 1. Get signed URL
    const metaRes = await fetch(`${WHATSAPP.apiBase}/${opts.mediaId}`, {
      headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}` },
    })
    if (!metaRes.ok) return { success: false, error: `Meta media meta ${metaRes.status}` }
    const meta = await metaRes.json() as { url?: string; mime_type?: string; file_size?: number }
    if (!meta.url) return { success: false, error: 'No url in media metadata' }
    const mime = meta.mime_type || opts.mimeFromWebhook || 'application/octet-stream'

    // 2. Download binary
    const binRes = await fetch(meta.url, {
      headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}` },
    })
    if (!binRes.ok) return { success: false, error: `Meta media bin ${binRes.status}` }
    const buf = Buffer.from(await binRes.arrayBuffer())

    // 3. Persist
    const ext = extFromMime(mime, 'bin')
    const safeId = opts.waMessageId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
    const filename = `${safeId}.${ext}`
    const fullPath = path.join(MEDIA_DIR, filename)
    fs.writeFileSync(fullPath, buf)

    return { success: true, path: filename, mime, size: buf.length }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * Reads a stored media file. Returns null if not found or unsafe path.
 */
export function readStoredMedia(filename: string): { buffer: Buffer; path: string } | null {
  try {
    ensureMediaDir()
    // Hard guard against path traversal
    const safe = path.basename(filename)
    if (!safe || safe.includes('..') || safe.startsWith('.')) return null
    const fullPath = path.join(MEDIA_DIR, safe)
    if (!fs.existsSync(fullPath)) return null
    const buffer = fs.readFileSync(fullPath)
    return { buffer, path: fullPath }
  } catch {
    return null
  }
}

/**
 * Uploads a file buffer to Meta /{phone_number_id}/media
 * Returns the media_id usable in subsequent messages call.
 */
export async function uploadMediaToMeta(opts: {
  buffer: Buffer
  filename: string
  mime: string
}): Promise<{ success: boolean; media_id?: string; error?: string }> {
  try {
    if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
      return { success: false, error: 'WhatsApp credentials missing' }
    }
    const form = new FormData()
    form.append('messaging_product', 'whatsapp')
    form.append('type', opts.mime)
    const blob = new Blob([new Uint8Array(opts.buffer)], { type: opts.mime })
    form.append('file', blob, opts.filename)

    const res = await fetch(`${WHATSAPP.apiBase}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}` },
      body: form,
    })
    const data = await res.json() as { id?: string; error?: { message?: string } }
    if (!res.ok || !data.id) {
      return { success: false, error: data.error?.message || `Upload failed (${res.status})` }
    }
    return { success: true, media_id: data.id }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * Sends a media message via WhatsApp Cloud API. Pass either media_id (preferred —
 * what uploadMediaToMeta returns) or link (a public URL that Meta will fetch).
 */
export async function sendMediaMessage(opts: {
  to: string
  type: WhatsAppMediaType
  media_id?: string
  link?: string
  caption?: string
  filename?: string  // for documents
}): Promise<{ success: boolean; message_id?: string; error?: string }> {
  try {
    if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
      return { success: false, error: 'WhatsApp credentials missing' }
    }
    if (!opts.media_id && !opts.link) {
      return { success: false, error: 'Provide media_id or link' }
    }

    const mediaPayload: Record<string, unknown> = {}
    if (opts.media_id) mediaPayload.id = opts.media_id
    if (opts.link) mediaPayload.link = opts.link
    if (opts.caption && opts.type !== 'sticker') mediaPayload.caption = opts.caption
    if (opts.type === 'document' && opts.filename) mediaPayload.filename = opts.filename

    const body = {
      messaging_product: 'whatsapp',
      to: opts.to,
      type: opts.type,
      [opts.type]: mediaPayload,
    }

    const res = await fetch(`${WHATSAPP.apiBase}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = await res.json() as { messages?: { id: string }[]; error?: { message?: string } }
    if (!res.ok || !data.messages?.[0]?.id) {
      return { success: false, error: data.error?.message || `Send failed (${res.status})` }
    }
    return { success: true, message_id: data.messages[0].id }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export function inferMediaTypeFromMime(mime: string): WhatsAppMediaType {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}
