'use client'

import { useEffect, useState, useCallback } from 'react'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'

interface PendingLead {
  row_number: number
  full_name: string
  phone: string
  city: string
  converted_at: string
}
interface CloserSummary {
  user_id: string
  name: string
  email: string
  pending_count: number
  pending_amount: number
  paid_count: number
  paid_amount: number
  pending_leads: PendingLead[]
}
interface Payment {
  id: number
  closer_user_id: string
  period_start: string
  period_end: string
  lead_rows: number[]
  amount: number
  paid: boolean
  paid_at: string | null
  notes: string | null
  created_at: string
}

function formatMoney(amount: number, currency: string) {
  return `${currency}${amount.toLocaleString('en-IN')}`
}

export default function CommissionsPage() {
  const [me, setMe] = useState<{ id: string; role: string; name: string } | null>(null)
  const [settings, setSettings] = useState<{ amount_per_conversion: number; currency: string }>({ amount_per_conversion: 10000, currency: '₹' })
  const [summaries, setSummaries] = useState<CloserSummary[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [editAmount, setEditAmount] = useState('')
  const [editCurrency, setEditCurrency] = useState('')
  const [expandedCloser, setExpandedCloser] = useState<string | null>(null)
  const [busyMark, setBusyMark] = useState(false)

  const isAdmin = me?.role === 'admin'

  const fetchAll = useCallback(async () => {
    try {
      const [meRes, dataRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch('/api/commissions'),
      ])
      const meJson = await meRes.json()
      const dataJson = await dataRes.json()
      if (meJson.success) setMe(meJson.data)
      if (dataJson.success) {
        setSettings(dataJson.data.settings)
        setSummaries(dataJson.data.summaries)
        setPayments(dataJson.data.payments)
        setEditAmount(String(dataJson.data.settings.amount_per_conversion))
        setEditCurrency(dataJson.data.settings.currency)
      } else {
        setErr(dataJson.error || 'Failed to load')
      }
    } catch (e) { setErr(String(e)) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function saveSettings() {
    setSavingSettings(true)
    try {
      const amt = Number(editAmount)
      if (!Number.isFinite(amt) || amt <= 0) {
        alert('Amount must be a positive number')
        setSavingSettings(false)
        return
      }
      const res = await fetch('/api/commissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { amount_per_conversion: amt, currency: editCurrency.trim() || '₹' } }),
      })
      const data = await res.json()
      if (data.success) {
        setSettings(data.data.settings)
      } else {
        alert(data.error || 'Save failed')
      }
    } catch (e) { alert(String(e)) }
    setSavingSettings(false)
  }

  async function snapshotPending(closerUserId: string, leadRows: number[], paidNow: boolean) {
    if (leadRows.length === 0) return
    const action = paidNow ? 'snapshot AND mark paid' : 'snapshot as pending'
    if (!window.confirm(`Record ${leadRows.length} lead(s) for commission (${action})?`)) return
    setBusyMark(true)
    try {
      const res = await fetch('/api/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closer_user_id: closerUserId, lead_rows: leadRows, paid: paidNow }),
      })
      const data = await res.json()
      if (data.success) {
        await fetchAll()
      } else {
        alert(data.error || 'Failed')
      }
    } catch (e) { alert(String(e)) }
    setBusyMark(false)
  }

  async function togglePaid(id: number, currentPaid: boolean) {
    setBusyMark(true)
    try {
      await fetch('/api/commissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, paid: !currentPaid }),
      })
      await fetchAll()
    } catch (e) { alert(String(e)) }
    setBusyMark(false)
  }

  async function deleteRecord(id: number) {
    if (!window.confirm('Delete this commission record? Cannot be undone.')) return
    setBusyMark(true)
    try {
      await fetch(`/api/commissions?id=${id}`, { method: 'DELETE' })
      await fetchAll()
    } catch (e) { alert(String(e)) }
    setBusyMark(false)
  }

  const totalPending = summaries.reduce((acc, s) => acc + s.pending_amount, 0)
  const totalPaid = summaries.reduce((acc, s) => acc + s.paid_amount, 0)

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-6 flex-1 w-full">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-text">Commissions</h1>
          <p className="text-sm text-dim mt-0.5">{isAdmin ? 'All closers — earnings, paid, pending' : 'Your earnings, paid + pending'}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : err ? (
          <p className="text-sm text-danger">{err}</p>
        ) : (
          <>
            {/* Top stats */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-xs text-dim uppercase tracking-wider">Pending</p>
                <p className="text-2xl font-bold text-accent mt-1">{formatMoney(totalPending, settings.currency)}</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-xs text-dim uppercase tracking-wider">Paid (lifetime)</p>
                <p className="text-2xl font-bold text-text mt-1">{formatMoney(totalPaid, settings.currency)}</p>
              </div>
            </div>

            {/* Settings — admin only */}
            {isAdmin && (
              <div className="bg-card border border-border rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-text">Commission rate</h2>
                  <span className="text-[11px] text-dim">Per CONVERTED lead</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editCurrency}
                    onChange={e => setEditCurrency(e.target.value)}
                    placeholder="₹"
                    className="w-12 bg-elevated border border-border rounded-md px-2 py-1.5 text-sm text-text text-center focus:outline-none focus:border-accent/50"
                  />
                  <input
                    type="number"
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value)}
                    className="flex-1 bg-elevated border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50"
                  />
                  <button
                    onClick={saveSettings}
                    disabled={savingSettings}
                    className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-[#1a1209] text-sm font-semibold px-4 py-1.5 rounded-md transition-colors"
                  >
                    {savingSettings ? 'Saving…' : 'Save'}
                  </button>
                </div>
                <p className="text-[11px] text-dim mt-2">Changing the rate doesn&apos;t recompute past records — only future snapshots use the new rate.</p>
              </div>
            )}

            {/* Per-closer summaries */}
            <div className="space-y-3 mb-8">
              {summaries.length === 0 ? (
                <p className="text-sm text-dim">No closers configured. Add a user with Type = Closer in Admin.</p>
              ) : summaries.map(s => (
                <div key={s.user_id} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center bg-elevated">
                        <span className="text-sm font-bold text-muted">{s.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text truncate">{s.name}</p>
                        <p className="text-[11px] text-dim mt-0.5">
                          Pending: <span className="font-semibold text-accent">{formatMoney(s.pending_amount, settings.currency)}</span> ({s.pending_count})
                          {' · '}
                          Paid: {formatMoney(s.paid_amount, settings.currency)} ({s.paid_count})
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setExpandedCloser(expandedCloser === s.user_id ? null : s.user_id)}
                        className="text-[11px] text-accent hover:underline"
                      >
                        {expandedCloser === s.user_id ? 'Hide' : 'View pending leads'}
                      </button>
                      {isAdmin && s.pending_count > 0 && (
                        <>
                          <button
                            onClick={() => snapshotPending(s.user_id, s.pending_leads.map(l => l.row_number), false)}
                            disabled={busyMark}
                            className="text-[11px] px-2 py-1 rounded-md border border-border hover:border-accent/50 transition-colors disabled:opacity-50"
                          >
                            Snapshot pending
                          </button>
                          <button
                            onClick={() => snapshotPending(s.user_id, s.pending_leads.map(l => l.row_number), true)}
                            disabled={busyMark}
                            className="text-[11px] px-2 py-1 rounded-md font-semibold disabled:opacity-50"
                            style={{ background: 'var(--color-accent)', color: '#1a1209' }}
                          >
                            Mark all paid
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {expandedCloser === s.user_id && s.pending_leads.length > 0 && (
                    <div className="border-t border-border bg-elevated/30">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-dim border-b border-border/50">
                            <th className="px-4 py-2 text-left font-medium">Lead</th>
                            <th className="px-4 py-2 text-left font-medium">City</th>
                            <th className="px-4 py-2 text-left font-medium">Converted</th>
                            <th className="px-4 py-2 text-right font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.pending_leads.map(l => (
                            <tr key={l.row_number} className="border-b border-border/30 last:border-b-0">
                              <td className="px-4 py-2">
                                <a href={`/leads/${l.row_number}`} className="text-text hover:text-accent">{l.full_name || l.phone}</a>
                              </td>
                              <td className="px-4 py-2 text-muted">{l.city || '—'}</td>
                              <td className="px-4 py-2 text-dim">{l.converted_at || '—'}</td>
                              <td className="px-4 py-2 text-right text-text">{formatMoney(settings.amount_per_conversion, settings.currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Payment history */}
            <div className="mt-8">
              <h2 className="text-base font-semibold text-text mb-3">Payment history</h2>
              {payments.length === 0 ? (
                <p className="text-sm text-dim">No commission records yet.</p>
              ) : (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-dim border-b border-border">
                        <th className="px-3 py-2 text-left font-medium">Closer</th>
                        <th className="px-3 py-2 text-left font-medium">Period</th>
                        <th className="px-3 py-2 text-center font-medium">Leads</th>
                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                        <th className="px-3 py-2 text-center font-medium">Status</th>
                        {isAdmin && <th className="px-3 py-2"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(p => {
                        const closer = summaries.find(s => s.user_id === p.closer_user_id)
                        return (
                          <tr key={p.id} className="border-b border-border/50">
                            <td className="px-3 py-2 text-text">{closer?.name || p.closer_user_id}</td>
                            <td className="px-3 py-2 text-muted">{p.period_start === p.period_end ? p.period_start : `${p.period_start} → ${p.period_end}`}</td>
                            <td className="px-3 py-2 text-center text-muted">{p.lead_rows.length}</td>
                            <td className="px-3 py-2 text-right text-text">{formatMoney(p.amount, settings.currency)}</td>
                            <td className="px-3 py-2 text-center">
                              {p.paid ? (
                                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--color-success) 15%, transparent)', color: 'var(--color-success)' }}>
                                  Paid
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)' }}>
                                  Pending
                                </span>
                              )}
                            </td>
                            {isAdmin && (
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                <button
                                  onClick={() => togglePaid(p.id, p.paid)}
                                  disabled={busyMark}
                                  className="text-[11px] text-accent hover:underline mr-3 disabled:opacity-50"
                                >
                                  {p.paid ? 'Mark unpaid' : 'Mark paid'}
                                </button>
                                <button
                                  onClick={() => deleteRecord(p.id)}
                                  disabled={busyMark}
                                  className="text-[11px] text-dim hover:text-danger disabled:opacity-50"
                                >
                                  Delete
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
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
