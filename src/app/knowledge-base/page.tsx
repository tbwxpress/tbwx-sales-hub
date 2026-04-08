'use client'

import { useState, useEffect, useCallback } from 'react'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'
import Toast from '@/components/Toast'

interface KBEntry {
  id: string; category: string; title: string; content: string;
  link: string; created_by: string; created_at: string
}

interface UserInfo {
  name: string
  role: string
}

const CATEGORIES = [
  'Doc Links',
  'Sales Scripts',
  'TBWX Info',
  'FAQs',
  'Objection Handling',
  'Pricing',
  'Process',
] as const

const CATEGORY_ICONS: Record<string, string> = {
  'Doc Links': 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
  'Sales Scripts': 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  'TBWX Info': 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z',
  'FAQs': 'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z',
  'Objection Handling': 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  'Pricing': 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  'Process': 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z',
}

const CATEGORY_COLORS: Record<string, string> = {
  'Doc Links': 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  'Sales Scripts': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  'TBWX Info': 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  'FAQs': 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  'Objection Handling': 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  'Pricing': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  'Process': 'bg-pink-500/15 text-pink-400 border-pink-500/20',
}

export default function KnowledgeBasePage() {
  const [entries, setEntries] = useState<KBEntry[]>([])
  const [user, setUser] = useState<UserInfo | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formCategory, setFormCategory] = useState<string>(CATEGORIES[0])
  const [formContent, setFormContent] = useState('')
  const [formLink, setFormLink] = useState('')

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d.success) setUser(d.data) })
      .catch(() => {})
  }, [])

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge-base')
      const data = await res.json()
      if (data.success) setEntries(data.data)
    } catch {
      // ignore
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  function selectEntry(entry: KBEntry) {
    setSelectedId(entry.id)
    setIsCreating(false)
    setFormTitle(entry.title)
    setFormCategory(entry.category)
    setFormContent(entry.content)
    setFormLink(entry.link)
  }

  function startCreate() {
    setSelectedId(null)
    setIsCreating(true)
    setFormTitle('')
    setFormCategory(CATEGORIES[0])
    setFormContent('')
    setFormLink('')
  }

  function clearEditor() {
    setSelectedId(null)
    setIsCreating(false)
    setFormTitle('')
    setFormCategory(CATEGORIES[0])
    setFormContent('')
    setFormLink('')
  }

  async function handleSave() {
    if (!formTitle.trim() || !formContent.trim()) {
      setToast({ message: 'Title and content are required', type: 'error' })
      return
    }
    setSaving(true)
    try {
      if (isCreating) {
        const res = await fetch('/api/knowledge-base', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: formCategory, title: formTitle, content: formContent, link: formLink }),
        })
        const data = await res.json()
        if (data.success) {
          setToast({ message: 'Entry created', type: 'success' })
          clearEditor()
          await fetchEntries()
        } else {
          setToast({ message: data.error || 'Failed to create', type: 'error' })
        }
      } else if (selectedId) {
        const res = await fetch('/api/knowledge-base', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedId, category: formCategory, title: formTitle, content: formContent, link: formLink }),
        })
        const data = await res.json()
        if (data.success) {
          setToast({ message: 'Entry updated', type: 'success' })
          await fetchEntries()
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
    if (!confirm('Delete this knowledge base entry?')) return
    try {
      const res = await fetch(`/api/knowledge-base?id=${selectedId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setToast({ message: 'Entry deleted', type: 'success' })
        clearEditor()
        await fetchEntries()
      } else {
        setToast({ message: data.error || 'Failed to delete', type: 'error' })
      }
    } catch {
      setToast({ message: 'Something went wrong', type: 'error' })
    }
  }

  // Filter entries
  const filtered = entries.filter(e => {
    const matchSearch = !search || e.title.toLowerCase().includes(search.toLowerCase()) || e.content.toLowerCase().includes(search.toLowerCase())
    const matchCategory = !activeCategory || e.category === activeCategory
    return matchSearch && matchCategory
  })

  // Group by category
  const grouped = CATEGORIES.reduce<Record<string, KBEntry[]>>((acc, cat) => {
    const items = filtered.filter(e => e.category === cat)
    if (items.length > 0) acc[cat] = items
    return acc
  }, {})
  const uncategorized = filtered.filter(e => !CATEGORIES.includes(e.category as typeof CATEGORIES[number]))
  if (uncategorized.length > 0) grouped['Other'] = uncategorized

  const selectedEntry = entries.find(e => e.id === selectedId)

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
                <h1 className="text-lg font-bold text-text">Knowledge Base</h1>
                <p className="text-xs text-dim mt-0.5">{entries.length} entries</p>
              </div>
              {isAdmin && (
                <button
                  onClick={startCreate}
                  className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Entry
                </button>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search knowledge base..."
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
                const count = entries.filter(e => e.category === cat).length
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

          {/* Entry list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : entries.length === 0 ? (
              <div className="p-6 text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <h3 className="text-text font-semibold mb-1">No entries yet</h3>
                <p className="text-sm text-dim">
                  {isAdmin ? 'Add your first knowledge base entry to help your sales team.' : 'The admin hasn\'t added any entries yet.'}
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-dim text-sm">No entries match your search</p>
              </div>
            ) : (
              <div className="py-2">
                {Object.entries(grouped).map(([cat, items]) => (
                  <div key={cat} className="mb-1">
                    <div className="px-4 py-2 flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={CATEGORY_ICONS[cat] || 'M7 7h10v10H7z'} />
                      </svg>
                      <span className="text-[11px] font-semibold text-dim uppercase tracking-wider">{cat}</span>
                      <span className="text-[10px] text-dim">({items.length})</span>
                    </div>

                    {items.map(entry => (
                      <button
                        key={entry.id}
                        onClick={() => selectEntry(entry)}
                        className={`w-full text-left px-4 py-3 border-l-2 transition-colors hover:bg-elevated/50 ${
                          selectedId === entry.id
                            ? 'border-l-accent bg-accent/5'
                            : 'border-l-transparent'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className={`text-sm font-medium ${selectedId === entry.id ? 'text-accent' : 'text-text'}`}>
                            {entry.title}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${CATEGORY_COLORS[entry.category] || 'bg-elevated text-dim border-border'}`}>
                            {entry.category}
                          </span>
                        </div>
                        <p className="text-xs text-dim mt-1 line-clamp-2 leading-relaxed">
                          {entry.content}
                        </p>
                        {entry.link && (
                          <div className="flex items-center gap-1 mt-1.5">
                            <svg className="w-3 h-3 text-accent/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                            </svg>
                            <span className="text-[10px] text-accent/60 truncate">Has link</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel - viewer/editor */}
        <div className="flex-1 flex flex-col">
          {(selectedId || isCreating) ? (
            <div className="flex-1 flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text">
                  {isCreating ? 'New Entry' : isAdmin ? 'Edit Entry' : 'View Entry'}
                </h2>
                <button
                  onClick={clearEditor}
                  className="text-dim hover:text-text text-xs px-2 py-1 rounded hover:bg-elevated transition-colors"
                >
                  Close
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 p-6 overflow-y-auto">
                <div className="max-w-2xl space-y-5">
                  {/* Title */}
                  <div>
                    <label className="block text-xs font-medium text-dim mb-1.5">Title</label>
                    {isAdmin ? (
                      <input
                        value={formTitle}
                        onChange={e => setFormTitle(e.target.value)}
                        placeholder="e.g. Franchise Investment Breakdown"
                        className="w-full bg-elevated border border-border rounded-lg px-4 py-2.5 text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent/50 transition-colors"
                      />
                    ) : (
                      <p className="text-sm text-text font-medium">{formTitle}</p>
                    )}
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-xs font-medium text-dim mb-1.5">Category</label>
                    {isAdmin ? (
                      <select
                        value={formCategory}
                        onChange={e => setFormCategory(e.target.value)}
                        className="w-full bg-elevated border border-border rounded-lg px-4 py-2.5 text-sm text-text focus:outline-none focus:border-accent/50 transition-colors"
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <span className={`text-xs px-2 py-1 rounded border ${CATEGORY_COLORS[formCategory] || 'bg-elevated text-dim border-border'}`}>
                        {formCategory}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div>
                    <label className="block text-xs font-medium text-dim mb-1.5">Content</label>
                    {isAdmin ? (
                      <>
                        <textarea
                          value={formContent}
                          onChange={e => setFormContent(e.target.value)}
                          placeholder="Write the content here... supports multiple lines for scripts, FAQs, detailed info etc."
                          rows={12}
                          className="w-full bg-elevated border border-border rounded-lg px-4 py-3 text-sm text-text placeholder:text-dim resize-none focus:outline-none focus:border-accent/50 transition-colors leading-relaxed"
                        />
                        <p className="text-[10px] text-dim mt-1.5">{formContent.length} characters</p>
                      </>
                    ) : (
                      <div className="bg-elevated border border-border rounded-lg px-4 py-3 text-sm text-text whitespace-pre-wrap leading-relaxed">
                        {formContent}
                      </div>
                    )}
                  </div>

                  {/* Link */}
                  <div>
                    <label className="block text-xs font-medium text-dim mb-1.5">Link (optional)</label>
                    {isAdmin ? (
                      <input
                        value={formLink}
                        onChange={e => setFormLink(e.target.value)}
                        placeholder="https://drive.google.com/... or any URL"
                        className="w-full bg-elevated border border-border rounded-lg px-4 py-2.5 text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent/50 transition-colors"
                      />
                    ) : formLink ? (
                      <a
                        href={formLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                        Open Link
                      </a>
                    ) : (
                      <p className="text-xs text-dim">No link attached</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer — admin only for save/delete */}
              {isAdmin && (
                <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                  <div>
                    {selectedId && (
                      <button
                        onClick={handleDelete}
                        className="text-xs text-dim hover:text-danger px-3 py-1.5 rounded-lg hover:bg-danger/10 transition-colors"
                      >
                        Delete Entry
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
                      disabled={saving || !formTitle.trim() || !formContent.trim()}
                      className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {saving ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-[#1a1209] border-t-transparent rounded-full animate-spin" />
                          Saving...
                        </>
                      ) : (
                        isCreating ? 'Create Entry' : 'Save Changes'
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Metadata */}
              {selectedEntry && (
                <div className="px-6 py-2 border-t border-border bg-elevated/30">
                  <p className="text-[10px] text-dim">
                    Added by {selectedEntry.created_by} on {new Date(selectedEntry.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Empty state */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-elevated flex items-center justify-center">
                  <svg className="w-7 h-7 text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <p className="text-muted font-medium mb-1">Select an entry</p>
                <p className="text-sm text-dim">Choose from the list to view details, scripts, or links.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <PoweredBy />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
