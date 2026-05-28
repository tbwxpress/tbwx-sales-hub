'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function UpdateRequestsBadge() {
  const [count, setCount] = useState(0)
  const [role, setRole] = useState('')

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d.success) setRole(d.data.role) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (role !== 'admin') return
    const tick = () => fetch('/api/update-requests/mark-seen')
      .then(r => r.json())
      .then(d => { if (d.success) setCount(d.data.count) })
      .catch(() => {})
    tick()
    const i = setInterval(tick, 60000)
    return () => clearInterval(i)
  }, [role])

  if (role !== 'admin') return null

  return (
    <Link
      href="/admin/update-requests"
      onClick={() => { fetch('/api/update-requests/mark-seen', { method: 'POST' }); setCount(0) }}
      className="relative text-xs text-dim hover:text-text"
    >
      Update Requests
      {count > 0 && (
        <span className="absolute -top-2 -right-3 bg-accent text-bg text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  )
}
