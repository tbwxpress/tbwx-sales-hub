'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

interface ReportDimension { name: string; score: number; note: string }
interface ReportCard {
  transcript: string
  overall_score: number
  dimensions: ReportDimension[]
  strengths: string[]
  coaching: string[]
  flagged_moment: string
}
interface Recording {
  id: number
  lead_phone: string
  agent_name: string
  call_sid: string
  recording_url: string
  duration_seconds: number
  status: string
  overall_score: number | null
  report_card: ReportCard | null
  created_at: string
}

interface Props {
  phone: string
  leadName: string
  leadRow: number
}

const ACTIVE_STATUSES = ['initiated', 'ringing', 'in-progress', 'in_progress', 'recorded_unscored']

const STATUS_LABEL: Record<string, string> = {
  initiated: 'Ringing you…',
  ringing: 'Ringing…',
  'in-progress': 'In progress',
  in_progress: 'In progress',
  recorded_unscored: 'Scoring…',
  completed: 'Scored',
  no_answer: 'No answer',
  busy: 'Busy',
  failed: 'Failed',
  canceled: 'Canceled',
}

function fmtDuration(seconds: number): string {
  if (!seconds) return '0s'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function fmtTime(ts: string): string {
  if (!ts) return ''
  // SQLite datetime('now') is UTC without a 'Z' — treat it as UTC.
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ts
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
}

function scoreColor(score: number): string {
  if (score >= 8) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
  if (score >= 5) return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  return 'bg-red-500/15 text-red-400 border-red-500/30'
}

export default function RecordedCallCard({ phone, leadName, leadRow }: Props) {
  const [agentPhone, setAgentPhone] = useState('')
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [calling, setCalling] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('saleshub_agent_phone')
      if (saved) setAgentPhone(saved)
    } catch { /* ignore */ }
  }, [])

  const fetchRecordings = useCallback(async () => {
    try {
      const res = await fetch(`/api/calls/by-lead/${encodeURIComponent(phone)}`)
      if (res.ok) {
        const json = await res.json()
        setRecordings(json.data || [])
      }
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [phone])

  useEffect(() => { fetchRecordings() }, [fetchRecordings])

  // Poll while a call is dialing / recording / being scored so the report card
  // appears without a manual refresh.
  useEffect(() => {
    const hasActive = recordings.some(r => ACTIVE_STATUSES.includes(r.status))
    if (!hasActive) return
    const interval = setInterval(fetchRecordings, 6000)
    return () => clearInterval(interval)
  }, [recordings, fetchRecordings])

  const handleCall = async () => {
    const digits = agentPhone.replace(/\D/g, '')
    if (digits.length < 10) {
      toast.error('Enter your phone number first (the phone you will answer).')
      return
    }
    try { localStorage.setItem('saleshub_agent_phone', agentPhone) } catch { /* ignore */ }

    setCalling(true)
    try {
      const res = await fetch('/api/calls/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_row: leadRow, lead_phone: phone, lead_name: leadName, agent_phone: agentPhone }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Could not start the call')
      } else {
        toast.success('📞 Your phone is ringing — pick up to connect to the lead.')
        setTimeout(fetchRecordings, 1500)
      }
    } catch {
      toast.error('Network error starting the call')
    } finally {
      setCalling(false)
    }
  }

  const hasActive = recordings.some(r => ACTIVE_STATUSES.includes(r.status))

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-dim uppercase tracking-wide flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
          </svg>
          Call &amp; Record
        </h2>
        {recordings.length > 0 && (
          <span className="text-[10px] text-dim">{recordings.length} call{recordings.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Your number + call button */}
      <div className="flex gap-2 mb-3">
        <input
          type="tel"
          inputMode="tel"
          value={agentPhone}
          onChange={(e) => setAgentPhone(e.target.value)}
          placeholder="Your phone (we ring you)"
          className="flex-1 min-w-0 bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder:text-dim/70 focus:outline-none focus:border-accent/50"
        />
        <button
          onClick={handleCall}
          disabled={calling || hasActive}
          className={`shrink-0 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
            hasActive
              ? 'bg-accent/10 border border-accent/30 text-accent cursor-not-allowed'
              : calling
              ? 'bg-accent/10 border border-accent/30 text-accent cursor-wait'
              : 'bg-accent/20 hover:bg-accent/30 border border-accent/40 text-accent hover:text-text'
          } disabled:opacity-70`}
        >
          {hasActive ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent" />
              </span>
              Live
            </>
          ) : calling ? (
            <>
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              Calling
            </>
          ) : (
            'Call'
          )}
        </button>
      </div>
      <p className="text-[10px] text-dim mb-3 -mt-1 px-0.5">
        We call your phone first, then connect you to the lead. The call is recorded &amp; auto-scored for quality.
      </p>

      {/* Recordings list */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-dim py-2">
          <div className="w-3 h-3 border border-dim border-t-transparent rounded-full animate-spin" />
          Loading recordings…
        </div>
      ) : recordings.length === 0 ? (
        <p className="text-xs text-dim py-1">No recorded calls yet</p>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {recordings.map((rec) => {
            const card = rec.report_card
            const score = rec.overall_score ?? card?.overall_score ?? null
            return (
              <div key={rec.id} className="rounded-md border border-border bg-elevated/50 overflow-hidden hover:border-border-light transition-colors">
                <button
                  onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
                  className="w-full px-3 py-2.5 flex items-center gap-2 text-left"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    rec.status === 'completed' ? 'bg-emerald-400' :
                    ACTIVE_STATUSES.includes(rec.status) ? 'bg-blue-400 animate-pulse' :
                    'bg-red-400'
                  }`} />
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <span className="text-[10px] text-dim">{STATUS_LABEL[rec.status] || rec.status}</span>
                    {rec.duration_seconds > 0 && (
                      <span className="text-[10px] text-dim">· {fmtDuration(rec.duration_seconds)}</span>
                    )}
                    {score != null && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${scoreColor(score)}`}>
                        {score.toFixed(1)}/10
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-dim whitespace-nowrap shrink-0">{fmtTime(rec.created_at)}</span>
                  <svg className={`w-3.5 h-3.5 text-dim transition-transform shrink-0 ${expanded === rec.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {expanded === rec.id && (
                  <div className="px-3 pb-3 border-t border-border/50 pt-2.5 space-y-3">
                    {/* Audio player */}
                    {rec.recording_url ? (
                      <audio controls preload="none" className="w-full h-9" src={`/api/calls/recording/${rec.id}`}>
                        Your browser cannot play this recording.
                      </audio>
                    ) : ACTIVE_STATUSES.includes(rec.status) ? (
                      <p className="text-[11px] text-dim">Recording will appear here once the call ends…</p>
                    ) : (
                      <p className="text-[11px] text-dim">No recording was captured for this call.</p>
                    )}

                    {rec.agent_name && (
                      <p className="text-[10px] text-dim">Caller: <span className="text-text/80">{rec.agent_name}</span></p>
                    )}

                    {/* Report card */}
                    {card ? (
                      <div className="space-y-3">
                        {card.dimensions?.length > 0 && (
                          <div>
                            <p className="text-[10px] text-dim uppercase tracking-wider mb-1.5">AI Report Card</p>
                            <div className="space-y-1">
                              {card.dimensions.map((d, i) => (
                                <div key={i} className="flex items-start gap-2">
                                  <span className={`shrink-0 mt-0.5 inline-flex items-center justify-center w-7 text-[10px] font-semibold rounded border ${scoreColor(d.score)}`}>
                                    {d.score}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-[11px] text-text/90 font-medium leading-tight">{d.name}</p>
                                    {d.note && <p className="text-[10px] text-dim leading-snug">{d.note}</p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {card.strengths?.length > 0 && (
                          <div>
                            <p className="text-[10px] text-emerald-400/80 uppercase tracking-wider mb-1">Strengths</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              {card.strengths.map((s, i) => <li key={i} className="text-[11px] text-text/80 leading-snug">{s}</li>)}
                            </ul>
                          </div>
                        )}

                        {card.coaching?.length > 0 && (
                          <div>
                            <p className="text-[10px] text-amber-400/80 uppercase tracking-wider mb-1">Coach on</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              {card.coaching.map((c, i) => <li key={i} className="text-[11px] text-text/80 leading-snug">{c}</li>)}
                            </ul>
                          </div>
                        )}

                        {card.flagged_moment && (
                          <div className="bg-red-500/5 border border-red-500/20 rounded px-2 py-1.5">
                            <p className="text-[10px] text-red-400/80 uppercase tracking-wider mb-0.5">🚩 Review</p>
                            <p className="text-[11px] text-text/80 leading-snug">{card.flagged_moment}</p>
                          </div>
                        )}

                        {card.transcript && (
                          <details className="group">
                            <summary className="text-[10px] text-dim uppercase tracking-wider cursor-pointer hover:text-muted flex items-center gap-1">
                              <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                              </svg>
                              Full Transcript
                            </summary>
                            <div className="mt-1.5 bg-bg/50 rounded p-2 max-h-40 overflow-y-auto">
                              <pre className="text-[11px] text-text/70 whitespace-pre-wrap font-sans leading-relaxed">{card.transcript}</pre>
                            </div>
                          </details>
                        )}
                      </div>
                    ) : rec.status === 'recorded_unscored' ? (
                      <p className="text-[11px] text-amber-400/80">Recorded — AI scoring is still processing (or failed). The audio above is available.</p>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
