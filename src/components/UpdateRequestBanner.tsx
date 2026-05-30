'use client'
import { useEffect, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import Badge from './ui/Badge'
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
      <div className="flex items-center gap-2 text-body font-semibold">
        <CircleAlert className="w-4 h-4 shrink-0" strokeWidth={2} />
        <span className="flex-1">
          Sales Head requested an update on this lead — due {dueLabel}.
        </span>
        {isOverdue && <Badge tone="lost">Overdue</Badge>}
      </div>
      {request.reason && (
        <div className="text-caption italic mt-1 text-current/80">&quot;{request.reason}&quot;</div>
      )}
      <div className="text-caption mt-1.5 text-current/70">
        Add a note below to answer this request.
      </div>
    </div>
  )
}
