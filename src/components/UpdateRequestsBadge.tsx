'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useVisiblePolling } from '@/lib/use-visible-polling'

export default function UpdateRequestsBadge() {
  const [count, setCount] = useState(0)
  const [role, setRole] = useState('')

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d.success) setRole(d.data.role) })
      .catch(() => {})
  }, [])

  // Admin-only badge — poll only while tab is visible. 60s cadence preserved
  // (audit said keep, and it's a soft notification badge).
  const tick = useCallback(() => {
    fetch('/api/update-requests/mark-seen')
      .then(r => r.json())
      .then(d => { if (d.success) setCount(d.data.count) })
      .catch(() => {})
  }, [])
  useVisiblePolling(tick, 60_000, role === 'admin')

  if (role !== 'admin') return null

  return (
    <Link
      href="/admin/update-requests"
      onClick={() => { fetch('/api/update-requests/mark-seen', { method: 'POST' }); setCount(0) }}
      className="relative text-caption text-dim hover:text-text transition-colors"
    >
      Update Requests
      {count > 0 && (
        <span className="absolute -top-2 -right-3 bg-accent text-bg text-caption font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  )
}
