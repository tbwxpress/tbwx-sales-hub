'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'

interface Notification {
  id: number
  type: string
  title: string
  body: string
  ref_phone: string | null
  ref_lead_row: number | null
  read: boolean
  created_at: string
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z')).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?include_read=1&limit=20')
      const data = await res.json()
      if (data.success) {
        setItems(data.data.items || [])
        setUnread(data.data.unread || 0)
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchAll()
    const i = setInterval(fetchAll, 30_000)
    return () => clearInterval(i)
  }, [fetchAll])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function markOneRead(id: number) {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    setUnread(prev => Math.max(0, prev - 1))
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch { /* silent */ }
  }

  async function markAllRead() {
    setItems(prev => prev.map(n => ({ ...n, read: true })))
    setUnread(0)
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all: true }),
      })
    } catch { /* silent */ }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-md hover:bg-elevated transition-colors text-muted hover:text-text"
        aria-label="Notifications"
        title="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-accent text-[10px] font-bold flex items-center justify-center" style={{ color: '#1a1209' }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-card shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
            <span className="text-sm font-semibold text-text">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-[11px] text-accent hover:underline">Mark all read</button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-xs text-dim text-center">No notifications yet.</p>
            ) : (
              items.map(n => {
                const href = n.ref_lead_row ? `/leads/${n.ref_lead_row}` : '/inbox'
                return (
                  <Link
                    key={n.id}
                    href={href}
                    onClick={() => { markOneRead(n.id); setOpen(false) }}
                    className={`block px-4 py-3 border-b border-border/50 hover:bg-elevated transition-colors ${!n.read ? 'bg-accent/5' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm ${!n.read ? 'font-semibold text-text' : 'text-muted'}`}>{n.title}</p>
                      <span className="text-[10px] text-dim shrink-0">{timeAgo(n.created_at)}</span>
                    </div>
                    {n.body && <p className="text-xs text-dim mt-0.5 line-clamp-2">{n.body}</p>}
                  </Link>
                )
              })
            )}
          </div>

          <div className="px-4 py-2 border-t border-border">
            <Link href="/today" onClick={() => setOpen(false)} className="text-xs text-accent hover:underline">
              Open Today &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
