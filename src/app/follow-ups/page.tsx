'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'

interface Lead {
  row_number: number; full_name: string; phone: string; assigned_to: string;
  next_followup: string; lead_status: string; city: string
}

export default function FollowUpsPage() {
  const [overdue, setOverdue] = useState<Lead[]>([])
  const [upcoming, setUpcoming] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/follow-ups')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setOverdue(d.data.overdue)
          setUpcoming(d.data.upcoming)
        }
        setLoading(false)
      })
  }, [])

  function daysFromNow(dateStr: string) {
    const diff = Math.floor((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return diff
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-6 flex-1 animate-fade-in">
        <div className="mb-6">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-text">Follow-ups</h1>
              <p className="text-xs text-dim mt-0.5">Scheduled tasks for your leads</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-4 border" style={{ background: 'var(--color-card)', borderColor: overdue.length > 0 ? 'rgba(239,68,68,0.25)' : 'var(--color-border)', borderLeft: overdue.length > 0 ? '3px solid var(--color-danger)' : undefined }}>
              <div className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: overdue.length > 0 ? 'var(--color-danger)' : 'var(--color-muted)' }}>Overdue</div>
              <div className="text-3xl font-extrabold leading-none" style={{ color: overdue.length > 0 ? 'var(--color-danger)' : 'var(--color-dim)' }}>{overdue.length}</div>
              <div className="text-[10px] mt-1" style={{ color: 'var(--color-dim)' }}>{overdue.length === 0 ? 'all caught up!' : 'need immediate attention'}</div>
            </div>
            <div className="rounded-xl p-4 border" style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
              <div className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>Upcoming</div>
              <div className="text-3xl font-extrabold leading-none" style={{ color: 'var(--color-accent)' }}>{upcoming.length}</div>
              <div className="text-[10px] mt-1" style={{ color: 'var(--color-dim)' }}>scheduled ahead</div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Overdue */}
            <div className="mb-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-danger mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Overdue ({overdue.length})
              </h2>
              {overdue.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-8 text-center">
                  <svg className="w-10 h-10 text-success mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium text-success">All caught up!</p>
                  <p className="text-xs text-dim mt-1">No overdue follow-ups. Keep it going.</p>
                </div>
              ) : (
                <div className="bg-card border border-danger/20 rounded-xl overflow-hidden glow-danger">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-elevated/30 text-left">
                        <th className="px-4 py-3 text-[10px] font-semibold text-dim uppercase tracking-wider">Lead</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-dim uppercase tracking-wider">Phone</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-dim uppercase tracking-wider">City</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-dim uppercase tracking-wider">Assigned</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-dim uppercase tracking-wider">Overdue By</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-dim uppercase tracking-wider"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {overdue.map(lead => (
                        <tr key={lead.row_number} className="table-row-hover">
                          <td className="px-4 py-3 font-medium text-text">{lead.full_name}</td>
                          <td className="px-4 py-3 text-muted font-mono text-xs">{lead.phone}</td>
                          <td className="px-4 py-3 text-muted text-xs">{lead.city}</td>
                          <td className="px-4 py-3 text-muted text-xs">{lead.assigned_to || <span className="italic text-dim">Unassigned</span>}</td>
                          <td className="px-4 py-3">
                            <span className="text-danger font-semibold text-xs">{Math.abs(daysFromNow(lead.next_followup))} days</span>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/leads/${lead.row_number}`}
                              className="bg-accent/10 text-accent text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-accent/20 hover:glow-accent-sm transition-colors inline-block"
                            >
                              Follow Up
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Upcoming */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-accent mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Upcoming ({upcoming.length})
              </h2>
              {upcoming.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-8 text-center">
                  <svg className="w-10 h-10 text-dim mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  <p className="text-sm font-medium text-muted">No upcoming follow-ups</p>
                  <p className="text-xs text-dim mt-1">Schedule follow-ups from the lead detail page.</p>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-elevated/30 text-left">
                        <th className="px-4 py-3 text-[10px] font-semibold text-dim uppercase tracking-wider">Lead</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-dim uppercase tracking-wider">Phone</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-dim uppercase tracking-wider">City</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-dim uppercase tracking-wider">Assigned</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-dim uppercase tracking-wider">Due In</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-dim uppercase tracking-wider"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {upcoming.map(lead => (
                        <tr key={lead.row_number} className="table-row-hover">
                          <td className="px-4 py-3 font-medium text-text">{lead.full_name}</td>
                          <td className="px-4 py-3 text-muted font-mono text-xs">{lead.phone}</td>
                          <td className="px-4 py-3 text-muted text-xs">{lead.city}</td>
                          <td className="px-4 py-3 text-muted text-xs">{lead.assigned_to || <span className="italic text-dim">Unassigned</span>}</td>
                          <td className="px-4 py-3">
                            <span className="text-accent font-medium text-xs">
                              {daysFromNow(lead.next_followup) === 0 ? 'Today' : `${daysFromNow(lead.next_followup)} days`}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/leads/${lead.row_number}`}
                              className="text-dim hover:text-accent text-xs transition-colors"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <PoweredBy />
    </div>
  )
}
