'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { istToday } from '@/lib/format'

interface Request {
  id: number
  lead_row: number
  agent_id: string
  agent_name: string
  reason: string | null
  due_date: string
  status: 'PENDING' | 'ANSWERED' | 'CANCELLED'
  created_at: string
  answered_at: string | null
  cancelled_at: string | null
}

type Tab = 'pending' | 'overdue' | 'answered' | 'cancelled'

export default function AdminUpdateRequestsPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const [rows, setRows] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    let qs = ''
    if (tab === 'pending') qs = '?status=PENDING'
    else if (tab === 'overdue') qs = '?overdue=true'
    else if (tab === 'answered') qs = '?status=ANSWERED'
    else if (tab === 'cancelled') qs = '?status=CANCELLED'

    const res = await fetch(`/api/update-requests${qs}`)
    const data = await res.json()
    if (data.success) setRows(data.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [tab])

  async function cancel(id: number) {
    if (!confirm('Cancel this update request?')) return
    const res = await fetch(`/api/update-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED' }),
    })
    const data = await res.json()
    if (data.success) load()
    else alert(data.error || 'Failed')
  }

  const today = istToday()
  function daysFrom(d: string): string {
    const diff = Math.round((new Date(today).getTime() - new Date(d).getTime()) / 86400000)
    if (diff === 0) return 'today'
    if (diff > 0) return `${diff}d ago`
    return `in ${-diff}d`
  }

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-4">
        <h1 className="text-lg font-bold text-text mb-3">Update Requests</h1>

        <div className="flex gap-1 mb-4 border-b border-border">
          {(['pending', 'overdue', 'answered', 'cancelled'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 ${
                tab === t ? 'border-accent text-accent' : 'border-transparent text-dim hover:text-text'
              }`}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-xs text-dim text-center py-8">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-xs text-dim text-center py-8">No requests in this view.</div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-elevated text-dim">
                <tr>
                  <th className="text-left px-3 py-2">Agent</th>
                  <th className="text-left px-3 py-2">Lead</th>
                  <th className="text-left px-3 py-2">Due</th>
                  <th className="text-left px-3 py-2">Reason</th>
                  <th className="text-right px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-border/40 hover:bg-elevated/40">
                    <td className="px-3 py-2 text-text">{r.agent_name}</td>
                    <td className="px-3 py-2">
                      <Link href={`/leads/${r.lead_row}`} className="text-accent hover:underline">
                        #{r.lead_row}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {r.due_date} <span className="text-dim">({daysFrom(r.due_date)})</span>
                    </td>
                    <td className="px-3 py-2 text-muted truncate max-w-xs">{r.reason || '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {r.status === 'PENDING' && (
                        <button onClick={() => cancel(r.id)} className="text-dim hover:text-danger">
                          Cancel
                        </button>
                      )}
                      {r.status === 'ANSWERED' && (
                        <span className="text-success text-[10px]">Answered {r.answered_at?.slice(0, 10)}</span>
                      )}
                      {r.status === 'CANCELLED' && (
                        <span className="text-dim text-[10px]">Cancelled {r.cancelled_at?.slice(0, 10)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
