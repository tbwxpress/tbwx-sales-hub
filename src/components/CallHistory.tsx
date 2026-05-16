'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatTime } from '@/lib/format'

interface CallLog {
  id: number
  phone: string
  duration: string
  outcome: string
  notes: string
  logged_by: string
  created_at: string
}

interface CallHistoryProps {
  phone: string
  refreshKey?: number
}

export default function CallHistory({ phone, refreshKey = 0 }: CallHistoryProps) {
  const [callLogs, setCallLogs] = useState<CallLog[]>([])

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(phone)}/calls`)
      const data = await res.json()
      if (data.success) setCallLogs(data.data || [])
    } catch { /* silent */ }
  }, [phone])

  useEffect(() => { fetchLogs() }, [fetchLogs, refreshKey])

  if (callLogs.length === 0) return null

  return (
    <div className="mt-4 pt-3 border-t border-border/50">
      <span className="text-[10px] text-dim uppercase tracking-wider block mb-2">Recent Calls</span>
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {callLogs.map(log => (
          <div key={log.id} className="flex items-center gap-2 text-[11px] flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
              log.outcome === 'answered' || log.outcome === 'interested'
                ? 'bg-success/15 text-success'
                : log.outcome === 'no_answer' || log.outcome === 'busy'
                ? 'bg-warning/15 text-warning'
                : 'bg-elevated text-muted'
            }`}>
              {log.outcome.replace(/_/g, ' ')}
            </span>
            {log.duration && <span className="text-dim">{log.duration}</span>}
            <span className="text-dim">{log.logged_by}</span>
            {log.notes && <span className="text-muted truncate flex-1 min-w-0">{log.notes}</span>}
            <span className="text-dim flex-shrink-0">{formatTime(log.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
