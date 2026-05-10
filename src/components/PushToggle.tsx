'use client'

import { useEffect, useState, useCallback } from 'react'

type State = 'unsupported' | 'denied' | 'idle' | 'subscribed' | 'loading' | 'configuring'

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const buf = new ArrayBuffer(raw.length)
  const out = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export default function PushToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>('loading')

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported'); return
    }
    if (Notification.permission === 'denied') { setState('denied'); return }
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setState(sub ? 'subscribed' : 'idle')
    } catch {
      setState('idle')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function enable() {
    setState('configuring')
    try {
      if (Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'idle'); return }
      }
      const keyRes = await fetch('/api/push/vapid-public-key')
      const keyData = await keyRes.json()
      if (!keyData.success || !keyData.publicKey) {
        alert('Push notifications are not configured on the server yet.')
        setState('idle'); return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      })
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Subscribe failed')
      setState('subscribed')
    } catch (err) {
      console.error('[push] enable failed', err)
      alert('Could not enable notifications. Please try again.')
      setState('idle')
    }
  }

  async function disable() {
    setState('configuring')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setState('idle')
    } catch (err) {
      console.error('[push] disable failed', err)
      setState('idle')
    }
  }

  if (state === 'loading' || state === 'unsupported') return null

  if (state === 'denied') {
    return (
      <span className={compact ? 'text-[10px] text-dim' : 'text-xs text-dim'}>
        Push blocked — change in browser settings
      </span>
    )
  }

  const baseBtn = 'rounded-md border border-border transition-colors disabled:opacity-50'
  const sizing = compact ? 'text-[11px] px-2 py-1' : 'text-xs px-2.5 py-1.5'

  if (state === 'subscribed') {
    return (
      <button
        onClick={disable}
        disabled={state !== 'subscribed'}
        className={`${baseBtn} ${sizing} text-muted hover:text-text hover:bg-elevated`}
        title="Push notifications are on for this device"
      >
        🔔 Push on
      </button>
    )
  }

  return (
    <button
      onClick={enable}
      disabled={state === 'configuring'}
      className={`${baseBtn} ${sizing} text-accent hover:bg-accent/10`}
      title="Get a notification when leads reply or get assigned to you"
    >
      {state === 'configuring' ? '...' : 'Enable push'}
    </button>
  )
}
