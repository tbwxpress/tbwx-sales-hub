'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface PendingRequest {
  id: number
  lead_row: number
  lead_name: string
  lead_city: string
  due_date: string
  reason: string | null
  overdue: boolean
}

function dueLabel(d: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)
  if (d === today) return 'TODAY'
  if (d === tomorrowStr) return 'Tomorrow'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function UpdateRequestWidget() {
  const [requests, setRequests] = useState<PendingRequest[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/update-requests/mine')
      .then(r => r.json())
      .then(d => { if (d.success) setRequests(d.data) })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  if (!loaded || requests.length === 0) return null

  const anyOverdue = requests.some(r => r.overdue)
  return (
    <div className={`rounded-lg border p-4 mb-4 ${
      anyOverdue ? 'border-danger/60' : 'border-amber-500/40'
    } bg-card`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-text">
          🔔 Updates Requested by Sales Head <span className="text-dim text-xs ml-1">({requests.length} pending)</span>
        </h2>
      </div>
      <div className="space-y-1">
        {requests.map(r => (
          <Link
            key={r.id}
            href={`/leads/${r.lead_row}`}
            className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-elevated transition-colors"
          >
            <span className="text-xs text-text truncate">
              • {r.lead_name}{r.lead_city ? ` (${r.lead_city})` : ''}
            </span>
            <span className={`text-[10px] font-medium ${r.overdue ? 'text-danger' : 'text-amber-400'}`}>
              due {dueLabel(r.due_date)} →
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
