'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'

interface FeedItem {
  kind: 'hot_stale' | 'overdue_followup' | 'telecaller_handoff' | 'unread_reply' | 'new_assignment'
  priority: number
  title: string
  subtitle: string
  ref_phone: string
  ref_lead_row: number
  status: string
  age_hours?: number
}

const KIND_META: Record<string, { label: string; color: string }> = {
  hot_stale: { label: 'HOT · stale', color: 'var(--color-danger)' },
  unread_reply: { label: 'Reply', color: 'var(--color-success)' },
  telecaller_handoff: { label: 'Hand-off', color: 'var(--color-accent)' },
  overdue_followup: { label: 'Overdue', color: 'var(--color-warning)' },
  new_assignment: { label: 'New', color: 'var(--color-accent)' },
}

export default function TodayPage() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/today')
      const data = await res.json()
      if (data.success) {
        setItems(data.data.items || [])
        setErr('')
      } else {
        setErr(data.error || 'Failed to load')
      }
    } catch (e) {
      setErr(String(e))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchFeed()
    const i = setInterval(fetchFeed, 60_000)
    return () => clearInterval(i)
  }, [fetchFeed])

  const grouped = items.reduce<Record<string, FeedItem[]>>((acc, it) => {
    (acc[it.kind] = acc[it.kind] || []).push(it)
    return acc
  }, {})

  const sectionOrder: FeedItem['kind'][] = ['hot_stale', 'unread_reply', 'telecaller_handoff', 'overdue_followup', 'new_assignment']

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-6 flex-1 w-full">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-text">Today</h1>
            <p className="text-sm text-dim mt-0.5">{items.length === 0 ? 'You’re all caught up.' : `${items.length} action${items.length === 1 ? '' : 's'} to take`}</p>
          </div>
          <button onClick={fetchFeed} className="text-xs text-accent hover:underline">Refresh</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : err ? (
          <p className="text-sm text-danger">{err}</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
            <p className="text-sm text-muted">Nothing urgent. Good time to reach out to a cold lead — open <Link href="/leads" className="text-accent hover:underline">Leads</Link>.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {sectionOrder.map(kind => {
              const list = grouped[kind]
              if (!list || list.length === 0) return null
              const meta = KIND_META[kind] || { label: kind, color: 'var(--color-muted)' }
              return (
                <section key={kind}>
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: meta.color }}>
                    {meta.label} · {list.length}
                  </h2>
                  <div className="space-y-2">
                    {list.map(item => (
                      <Link
                        key={`${item.kind}-${item.ref_lead_row}`}
                        href={`/leads/${item.ref_lead_row}`}
                        className="block rounded-lg p-3 hover:bg-elevated/60 transition-colors"
                        style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-text truncate">{item.title}</p>
                            <p className="text-xs text-dim mt-0.5 line-clamp-2">{item.subtitle}</p>
                          </div>
                          <span className="text-[10px] font-semibold uppercase tracking-wider shrink-0" style={{ color: meta.color }}>
                            {item.status}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
      <PoweredBy />
    </div>
  )
}
