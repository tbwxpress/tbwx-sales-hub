'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Lead, Message, QuickReply, ApiResponse } from '@/lib/types'
import VoiceAgentCard from '@/components/VoiceAgentCard'
import AgreementForm from '@/components/AgreementForm'
import { LEAD_STATUSES, STATUS_LABELS } from '@/config/client'
import Toast from '@/components/Toast'
import { formatTime } from '@/lib/format'

// Status and priority options
const STATUSES = LEAD_STATUSES
const PRIORITIES = ['HOT', 'WARM', 'COLD'] as const

// Available WhatsApp templates
const TEMPLATES = [
  { name: 'franchise_lead_welcome_v3', label: 'Franchise Welcome (Deck)' },
  { name: 'franchise_inquiry_response', label: 'Franchise Inquiry Response' },
]

// Status badge colors — theme-aware via CSS variables
function makeStatusVars(cssVar: string): { bg: string; text: string; border: string } {
  return {
    bg: `color-mix(in srgb, ${cssVar} 15%, transparent)`,
    text: cssVar,
    border: `color-mix(in srgb, ${cssVar} 30%, transparent)`,
  }
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  NEW:                  makeStatusVars('var(--color-status-new)'),
  DECK_SENT:            makeStatusVars('var(--color-status-deck-sent)'),
  REPLIED:              makeStatusVars('var(--color-status-replied)'),
  NO_RESPONSE:          makeStatusVars('var(--color-status-no-response)'),
  CALL_DONE_INTERESTED: makeStatusVars('var(--color-status-call-done-interested)'),
  HOT:                  makeStatusVars('var(--color-status-hot)'),
  FINAL_NEGOTIATION:    makeStatusVars('var(--color-status-final-negotiation)'),
  CONVERTED:            makeStatusVars('var(--color-status-converted)'),
  DELAYED:              makeStatusVars('var(--color-status-delayed)'),
  LOST:                 makeStatusVars('var(--color-status-lost)'),
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  HOT:  makeStatusVars('var(--color-priority-hot)'),
  WARM: makeStatusVars('var(--color-priority-warm)'),
  COLD: makeStatusVars('var(--color-priority-cold)'),
}

// ─── Lead Notes Component (DB-backed with timestamps) ────────────────────────

interface LeadNote { id: number; phone: string; note: string; created_by: string; created_at: string }

function LeadNotes({ phone }: { phone: string }) {
  const [notes, setNotes] = useState<LeadNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(phone)}/notes`)
      const data = await res.json()
      if (data.success) setNotes(data.data || [])
    } catch { /* silent */ }
  }, [phone])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  async function handleSave() {
    if (!newNote.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/inbox/${encodeURIComponent(phone)}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setNewNote('')
        fetchNotes()
      }
    } catch { /* silent */ }
    setSaving(false)
  }

  return (
    <div>
      <label className="text-xs text-dim block mb-2">Notes</label>
      <div className="flex gap-2 mb-3">
        <input
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          placeholder="Add a note (e.g. wants Meerut, budget 5L)..."
          className="flex-1 bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent/50"
        />
        <button
          onClick={handleSave}
          disabled={saving || !newNote.trim()}
          className="text-xs bg-accent/20 hover:bg-accent/30 text-accent px-3 py-2 rounded-md transition-colors font-medium disabled:opacity-50"
        >
          {saving ? '...' : 'Add'}
        </button>
      </div>
      {notes.length > 0 ? (
        <div className="space-y-2 max-h-48 overflow-y-auto border-l-2 border-accent/20 pl-3">
          {notes.map(n => (
            <div key={n.id} className="text-xs flex items-start gap-2">
              <span className="text-dim flex-shrink-0 w-24">{formatTime(n.created_at)}</span>
              <span className="text-muted flex-shrink-0 font-medium">{n.created_by}</span>
              <span className="text-text">{n.note}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-dim">No notes yet</p>
      )}
    </div>
  )
}

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--color-score-great)'
  if (score >= 60) return 'var(--color-score-good)'
  if (score >= 40) return 'var(--color-score-fair)'
  if (score >= 20) return 'var(--color-score-low)'
  return 'var(--color-score-poor)'
}
function scoreBg(score: number): string {
  return `color-mix(in srgb, ${scoreColor(score)} 15%, transparent)`
}
function scoreBorder(score: number, opacity = 40): string {
  return `color-mix(in srgb, ${scoreColor(score)} ${opacity}%, transparent)`
}
function scoreLabel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Average'
  if (score >= 20) return 'Low'
  return 'Cold'
}

function getDeliveryIcon(status: string) {
  switch (status?.toLowerCase()) {
    case 'sent': return '\u2713'
    case 'delivered': return '\u2713\u2713'
    case 'read': return '\u2713\u2713'
    case 'failed': return '\u2717'
    default: return ''
  }
}

export default function LeadDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  // Core state
  const [lead, setLead] = useState<Lead | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [users, setUsers] = useState<{ id: string; name: string; role: string; active?: boolean; is_telecaller?: boolean }[]>([])
  const [telecallerAssignment, setTelecallerAssignment] = useState<{ telecaller_user_id: string; telecaller_name: string; assigned_at: string; notes: string | null } | null>(null)
  const [tcSelected, setTcSelected] = useState('')
  const [tcSaving, setTcSaving] = useState(false)
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  // Assignment history
  const [assignHistory, setAssignHistory] = useState<{ from_agent: string; to_agent: string; assigned_by: string; created_at: string }[]>([])

  // Lead score
  const [leadScore, setLeadScore] = useState<number | null>(null)

  // Drip state
  const [dripState, setDripState] = useState<{ enabled: number; current_step: number; sequence: string; paused_at: string | null; pause_reason: string | null } | null>(null)
  const [togglingDrip, setTogglingDrip] = useState(false)

  // Session user
  const [sessionUser, setSessionUser] = useState<{ name: string; role: string } | null>(null)

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showAgreementForm, setShowAgreementForm] = useState(false)
  const [agreements, setAgreements] = useState<{ id: string; doc_type: string; status: string; created_at: string; generated_by: string }[]>([])

  // Fetch agreements for this lead
  useEffect(() => {
    if (!lead?.phone) return
    fetch(`/api/agreements?phone=${encodeURIComponent(lead.phone)}`)
      .then(r => r.json())
      .then(d => { if (d.success) setAgreements(d.data || []) })
      .catch(() => {})
  }, [lead?.phone])
  const [deleting, setDeleting] = useState(false)

  // Auto-message verification
  const [autoMsgStatus, setAutoMsgStatus] = useState<{
    auto_message_sent: boolean
    status: string
    wa_message_id?: string
    template_used?: string
    message?: string
  } | null>(null)
  const [verifying, setVerifying] = useState(false)

  // Form state
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false)
  const [notesValue, setNotesValue] = useState('')
  const [savingField, setSavingField] = useState('')
  const [outsideWindow, setOutsideWindow] = useState(false)
  const [sendError, setSendError] = useState('')

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const qrDropdownRef = useRef<HTMLDivElement>(null)
  const templateDropdownRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom of chat
  const scrollToBottom = useCallback(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  // Fetch lead data
  const fetchLead = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${id}`)
      const json: ApiResponse<Lead> = await res.json()
      if (json.success && json.data) {
        setLead(json.data)
        setNotesValue(json.data.notes || '')
        if (json.data.lead_score !== undefined) setLeadScore(json.data.lead_score)
      } else {
        setError(json.error || 'Lead not found')
      }
    } catch {
      setError('Failed to load lead')
    }
  }, [id])

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${id}/messages`)
      const json: ApiResponse<Message[]> = await res.json()
      if (json.success && json.data) {
        setMessages(json.data)
        const received = json.data.filter(m => m.direction === 'received')
        if (received.length === 0) {
          setOutsideWindow(true)
        } else {
          const lastTs = received[received.length - 1].timestamp
          const lastDate = new Date(lastTs)
          const hoursDiff = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60)
          setOutsideWindow(hoursDiff > 24)
        }
      }
    } catch {
      // silent fail on message refresh
    }
  }, [id])

  // Fetch users (for assign dropdown)
  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users')
      const json = await res.json()
      if (json.success && json.data) {
        setUsers(json.data)
      }
    } catch {
      // Non-admin users may get 403
    }
  }, [])

  // Fetch telecaller assignment for this lead
  const fetchTelecallerAssignment = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${id}/telecaller`)
      const json = await res.json()
      if (json.success) setTelecallerAssignment(json.data)
    } catch { /* silent */ }
  }, [id])

  async function assignTelecaller() {
    if (!tcSelected) return
    setTcSaving(true)
    try {
      const res = await fetch(`/api/leads/${id}/telecaller`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telecaller_user_id: tcSelected }),
      })
      const json = await res.json()
      if (json.success) {
        setTcSelected('')
        await fetchTelecallerAssignment()
      } else {
        setToast(json.error || 'Failed to assign')
      }
    } catch (e) { setToast(String(e)) }
    setTcSaving(false)
  }

  async function unassignTelecaller() {
    setTcSaving(true)
    try {
      const res = await fetch(`/api/leads/${id}/telecaller`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) await fetchTelecallerAssignment()
      else setToast(json.error || 'Failed to unassign')
    } catch (e) { setToast(String(e)) }
    setTcSaving(false)
  }

  // Fetch quick replies
  const fetchQuickReplies = useCallback(async () => {
    try {
      const res = await fetch('/api/quick-replies')
      const json: ApiResponse<QuickReply[]> = await res.json()
      if (json.success && json.data) {
        setQuickReplies(json.data)
      }
    } catch {
      // silent
    }
  }, [])

  // Fetch assignment history
  const fetchAssignHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${id}/assignments`)
      const json = await res.json()
      if (json.success && json.data) {
        setAssignHistory(json.data)
      }
    } catch {
      // silent
    }
  }, [id])

  // Fetch drip state
  const fetchDripState = useCallback(async () => {
    if (!lead?.phone) return
    try {
      const res = await fetch(`/api/drip?phone=${encodeURIComponent(lead.phone)}`)
      const json = await res.json()
      if (json.success) setDripState(json.data)
    } catch { /* silent */ }
  }, [lead?.phone])

  // Toggle drip sequence
  const handleToggleDrip = async () => {
    if (!lead?.phone) return
    setTogglingDrip(true)
    try {
      const res = await fetch('/api/drip', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: lead.phone, enabled: !dripState?.enabled }),
      })
      const json = await res.json()
      if (json.success) {
        await fetchDripState()
        setToast(dripState?.enabled ? 'Drip sequence paused' : 'Drip sequence resumed')
      }
    } catch { /* silent */ }
    setTogglingDrip(false)
  }

  // Delete lead (admin only)
  const handleDeleteLead = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) {
        setToast('Lead deleted')
        setTimeout(() => router.push('/dashboard'), 500)
      } else {
        setToast(json.error || 'Failed to delete')
      }
    } catch {
      setToast('Failed to delete lead')
    }
    setDeleting(false)
    setShowDeleteConfirm(false)
  }

  // Fetch auto-message verification status
  const fetchAutoMsgStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${id}/verify-message`)
      const json = await res.json()
      if (json.success) {
        setAutoMsgStatus(json.data)
      }
    } catch {
      // silent
    }
  }, [id])

  // Manual re-verify
  const handleVerify = async () => {
    setVerifying(true)
    await fetchAutoMsgStatus()
    setVerifying(false)
    setToast('Message status refreshed')
  }

  // Initial load
  useEffect(() => {
    async function load() {
      setLoading(true)
      await Promise.all([fetchLead(), fetchMessages(), fetchUsers(), fetchQuickReplies(), fetchAutoMsgStatus(), fetchAssignHistory(), fetchTelecallerAssignment()])
      setLoading(false)
    }
    load()
  }, [fetchLead, fetchMessages, fetchUsers, fetchQuickReplies, fetchAutoMsgStatus, fetchAssignHistory, fetchTelecallerAssignment])

  // Fetch drip state when lead is loaded
  useEffect(() => {
    if (lead?.phone) fetchDripState()
  }, [lead?.phone, fetchDripState])

  // Fetch session user (for admin detection)
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(json => {
      if (json.success) setSessionUser(json.data)
    }).catch(() => {})
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Auto-refresh messages every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMessages()
    }, 15000)
    return () => clearInterval(interval)
  }, [fetchMessages])

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (qrDropdownRef.current && !qrDropdownRef.current.contains(e.target as Node)) {
        setShowQuickReplies(false)
      }
      if (templateDropdownRef.current && !templateDropdownRef.current.contains(e.target as Node)) {
        setShowTemplateDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Update lead field
  const updateField = async (field: string, value: string) => {
    if (!lead) return
    setSavingField(field)
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      const json = await res.json()
      if (json.success) {
        setLead(prev => prev ? { ...prev, [field]: value } : prev)
        const labels: Record<string, string> = {
          lead_status: 'Status',
          lead_priority: 'Priority',
          assigned_to: 'Assignment',
          notes: 'Notes',
          next_followup: 'Follow-up date',
        }
        setToast(`${labels[field] || field} updated`)
        if (field === 'assigned_to') fetchAssignHistory()
      }
    } catch {
      // silent
    }
    setSavingField('')
  }

  // Send free-text message
  const handleSend = async () => {
    if (!messageText.trim() || !lead) return
    setSending(true)
    setSendError('')
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: lead.phone,
          message: messageText.trim(),
          lead_row: lead.row_number,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setMessageText('')
        await fetchMessages()
        await fetchLead()
      } else if (json.needs_template) {
        setOutsideWindow(true)
        setSendError('Outside 24-hour window. Use a template message instead.')
      } else {
        setSendError(json.error || 'Failed to send')
      }
    } catch {
      setSendError('Network error')
    }
    setSending(false)
  }

  // Send template message
  const handleSendTemplate = async (templateName: string) => {
    if (!lead) return
    setSending(true)
    setSendError('')
    setShowTemplateDropdown(false)
    try {
      const firstName = lead.full_name.split(' ')[0] || lead.full_name
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: lead.phone,
          template_name: templateName,
          template_params: [{ type: 'text', text: firstName }],
          lead_row: lead.row_number,
        }),
      })
      const json = await res.json()
      if (json.success) {
        await fetchMessages()
        await fetchLead()
      } else {
        setSendError(json.error || 'Failed to send template')
      }
    } catch {
      setSendError('Network error')
    }
    setSending(false)
  }

  // Quick reply select
  const handleQuickReply = (qr: QuickReply) => {
    setMessageText(qr.message)
    setShowQuickReplies(false)
  }

  // Mark as lost
  const handleMarkLost = async () => {
    if (!confirm('Are you sure you want to mark this lead as LOST?')) return
    await updateField('lead_status', 'LOST')
  }

  // Mark as converted
  const handleMarkConverted = async () => {
    if (!confirm('Mark this lead as CONVERTED?')) return
    await updateField('lead_status', 'CONVERTED')
  }

  // Key handler for message input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Loading lead...
        </div>
      </div>
    )
  }

  // Error state
  if (error || !lead) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-4">
        <p className="text-danger">{error || 'Lead not found'}</p>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-sm text-muted hover:text-text underline"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  const isTerminal = lead.lead_status === 'CONVERTED' || lead.lead_status === 'LOST'

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Top bar */}
      <div className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-dim hover:text-text transition-colors text-sm flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </button>
          <div className="w-px h-5 bg-border" />
          <h1 className="text-lg font-semibold">{lead.full_name}</h1>
          <span className="text-xs px-2 py-0.5 rounded border" style={STATUS_COLORS[lead.lead_status] ? { background: STATUS_COLORS[lead.lead_status].bg, color: STATUS_COLORS[lead.lead_status].text, borderColor: STATUS_COLORS[lead.lead_status].border } : { background: 'var(--color-elevated)', color: 'var(--color-muted)', borderColor: 'var(--color-border)' }}>
            {lead.lead_status}
          </span>
          <span className="text-xs px-2 py-0.5 rounded border" style={PRIORITY_COLORS[lead.lead_priority] ? { background: PRIORITY_COLORS[lead.lead_priority].bg, color: PRIORITY_COLORS[lead.lead_priority].text, borderColor: PRIORITY_COLORS[lead.lead_priority].border } : { background: 'var(--color-elevated)', color: 'var(--color-muted)', borderColor: 'var(--color-border)' }}>
            {lead.lead_priority || '-'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-dim">
          <span>Lead #{lead.row_number}</span>
          {lead.created_time && (
            <>
              <span className="text-border-light">|</span>
              <span>Created {new Date(lead.created_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </>
          )}
        </div>
      </div>

      {/* Main layout */}
      <div className="flex h-[calc(100vh-57px)]">

        {/* LEFT SIDEBAR */}
        <div className="w-1/3 min-w-[340px] max-w-[440px] border-r border-border overflow-y-auto bg-bg">
          <div className="p-5 space-y-5">

            {/* Lead Info Card */}
            <div className="bg-card rounded-lg border border-border p-4 space-y-3">
              <h2 className="text-xs font-semibold text-dim uppercase tracking-wide mb-3">Lead Info</h2>

              <InfoRow label="Name" value={lead.full_name} />
              <InfoRow label="Phone" value={lead.phone} isPhone />
              <InfoRow label="Email" value={lead.email || '---'} />
              <InfoRow label="City" value={[lead.city, lead.state].filter(Boolean).join(', ') || '---'} />
              <InfoRow label="Model Interest" value={lead.model_interest || '---'} />
              <InfoRow label="Experience" value={lead.experience || '---'} />
              <InfoRow label="Timeline" value={lead.timeline || '---'} />
              <InfoRow label="Platform" value={lead.platform || '---'} />
            </div>

            {/* Lead Score Card */}
            {leadScore !== null && (
              <div className="bg-card rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-dim uppercase tracking-wide">Lead Score</h2>
                  <span className="text-[10px] font-medium" style={{ color: scoreColor(leadScore) }}>
                    {scoreLabel(leadScore)}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
                    style={{
                      backgroundColor: scoreBg(leadScore),
                      color: scoreColor(leadScore),
                      border: `2px solid ${scoreBorder(leadScore, 40)}`,
                    }}
                  >
                    {leadScore}
                  </div>
                  <div className="flex-1">
                    <div className="w-full h-2 bg-elevated rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${leadScore}%`, backgroundColor: scoreColor(leadScore) }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[9px] text-dim">0</span>
                      <span className="text-[9px] text-dim">100</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Drip Sequence Card */}
            <div className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-dim uppercase tracking-wide">Follow-up Sequence</h2>
                <button
                  onClick={handleToggleDrip}
                  disabled={togglingDrip}
                  className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
                    dripState?.enabled ? 'bg-success' : 'bg-elevated border border-border'
                  } disabled:opacity-50`}
                  title={dripState?.enabled ? 'Pause drip sequence' : 'Resume drip sequence'}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                    dripState?.enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
              {dripState ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      dripState.enabled
                        ? 'bg-success/15 text-success border border-success/25'
                        : 'bg-elevated text-dim border border-border'
                    }`}>
                      {dripState.enabled ? 'Active' : 'Paused'}
                    </span>
                    <span className="text-dim">Step {dripState.current_step + 1}</span>
                    {dripState.sequence && (
                      <span className="text-dim">· {dripState.sequence}</span>
                    )}
                  </div>
                  {dripState.pause_reason && (
                    <p className="text-[10px] text-dim">Paused: {dripState.pause_reason}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-dim">No sequence started</p>
              )}
            </div>

            {/* n8n Auto-Message Status */}
            <div className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-dim uppercase tracking-wide">Auto Message</h2>
                <button
                  onClick={handleVerify}
                  disabled={verifying}
                  className="text-[10px] text-dim hover:text-accent transition-colors disabled:opacity-50"
                  title="Refresh status"
                >
                  {verifying ? 'Checking...' : 'Refresh'}
                </button>
              </div>
              {autoMsgStatus ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {autoMsgStatus.status === 'read' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-md">
                        <span>&#10003;&#10003;</span> Read
                      </span>
                    )}
                    {autoMsgStatus.status === 'delivered' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-md">
                        <span>&#10003;&#10003;</span> Delivered
                      </span>
                    )}
                    {autoMsgStatus.status === 'sent' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 bg-zinc-500/10 border border-zinc-500/20 px-2.5 py-1 rounded-md">
                        <span>&#10003;</span> Sent
                      </span>
                    )}
                    {autoMsgStatus.status === 'failed' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-md">
                        <span>&#10007;</span> Failed
                      </span>
                    )}
                    {autoMsgStatus.status === 'none' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-dim bg-elevated border border-border px-2.5 py-1 rounded-md">
                        Not sent
                      </span>
                    )}
                    {!['read', 'delivered', 'sent', 'failed', 'none'].includes(autoMsgStatus.status) && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 bg-elevated border border-border px-2.5 py-1 rounded-md">
                        Unknown
                      </span>
                    )}
                  </div>
                  {autoMsgStatus.template_used && (
                    <p className="text-[10px] text-dim">Template: {autoMsgStatus.template_used}</p>
                  )}
                  <p className="text-[10px] text-dim">{autoMsgStatus.message}</p>
                </div>
              ) : (
                <p className="text-xs text-dim">Loading...</p>
              )}
            </div>

            {/* Documents Card */}
            <div className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-text flex items-center gap-2">
                  <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  Agreements
                </h3>
                <button
                  onClick={() => setShowAgreementForm(true)}
                  className="text-[10px] bg-accent/10 hover:bg-accent/20 text-accent px-2.5 py-1 rounded transition-colors font-medium"
                >
                  + Generate
                </button>
              </div>
              {agreements.length > 0 ? (
                <div className="space-y-2">
                  {agreements.map(a => (
                    <div key={a.id} className="flex items-center justify-between text-xs bg-elevated/50 rounded px-3 py-2 border border-border/50">
                      <div>
                        <span className="text-text font-medium">{a.doc_type === 'FBA' ? 'FBA' : 'Franchise Agreement'}</span>
                        <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          a.status === 'GENERATED' ? 'bg-success/15 text-success' :
                          a.status === 'REVIEWED' ? 'bg-accent/15 text-accent' :
                          'bg-elevated text-dim'
                        }`}>{a.status}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Preview — works for any status */}
                        <button
                          onClick={() => window.open(`/api/agreements/${a.id}/generate`, '_blank')}
                          className="text-accent hover:text-accent-hover text-[10px] font-medium"
                        >
                          Preview
                        </button>
                        {/* Generate PDF — admin only, for drafts */}
                        {a.status === 'DRAFT' && sessionUser?.role === 'admin' && (
                          <button
                            onClick={async () => {
                              const res = await fetch(`/api/agreements/${a.id}/generate`, { method: 'POST' })
                              if (res.ok) {
                                const html = await res.text()
                                const win = window.open('', '_blank')
                                if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 500) }
                                // Refresh agreements list
                                fetch(`/api/agreements?phone=${encodeURIComponent(lead!.phone)}`)
                                  .then(r => r.json())
                                  .then(d => { if (d.success) setAgreements(d.data || []) })
                                  .catch(() => {})
                              }
                            }}
                            className="text-success hover:text-green-300 text-[10px] font-medium"
                          >
                            Generate PDF
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-dim">No agreements generated yet</p>
              )}
            </div>

            {/* Agreement Form Modal */}
            {showAgreementForm && lead && (
              <AgreementForm
                leadName={lead.full_name}
                leadPhone={lead.phone}
                leadRow={lead.row_number}
                leadCity={lead.city}
                userRole={sessionUser?.role || 'agent'}
                onClose={() => setShowAgreementForm(false)}
                onSuccess={() => {
                  fetch(`/api/agreements?phone=${encodeURIComponent(lead.phone)}`)
                    .then(r => r.json())
                    .then(d => { if (d.success) setAgreements(d.data || []) })
                    .catch(() => {})
                }}
              />
            )}

            {/* AI Voice Agent Card */}
            <VoiceAgentCard
              phone={lead.phone}
              leadName={lead.full_name}
              leadId={String(lead.row_number || '')}
            />

            {/* Manage Card */}
            <div className="bg-card rounded-lg border border-border p-4 space-y-4">
              <h2 className="text-xs font-semibold text-dim uppercase tracking-wide mb-1">Manage</h2>

              <div>
                <label className="text-xs text-dim block mb-1">Status</label>
                <select
                  value={lead.lead_status}
                  onChange={(e) => updateField('lead_status', e.target.value)}
                  disabled={savingField === 'lead_status'}
                  className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
                >
                  {STATUSES.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-dim block mb-1">Priority</label>
                <select
                  value={lead.lead_priority}
                  onChange={(e) => updateField('lead_priority', e.target.value)}
                  disabled={savingField === 'lead_priority'}
                  className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
                >
                  {PRIORITIES.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Assigned To */}
              <div>
                <label className="text-xs text-dim block mb-1">Assigned To</label>
                {users.length > 0 ? (
                  <select
                    value={lead.assigned_to}
                    onChange={(e) => updateField('assigned_to', e.target.value)}
                    disabled={savingField === 'assigned_to'}
                    className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
                  >
                    <option value="">Unassigned</option>
                    {users.map(u => (
                      <option key={u.id} value={u.name}>{u.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-muted">{lead.assigned_to || 'Unassigned'}</p>
                )}
                {/* Telecaller assignment */}
                <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>Telecaller</p>
                  {telecallerAssignment ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs">
                        <span className="font-medium text-text">{telecallerAssignment.telecaller_name}</span>
                        <span className="text-dim ml-2">assigned for telecalling</span>
                      </div>
                      <button onClick={unassignTelecaller} disabled={tcSaving} className="text-[11px] text-dim hover:text-danger transition-colors disabled:opacity-50">
                        Unassign
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select value={tcSelected} onChange={e => setTcSelected(e.target.value)} className="flex-1 bg-card border border-border rounded-md px-2 py-1.5 text-xs text-text focus:outline-none focus:border-accent/50">
                        <option value="">Pick a telecaller…</option>
                        {users.filter(u => u.is_telecaller && u.active !== false).map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                      <button onClick={assignTelecaller} disabled={!tcSelected || tcSaving} className="text-xs font-semibold px-3 py-1.5 rounded-md transition-colors disabled:opacity-50" style={{ background: 'var(--color-accent)', color: '#1a1209' }}>
                        Assign
                      </button>
                    </div>
                  )}
                  {users.filter(u => u.is_telecaller && u.active !== false).length === 0 && (
                    <p className="text-[11px] text-dim mt-1">No telecallers configured. Add one in Admin → Users.</p>
                  )}
                </div>

                {/* Assignment History */}
                {assignHistory.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[10px] text-dim uppercase tracking-wider">History</p>
                    {assignHistory.slice(0, 5).map((h, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px] text-muted">
                        <svg className="w-3 h-3 shrink-0 text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                        </svg>
                        <span>
                          {h.from_agent || 'Unassigned'} → {h.to_agent || 'Unassigned'}
                        </span>
                        <span className="text-dim ml-auto whitespace-nowrap">
                          {h.assigned_by} · {formatTime(h.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Follow-up date picker */}
              <div>
                <label className="text-xs text-dim block mb-1">Next Follow-up</label>
                <input
                  type="date"
                  value={lead.next_followup || ''}
                  onChange={(e) => updateField('next_followup', e.target.value)}
                  disabled={savingField === 'next_followup'}
                  className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
                />
                {savingField === 'next_followup' && (
                  <p className="text-xs text-dim mt-1">Saving...</p>
                )}
              </div>

              {/* Notes — timestamped, from DB */}
              <LeadNotes phone={lead.phone} />
            </div>

            {/* Action Buttons */}
            {!isTerminal && (
              <div className="space-y-2">
                <button
                  onClick={handleMarkConverted}
                  className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-md px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Mark as Converted
                </button>
                <button
                  onClick={handleMarkLost}
                  className="w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-md px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Mark as Lost
                </button>
              </div>
            )}

            {isTerminal && (
              <div className={`rounded-lg border p-4 text-center ${
                lead.lead_status === 'CONVERTED'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}>
                <p className="text-sm font-medium">
                  {lead.lead_status === 'CONVERTED' ? 'Lead Converted' : 'Lead Lost'}
                </p>
              </div>
            )}

            <button
              onClick={() => router.push('/leads')}
              className="w-full bg-elevated hover:bg-border border border-border text-muted rounded-md px-4 py-2.5 text-sm transition-colors"
            >
              &larr; Back to Leads
            </button>

            {/* Admin: Delete Lead */}
            {sessionUser?.role === 'admin' && (
              <div className="pt-3 border-t border-border">
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full text-xs text-dim hover:text-danger transition-colors py-2"
                  >
                    Delete this lead
                  </button>
                ) : (
                  <div className="bg-danger/10 border border-danger/20 rounded-md p-3 space-y-2">
                    <p className="text-xs text-danger font-medium">
                      Delete this lead permanently?
                    </p>
                    <p className="text-[10px] text-dim">
                      This will clear all data for {lead.full_name} from the sheet. This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDeleteLead}
                        disabled={deleting}
                        className="flex-1 bg-danger/20 hover:bg-danger/30 border border-danger/30 text-danger text-xs rounded-md px-3 py-1.5 font-medium transition-colors disabled:opacity-50"
                      >
                        {deleting ? 'Deleting...' : 'Confirm Delete'}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 bg-elevated border border-border text-muted text-xs rounded-md px-3 py-1.5 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL - CHAT */}
        <div className="flex-1 flex flex-col bg-bg">

          {/* Chat header */}
          <div className="border-b border-border bg-card px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-600/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-text">WhatsApp Chat</p>
                <p className="text-xs text-dim">{lead.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {outsideWindow && (
                <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-1 rounded">
                  Outside 24h window
                </span>
              )}
              <span className="text-xs text-dim">{messages.length} messages</span>
            </div>
          </div>

          {/* Messages area */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-dim">
                <svg className="w-12 h-12 mb-3 text-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-sm">No messages yet</p>
                <p className="text-xs mt-1">Send a template message to start the conversation</p>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => {
                  const isSent = msg.direction === 'sent'
                  const showDate = i === 0 || (
                    new Date(msg.timestamp).toDateString() !== new Date(messages[i - 1].timestamp).toDateString()
                  )

                  return (
                    <div key={`${msg.wa_message_id || i}-${msg.timestamp}`}>
                      {showDate && (
                        <div className="flex justify-center my-3">
                          <span className="text-xs bg-elevated text-dim px-3 py-1 rounded-full">
                            {new Date(msg.timestamp).toLocaleDateString('en-IN', {
                              day: 'numeric', month: 'long', year: 'numeric'
                            })}
                          </span>
                        </div>
                      )}
                      <div className={`flex ${isSent ? 'justify-end' : 'justify-start'} mb-1`}>
                        <div
                          className={`relative max-w-[70%] rounded-lg px-3 py-2 ${
                            isSent
                              ? 'bg-wa-sent text-zinc-100 rounded-tr-none'
                              : 'bg-wa-received text-text rounded-tl-none'
                          }`}
                        >
                          {msg.template_used && (
                            <div className="text-[10px] text-zinc-400 mb-1 italic">
                              Template: {msg.template_used}
                            </div>
                          )}

                          {isSent && msg.sent_by && (
                            <div className="text-[10px] text-emerald-400/70 mb-0.5 font-medium">
                              {msg.sent_by}
                            </div>
                          )}

                          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                            {msg.text}
                          </p>

                          <div className={`flex items-center gap-1 mt-1 ${isSent ? 'justify-end' : 'justify-start'}`}>
                            <span className="text-[10px] text-zinc-400/60">
                              {formatTime(msg.timestamp)}
                            </span>
                            {isSent && (
                              <span className={`text-[10px] ${msg.status === 'read' ? 'text-blue-400' : 'text-zinc-500'}`}>
                                {getDeliveryIcon(msg.status)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={chatEndRef} />
              </>
            )}
          </div>

          {/* Send error */}
          {sendError && (
            <div className="px-5 py-2 bg-danger/10 border-t border-danger/20">
              <p className="text-xs text-danger flex items-center gap-2">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {sendError}
                <button onClick={() => setSendError('')} className="ml-auto text-danger/60 hover:text-danger">
                  Dismiss
                </button>
              </p>
            </div>
          )}

          {/* 24-hour window warning + template dropdown */}
          {outsideWindow && (
            <div className="px-5 py-2 bg-amber-500/5 border-t border-amber-500/20">
              <div className="flex items-center justify-between">
                <p className="text-xs text-amber-400/80">
                  This lead has not messaged in the last 24 hours. You can only send approved templates.
                </p>
                <div className="relative" ref={templateDropdownRef}>
                  <button
                    onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
                    disabled={sending}
                    className="bg-green-600 hover:bg-green-500 text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {sending ? 'Sending...' : 'Send Template'}
                  </button>
                  {showTemplateDropdown && (
                    <div className="absolute bottom-full right-0 mb-1 w-64 bg-elevated border border-border rounded-lg shadow-xl overflow-hidden z-10">
                      {TEMPLATES.map(t => (
                        <button
                          key={t.name}
                          onClick={() => handleSendTemplate(t.name)}
                          className="w-full text-left px-4 py-3 text-sm text-text hover:bg-card transition-colors border-b border-border last:border-b-0"
                        >
                          <span className="font-medium">{t.label}</span>
                          <span className="block text-xs text-dim mt-0.5">{t.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Message input area */}
          <div className="border-t border-border bg-card px-4 py-3">
            <div className="flex items-end gap-2">
              {/* Quick Replies button */}
              <div className="relative" ref={qrDropdownRef}>
                <button
                  onClick={() => setShowQuickReplies(!showQuickReplies)}
                  className="p-2 rounded-lg bg-elevated hover:bg-border text-dim hover:text-text transition-colors"
                  title="Quick Replies"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
                {showQuickReplies && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 max-h-64 overflow-y-auto bg-elevated border border-border rounded-lg shadow-xl z-10">
                    <div className="px-3 py-2 border-b border-border sticky top-0 bg-elevated">
                      <p className="text-xs font-semibold text-dim uppercase tracking-wide">Quick Replies</p>
                    </div>
                    {quickReplies.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-dim">
                        No quick replies configured
                      </div>
                    ) : (
                      quickReplies.map(qr => (
                        <button
                          key={qr.id}
                          onClick={() => handleQuickReply(qr)}
                          className="w-full text-left px-3 py-2.5 hover:bg-card transition-colors border-b border-border/50 last:border-b-0"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-text font-medium">{qr.title}</span>
                            {qr.category && (
                              <span className="text-[10px] bg-card text-dim px-1.5 py-0.5 rounded">{qr.category}</span>
                            )}
                          </div>
                          <p className="text-xs text-dim mt-0.5 line-clamp-2">{qr.message}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Text input */}
              <div className="flex-1 relative">
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={outsideWindow ? 'Send a template message first...' : 'Type a message...'}
                  disabled={outsideWindow && !messageText}
                  rows={1}
                  className="w-full bg-elevated border border-border rounded-lg px-4 py-2.5 text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent/50 resize-none disabled:opacity-50"
                  style={{ minHeight: '42px', maxHeight: '120px' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = '42px'
                    target.style.height = Math.min(target.scrollHeight, 120) + 'px'
                  }}
                />
              </div>

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={sending || !messageText.trim() || (outsideWindow && !messageText.trim())}
                className="p-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Send message"
              >
                {sending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}

// Info row component for the sidebar
function InfoRow({ label, value, isPhone }: { label: string; value: string; isPhone?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-dim shrink-0 pt-0.5">{label}</span>
      {isPhone ? (
        <a
          href={`https://wa.me/${value?.replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-green-400 hover:text-green-300 font-mono text-right"
        >
          {value}
        </a>
      ) : (
        <span className="text-sm text-text text-right">{value}</span>
      )}
    </div>
  )
}
