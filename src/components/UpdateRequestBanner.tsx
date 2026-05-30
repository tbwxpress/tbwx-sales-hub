'use client'
import { useEffect, useState } from 'react'
import { IST, istToday } from '@/lib/format'

interface PendingRequest {
  id: number
  due_date: string
  reason: string | null
  agent_name: string
}

interface Props {
  leadRow: number
}

export default function UpdateRequestBanner({ leadRow }: Props) {
  const [request, setRequest] = useState<PendingRequest | null>(null)

  useEffect(() => {
    fetch(`/api/update-requests/for-lead/${leadRow}`)
      .then(r => r.json())
      .then(d => { if (d.success) setRequest(d.data) })
      .catch(() => {})
  }, [leadRow])

  if (!request) return null

  const isOverdue = request.due_date < istToday()
  const dueLabel = new Date(request.due_date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: IST,
  })

  return (
    <div
      className={`rounded-md border p-3 mb-3 ${
        isOverdue
          ? 'bg-danger/10 border-danger/40 text-danger'
          : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
      }`}
    >
      <div className="text-xs font-semibold">
        🟡 Sales Head requested an update on this lead — due {dueLabel}{isOverdue ? ' (OVERDUE)' : ''}.
      </div>
      {request.reason && (
        <div className="text-[11px] italic mt-1 text-current/80">&quot;{request.reason}&quot;</div>
      )}
      <div className="text-[10px] mt-1.5 text-current/70">
        Add a note below to answer this request.
      </div>
    </div>
  )
}
