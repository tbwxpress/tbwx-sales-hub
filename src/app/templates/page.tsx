'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'

interface Template {
  id: string
  name: string
  status: string
  category: string
  body: string
  param_count: number
}

const CATEGORY_COLORS: Record<string, string> = {
  UTILITY: 'bg-green-500/15 text-green-400',
  MARKETING: 'bg-orange-500/15 text-orange-400',
  AUTHENTICATION: 'bg-blue-500/15 text-blue-400',
}

const STATUS_COLORS: Record<string, string> = {
  APPROVED: 'bg-success/15 text-success',
  PENDING: 'bg-warning/15 text-warning',
  REJECTED: 'bg-danger/15 text-danger',
}

export default function TemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ role: string } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [toast, setToast] = useState('')
  const [deleting, setDeleting] = useState('')

  // Create form state
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('UTILITY')
  const [newHeader, setNewHeader] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newFooter, setNewFooter] = useState('The Belgian Waffle Xpress')
  const [newExampleParams, setNewExampleParams] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.success) setCurrentUser(d.data)
    })
    fetchTemplates()
  }, [router])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 4000)
      return () => clearTimeout(t)
    }
  }, [toast])

  async function fetchTemplates() {
    try {
      const res = await fetch('/api/templates')
      const data = await res.json()
      if (data.success) setTemplates(data.data)
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName || !newBody) return

    setCreating(true)
    try {
      const exampleParams = newExampleParams
        ? newExampleParams.split(',').map(s => s.trim())
        : undefined

      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          category: newCategory,
          header_text: newHeader || undefined,
          body_text: newBody,
          footer_text: newFooter || undefined,
          example_params: exampleParams,
        }),
      })
      const data = await res.json()

      if (data.success) {
        setToast(`Template "${newName}" created (${data.data.status})`)
        setShowCreate(false)
        setNewName(''); setNewBody(''); setNewHeader(''); setNewExampleParams('')
        fetchTemplates()
      } else {
        setToast(`Error: ${data.error}`)
      }
    } catch {
      setToast('Network error')
    }
    setCreating(false)
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return

    setDeleting(name)
    try {
      const res = await fetch('/api/templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()

      if (data.success) {
        setToast(`Template "${name}" deleted`)
        fetchTemplates()
      } else {
        setToast(`Error: ${data.error}`)
      }
    } catch {
      setToast('Network error')
    }
    setDeleting('')
  }

  // Count params in body text
  function getParamHint(body: string) {
    const matches = body.match(/\{\{\d+\}\}/g) || []
    return matches.length
  }

  const isAdmin = currentUser?.role === 'admin'

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />

      {/* Toast */}
      {toast && (
        <div className={`fixed top-16 right-4 z-50 bg-card text-text text-sm px-4 py-2.5 rounded-lg shadow-xl shadow-black/30 animate-slide-in border ${
          toast.toLowerCase().includes('error') ? 'border-red-500/50 text-red-300' : 'border-border'
        }`}>
          {toast}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6 flex-1 w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text">WhatsApp Templates</h1>
            <p className="text-sm text-dim mt-0.5">
              {templates.length} templates &middot; {templates.filter(t => t.status === 'APPROVED').length} approved
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
            >
              {showCreate ? 'Cancel' : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  New Template
                </>
              )}
            </button>
          )}
        </div>

        {/* Create Form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="bg-card border border-border rounded-xl p-5 mb-6 space-y-4">
            <h2 className="text-sm font-semibold text-muted">Create New Template</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-dim mb-1">Template Name</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  required
                  placeholder="e.g. autoresponse_2"
                  className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
                />
                <p className="text-[10px] text-dim mt-1">Lowercase, underscores only. Auto-formatted.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-dim mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
                >
                  <option value="UTILITY">UTILITY (delivers to everyone)</option>
                  <option value="MARKETING">MARKETING (opt-in required)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-dim mb-1">Header (optional)</label>
              <input
                value={newHeader}
                onChange={e => setNewHeader(e.target.value)}
                placeholder="e.g. Your Franchise Inquiry"
                className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-dim mb-1">
                Body Text <span className="text-danger">*</span>
              </label>
              <textarea
                value={newBody}
                onChange={e => setNewBody(e.target.value)}
                required
                rows={5}
                placeholder={'Hi {{1}}, thanks for your interest...\n\nUse {{1}}, {{2}} etc for variables.'}
                className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50 resize-none"
              />
              {getParamHint(newBody) > 0 && (
                <p className="text-[10px] text-accent mt-1">
                  {getParamHint(newBody)} parameter(s) detected. Provide example values below.
                </p>
              )}
            </div>

            {getParamHint(newBody) > 0 && (
              <div>
                <label className="block text-xs font-medium text-dim mb-1">
                  Example Values (comma-separated)
                </label>
                <input
                  value={newExampleParams}
                  onChange={e => setNewExampleParams(e.target.value)}
                  placeholder="e.g. Rahul, Mumbai"
                  className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
                />
                <p className="text-[10px] text-dim mt-1">Meta requires examples for template approval.</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-dim mb-1">Footer (optional)</label>
              <input
                value={newFooter}
                onChange={e => setNewFooter(e.target.value)}
                placeholder="The Belgian Waffle Xpress"
                className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
              />
            </div>

            <button
              type="submit"
              disabled={creating}
              className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Submit for Approval'}
            </button>
          </form>
        )}

        {/* Template List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-dim text-sm">No templates found</div>
        ) : (
          <div className="space-y-3">
            {templates.map(t => (
              <div key={t.id} className="bg-card border border-border rounded-xl p-4 hover:border-border-light transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-text font-mono">{t.name}</h3>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[t.category] || 'bg-elevated text-muted'}`}>
                      {t.category}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status] || 'bg-elevated text-muted'}`}>
                      {t.status}
                    </span>
                    {t.param_count > 0 && (
                      <span className="text-[10px] bg-elevated text-dim px-2 py-0.5 rounded-full">
                        {t.param_count} param{t.param_count > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {isAdmin && t.name !== 'hello_world' && (
                    <button
                      onClick={() => handleDelete(t.name)}
                      disabled={deleting === t.name}
                      className="text-dim hover:text-danger text-xs transition-colors disabled:opacity-50"
                    >
                      {deleting === t.name ? 'Deleting...' : 'Delete'}
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted leading-relaxed whitespace-pre-wrap bg-elevated/50 rounded-lg p-3 border border-border/50">
                  {t.body || '(No body text)'}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[10px] text-dim">ID: {t.id}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
