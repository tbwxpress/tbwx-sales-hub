'use client'

import { useState, useEffect, useCallback } from 'react'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'
import Toast from '@/components/Toast'

interface QuickReply {
  id: string; category: string; title: string; message: string;
  created_by: string; created_at: string
}

const CATEGORIES = [
  'Greeting',
  'Pricing & ROI',
  'Location',
  'Support',
  'Objection Handling',
  'Follow-up',
  'Closing',
] as const

const CATEGORY_ICONS: Record<string, string> = {
  'Greeting': 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z',
  'Pricing & ROI': 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  'Location': 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
  'Support': 'M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z',
  'Objection Handling': 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  'Follow-up': 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  'Closing': 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z',
}

const CATEGORY_COLORS: Record<string, string> = {
  'Greeting': 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  'Pricing & ROI': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  'Location': 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  'Support': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  'Objection Handling': 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  'Follow-up': 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  'Closing': 'bg-green-500/15 text-green-400 border-green-500/20',
}

const DEFAULT_QUICK_REPLIES: Omit<QuickReply, 'id' | 'created_by' | 'created_at'>[] = [
  // Greeting
  { category: 'Greeting', title: 'Welcome Response', message: 'Hi! Thanks for your interest in The Belgian Waffle Xpress franchise. I\'m here to help you with all the details. What city are you looking at for your franchise?' },
  { category: 'Greeting', title: 'Quick Acknowledgment', message: 'Hey! Got your inquiry. Let me share some details about the TBWX franchise opportunity. Are you available for a quick call?' },
  // Pricing & ROI
  { category: 'Pricing & ROI', title: 'Investment Details', message: 'The total investment for a TBWX franchise ranges from \u20B93-8 lakhs depending on the model and location. This includes equipment, branding, training, and initial inventory. Would you like me to send the detailed franchise deck?' },
  { category: 'Pricing & ROI', title: 'ROI & Payback', message: 'Most of our franchise partners see a payback period of 8-12 months. Monthly revenue depends on location and footfall, but our existing outlets average \u20B92-4 lakhs/month. Happy to share detailed projections.' },
  // Location
  { category: 'Location', title: 'City Availability', message: 'Great choice! We\'re expanding across North India. Can you confirm which city/area you\'re looking at? I\'ll check availability and share the location requirements.' },
  { category: 'Location', title: 'Site Requirements', message: 'For a TBWX outlet, you\'ll need: 100-200 sq ft space, ground floor preferred, good footfall area (mall, market, or college zone). We help with site selection too.' },
  // Support
  { category: 'Support', title: 'Franchise Support', message: 'As a TBWX franchise partner, you get: complete training, equipment setup, branding & signage, menu with recipes, marketing support, and ongoing operational guidance. We\'re with you from day one.' },
  { category: 'Support', title: 'Training Info', message: 'We provide 5-7 days of hands-on training covering food preparation, equipment handling, hygiene standards, POS operations, and customer service. No prior food industry experience needed.' },
  // Objection Handling
  { category: 'Objection Handling', title: 'Too Expensive', message: 'I understand the concern. Compared to other food franchises that cost \u20B915-50 lakhs, TBWX is designed to be accessible at \u20B93-8 lakhs. The low investment + quick payback makes it one of the best ROI opportunities in the F&B space.' },
  { category: 'Objection Handling', title: 'What If It Fails', message: 'Valid concern! Here\'s what protects you: our proven recipe system means consistent quality, we help with location selection (the #1 factor), and our ongoing support ensures you\'re never on your own. Plus the low investment means lower risk compared to bigger franchises.' },
  { category: 'Objection Handling', title: 'Competitor Comparison', message: 'What sets TBWX apart: lower investment than most waffle/cafe franchises, a unique Belgian waffle product that stands out, strong brand identity with \'Just Waffle It\' positioning, and a founder who\'s hands-on with every franchise partner.' },
  // Follow-up
  { category: 'Follow-up', title: 'Gentle Follow-up', message: 'Hi! Just checking in \u2014 did you get a chance to go through the franchise details I shared? Happy to answer any questions or schedule a call at your convenience.' },
  { category: 'Follow-up', title: 'Re-engagement', message: 'Hey! We spoke a while back about the TBWX franchise. Just wanted to let you know we still have availability in your area. Would you like to revisit the opportunity?' },
  // Closing
  { category: 'Closing', title: 'Next Steps', message: 'Great to hear you\'re interested! Here are the next steps:\n1. We\'ll share the franchise agreement for review\n2. Schedule a visit to our outlet\n3. Finalize location and timeline\n\nShall we proceed?' },
  { category: 'Closing', title: 'Send Deck', message: 'I\'m sharing our franchise deck with all the details \u2014 investment breakdown, support provided, outlet photos, and ROI projections. Take your time to review and let me know your questions!' },
]

export default function QuickRepliesPage() {
  const [replies, setReplies] = useState<QuickReply[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [loadingStarters, setLoadingStarters] = useState(false)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formCategory, setFormCategory] = useState<string>(CATEGORIES[0])
  const [formMessage, setFormMessage] = useState('')

  const fetchReplies = useCallback(async () => {
    try {
      const res = await fetch('/api/quick-replies')
      const data = await res.json()
      if (data.success) setReplies(data.data)
    } catch {
      // ignore
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchReplies()
  }, [fetchReplies])

  // When selecting a reply, populate the form
  function selectReply(qr: QuickReply) {
    setSelectedId(qr.id)
    setIsCreating(false)
    setFormTitle(qr.title)
    setFormCategory(qr.category)
    setFormMessage(qr.message)
  }

  function startCreate() {
    setSelectedId(null)
    setIsCreating(true)
    setFormTitle('')
    setFormCategory(CATEGORIES[0])
    setFormMessage('')
  }

  function clearEditor() {
    setSelectedId(null)
    setIsCreating(false)
    setFormTitle('')
    setFormCategory(CATEGORIES[0])
    setFormMessage('')
  }

  async function handleSave() {
    if (!formTitle.trim() || !formMessage.trim()) {
      setToast({ message: 'Title and message are required', type: 'error' })
      return
    }
    setSaving(true)
    try {
      if (isCreating) {
        const res = await fetch('/api/quick-replies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: formCategory, title: formTitle, message: formMessage }),
        })
        const data = await res.json()
        if (data.success) {
          setToast({ message: 'Quick reply created', type: 'success' })
          clearEditor()
          await fetchReplies()
        } else {
          setToast({ message: data.error || 'Failed to create', type: 'error' })
        }
      } else if (selectedId) {
        const res = await fetch('/api/quick-replies', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedId, category: formCategory, title: formTitle, message: formMessage }),
        })
        const data = await res.json()
        if (data.success) {
          setToast({ message: 'Quick reply updated', type: 'success' })
          await fetchReplies()
        } else {
          setToast({ message: data.error || 'Failed to update', type: 'error' })
        }
      }
    } catch {
      setToast({ message: 'Something went wrong', type: 'error' })
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selectedId) return
    if (!confirm('Delete this quick reply?')) return
    try {
      const res = await fetch(`/api/quick-replies?id=${selectedId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setToast({ message: 'Quick reply deleted', type: 'success' })
        clearEditor()
        await fetchReplies()
      } else {
        setToast({ message: data.error || 'Failed to delete', type: 'error' })
      }
    } catch {
      setToast({ message: 'Something went wrong', type: 'error' })
    }
  }

  async function loadStarterTemplates() {
    setLoadingStarters(true)
    try {
      for (const qr of DEFAULT_QUICK_REPLIES) {
        await fetch('/api/quick-replies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(qr),
        })
      }
      setToast({ message: `${DEFAULT_QUICK_REPLIES.length} starter templates created!`, type: 'success' })
      await fetchReplies()
    } catch {
      setToast({ message: 'Failed to create starter templates', type: 'error' })
    }
    setLoadingStarters(false)
  }

  // Filter replies
  const filtered = replies.filter(qr => {
    const matchSearch = !search || qr.title.toLowerCase().includes(search.toLowerCase()) || qr.message.toLowerCase().includes(search.toLowerCase())
    const matchCategory = !activeCategory || qr.category === activeCategory
    return matchSearch && matchCategory
  })

  // Group by category
  const grouped = CATEGORIES.reduce<Record<string, QuickReply[]>>((acc, cat) => {
    const items = filtered.filter(qr => qr.category === cat)
    if (items.length > 0) acc[cat] = items
    return acc
  }, {})

  // Also catch any replies in categories not in our list
  const uncategorized = filtered.filter(qr => !CATEGORIES.includes(qr.category as typeof CATEGORIES[number]))
  if (uncategorized.length > 0) grouped['Other'] = uncategorized

  const selectedReply = replies.find(r => r.id === selectedId)

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />

      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full">
        {/* Left sidebar - list */}
        <div className="lg:w-[420px] xl:w-[460px] border-r border-border flex flex-col">
          {/* Header */}
          <div className="px-4 py-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-lg font-bold text-text">Quick Replies</h1>
                <p className="text-xs text-dim mt-0.5">{replies.length} templates</p>
              </div>
              <button
                onClick={startCreate}
                className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add New
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search quick replies..."
                className="w-full bg-elevated border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent/50"
              />
            </div>

            {/* Category filter pills */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              <button
                onClick={() => setActiveCategory(null)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  !activeCategory ? 'bg-accent/15 text-accent border-accent/30' : 'text-dim border-border hover:text-text hover:border-border-light'
                }`}
              >
                All
              </button>
              {CATEGORIES.map(cat => {
                const count = replies.filter(r => r.category === cat).length
                if (count === 0 && activeCategory !== cat) return null
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      activeCategory === cat ? 'bg-accent/15 text-accent border-accent/30' : 'text-dim border-border hover:text-text hover:border-border-light'
                    }`}
                  >
                    {cat} {count > 0 && <span className="text-dim">({count})</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Reply list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : replies.length === 0 ? (
              /* Starter templates banner */
              <div className="p-6 text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-text font-semibold mb-1">No quick replies yet</h3>
                <p className="text-sm text-dim mb-4">
                  Get started with pre-built franchise sales templates, or create your own from scratch.
                </p>
                <button
                  onClick={loadStarterTemplates}
                  disabled={loadingStarters}
                  className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
                >
                  {loadingStarters ? (
                    <>
                      <div className="w-4 h-4 border-2 border-[#1a1209] border-t-transparent rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Load 15 Starter Templates
                    </>
                  )}
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-dim text-sm">No replies match your search</p>
              </div>
            ) : (
              <div className="py-2">
                {Object.entries(grouped).map(([cat, items]) => (
                  <div key={cat} className="mb-1">
                    {/* Category header */}
                    <div className="px-4 py-2 flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={CATEGORY_ICONS[cat] || 'M7 7h10v10H7z'} />
                      </svg>
                      <span className="text-[11px] font-semibold text-dim uppercase tracking-wider">{cat}</span>
                      <span className="text-[10px] text-dim">({items.length})</span>
                    </div>

                    {/* Items */}
                    {items.map(qr => (
                      <button
                        key={qr.id}
                        onClick={() => selectReply(qr)}
                        className={`w-full text-left px-4 py-3 border-l-2 transition-colors hover:bg-elevated/50 ${
                          selectedId === qr.id
                            ? 'border-l-accent bg-accent/5'
                            : 'border-l-transparent'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className={`text-sm font-medium ${selectedId === qr.id ? 'text-accent' : 'text-text'}`}>
                            {qr.title}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${CATEGORY_COLORS[qr.category] || 'bg-elevated text-dim border-border'}`}>
                            {qr.category}
                          </span>
                        </div>
                        <p className="text-xs text-dim mt-1 line-clamp-2 leading-relaxed">
                          {qr.message}
                        </p>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel - editor */}
        <div className="flex-1 flex flex-col">
          {(selectedId || isCreating) ? (
            <div className="flex-1 flex flex-col">
              {/* Editor header */}
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text">
                  {isCreating ? 'New Quick Reply' : 'Edit Quick Reply'}
                </h2>
                <button
                  onClick={clearEditor}
                  className="text-dim hover:text-text text-xs px-2 py-1 rounded hover:bg-elevated transition-colors"
                >
                  Close
                </button>
              </div>

              {/* Editor body */}
              <div className="flex-1 p-6 overflow-y-auto">
                <div className="max-w-2xl space-y-5">
                  {/* Title */}
                  <div>
                    <label className="block text-xs font-medium text-dim mb-1.5">Title</label>
                    <input
                      value={formTitle}
                      onChange={e => setFormTitle(e.target.value)}
                      placeholder="e.g. Welcome Response"
                      className="w-full bg-elevated border border-border rounded-lg px-4 py-2.5 text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent/50 transition-colors"
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-xs font-medium text-dim mb-1.5">Category</label>
                    <select
                      value={formCategory}
                      onChange={e => setFormCategory(e.target.value)}
                      className="w-full bg-elevated border border-border rounded-lg px-4 py-2.5 text-sm text-text focus:outline-none focus:border-accent/50 transition-colors"
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Message */}
                  <div>
                    <label className="block text-xs font-medium text-dim mb-1.5">Message</label>
                    <textarea
                      value={formMessage}
                      onChange={e => setFormMessage(e.target.value)}
                      placeholder="The message that will be sent to the lead..."
                      rows={8}
                      className="w-full bg-elevated border border-border rounded-lg px-4 py-3 text-sm text-text placeholder:text-dim resize-none focus:outline-none focus:border-accent/50 transition-colors leading-relaxed"
                    />
                    <p className="text-[10px] text-dim mt-1.5">{formMessage.length} characters</p>
                  </div>

                  {/* Preview */}
                  {formMessage && (
                    <div>
                      <label className="block text-xs font-medium text-dim mb-1.5">Preview</label>
                      <div className="bg-wa-sent border border-wa-sent/50 rounded-xl px-4 py-3 text-sm text-wa-text whitespace-pre-wrap leading-relaxed max-w-sm">
                        {formMessage}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Editor footer */}
              <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                <div>
                  {selectedId && (
                    <button
                      onClick={handleDelete}
                      className="text-xs text-dim hover:text-danger px-3 py-1.5 rounded-lg hover:bg-danger/10 transition-colors"
                    >
                      Delete Reply
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={clearEditor}
                    className="text-sm text-dim hover:text-text px-4 py-2 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !formTitle.trim() || !formMessage.trim()}
                    className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-[#1a1209] border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      isCreating ? 'Create Reply' : 'Save Changes'
                    )}
                  </button>
                </div>
              </div>

              {/* Metadata for existing replies */}
              {selectedReply && (
                <div className="px-6 py-2 border-t border-border bg-elevated/30">
                  <p className="text-[10px] text-dim">
                    Created by {selectedReply.created_by} on {new Date(selectedReply.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Empty state for editor panel */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-elevated flex items-center justify-center">
                  <svg className="w-7 h-7 text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-muted font-medium mb-1">Select a quick reply</p>
                <p className="text-sm text-dim">Choose one from the list to view or edit, or create a new one.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <PoweredBy />

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
