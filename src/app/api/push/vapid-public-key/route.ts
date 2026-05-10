import { NextResponse } from 'next/server'

// GET /api/push/vapid-public-key — returns the public VAPID key the browser
// uses when subscribing. Public by design (the private key never leaves the server).

export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
  if (!key) {
    return NextResponse.json(
      { success: false, error: 'Push notifications are not configured on the server.' },
      { status: 503 },
    )
  }
  return NextResponse.json({ success: true, publicKey: key })
}
