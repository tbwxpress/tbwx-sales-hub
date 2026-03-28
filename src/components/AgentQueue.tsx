'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'

interface Lead {
  row_number: number
  full_name: string
  phone: string
  city: string
  lead_status: string
  lead_priority: string
  assigned_to: string
  next_followup: string
  created_time: string
}

interface SessionUser {
  name: string
  role: string
}

function isToday(dateStr: string): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

function isPast(dateStr: string): boolean {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '-'
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function AgentQueue({ user }: { user: SessionUser }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/leads')
      .then(r => r.json())
      .then(d => {
        if (d.success) setLeads(d.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const myLeads = leads.filter(
    l => l.assigned_to?.toLowerCase() === user.name.toLowerCase()
  )

  const repliesWaiting = myLeads.filter(l => l.lead_status === 'REPLIED')

  const followupsDue = myLeads.filter(
    l =>
      l.next_followup &&
      (isToday(l.next_followup) || isPast(l.next_followup)) &&
      !['CONVERTED', 'LOST'].includes(l.lead_status) &&
      l.lead_status !== 'REPLIED'
  )

  const hotLeads = myLeads.filter(
    l =>
      l.lead_priority === 'HOT' &&
      !['CONVERTED', 'LOST'].includes(l.lead_status) &&
      l.lead_status !== 'REPLIED' &&
      !(l.next_followup && (isToday(l.next_followup) || isPast(l.next_followup)))
  )

  const totalActions = repliesWaiting.length + followupsDue.length + hotLeads.length
  const totalContacted = myLeads.filter(
    l => !['NEW', 'DECK_SENT'].includes(l.lead_status)
  ).length
  const dailyGoal = 10
  const progressPct = Math.min(100, Math.round((totalContacted / dailyGoal) * 100))

  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Greeting */}
        <div className="mb-6">
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
            {greeting}, {user.name} 👋
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
            {totalActions > 0
              ? `You have ${totalActions} action${totalActions === 1 ? '' : 's'} waiting — let's close some deals.`
              : 'All caught up! Check back soon or reach out to new leads.'}
          </p>
        </div>

        {/* Daily progress bar */}
        <div
          className="rounded-xl p-4 mb-5 border"
          style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: 'var(--color-muted)' }}
            >
              Daily Progress
            </span>
            <span className="text-xs font-bold" style={{ color: 'var(--color-accent)' }}>
              {totalContacted} / {dailyGoal} leads
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: 'var(--color-elevated)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progressPct}%`,
                background:
                  progressPct >= 80
                    ? 'linear-gradient(90deg, var(--color-success), #22c55e)'
                    : 'linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))',
              }}
            />
          </div>
        </div>

        {loading && (
          <div
            className="text-center py-12 text-sm"
            style={{ color: 'var(--color-muted)' }}
          >
            Loading your queue...
          </div>
        )}

        {!loading && totalActions === 0 && (
          <div
            className="rounded-xl p-8 text-center border"
            style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="text-3xl mb-3">🎉</div>
            <div className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>
              Queue is clear!
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
              No replies, follow-ups, or hot leads need attention right now.
            </div>
            <Link
              href="/leads"
              className="inline-block mt-4 text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
              style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
            >
              Browse all leads →
            </Link>
          </div>
        )}

        {/* Replies Waiting */}
        {repliesWaiting.length > 0 && (
          <section className="mb-5">
            <h2
              className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5"
              style={{ color: 'var(--color-muted)' }}
            >
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--color-success)' }} />
              Replies Waiting ({repliesWaiting.length})
            </h2>
            <div className="flex flex-col gap-2">
              {repliesWaiting.map(lead => (
                <Link
                  key={lead.row_number}
                  href={`/inbox?phone=${lead.phone}`}
                  className="flex items-center justify-between rounded-xl px-4 py-3 border transition-all duration-150 group"
                  style={{
                    background: 'var(--color-card)',
                    borderColor: 'rgba(34,197,94,0.25)',
                  }}
                >
                  <div>
                    <div
                      className="text-sm font-semibold transition-colors"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {lead.full_name}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-muted)' }}>
                      {lead.city} · replied {timeAgo(lead.created_time)}
                    </div>
                  </div>
                  <span
                    className="text-xs font-semibold px-2 py-1 rounded-md"
                    style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--color-success)' }}
                  >
                    Reply →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Follow-ups Due */}
        {followupsDue.length > 0 && (
          <section className="mb-5">
            <h2
              className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5"
              style={{ color: 'var(--color-muted)' }}
            >
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--color-warning)' }} />
              Follow-ups Due ({followupsDue.length})
            </h2>
            <div className="flex flex-col gap-2">
              {followupsDue.map(lead => (
                <Link
                  key={lead.row_number}
                  href={`/leads/${lead.row_number}`}
                  className="flex items-center justify-between rounded-xl px-4 py-3 border transition-all duration-150 group"
                  style={{
                    background: 'var(--color-card)',
                    borderColor: 'rgba(245,158,11,0.25)',
                  }}
                >
                  <div>
                    <div
                      className="text-sm font-semibold transition-colors"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {lead.full_name}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-muted)' }}>
                      {lead.city} · {lead.lead_status.replace('_', ' ')}
                    </div>
                  </div>
                  <span
                    className="text-xs font-semibold px-2 py-1 rounded-md"
                    style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--color-warning)' }}
                  >
                    Follow up →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Hot Leads */}
        {hotLeads.length > 0 && (
          <section className="mb-5">
            <h2
              className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5"
              style={{ color: 'var(--color-muted)' }}
            >
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--color-hot)' }} />
              Hot Leads ({hotLeads.length})
            </h2>
            <div className="flex flex-col gap-2">
              {hotLeads.map(lead => (
                <Link
                  key={lead.row_number}
                  href={`/leads/${lead.row_number}`}
                  className="flex items-center justify-between rounded-xl px-4 py-3 border transition-all duration-150 group"
                  style={{
                    background: 'var(--color-card)',
                    borderColor: 'rgba(249,115,22,0.25)',
                  }}
                >
                  <div>
                    <div
                      className="text-sm font-semibold transition-colors"
                      style={{ color: 'var(--color-text)' }}
                    >
                      🔥 {lead.full_name}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-muted)' }}>
                      {lead.city} · {lead.lead_status.replace('_', ' ')}
                    </div>
                  </div>
                  <span
                    className="text-xs font-semibold px-2 py-1 rounded-md"
                    style={{ background: 'rgba(249,115,22,0.12)', color: 'var(--color-hot)' }}
                  >
                    Call now →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* All my leads link */}
        {!loading && (
          <Link
            href="/leads"
            className="block text-center text-xs font-semibold py-3 rounded-xl border transition-colors mt-2"
            style={{
              color: 'var(--color-muted)',
              borderColor: 'var(--color-border)',
              background: 'var(--color-card)',
            }}
          >
            View all my leads →
          </Link>
        )}

      </div>
    </div>
  )
}
