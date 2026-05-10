/**
 * Web Push send pipeline (Wave C).
 *
 * Pairs with public/sw.js push handler. Subscriptions are stored in
 * push_subscriptions; this module fans out a payload to every subscription
 * the target user has registered (laptop + phone is common).
 *
 * Stale subscriptions (410/404 from the push service) are deleted automatically
 * so the table stays clean.
 */

import webpush from 'web-push'
import { getPushSubscriptionsForUser, deletePushSubscription, touchPushSubscription } from './db'

let _vapidConfigured = false

function configureVapid(): boolean {
  if (_vapidConfigured) return true
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'
  if (!pub || !priv) {
    console.warn('[push] VAPID keys not configured — push notifications disabled')
    return false
  }
  webpush.setVapidDetails(subject, pub, priv)
  _vapidConfigured = true
  return true
}

export interface PushPayload {
  title: string
  body?: string
  url?: string
  icon?: string
  badge?: string
  tag?: string
}

/**
 * Send a Web Push notification to every subscription a user has.
 * Returns { sent, failed } counts. Never throws.
 */
export async function sendPushTo(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!configureVapid()) return { sent: 0, failed: 0 }

  let subs
  try {
    subs = await getPushSubscriptionsForUser(userId)
  } catch (err) {
    console.error('[push] failed to load subs for', userId, err)
    return { sent: 0, failed: 0 }
  }
  if (subs.length === 0) return { sent: 0, failed: 0 }

  const json = JSON.stringify({
    title: payload.title,
    body: payload.body ?? '',
    url: payload.url ?? '/today',
    icon: payload.icon ?? '/icon-192.png',
    badge: payload.badge ?? '/icon-192.png',
    tag: payload.tag ?? 'tbwx-notification',
  })

  let sent = 0
  let failed = 0

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        json,
      )
      sent++
      // Best-effort touch — don't block on success path
      touchPushSubscription(s.endpoint).catch(() => {})
    } catch (err: unknown) {
      failed++
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        // Subscription is dead — clean up so we don't keep retrying.
        deletePushSubscription(s.endpoint).catch(() => {})
      } else {
        console.error('[push] send failed for', s.endpoint.slice(0, 64), 'status:', status, err)
      }
    }
  }))

  return { sent, failed }
}

export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
}
