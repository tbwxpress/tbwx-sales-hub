'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'

interface DripStep { day: number; template: string; description: string }
interface DripSequence { id: string; name: string; priority_band: string; steps: string; active: number }

const BANDS = ['HOT', 'WARM', 'COLD'] as const
const BAND_COLORS: Record<string, string> = {
  HOT: 'var(--color-priority-hot)',
  WARM: 'var(--color-priority-warm)',
  COLD: 'var(--color-priority-cold)',
}
const BAND_DESCRIPTIONS: Record<string, string> = {
  HOT: 'Aggressive — 1-2-3 day cadence for high-intent leads',
  WARM: 'Balanced — 3-5-7 day cadence for moderate-interest leads',
  COLD: 'Gentle — 7-14-21 day cadence for low-engagement leads',
}

export default function DripSettingsPage() {
  const router = useRouter()
  const [sequences, setSequences] = useState<DripSequence[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  // Editing state
  const [editBand, setEditBand] = useState<string | null>(null)
  const [editSteps, setEditSteps] = useState<DripStep[]>([])
  const [editName, setEditName] = useState('')

  useEffect(() => {
    async function load() {
      const authRes = await fetch('/api/auth/me')
      const authData = await authRes.json()
      if (!authData.success || authData.data.role !== 'admin') { router.push('/dashboard'); return }

      const res = await fetch('/api/drip/sequences')
      const data = await res.json()
      if (data.success) setSequences(data.data)
      setLoading(false)
    }
    load()
  }, [router])

  function getSequenceForBand(band: string): { seq: DripSequence | null; steps: DripStep[] } {
    const seq = sequences.find(s => s.priority_band === band)
    if (!seq) return { seq: null, steps: [] }
    try { return { seq, steps: JSON.parse(seq.steps) } } catch { return { seq, steps: [] } }
  }

  function startEdit(band: string) {
    const { seq, steps } = getSequenceForBand(band)
    setEditBand(band)
    setEditName(seq?.name || `${band} Drip Sequence`)
    setEditSteps(steps.length > 0 ? steps : [{ day: 1, template: '', description: '' }])
  }

  function addStep() {
    const lastDay = editSteps.length > 0 ? editSteps[editSteps.length - 1].day : 0
    setEditSteps([...editSteps, { day: lastDay + 2, template: '', description: '' }])
  }

  function removeStep(idx: number) {
    setEditSteps(editSteps.filter((_, i) => i !== idx))
  }

  function updateStep(idx: number, field: keyof DripStep, value: string | number) {
    setEditSteps(editSteps.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  async function saveSequence() {
    if (!editBand || editSteps.length === 0) return
    setSaving(true)
    try {
      const id = sequences.find(s => s.priority_band === editBand)?.id || `drip-${editBand.toLowerCase()}`
      const res = await fetch('/api/drip/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: editName, priority_band: editBand, steps: editSteps, active: true }),
      })
      const data = await res.json()
      if (data.success) {
        setToast(`${editBand} sequence saved`)
        setEditBand(null)
        // Refresh
        const refresh = await fetch('/api/drip/sequences')
        const refreshData = await refresh.json()
        if (refreshData.success) setSequences(refreshData.data)
      }
    } catch { /* ignore */ }
    setSaving(false)
    setTimeout(() => setToast(''), 2500)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-56px)]">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text">Drip Sequences</h1>
            <p className="text-sm text-dim mt-0.5">Automated follow-up cadences by lead priority</p>
          </div>
          <a href="/dashboard" className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors bg-elevated text-muted hover:text-text">
            &larr; Dashboard
          </a>
        </div>

        {/* Sequence Cards */}
        <div className="space-y-4">
          {BANDS.map(band => {
            const { seq, steps } = getSequenceForBand(band)
            const isEditing = editBand === band

            return (
              <div key={band} className="bg-card border border-border rounded-lg overflow-hidden">
                {/* Header */}
                <div className="px-5 py-3 flex items-center justify-between border-b border-border/50">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold" style={{ color: BAND_COLORS[band] }}>{band}</span>
                    <span className="text-xs text-dim">{BAND_DESCRIPTIONS[band]}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-dim">
                      {steps.length > 0 ? `${steps.length} step${steps.length !== 1 ? 's' : ''}` : 'Not configured'}
                    </span>
                    {!isEditing && (
                      <button
                        onClick={() => startEdit(band)}
                        className="text-xs bg-accent/10 hover:bg-accent/20 text-accent px-2.5 py-1 rounded transition-colors"
                      >
                        {steps.length > 0 ? 'Edit' : 'Configure'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Steps Display (when not editing) */}
                {!isEditing && steps.length > 0 && (
                  <div className="px-5 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {steps.map((step: DripStep, i: number) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="text-[10px] bg-elevated px-2 py-1 rounded text-muted">
                            Day {step.day}: <span className="text-text font-medium">{step.template}</span>
                          </span>
                          {i < steps.length - 1 && <span className="text-dim text-xs">&rarr;</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Edit Form */}
                {isEditing && (
                  <div className="px-5 py-4 space-y-3">
                    <div>
                      <label className="text-xs text-dim block mb-1">Sequence Name</label>
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-dim block mb-2">Steps</label>
                      <div className="space-y-2">
                        {editSteps.map((step, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-dim w-8 flex-shrink-0">#{i + 1}</span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <label className="text-[10px] text-dim">Day</label>
                              <input
                                type="number"
                                min={1}
                                value={step.day}
                                onChange={e => updateStep(i, 'day', parseInt(e.target.value) || 1)}
                                className="w-14 bg-elevated border border-border rounded px-2 py-1.5 text-sm text-text text-center focus:outline-none focus:border-accent/50"
                              />
                            </div>
                            <input
                              value={step.template}
                              onChange={e => updateStep(i, 'template', e.target.value)}
                              placeholder="Template name"
                              className="flex-1 bg-elevated border border-border rounded px-2.5 py-1.5 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50"
                            />
                            <input
                              value={step.description}
                              onChange={e => updateStep(i, 'description', e.target.value)}
                              placeholder="Description"
                              className="flex-1 bg-elevated border border-border rounded px-2.5 py-1.5 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50"
                            />
                            <button onClick={() => removeStep(i)} className="text-dim hover:text-danger transition-colors p-1 flex-shrink-0" title="Remove step">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={addStep}
                        className="mt-2 text-xs text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Add Step
                      </button>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
                      <button onClick={() => setEditBand(null)} className="text-sm text-muted hover:text-text transition-colors px-3 py-1.5">Cancel</button>
                      <button
                        onClick={saveSequence}
                        disabled={saving || editSteps.length === 0 || editSteps.some(s => !s.template)}
                        className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save Sequence'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Info */}
        <div className="mt-6 bg-elevated/50 border border-border rounded-lg px-5 py-4">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">How it works</h3>
          <ul className="text-xs text-dim space-y-1.5">
            <li>Leads in <span className="text-text font-medium">DECK_SENT</span> or <span className="text-text font-medium">CALL_DONE</span> status get matched to a drip sequence based on their priority (HOT/WARM/COLD).</li>
            <li>Each step sends a WhatsApp template after the specified number of days since the lead entered the sequence.</li>
            <li>Drip <span className="text-text font-medium">pauses automatically</span> when a lead replies or moves to INTERESTED/NEGOTIATION/CONVERTED/LOST.</li>
            <li>Drip <span className="text-text font-medium">auto-resumes</span> if a lead replied but no manual message was sent for {'{'}3/5/7{'}'} days (HOT/WARM/COLD).</li>
            <li>Templates must be approved in Meta Business Manager before they can be sent.</li>
          </ul>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] toast-enter">
          <div className="bg-accent text-[#1a1209] px-5 py-2.5 rounded-lg shadow-xl text-sm font-medium flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}
