'use client'

import { useState } from 'react'

interface QuickReply {
  id: string
  category: string
  title: string
  message: string
  created_by: string
  created_at: string
}

interface QuickReplyPickerProps {
  replies: QuickReply[]
  onSelect: (message: string) => void
  onClose: () => void
}

const CATEGORY_ORDER = [
  'Greeting',
  'Pricing & ROI',
  'Location',
  'Support',
  'Objection Handling',
  'Follow-up',
  'Closing',
]

const CATEGORY_ICONS: Record<string, string> = {
  'Greeting': 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z',
  'Pricing & ROI': 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  'Location': 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
  'Support': 'M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z',
  'Objection Handling': 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  'Follow-up': 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  'Closing': 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z',
}

export default function QuickReplyPicker({ replies, onSelect, onClose }: QuickReplyPickerProps) {
  const [search, setSearch] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(CATEGORY_ORDER))
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Filter by search
  const filtered = replies.filter(qr => {
    if (!search) return true
    const q = search.toLowerCase()
    return qr.title.toLowerCase().includes(q) || qr.message.toLowerCase().includes(q)
  })

  // Group by category, respecting order
  const grouped: [string, QuickReply[]][] = []
  const usedCategories = new Set<string>()

  for (const cat of CATEGORY_ORDER) {
    const items = filtered.filter(qr => qr.category === cat)
    if (items.length > 0) {
      grouped.push([cat, items])
      usedCategories.add(cat)
    }
  }
  // Catch uncategorized
  const uncategorized = filtered.filter(qr => !usedCategories.has(qr.category))
  if (uncategorized.length > 0) {
    grouped.push(['Other', uncategorized])
  }

  function toggleCategory(cat: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const hoveredReply = hoveredId ? replies.find(r => r.id === hoveredId) : null

  return (
    <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden flex flex-col" style={{ maxHeight: '420px', width: '340px' }}>
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-text">Quick Replies</span>
        <button onClick={onClose} className="text-dim hover:text-text transition-colors p-0.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full bg-elevated border border-border rounded-md pl-8 pr-3 py-1.5 text-xs text-text placeholder:text-dim focus:outline-none focus:border-accent/50"
            autoFocus
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-dim">No quick replies found</p>
          </div>
        ) : (
          grouped.map(([cat, items]) => (
            <div key={cat}>
              {/* Category header - collapsible */}
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-elevated/50 hover:bg-elevated transition-colors"
              >
                <svg
                  className={`w-3 h-3 text-dim transition-transform ${expandedCategories.has(cat) ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <svg className="w-3 h-3 text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={CATEGORY_ICONS[cat] || 'M7 7h10v10H7z'} />
                </svg>
                <span className="text-[10px] font-semibold text-dim uppercase tracking-wider">{cat}</span>
                <span className="text-[10px] text-dim ml-auto">{items.length}</span>
              </button>

              {/* Items */}
              {expandedCategories.has(cat) && (
                <div>
                  {items.map(qr => (
                    <button
                      key={qr.id}
                      onClick={() => onSelect(qr.message)}
                      onMouseEnter={() => setHoveredId(qr.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className="w-full text-left px-4 py-2 text-xs text-text hover:bg-accent/10 hover:text-accent transition-colors border-l-2 border-l-transparent hover:border-l-accent"
                    >
                      {qr.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Preview tooltip at bottom when hovering */}
      {hoveredReply && (
        <div className="border-t border-border px-3 py-2 bg-elevated/50 max-h-[100px] overflow-y-auto">
          <p className="text-[10px] text-dim mb-0.5 font-medium">Preview:</p>
          <p className="text-[11px] text-muted leading-relaxed whitespace-pre-wrap line-clamp-3">
            {hoveredReply.message}
          </p>
        </div>
      )}
    </div>
  )
}
