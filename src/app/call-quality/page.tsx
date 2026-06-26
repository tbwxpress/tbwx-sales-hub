'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
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
  lead_row: number | null
  lead_phone: string
  lead_name: string
  agent_name: string
  duration_seconds: number
  status: string
  overall_score: number | null
  report_card: ReportCard | null
  recording_url: string
  created_at: string
}
interface LeaderRow {
  agent_name: string
  total_recorded: number
  scored: number
  avg_score: number | null
  avg_duration: number | null
  low_score: number
  last_call_at: string
}
interface ScorecardData {
  days: number
  leaderboard: LeaderRow[]
  recent: Recording[]
}

const RANGES = [7, 30, 90]

function scoreColor(score: number | null): string {
  if (score == null) return 'bg-elevated text-dim border-border'
  if (score >= 8) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
  if (score >= 5) return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  return 'bg-red-500/15 text-red-400 border-red-500/30'
}
function fmtScore(s: number | null): string {
  return s == null ? '—' : s.toFixed(1)
}
function fmtDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}
function fmtTime(ts: string): string {
  if (!ts) return ''
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ts
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
}
function needsReview(r: Recording): boolean {
  if (r.status === 'recorded_unscored') return true
  const s = r.overall_score ?? r.report_card?.overall_score ?? null
  if (s != null && s < 5) return true
  if (r.report_card?.flagged_moment) return true
  return false
}

export default function CallQualityPage() {
  const router = useRouter()
  const [days, setDays] = useState(30)
  const [data, setData] = useState<ScorecardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [filter, setFilter] = useState<'all' | 'review'>('all')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [rescoring, setRescoring] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/calls/scorecard?days=${days}`)
      if (res.status === 403) { setDenied(true); return }
      const json = await res.json()
      if (json.success) { setData(json.data); setDenied(false) }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  const rescore = async (id: number) => {
    setRescoring(id)
    try {
      const res = await fetch(`/api/calls/${id}/rescore`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Re-score failed')
      } else {
        toast.success(`Scored: ${Number(json.overall_score).toFixed(1)}/10`)
        load()
      }
    } catch {
      toast.error('Network error')
    } finally {
      setRescoring(null)
    }
  }

  const recent = (data?.recent || []).filter(r => filter === 'all' || needsReview(r))

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold text-text">Call Quality &amp; Coaching</h1>
            <p className="text-xs text-dim mt-0.5">Recorded calls, AI-scored for quality &amp; performance review.</p>
          </div>
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
            {RANGES.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  days === d ? 'bg-accent/20 text-accent' : 'text-dim hover:text-text'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {denied ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-sm text-dim">This page is for managers (admin) only.</p>
            <button onClick={() => router.push('/dashboard')} className="mt-3 text-xs text-accent hover:underline">
              Back to dashboard
            </button>
          </div>
        ) : loading && !data ? (
          <div className="flex items-center gap-2 text-sm text-dim py-10 justify-center">
            <div className="w-4 h-4 border-2 border-dim border-t-transparent rounded-full animate-spin" />
            Loading call quality…
          </div>
        ) : (
          <div className="space-y-6">
            {/* Leaderboard */}
            <section className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h2 className="text-xs font-semibold text-dim uppercase tracking-wide">Telecaller Leaderboard</h2>
                <span className="text-[10px] text-dim">last {data?.days}d · by avg AI score</span>
              </div>
              {(data?.leaderboard?.length || 0) === 0 ? (
                <p className="text-xs text-dim p-4">No recorded calls in this window yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] text-dim uppercase tracking-wider border-b border-border/60">
                        <th className="text-left font-medium px-4 py-2">Telecaller</th>
                        <th className="text-center font-medium px-3 py-2">Avg Score</th>
                        <th className="text-center font-medium px-3 py-2">Recorded</th>
                        <th className="text-center font-medium px-3 py-2">Scored</th>
                        <th className="text-center font-medium px-3 py-2">Avg Length</th>
                        <th className="text-center font-medium px-3 py-2">Low (&lt;5)</th>
                        <th className="text-right font-medium px-4 py-2">Last Call</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.leaderboard.map((row, i) => (
                        <tr key={row.agent_name} className="border-b border-border/40 hover:bg-elevated/40">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-dim w-4">{i + 1}</span>
                              <span className="text-text font-medium">{row.agent_name}</span>
                            </div>
                          </td>
                          <td className="text-center px-3 py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${scoreColor(row.avg_score)}`}>
                              {fmtScore(row.avg_score)}
                            </span>
                          </td>
                          <td className="text-center px-3 py-2.5 text-body">{row.total_recorded}</td>
                          <td className="text-center px-3 py-2.5 text-body">{row.scored}</td>
                          <td className="text-center px-3 py-2.5 text-body">{fmtDuration(row.avg_duration)}</td>
                          <td className="text-center px-3 py-2.5">
                            {row.low_score > 0
                              ? <span className="text-red-400 font-medium">{row.low_score}</span>
                              : <span className="text-dim">0</span>}
                          </td>
                          <td className="text-right px-4 py-2.5 text-dim text-xs whitespace-nowrap">{fmtTime(row.last_call_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* QA feed */}
            <section className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-xs font-semibold text-dim uppercase tracking-wide">Recent Calls</h2>
                <div className="flex items-center gap-1 bg-elevated border border-border rounded-md p-0.5">
                  <button
                    onClick={() => setFilter('all')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${filter === 'all' ? 'bg-accent/20 text-accent' : 'text-dim hover:text-text'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFilter('review')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${filter === 'review' ? 'bg-red-500/20 text-red-400' : 'text-dim hover:text-text'}`}
                  >
                    Needs review
                  </button>
                </div>
              </div>

              {recent.length === 0 ? (
                <p className="text-xs text-dim p-4">{filter === 'review' ? 'No calls flagged for review 🎉' : 'No recorded calls in this window yet.'}</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {recent.map((rec) => {
                    const card = rec.report_card
                    const score = rec.overall_score ?? card?.overall_score ?? null
                    const open = expanded === rec.id
                    return (
                      <div key={rec.id}>
                        <button
                          onClick={() => setExpanded(open ? null : rec.id)}
                          className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-elevated/40 transition-colors"
                        >
                          <span className={`inline-flex items-center justify-center shrink-0 w-10 h-7 rounded text-xs font-semibold border ${scoreColor(score)}`}>
                            {fmtScore(score)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-text font-medium text-sm truncate">{rec.lead_name || rec.lead_phone || 'Lead'}</span>
                              {needsReview(rec) && (
                                <span className="text-[9px] uppercase tracking-wide text-red-400 border border-red-500/30 bg-red-500/10 rounded px-1 py-0.5">review</span>
                              )}
                            </div>
                            <p className="text-[11px] text-dim truncate">
                              {rec.agent_name || 'Unknown'} · {fmtDuration(rec.duration_seconds)} · {fmtTime(rec.created_at)}
                            </p>
                          </div>
                          <svg className={`w-4 h-4 text-dim transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>

                        {open && (
                          <div className="px-4 pb-4 space-y-3 bg-bg/30">
                            {rec.recording_url ? (
                              <audio controls preload="none" className="w-full h-9" src={`/api/calls/recording/${rec.id}`} />
                            ) : (
                              <p className="text-[11px] text-dim">No recording captured.</p>
                            )}

                            {rec.lead_row ? (
                              <a href={`/leads/${rec.lead_row}`} className="text-[11px] text-accent hover:underline">Open lead →</a>
                            ) : null}

                            {card ? (
                              <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                  <p className="text-[10px] text-dim uppercase tracking-wider mb-1.5">Report Card</p>
                                  <div className="space-y-1">
                                    {card.dimensions?.map((d, i) => (
                                      <div key={i} className="flex items-start gap-2">
                                        <span className={`shrink-0 mt-0.5 inline-flex items-center justify-center w-7 text-[10px] font-semibold rounded border ${scoreColor(d.score)}`}>{d.score}</span>
                                        <div className="min-w-0">
                                          <p className="text-[11px] text-text/90 font-medium leading-tight">{d.name}</p>
                                          {d.note && <p className="text-[10px] text-dim leading-snug">{d.note}</p>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div className="space-y-3">
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
                                </div>

                                {card.transcript && (
                                  <details className="md:col-span-2 group">
                                    <summary className="text-[10px] text-dim uppercase tracking-wider cursor-pointer hover:text-muted">Full transcript</summary>
                                    <div className="mt-1.5 bg-bg/50 rounded p-2 max-h-52 overflow-y-auto">
                                      <pre className="text-[11px] text-text/70 whitespace-pre-wrap font-sans leading-relaxed">{card.transcript}</pre>
                                    </div>
                                  </details>
                                )}
                              </div>
                            ) : rec.status === 'recorded_unscored' ? (
                              <div className="flex items-center gap-3">
                                <p className="text-[11px] text-amber-400/80">Not scored yet (AI hiccup or still processing).</p>
                                <button
                                  onClick={() => rescore(rec.id)}
                                  disabled={rescoring === rec.id}
                                  className="text-[11px] bg-accent/20 hover:bg-accent/30 border border-accent/40 text-accent rounded px-2.5 py-1 disabled:opacity-60"
                                >
                                  {rescoring === rec.id ? 'Scoring…' : 'Re-score'}
                                </button>
                              </div>
                            ) : (
                              <p className="text-[11px] text-dim">Call did not connect — nothing to score.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
