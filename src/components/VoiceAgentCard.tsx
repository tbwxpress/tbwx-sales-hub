'use client'

import { useState, useEffect, useCallback } from 'react'

interface VoiceCall {
  id: number
  phone: string
  lead_id: string
  call_sid: string
  status: string
  duration_seconds: number
  interest_level: string
  preferred_city: string
  callback_time: string
  questions: string
  summary: string
  transcript: string
  created_at: string
}

interface VoiceAgentCardProps {
  phone: string
  leadName: string
  leadId: string
}

const STATUS_STYLES: Record<string, string> = {
  initiated: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  ringing: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  in_progress: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  no_answer: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25',
  failed: 'bg-red-500/15 text-red-400 border-red-500/25',
  busy: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
}

const INTEREST_STYLES: Record<string, string> = {
  hot: 'bg-red-500/15 text-red-400 border-red-500/25',
  warm: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  cold: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
}

function formatDuration(seconds: number): string {
  if (!seconds) return '0s'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatTime(ts: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  if (isToday) return `Today ${time}`
  if (isYesterday) return `Yesterday ${time}`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' + time
}

export default function VoiceAgentCard({ phone, leadName, leadId }: VoiceAgentCardProps) {
  const [calls, setCalls] = useState<VoiceCall[]>([])
  const [loading, setLoading] = useState(true)
  const [calling, setCalling] = useState(false)
  const [expandedCall, setExpandedCall] = useState<number | null>(null)
  const [error, setError] = useState('')

  const fetchCalls = useCallback(async () => {
    try {
      const res = await fetch(`/api/voice-agent/calls/${encodeURIComponent(phone)}`)
      if (res.ok) {
        const data = await res.json()
        setCalls(data.calls || [])
      }
    } catch {
      // silent fail on fetch
    } finally {
      setLoading(false)
    }
  }, [phone])

  useEffect(() => {
    fetchCalls()
  }, [fetchCalls])

  // Poll for updates if there's an active call
  useEffect(() => {
    const hasActive = calls.some(c => c.status === 'initiated' || c.status === 'ringing' || c.status === 'in_progress')
    if (!hasActive) return
    const interval = setInterval(fetchCalls, 5000)
    return () => clearInterval(interval)
  }, [calls, fetchCalls])

  const handleCall = async () => {
    setCalling(true)
    setError('')
    try {
      const res = await fetch('/api/voice-agent/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, name: leadName, lead_id: leadId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to initiate call')
      } else {
        // Refresh calls list
        setTimeout(fetchCalls, 1000)
      }
    } catch {
      setError('Network error')
    } finally {
      setCalling(false)
    }
  }

  const hasActiveCall = calls.some(c => c.status === 'initiated' || c.status === 'ringing' || c.status === 'in_progress')

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-dim uppercase tracking-wide flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
          </svg>
          AI Voice Agent
        </h2>
        {calls.length > 0 && (
          <span className="text-[10px] text-dim">{calls.length} call{calls.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Call Button */}
      <button
        onClick={handleCall}
        disabled={calling || hasActiveCall}
        className={`w-full mb-3 flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
          hasActiveCall
            ? 'bg-purple-500/10 border border-purple-500/30 text-purple-400 cursor-not-allowed'
            : calling
            ? 'bg-accent/10 border border-accent/30 text-accent cursor-wait'
            : 'bg-gradient-to-r from-purple-500/20 to-accent/20 hover:from-purple-500/30 hover:to-accent/30 border border-purple-500/30 hover:border-purple-400/50 text-purple-300 hover:text-purple-200 shadow-sm hover:shadow-purple-500/10'
        } disabled:opacity-70`}
      >
        {hasActiveCall ? (
          <>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-400" />
            </span>
            Call in Progress...
          </>
        ) : calling ? (
          <>
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Dialling...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
            Call via AI Agent
          </>
        )}
      </button>

      {error && (
        <p className="text-xs text-red-400 mb-2 px-1">{error}</p>
      )}

      {/* Call History */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-dim py-2">
          <div className="w-3 h-3 border border-dim border-t-transparent rounded-full animate-spin" />
          Loading calls...
        </div>
      ) : calls.length === 0 ? (
        <p className="text-xs text-dim py-1">No AI calls yet</p>
      ) : (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {calls.map((call) => (
            <div
              key={call.id}
              className="rounded-md border border-border bg-elevated/50 overflow-hidden transition-colors hover:border-border-light"
            >
              {/* Call header - always visible */}
              <button
                onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
                className="w-full px-3 py-2.5 flex items-center gap-2 text-left"
              >
                {/* Status indicator dot */}
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  call.status === 'completed' ? 'bg-emerald-400' :
                  call.status === 'failed' || call.status === 'no_answer' ? 'bg-red-400' :
                  call.status === 'initiated' || call.status === 'ringing' ? 'bg-blue-400 animate-pulse' :
                  'bg-zinc-400'
                }`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                      STATUS_STYLES[call.status] || 'bg-elevated text-dim border-border'
                    }`}>
                      {call.status?.replace('_', ' ').toUpperCase() || 'UNKNOWN'}
                    </span>
                    {call.interest_level && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                        INTEREST_STYLES[call.interest_level.toLowerCase()] || 'bg-elevated text-dim border-border'
                      }`}>
                        {call.interest_level.toUpperCase()}
                      </span>
                    )}
                    {call.duration_seconds > 0 && (
                      <span className="text-[10px] text-dim">{formatDuration(call.duration_seconds)}</span>
                    )}
                  </div>
                </div>

                <span className="text-[10px] text-dim whitespace-nowrap shrink-0">{formatTime(call.created_at)}</span>

                <svg
                  className={`w-3.5 h-3.5 text-dim transition-transform duration-200 shrink-0 ${
                    expandedCall === call.id ? 'rotate-180' : ''
                  }`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {/* Expanded details */}
              {expandedCall === call.id && (
                <div className="px-3 pb-3 border-t border-border/50 pt-2.5 space-y-2.5">
                  {/* Summary */}
                  {call.summary && (
                    <div>
                      <p className="text-[10px] text-dim uppercase tracking-wider mb-1">Summary</p>
                      <p className="text-xs text-text/90 leading-relaxed">{call.summary}</p>
                    </div>
                  )}

                  {/* Key info grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {call.preferred_city && (
                      <div className="bg-bg/50 rounded px-2 py-1.5">
                        <p className="text-[9px] text-dim uppercase">City</p>
                        <p className="text-xs text-text">{call.preferred_city}</p>
                      </div>
                    )}
                    {call.callback_time && (
                      <div className="bg-bg/50 rounded px-2 py-1.5">
                        <p className="text-[9px] text-dim uppercase">Callback</p>
                        <p className="text-xs text-text">{call.callback_time}</p>
                      </div>
                    )}
                  </div>

                  {/* Questions */}
                  {call.questions && (
                    <div>
                      <p className="text-[10px] text-dim uppercase tracking-wider mb-1">Questions Asked</p>
                      <p className="text-xs text-text/80 leading-relaxed">{call.questions}</p>
                    </div>
                  )}

                  {/* Transcript */}
                  {call.transcript && (
                    <details className="group">
                      <summary className="text-[10px] text-dim uppercase tracking-wider cursor-pointer hover:text-muted transition-colors flex items-center gap-1">
                        <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                        Full Transcript
                      </summary>
                      <div className="mt-1.5 bg-bg/50 rounded p-2 max-h-40 overflow-y-auto">
                        <pre className="text-[11px] text-text/70 whitespace-pre-wrap font-sans leading-relaxed">{call.transcript}</pre>
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
