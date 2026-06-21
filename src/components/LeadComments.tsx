'use client'

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react'
import { toast } from 'sonner'
import { MessageSquare, Send, AtSign, CornerDownLeft } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import EmptyState from '@/components/ui/EmptyState'

// ─── Types ───────────────────────────────────────────────────────────────────

interface LeadComment {
  id: number
  lead_row: number
  author_id: string
  author_name: string
  body: string
  mentions: string[]
  created_at: string
}

interface Agent {
  id: string
  name: string
}

interface LeadCommentsProps {
  leadRow: number
  currentUser: { id?: string; name: string; role: string }
  agents: Agent[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Initials for the avatar fallback (e.g. "Rahul Mehta" → "RM").
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Deterministic warm-palette hue per author so avatars stay consistent but
// still distinguishable across the thread. Stays inside the gold/amber family.
function avatarHue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  // Bias toward warm tones (gold → amber → terracotta): 28–52°.
  return 28 + (h % 24)
}

// Compact relative time ("just now", "5m", "3h", "2d") with a full-date
// fallback for anything older than a week. Server stores UTC ("YYYY-MM-DD
// HH:MM:SS" from SQLite datetime('now')) — normalise to a parseable ISO string.
function relativeTime(raw: string): string {
  if (!raw) return ''
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return raw
  const diff = Date.now() - then
  const sec = Math.round(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Render a comment body, highlighting "@Name" tokens against the known agent
// roster in the brand accent. Names with spaces are matched greedily so
// "@Rahul Mehta" highlights both words.
function renderBody(body: string, agentNames: string[]): React.ReactNode {
  if (!body) return null
  // Longest names first so "@Rahul Mehta" wins over "@Rahul".
  const sorted = [...agentNames].filter(Boolean).sort((a, b) => b.length - a.length)
  if (sorted.length === 0) return body

  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`@(${sorted.map(escape).join('|')})`, 'g')

  const out: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = pattern.exec(body)) !== null) {
    if (m.index > last) out.push(<Fragment key={key++}>{body.slice(last, m.index)}</Fragment>)
    out.push(
      <span key={key++} className="text-accent font-semibold rounded px-0.5 -mx-0.5 bg-accent/10">
        @{m[1]}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (last < body.length) out.push(<Fragment key={key++}>{body.slice(last)}</Fragment>)
  return out
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LeadComments({ leadRow, currentUser, agents }: LeadCommentsProps) {
  const [comments, setComments] = useState<LeadComment[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)

  // Tracks which agent ids have been mentioned (by inserting "@Name") so we can
  // send the correct id[] to the API even though the textarea only holds names.
  const [mentionedIds, setMentionedIds] = useState<Set<string>>(new Set())

  // @mention autocomplete state.
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const listEndRef = useRef<HTMLDivElement>(null)

  const agentNames = useMemo(() => agents.map(a => a.name), [agents])

  // ── Load ─────────────────────────────────────────────────────────────────
  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${leadRow}/comments`)
      const data = await res.json()
      if (Array.isArray(data?.comments)) setComments(data.comments)
    } catch {
      /* silent — collaboration thread is non-blocking */
    } finally {
      setLoading(false)
    }
  }, [leadRow])

  useEffect(() => { fetchComments() }, [fetchComments])

  // Keep the newest comment in view after load / append.
  useEffect(() => {
    if (!loading && comments.length > 0) {
      listEndRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [comments.length, loading])

  // ── @mention detection ─────────────────────────────────────────────────────
  const filteredAgents = useMemo(() => {
    const q = mentionQuery.toLowerCase()
    return agents.filter(a => a.name.toLowerCase().includes(q)).slice(0, 6)
  }, [agents, mentionQuery])

  // Inspect the text just before the caret. If it's an unbroken "@token"
  // (no whitespace), open the picker and filter by the token.
  const detectMention = useCallback((value: string, caret: number) => {
    const upto = value.slice(0, caret)
    const at = upto.lastIndexOf('@')
    if (at === -1) { setMentionOpen(false); return }
    const between = upto.slice(at + 1)
    // A mention token is at-sign + word-ish chars/spaces, but breaks on newline
    // or a double-space (so finished mentions don't re-trigger).
    if (/[\n]/.test(between) || between.length > 30) { setMentionOpen(false); return }
    // Only trigger when @ starts a word (start-of-text or after whitespace).
    const before = at === 0 ? '' : upto[at - 1]
    if (before && !/\s/.test(before)) { setMentionOpen(false); return }
    setMentionStart(at)
    setMentionQuery(between)
    setMentionOpen(true)
    setActiveIdx(0)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setBody(value)
    const caret = e.target.selectionStart ?? value.length
    detectMention(value, caret)
  }

  // Insert "@Name " at the mention token position and record the agent id.
  const pickMention = useCallback((agent: Agent) => {
    if (mentionStart === null) return
    const el = textareaRef.current
    const caret = el?.selectionStart ?? body.length
    const before = body.slice(0, mentionStart)
    const after = body.slice(caret)
    const inserted = `@${agent.name} `
    const next = before + inserted + after
    setBody(next)
    setMentionedIds(prev => new Set(prev).add(agent.id))
    setMentionOpen(false)
    setMentionQuery('')
    setMentionStart(null)
    // Restore caret just after the inserted mention.
    requestAnimationFrame(() => {
      if (el) {
        const pos = before.length + inserted.length
        el.focus()
        el.setSelectionRange(pos, pos)
      }
    })
  }, [body, mentionStart])

  // ── Submit ─────────────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    const text = body.trim()
    if (!text || posting) return
    setPosting(true)

    // Only keep ids whose "@Name" actually survived in the final text.
    const mentions = agents
      .filter(a => mentionedIds.has(a.id) && text.includes(`@${a.name}`))
      .map(a => a.id)

    try {
      const res = await fetch(`/api/leads/${leadRow}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, mentions }),
      })
      const data = await res.json()
      if (res.ok && data?.comment) {
        setComments(prev => [...prev, data.comment as LeadComment])
        setBody('')
        setMentionedIds(new Set())
        setMentionOpen(false)
      } else {
        toast.error(data?.error || 'Could not post comment')
      }
    } catch {
      toast.error('Network error — comment not posted')
    } finally {
      setPosting(false)
    }
  }, [body, posting, agents, mentionedIds, leadRow])

  // ── Keyboard ─────────────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // When the mention picker is open, arrows/enter/tab drive it.
    if (mentionOpen && filteredAgents.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % filteredAgents.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => (i - 1 + filteredAgents.length) % filteredAgents.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(filteredAgents[activeIdx]); return }
      if (e.key === 'Escape') { e.preventDefault(); setMentionOpen(false); return }
    }
    // Enter sends, Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="px-4 pb-4 pt-3 border-t border-border/60 space-y-4">
      {/* ── Thread ── */}
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading comments">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex gap-3">
              <div className="skeleton h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-2 pt-0.5">
                <div className="skeleton h-3 w-1/3 rounded" />
                <div className="skeleton h-3 w-4/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="w-9 h-9" strokeWidth={1.5} />}
          title="No comments yet"
          hint="Start the thread — loop in a teammate with @ to pull them in."
        />
      ) : (
        <ul className="space-y-4" aria-label="Lead comments">
          {comments.map((c, i) => {
            const mine = (!!currentUser.id && c.author_id === currentUser.id) || c.author_name === currentUser.name
            const hue = avatarHue(c.author_name || c.author_id || String(c.id))
            return (
              <li key={c.id} className="flex gap-3 animate-fade-in" style={{ animationDelay: `${Math.min(i, 6) * 35}ms` }}>
                <Avatar size="sm" className="mt-0.5 shrink-0">
                  <AvatarFallback
                    className="text-[11px] font-semibold text-bg"
                    style={{ background: `hsl(${hue} 70% 55%)` }}
                  >
                    {initials(c.author_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-text leading-tight">
                      {c.author_name || 'Unknown'}
                    </span>
                    {mine && (
                      <span className="text-[9px] uppercase tracking-wider text-accent/80 bg-accent/10 border border-accent/20 rounded px-1 py-px font-semibold">
                        You
                      </span>
                    )}
                    <span className="text-[11px] text-dim" title={c.created_at}>
                      {relativeTime(c.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-body leading-relaxed whitespace-pre-wrap break-words mt-0.5">
                    {renderBody(c.body, agentNames)}
                  </p>
                </div>
              </li>
            )
          })}
          <div ref={listEndRef} />
        </ul>
      )}

      {/* ── Composer ── */}
      <div className="relative">
        <div className="rounded-lg border border-border bg-elevated focus-within:border-accent/50 transition-colors">
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment…  Type @ to mention a teammate"
            rows={2}
            aria-label="Write a comment"
            className="min-h-[60px] max-h-40 resize-none border-0 bg-transparent text-sm text-text placeholder:text-dim focus-visible:ring-0 focus-visible:border-0 px-3 py-2.5"
          />
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/50">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] text-dim">
              <AtSign className="w-3 h-3" />
              mention teammates
              <span className="text-border-light mx-1">·</span>
              <CornerDownLeft className="w-3 h-3" />
              to send
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={!body.trim() || posting}
              className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold rounded-md px-3 py-1.5 transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-ring"
              style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
            >
              {posting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-bg/40 border-t-bg rounded-full animate-spin" />
                  Posting
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Comment
                </>
              )}
            </button>
          </div>
        </div>

        {/* @mention dropdown — re-themed command-palette look, caret-anchored
            above the composer so it never clips the page chrome. */}
        {mentionOpen && filteredAgents.length > 0 && (
          <div
            role="listbox"
            aria-label="Mention a teammate"
            className="absolute bottom-full left-0 mb-2 w-64 max-w-[90vw] z-20 overflow-hidden rounded-lg border border-border bg-card shadow-xl animate-fade-in"
          >
            <div className="px-3 py-1.5 border-b border-border/60 flex items-center gap-1.5">
              <AtSign className="w-3 h-3 text-accent" />
              <span className="text-[10px] uppercase tracking-wider text-dim font-semibold">
                {mentionQuery ? `Matching “${mentionQuery}”` : 'Mention'}
              </span>
            </div>
            <ul className="max-h-56 overflow-y-auto py-1">
              {filteredAgents.map((a, i) => (
                <li key={a.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === activeIdx}
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseDown={e => { e.preventDefault(); pickMention(a) }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                      i === activeIdx ? 'bg-accent/15' : 'hover:bg-elevated'
                    }`}
                  >
                    <Avatar size="sm" className="shrink-0">
                      <AvatarFallback
                        className="text-[10px] font-semibold text-bg"
                        style={{ background: `hsl(${avatarHue(a.name)} 70% 55%)` }}
                      >
                        {initials(a.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className={`text-sm truncate ${i === activeIdx ? 'text-accent font-medium' : 'text-text'}`}>
                      {a.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
