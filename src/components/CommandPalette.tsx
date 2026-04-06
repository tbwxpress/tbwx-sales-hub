'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Lead {
  row_number: number
  full_name: string
  phone: string
  email: string
  city: string
  lead_status: string
  lead_priority: string
  assigned_to: string
}

const STATUS_COLOR: Record<string, string> = {
  NEW: 'var(--color-status-new)', DECK_SENT: 'var(--color-status-deck-sent)',
  REPLIED: 'var(--color-status-replied)', NO_RESPONSE: 'var(--color-status-no-response)',
  CALL_DONE_INTERESTED: 'var(--color-status-call-done-interested)', HOT: 'var(--color-status-hot)',
  FINAL_NEGOTIATION: 'var(--color-status-final-negotiation)', CONVERTED: 'var(--color-status-converted)',
  DELAYED: 'var(--color-status-delayed)', LOST: 'var(--color-status-lost)',
}

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { label: 'Inbox', href: '/inbox', icon: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4' },
  { label: 'Follow-ups', href: '/follow-ups', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { label: 'Pipeline', href: '/pipeline', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Quick Replies', href: '/quick-replies', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { label: 'Templates', href: '/templates', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
  { label: 'Agent Stats', href: '/agent-stats', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { label: 'Admin', href: '/admin', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
]

export default function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [leads, setLeads] = useState<Lead[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Fetch leads when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      inputRef.current?.focus()
      fetch('/api/leads')
        .then(r => r.json())
        .then(d => { if (d.success) setLeads(d.data) })
        .catch(() => {})
    }
  }, [open])

  // Filter results
  const q = query.toLowerCase().trim()
  const navResults = q
    ? NAV_ITEMS.filter(n => n.label.toLowerCase().includes(q))
    : []
  const leadResults = q
    ? leads.filter(l =>
        l.full_name?.toLowerCase().includes(q) ||
        l.phone?.includes(q) ||
        l.city?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q)
      ).slice(0, 8)
    : []
  const allResults = [...navResults.map(n => ({ type: 'nav' as const, ...n })), ...leadResults.map(l => ({ type: 'lead' as const, ...l }))]

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, allResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && allResults.length > 0) {
      e.preventDefault()
      const item = allResults[activeIdx]
      if (item.type === 'nav') {
        router.push(item.href)
      } else {
        router.push(`/leads/${item.row_number}`)
      }
      setOpen(false)
    }
  }, [allResults, activeIdx, router])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  // Reset active on query change
  useEffect(() => { setActiveIdx(0) }, [query])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <svg className="w-5 h-5 shrink-0" style={{ color: 'var(--color-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search leads, pages..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--color-text)' }}
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--color-elevated)', color: 'var(--color-dim)', border: '1px solid var(--color-border)' }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[340px] overflow-y-auto py-1">
          {q === '' ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs" style={{ color: 'var(--color-dim)' }}>Type to search leads by name, phone, city, or email</p>
              <p className="text-[10px] mt-2" style={{ color: 'var(--color-dim)' }}>
                <kbd className="font-mono px-1 py-0.5 rounded" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>↑↓</kbd> navigate
                {' '}<kbd className="font-mono px-1 py-0.5 rounded" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>↵</kbd> select
              </p>
            </div>
          ) : allResults.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs" style={{ color: 'var(--color-dim)' }}>No results for &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            <>
              {/* Nav Results */}
              {navResults.length > 0 && (
                <>
                  <div className="px-4 py-1.5">
                    <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-dim)' }}>Pages</span>
                  </div>
                  {navResults.map((nav, i) => (
                    <button
                      key={nav.href}
                      onClick={() => { router.push(nav.href); setOpen(false) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                      style={{
                        background: activeIdx === i ? 'var(--color-elevated)' : 'transparent',
                        color: activeIdx === i ? 'var(--color-accent)' : 'var(--color-text)',
                      }}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={nav.icon} />
                      </svg>
                      <span className="text-sm font-medium">{nav.label}</span>
                    </button>
                  ))}
                </>
              )}

              {/* Lead Results */}
              {leadResults.length > 0 && (
                <>
                  <div className="px-4 py-1.5 mt-1">
                    <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-dim)' }}>Leads</span>
                  </div>
                  {leadResults.map((lead, j) => {
                    const idx = navResults.length + j
                    const sc = STATUS_COLOR[lead.lead_status] || 'var(--color-muted)'
                    return (
                      <button
                        key={lead.row_number}
                        onClick={() => { router.push(`/leads/${lead.row_number}`); setOpen(false) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                        style={{
                          background: activeIdx === idx ? 'var(--color-elevated)' : 'transparent',
                        }}
                      >
                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}>
                          {lead.full_name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: activeIdx === idx ? 'var(--color-accent)' : 'var(--color-text)' }}>
                            {lead.full_name || 'Unknown'}
                          </div>
                          <div className="text-[10px] truncate" style={{ color: 'var(--color-dim)' }}>
                            {lead.city}{lead.phone ? ` · ${lead.phone}` : ''}
                          </div>
                        </div>
                        <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: `color-mix(in srgb, ${sc} 15%, transparent)`, color: sc }}>
                          {lead.lead_status?.replace('_', ' ')}
                        </span>
                      </button>
                    )
                  })}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-border)', background: 'var(--color-elevated)' }}>
          <span className="text-[10px]" style={{ color: 'var(--color-dim)' }}>
            {allResults.length} result{allResults.length !== 1 ? 's' : ''}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-dim)' }}>
            <kbd className="font-mono">⌘K</kbd> to toggle
          </span>
        </div>
      </div>
    </div>
  )
}
