'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Navbar from '@/components/Navbar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SUGGESTED_REPLIES } from '@/config/suggested-replies'
import LogCallModal from '@/components/LogCallModal'
import CallHistory from '@/components/CallHistory'
import VoiceAgentCard from '@/components/VoiceAgentCard'
import ActivityLog from '@/components/ActivityLog'

interface Contact {
  phone: string
  name: string
  is_lead: number
  lead_row: number | null
  lead_id: string
  city: string
  avatar_color: string
  last_message: string
  last_direction: string
  last_message_at: string
  unread_count: number
}

interface Message {
  id: number
  phone: string
  direction: 'sent' | 'received'
  text: string
  timestamp: string
  sent_by: string
  wa_message_id: string
  status: string
  template_used: string
  read: number
  media_type?: string
  media_id?: string
  media_mime?: string
  media_filename?: string
  media_path?: string
}

interface QuickReply {
  id: string
  category: string
  title: string
  message: string
}

interface WaTemplate {
  name: string
  label: string
  param_count: number
  category: string
}

interface LeadNote {
  id: number
  phone: string
  note: string
  created_by: string
  created_at: string
}

export default function InboxPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [activePhone, setActivePhone] = useState<string | null>(null)
  const [activeContact, setActiveContact] = useState<Contact | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [forwardSrc, setForwardSrc] = useState<Message | null>(null)
  const [forwardTarget, setForwardTarget] = useState('')
  const [forwardCaption, setForwardCaption] = useState('')
  const [forwarding, setForwarding] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msgLoading, setMsgLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)
  const [toast, setToast] = useState('')
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [waTemplates, setWaTemplates] = useState<WaTemplate[]>([])
  const [syncing, setSyncing] = useState(false)
  const [showNewChat, setShowNewChat] = useState(false)
  const [newChatPhone, setNewChatPhone] = useState('')
  const [newChatName, setNewChatName] = useState('')
  // Lead details panel
  const [showLeadDetails, setShowLeadDetails] = useState(false)
  // Full lead info from API
  interface LeadInfo { row_number: number; full_name: string; lead_status: string; lead_priority: string; assigned_to: string; email: string; city: string; state: string; model_interest: string; next_followup: string; lead_score?: number }
  const [leadInfo, setLeadInfo] = useState<LeadInfo | null>(null)
  const [updatingLead, setUpdatingLead] = useState(false)
  // Call logging
  const [showCallModal, setShowCallModal] = useState(false)
  const [callHistoryKey, setCallHistoryKey] = useState(0)
  // Notes
  const [leadNotes, setLeadNotes] = useState<LeadNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  // Reminder
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [reminderTitle, setReminderTitle] = useState('')
  const [reminderDate, setReminderDate] = useState('')
  const [reminderTime, setReminderTime] = useState('10:00')
  const [savingReminder, setSavingReminder] = useState(false)
  // Browser notifications
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default')
  // Mobile sidebar toggle (controls list↔thread on <md)
  const [showSidebar, setShowSidebar] = useState(true)
  // Mobile right-side context drawer (slide-in lead details on <md). Desktop ignores this.
  const [contextDrawerOpen, setContextDrawerOpen] = useState(false)
  // Session user — needed to check can_edit_leads permission
  const [sessionUser, setSessionUser] = useState<{ id: string; role: string; can_edit_leads?: boolean } | null>(null)
  // Inbox delegation state
  const [inboxActiveDelegation, setInboxActiveDelegation] = useState<{ id: number; from_agent_name: string; to_agent_name: string; expires_at: string | null } | null>(null)
  const [showInboxDelegateModal, setShowInboxDelegateModal] = useState(false)
  const [inboxDelegateToId, setInboxDelegateToId] = useState('')
  const [inboxDelegateMessage, setInboxDelegateMessage] = useState('')
  const [inboxDelegateExpires, setInboxDelegateExpires] = useState('')
  const [inboxDelegating, setInboxDelegating] = useState(false)
  const [inboxEndingDelegation, setInboxEndingDelegation] = useState(false)
  const [inboxAgents, setInboxAgents] = useState<{ id: string; name: string; role: string; active: boolean }[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const prevMsgCountRef = useRef(0)

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      if (e.key === '/' && activePhone) {
        e.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="Search"]')
        searchInput?.focus()
      } else if (e.key === 'r' || e.key === 'R') {
        if (activePhone) {
          e.preventDefault()
          const msgInput = document.querySelector<HTMLInputElement>('input[placeholder*="Type a message"], input[placeholder*="Use a template"]')
          msgInput?.focus()
        }
      } else if (e.key === 'Escape') {
        if (activePhone) {
          setShowSidebar(true)
          setActivePhone(null)
          setActiveContact(null)
          setMessages([])
          setContextDrawerOpen(false)
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activePhone])

  // Request notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission)
    }
  }, [])

  function requestNotifPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(p => setNotifPermission(p))
    }
  }

  function showNotification(title: string, body: string) {
    if (notifPermission === 'granted' && typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const n = new Notification(title, {
          body,
          icon: '/logo-tbwx.png',
          tag: 'tbwx-inbox',
        })
        // Play notification sound
        try {
          const audio = new Audio('/notification.mp3')
          audio.volume = 0.5
          audio.play().catch(() => {})
        } catch { /* no audio file, skip */ }
        setTimeout(() => n.close(), 5000)
      } catch { /* ignore */ }
    }
  }

  // Inbox pagination — agents with thousands of leads would overflow SQLite
  // param limits and lag the DOM if we loaded everything at once.
  const PAGE_SIZE = 200
  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE)
  const [hasMoreContacts, setHasMoreContacts] = useState(false)
  const [loadingMoreContacts, setLoadingMoreContacts] = useState(false)

  // Fetch contacts (paginated, always from offset 0 so polling stays consistent)
  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch(`/api/inbox?limit=${loadedCount}&offset=0`)
      const data = await res.json()
      if (data.success) {
        setContacts(data.data)
        setHasMoreContacts(Boolean(data.meta?.hasMore))
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [loadedCount])

  // "Show older" — expand the loaded window and refetch
  const loadOlderContacts = useCallback(async () => {
    if (loadingMoreContacts || !hasMoreContacts) return
    setLoadingMoreContacts(true)
    const next = loadedCount + PAGE_SIZE
    try {
      const res = await fetch(`/api/inbox?limit=${next}&offset=0`)
      const data = await res.json()
      if (data.success) {
        setContacts(data.data)
        setHasMoreContacts(Boolean(data.meta?.hasMore))
        setLoadedCount(next)
      }
    } catch { /* ignore */ }
    setLoadingMoreContacts(false)
  }, [loadedCount, hasMoreContacts, loadingMoreContacts])

  // Fetch messages for active contact
  const fetchMessages = useCallback(async (phone: string) => {
    try {
      const res = await fetch(`/api/inbox/${phone}`)
      const data = await res.json()
      if (data.success) {
        const newMsgs: Message[] = data.data.messages
        // Check for new received messages → trigger notification
        const receivedCount = newMsgs.filter(m => m.direction === 'received').length
        if (receivedCount > prevMsgCountRef.current && prevMsgCountRef.current > 0) {
          const latestReceived = newMsgs.filter(m => m.direction === 'received').pop()
          if (latestReceived) {
            showNotification(
              `New message from ${data.data.contact?.name || phone}`,
              latestReceived.text.substring(0, 100)
            )
          }
        }
        prevMsgCountRef.current = receivedCount
        setMessages(newMsgs)
        if (data.data.contact) setActiveContact(data.data.contact)
        setContacts(prev => prev.map(c =>
          c.phone === phone ? { ...c, unread_count: 0 } : c
        ))
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifPermission])

  // Fetch quick replies + templates + session
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d.success) setSessionUser(d.data) })
      .catch(() => {})
    fetch('/api/users')
      .then(r => r.json())
      .then(d => { if (d.success) setInboxAgents(d.data.filter((u: { active: boolean }) => u.active)) })
      .catch(() => {})
    fetch('/api/quick-replies')
      .then(r => r.json())
      .then(d => { if (d.success) setQuickReplies(d.data) })
      .catch(() => {})
    fetch('/api/templates')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setWaTemplates(
            d.data
              .filter((t: { status: string; name: string }) => t.status === 'APPROVED' && t.name !== 'hello_world')
              .map((t: { name: string; param_count: number; category: string }) => ({
                name: t.name,
                label: t.name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
                param_count: t.param_count,
                category: t.category,
              }))
          )
        }
      })
      .catch(() => {})
  }, [])

  // Initial load
  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  // Poll for new messages (8s)
  useEffect(() => {
    pollRef.current = setInterval(() => {
      fetchContacts()
      if (activePhone) fetchMessages(activePhone)
    }, 8000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activePhone, fetchContacts, fetchMessages])

  // Auto-sync from Google Sheets every 2 minutes
  useEffect(() => {
    const syncInterval = setInterval(() => {
      fetch('/api/inbox/sync', { method: 'POST' })
        .then(r => r.json())
        .then(d => {
          if (d.success && (d.data.contacts_created > 0 || d.data.messages_imported > 0)) {
            fetchContacts()
            setToast(`Auto-synced: ${d.data.contacts_created} contacts, ${d.data.messages_imported} messages`)
          }
        })
        .catch(() => {})
    }, 120000) // 2 minutes
    return () => clearInterval(syncInterval)
  }, [fetchContacts])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Toast auto-dismiss (longer for errors)
  useEffect(() => {
    if (toast) {
      const isError = toast.toLowerCase().includes('error') || toast.toLowerCase().includes('failed') || toast.toLowerCase().includes('not delivered')
      const t = setTimeout(() => setToast(''), isError ? 6000 : 3000)
      return () => clearTimeout(t)
    }
  }, [toast])

  // Open conversation
  function openConversation(contact: Contact) {
    setActivePhone(contact.phone)
    setActiveContact(contact)
    setMsgLoading(true)
    prevMsgCountRef.current = 0
    setShowSidebar(false) // Hide sidebar on mobile
    setLeadInfo(null)
    fetchMessages(contact.phone).finally(() => setMsgLoading(false))
    // Fetch notes
    fetch(`/api/inbox/${contact.phone}/notes`)
      .then(r => r.json())
      .then(d => { if (d.success) setLeadNotes(d.data) })
      .catch(() => {})
    // Fetch lead info + active delegation if this is a lead
    setInboxActiveDelegation(null)
    if (contact.is_lead && contact.lead_row) {
      fetch(`/api/leads/${contact.lead_row}`)
        .then(r => r.json())
        .then(d => { if (d.success) setLeadInfo(d.data) })
        .catch(() => {})
      fetch(`/api/leads/${contact.lead_row}/delegations`)
        .then(r => r.json())
        .then(d => {
          if (d.success && d.data) {
            const active = d.data.find((del: { status: string }) => del.status === 'active') || null
            setInboxActiveDelegation(active ? { id: active.id, from_agent_name: active.from_agent_name, to_agent_name: active.to_agent_name, expires_at: active.expires_at } : null)
          }
        })
        .catch(() => {})
    }
  }

  // Inbox delegation handlers
  async function handleInboxDelegate() {
    if (!inboxDelegateToId || !activeContact?.lead_row) return
    setInboxDelegating(true)
    try {
      const res = await fetch(`/api/leads/${activeContact.lead_row}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_agent_id: inboxDelegateToId, message: inboxDelegateMessage, expires_at: inboxDelegateExpires || undefined }),
      })
      const json = await res.json()
      if (json.success) {
        setToast('Help requested')
        setShowInboxDelegateModal(false)
        setInboxDelegateToId('')
        setInboxDelegateMessage('')
        setInboxDelegateExpires('')
        setInboxActiveDelegation({ id: json.data.id, from_agent_name: json.data.from_agent_name, to_agent_name: json.data.to_agent_name, expires_at: json.data.expires_at })
      } else {
        setToast(json.error || 'Failed to delegate')
      }
    } catch { setToast('Failed to delegate') }
    setInboxDelegating(false)
  }

  async function handleInboxEndDelegation() {
    if (!inboxActiveDelegation) return
    setInboxEndingDelegation(true)
    try {
      const res = await fetch(`/api/delegations/${inboxActiveDelegation.id}/end`, { method: 'POST' })
      const json = await res.json()
      if (json.success) { setToast('Delegation ended'); setInboxActiveDelegation(null) }
      else setToast(json.error || 'Failed to end delegation')
    } catch { setToast('Failed to end delegation') }
    setInboxEndingDelegation(false)
  }

  // Update lead field from inbox
  async function updateLeadFromInbox(field: string, value: string) {
    if (!leadInfo) return
    setUpdatingLead(true)
    try {
      const res = await fetch(`/api/leads/${leadInfo.row_number}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      const data = await res.json()
      if (data.success) {
        setLeadInfo(prev => prev ? { ...prev, [field]: value } : null)
        const labels: Record<string, string> = { lead_status: 'Status', lead_priority: 'Priority', full_name: 'Name', email: 'Email', city: 'City', state: 'State', model_interest: 'Model interest' }
        setToast(`${labels[field] || field} updated`)
      } else {
        setToast(data.error || 'Update failed')
      }
    } catch {
      setToast('Update failed')
    }
    setUpdatingLead(false)
  }

  // Send message
  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault()
    if (!inputText.trim() || !activePhone || sending) return

    setSending(true)
    try {
      const res = await fetch('/api/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: activePhone,
          message: inputText,
          contact_name: activeContact?.name || '',
        }),
      })
      const data = await res.json()

      if (data.success) {
        setInputText('')
        fetchMessages(activePhone)
        fetchContacts()
      } else if (data.needs_template) {
        setToast('Outside 24hr window — use a template')
        setShowTemplates(true)
      } else {
        setToast(data.error || 'Send failed')
      }
    } catch {
      setToast('Network error')
    }
    setSending(false)
  }

  // Send template
  async function sendTemplateMsg(templateName: string, paramCount: number = 0) {
    if (!activePhone || sending) return

    setSending(true)
    try {
      let templateParams: { type: string; text: string }[] | undefined
      if (paramCount > 0) {
        const firstName = (activeContact?.name || 'there').split(' ')[0]
        templateParams = [{ type: 'text', text: firstName }]
        // Fill remaining params with sensible defaults (e.g. ref number)
        for (let i = 1; i < paramCount; i++) {
          templateParams.push({ type: 'text', text: `TBWX-${activePhone?.slice(-4) || '0000'}` })
        }
      }

      const res = await fetch('/api/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: activePhone,
          template_name: templateName,
          template_params: templateParams,
          contact_name: activeContact?.name || '',
        }),
      })
      const data = await res.json()

      if (data.success) {
        setShowTemplates(false)
        fetchMessages(activePhone)
        fetchContacts()
        setToast('Template sent')
      } else {
        setToast(data.error || 'Template send failed')
      }
    } catch {
      setToast('Network error')
    }
    setSending(false)
  }

  // Sync from Sheets
  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/inbox/sync', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setToast(`Synced: ${data.data.contacts_created} contacts, ${data.data.messages_imported} messages (${data.data.leads_skipped || 0} leads skipped — no template sent)`)
        fetchContacts()
      } else {
        setToast(data.error || 'Sync failed')
      }
    } catch {
      setToast('Sync failed')
    }
    setSyncing(false)
  }

  // Start new conversation
  function startNewChat() {
    const phone = newChatPhone.replace(/\D/g, '')
    if (!phone || phone.length < 10) {
      setToast('Enter a valid phone number')
      return
    }
    const fullPhone = phone.length === 10 ? `91${phone}` : phone

    const existing = contacts.find(c => c.phone === fullPhone)
    if (existing) {
      openConversation(existing)
      setShowNewChat(false)
      setNewChatPhone('')
      setNewChatName('')
      return
    }

    const tempContact: Contact = {
      phone: fullPhone,
      name: newChatName || '',
      is_lead: 0,
      lead_row: null,
      lead_id: '',
      city: '',
      avatar_color: '#3b82f6',
      last_message: '',
      last_direction: '',
      last_message_at: '',
      unread_count: 0,
    }
    setContacts(prev => [tempContact, ...prev])
    openConversation(tempContact)
    setShowNewChat(false)
    setNewChatPhone('')
    setNewChatName('')
  }

  // Save note
  async function handleSaveNote() {
    if (!activePhone || !newNote.trim()) return
    setSavingNote(true)
    try {
      const res = await fetch(`/api/inbox/${activePhone}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setNewNote('')
        fetch(`/api/inbox/${activePhone}/notes`)
          .then(r => r.json())
          .then(d => { if (d.success) setLeadNotes(d.data) })
          .catch(() => {})
        setToast('Note saved')
      } else {
        setToast('Error: ' + (data.error || 'Failed to save note'))
      }
    } catch {
      setToast('Network error')
    }
    setSavingNote(false)
  }

  // Save reminder
  async function handleSaveReminder() {
    if (!reminderTitle.trim() || !reminderDate) return
    setSavingReminder(true)
    try {
      const dueAt = new Date(`${reminderDate}T${reminderTime || '10:00'}:00`).toISOString()
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: activePhone || undefined,
          title: reminderTitle.trim(),
          due_at: dueAt,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setShowReminderModal(false)
        setReminderTitle('')
        setReminderDate('')
        setReminderTime('10:00')
        setToast('Reminder set')
      } else {
        setToast('Error: ' + (data.error || 'Failed to set reminder'))
      }
    } catch {
      setToast('Network error')
    }
    setSavingReminder(false)
  }

  // Filtered contacts
  const filteredContacts = contacts.filter(c => {
    if (showUnreadOnly && c.unread_count === 0) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return c.name.toLowerCase().includes(q) || c.phone.includes(searchQuery)
    }
    return true
  })
  const unreadTotal = contacts.reduce((sum, c) => sum + (c.unread_count || 0), 0)

  // 24hr window check
  const lastReceived = messages.filter(m => m.direction === 'received').pop()
  const isWithin24h = lastReceived
    ? (Date.now() - new Date(lastReceived.timestamp).getTime()) < 24 * 60 * 60 * 1000
    : false

  // Format time
  function formatTime(ts: string) {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 86400000 && d.getDate() === now.getDate()) {
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    }
    if (diff < 172800000) return 'Yesterday'
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })
  }

  function formatMsgTime(ts: string) {
    if (!ts) return ''
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
  }

  function getDateLabel(ts: string) {
    const d = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 86400000 && d.getDate() === now.getDate()) return 'Today'
    if (diff < 172800000) return 'Yesterday'
    return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })
  }

  return (
    <div className="h-screen bg-bg flex flex-col overflow-hidden">
      <Navbar />

      {/* Notification permission banner */}
      {notifPermission === 'default' && (
        <div className="bg-accent/10 border-b border-accent/20 px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-accent">Enable browser notifications to get alerted for new messages</span>
          <button
            onClick={requestNotifPermission}
            className="text-xs bg-accent/20 hover:bg-accent/30 text-accent px-3 py-1 rounded transition-colors font-medium"
          >
            Enable
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card text-text text-sm px-4 py-2.5 rounded-lg shadow-xl shadow-black/30 animate-slide-in border ${
          toast.toLowerCase().includes('error') || toast.toLowerCase().includes('failed') || toast.toLowerCase().includes('not delivered')
            ? 'border-red-500/50 text-red-300'
            : 'border-border'
        }`}>
          {toast}
        </div>
      )}

      {/* Reminder Modal — shadcn Dialog */}
      <Dialog open={showReminderModal} onOpenChange={setShowReminderModal}>
        <DialogContent className="sm:max-w-sm" style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
          <DialogHeader>
            <DialogTitle className="text-sm" style={{ color: 'var(--color-text)' }}>Set Reminder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-dim)' }}>What to do</label>
              <Input
                value={reminderTitle}
                onChange={e => setReminderTitle(e.target.value)}
                placeholder="e.g. Call back, Send deck, Follow up..."
                className="text-sm"
                style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-dim)' }}>Date</label>
                <Input type="date" value={reminderDate} onChange={e => setReminderDate(e.target.value)} className="text-sm" style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-dim)' }}>Time</label>
                <Input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)} className="text-sm" style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} />
              </div>
            </div>
            {activeContact && (
              <p className="text-[10px]" style={{ color: 'var(--color-dim)' }}>For: {activeContact.name || activePhone}</p>
            )}
            <Button
              onClick={handleSaveReminder}
              disabled={savingReminder || !reminderTitle.trim() || !reminderDate}
              className="w-full font-semibold"
              style={{ background: 'var(--color-accent)', color: '#1a1209' }}
            >
              {savingReminder ? 'Saving...' : 'Set Reminder'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Call Log Modal */}
      {activePhone && (
        <LogCallModal
          phone={activePhone}
          open={showCallModal}
          onClose={() => setShowCallModal(false)}
          onLogged={() => {
            setToast('Call logged')
            setCallHistoryKey(k => k + 1)
          }}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar — Contact List */}
        <div className={`w-full md:w-80 lg:w-96 border-r border-border flex flex-col bg-card ${
          !showSidebar && activePhone ? 'hidden md:flex' : 'flex'
        }`}>
          {/* Sidebar Header */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-base font-bold text-text flex items-center gap-2">
                <svg className="w-5 h-5 text-[#25d366]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Inbox
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowNewChat(!showNewChat)}
                  className="text-[10px] bg-[#25d366] hover:bg-[#20bd5a] text-white px-2 py-1 rounded transition-colors font-medium"
                  title="New conversation"
                >
                  + New
                </button>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="text-[10px] bg-elevated hover:bg-border text-muted px-2 py-1 rounded transition-colors disabled:opacity-50"
                  title="Sync messages from Google Sheets"
                >
                  {syncing ? 'Syncing...' : 'Sync'}
                </button>
              </div>
            </div>
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 z-10" style={{ color: 'var(--color-dim)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <Input
                type="text"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 text-sm"
                style={{ background: 'color-mix(in srgb, var(--color-elevated) 60%, transparent)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
            {/* Unread filter toggle */}
            <button
              type="button"
              onClick={() => setShowUnreadOnly(v => !v)}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                background: showUnreadOnly ? 'color-mix(in srgb, var(--color-accent) 18%, transparent)' : 'color-mix(in srgb, var(--color-elevated) 60%, transparent)',
                borderColor: showUnreadOnly ? 'color-mix(in srgb, var(--color-accent) 50%, transparent)' : 'var(--color-border)',
                color: showUnreadOnly ? 'var(--color-accent)' : 'var(--color-dim)',
                border: '1px solid',
              }}
              title={showUnreadOnly ? 'Show all conversations' : 'Show only conversations with unread messages'}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {showUnreadOnly ? 'Showing unread only' : 'Unread only'}
              </span>
              {unreadTotal > 0 && (
                <span
                  className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={{
                    background: showUnreadOnly ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-accent) 25%, transparent)',
                    color: showUnreadOnly ? 'var(--color-bg)' : 'var(--color-accent)',
                  }}
                >
                  {unreadTotal > 99 ? '99+' : unreadTotal}
                </span>
              )}
            </button>
          </div>

          {/* New Chat Dialog */}
          {showNewChat && (
            <div className="p-3 border-b border-border bg-elevated/50">
              <div className="text-xs font-medium text-muted mb-2">New Conversation</div>
              <input
                type="text"
                placeholder="Phone number (e.g. 9876543210)"
                value={newChatPhone}
                onChange={e => setNewChatPhone(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50 mb-1.5"
                autoFocus
              />
              <input
                type="text"
                placeholder="Name (optional)"
                value={newChatName}
                onChange={e => setNewChatName(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50 mb-2"
              />
              <div className="flex gap-2">
                <button
                  onClick={startNewChat}
                  className="flex-1 bg-[#25d366] hover:bg-[#20bd5a] text-white text-xs py-1.5 rounded-lg transition-colors font-medium"
                >
                  Start Chat
                </button>
                <button
                  onClick={() => { setShowNewChat(false); setNewChatPhone(''); setNewChatName('') }}
                  className="px-3 bg-card hover:bg-border text-muted text-xs py-1.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
              <p className="text-[10px] text-dim mt-1.5">Outside 24hr window? You can send a template after opening the chat.</p>
            </div>
          )}

          {/* Contact List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-0">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-3 border-b border-border/50 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-elevated flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-elevated rounded w-3/5" />
                      <div className="h-2.5 bg-elevated rounded w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-dim text-sm px-4 text-center">
                <svg className="w-10 h-10 mb-2 text-dim/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                {contacts.length === 0
                  ? 'No messages yet. Click "Sync" to import from Google Sheets.'
                  : 'No contacts match your search.'
                }
              </div>
            ) : (
              <>
              {filteredContacts.map(contact => (
                <button
                  key={contact.phone}
                  onClick={() => openConversation(contact)}
                  className={`w-full flex items-center gap-3 px-3 py-3 border-b border-border/50 transition-all text-left ${
                    activePhone === contact.phone
                      ? 'bg-accent/10 border-l-2 border-l-accent'
                      : 'hover:bg-elevated hover:border-l-2 hover:border-l-accent/40 border-l-2 border-l-transparent'
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: contact.avatar_color + '25', color: contact.avatar_color }}
                  >
                    <span className="text-sm font-bold">
                      {(contact.name || contact.phone).charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-text truncate">
                        {contact.name || formatPhoneDisplay(contact.phone)}
                      </span>
                      <span className="text-[10px] text-muted flex-shrink-0 ml-2">
                        {formatTime(contact.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-muted truncate">
                        {contact.last_direction === 'sent' && (
                          <span className="text-muted mr-0.5">You: </span>
                        )}
                        {contact.last_message || 'No messages'}
                      </span>
                      {contact.unread_count > 0 && (
                        <span className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                          <span className="w-2 h-2 rounded-full bg-[#25d366] pulse-dot"></span>
                          <span className="bg-[#25d366] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                            {contact.unread_count > 9 ? '9+' : contact.unread_count}
                          </span>
                        </span>
                      )}
                    </div>
                    {/* Tags */}
                    <div className="flex items-center gap-1 mt-1">
                      {contact.is_lead ? (
                        <span className="text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-semibold">Lead</span>
                      ) : null}
                      {contact.city && (
                        <span className="text-[9px] bg-elevated text-muted px-1.5 py-0.5 rounded font-medium" style={{ border: '1px solid var(--color-border)' }}>{contact.city}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {hasMoreContacts && !searchQuery && !showUnreadOnly && (
                <button
                  onClick={loadOlderContacts}
                  disabled={loadingMoreContacts}
                  className="w-full py-3 text-xs text-muted hover:text-text hover:bg-elevated border-t border-border transition-colors disabled:opacity-50"
                >
                  {loadingMoreContacts ? 'Loading…' : 'Show older conversations'}
                </button>
              )}
              </>
            )}
          </div>
        </div>

        {/* Right Panel — Conversation */}
        <div className={`flex-1 flex flex-col bg-bg min-h-0 ${
          showSidebar && activePhone ? 'hidden md:flex' : !activePhone ? 'hidden md:flex' : 'flex'
        }`}>
          {!activePhone ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center text-dim">
              <svg className="w-20 h-20 mb-4 text-dim/30" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              <h3 className="text-lg font-semibold text-muted mb-1">TBWX WhatsApp Inbox</h3>
              <p className="text-sm">Select a conversation to start messaging</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border glass-nav">
                {/* Back button (mobile only) */}
                <button
                  onClick={() => { setShowSidebar(true); setActivePhone(null); setActiveContact(null); setMessages([]); setContextDrawerOpen(false) }}
                  className="md:hidden flex items-center gap-1 text-muted hover:text-text flex-shrink-0"
                  aria-label="Back to conversation list"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="text-xs font-medium">Conversations</span>
                </button>

                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: (activeContact?.avatar_color || 'var(--color-accent)') + '25',
                    color: activeContact?.avatar_color || 'var(--color-accent)'
                  }}
                >
                  <span className="text-sm font-bold">
                    {(activeContact?.name || activePhone).charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Contact info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text truncate">
                    {activeContact?.name || formatPhoneDisplay(activePhone)}
                  </div>
                  <div className="text-[11px] text-muted flex items-center gap-2 flex-wrap">
                    <span>+{activePhone}</span>
                    {activeContact?.is_lead ? (
                      <span className="bg-accent/20 text-accent px-1.5 py-0.5 rounded text-[9px] font-semibold">Lead</span>
                    ) : null}
                    {activeContact?.city && <span className="font-medium">{activeContact.city}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* 24hr window indicator */}
                  <span className={`text-[10px] px-2 py-1 rounded-full font-medium hidden sm:inline-block ${
                    isWithin24h
                      ? 'bg-success/15 text-success'
                      : 'bg-warning/15 text-warning'
                  }`}>
                    {isWithin24h ? '24h open' : 'Template only'}
                  </span>

                  {/* Log Call button */}
                  <button
                    onClick={() => setShowCallModal(true)}
                    className="text-[10px] bg-elevated hover:bg-border text-muted px-2 py-1 rounded transition-colors font-medium flex items-center gap-1"
                    title="Log a call"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                    <span className="hidden sm:inline">Log Call</span>
                  </button>

                  {/* Reminder button */}
                  <button
                    onClick={() => setShowReminderModal(true)}
                    className="text-[10px] bg-elevated hover:bg-border text-muted px-2 py-1 rounded transition-colors font-medium flex items-center gap-1"
                    title="Set a reminder"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="hidden sm:inline">Remind</span>
                  </button>

                  {/* Lead details toggle — desktop toggles inline panel; mobile opens right drawer */}
                  <button
                    onClick={() => {
                      // On mobile, open the slide-in drawer; on desktop, toggle the inline panel
                      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
                        setContextDrawerOpen(true)
                      } else {
                        setShowLeadDetails(!showLeadDetails)
                      }
                    }}
                    className={`text-[10px] px-2 py-1 rounded transition-colors font-medium flex items-center gap-1 ${
                      showLeadDetails ? 'bg-accent/20 text-accent' : 'bg-elevated hover:bg-border text-muted'
                    }`}
                    title="Toggle lead details"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                    </svg>
                    <span className="hidden sm:inline">Details</span>
                  </button>
                </div>
              </div>

              {/* Lead Details Panel (collapsible) — desktop only; mobile uses slide-in drawer below */}
              {showLeadDetails && activeContact && (
                <div className="hidden md:block border-b border-border glass-nav px-4 py-3">
                  {(() => {
                    const canEdit = leadInfo && (sessionUser?.role === 'admin' || sessionUser?.can_edit_leads === true)
                    const inlineField = (field: string, currentVal: string) => (
                      <input
                        key={field}
                        defaultValue={currentVal}
                        onBlur={e => { if (e.target.value !== currentVal) updateLeadFromInbox(field, e.target.value) }}
                        disabled={updatingLead}
                        className="w-full bg-elevated border border-border rounded px-1.5 py-0.5 text-xs text-text focus:outline-none focus:border-accent/50 disabled:opacity-50 font-medium"
                      />
                    )
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-dim block text-[10px] uppercase tracking-wider">Name</span>
                          {canEdit ? inlineField('full_name', leadInfo?.full_name || activeContact.name || '') : <span className="text-text font-medium">{activeContact.name || 'Unknown'}</span>}
                        </div>
                        <div>
                          <span className="text-dim block text-[10px] uppercase tracking-wider">Phone</span>
                          <span className="text-text font-medium">+{activeContact.phone}</span>
                        </div>
                        <div>
                          <span className="text-dim block text-[10px] uppercase tracking-wider">City</span>
                          {canEdit ? inlineField('city', leadInfo?.city || activeContact.city || '') : <span className="text-text font-medium">{leadInfo?.city || activeContact.city || 'N/A'}</span>}
                        </div>
                        <div>
                          <span className="text-dim block text-[10px] uppercase tracking-wider">State</span>
                          {canEdit ? inlineField('state', leadInfo?.state || '') : <span className="text-text font-medium">{leadInfo?.state || 'N/A'}</span>}
                        </div>
                        <div>
                          <span className="text-dim block text-[10px] uppercase tracking-wider">Email</span>
                          {canEdit ? inlineField('email', leadInfo?.email || '') : <span className="text-text font-medium">{leadInfo?.email || 'N/A'}</span>}
                        </div>
                        <div>
                          <span className="text-dim block text-[10px] uppercase tracking-wider">Model Interest</span>
                          {canEdit ? inlineField('model_interest', leadInfo?.model_interest || '') : <span className="text-text font-medium">{leadInfo?.model_interest || 'N/A'}</span>}
                        </div>
                        <div>
                          <span className="text-dim block text-[10px] uppercase tracking-wider">Type</span>
                          <span className="text-text font-medium">{activeContact.is_lead ? 'Lead' : 'Contact'}</span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Lead-specific info: Status, Priority, Assigned, Score */}
                  {leadInfo && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mt-3 pt-3 border-t border-border/50">
                      <div>
                        <span className="text-dim block text-[10px] uppercase tracking-wider mb-1">Status</span>
                        <Select value={leadInfo.lead_status} onValueChange={v => v && updateLeadFromInbox('lead_status', v)} disabled={updatingLead}>
                          <SelectTrigger className="h-7 text-[11px]" style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                            {['NEW','DECK_SENT','REPLIED','NO_RESPONSE','CALL_DONE_INTERESTED','HOT','FINAL_NEGOTIATION','CONVERTED','DELAYED','LOST'].map(s => (
                              <SelectItem key={s} value={s} className="text-[11px]">{s.replace('_', ' ')}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <span className="text-dim block text-[10px] uppercase tracking-wider mb-1">Priority</span>
                        <Select value={leadInfo.lead_priority || '__none__'} onValueChange={v => v && updateLeadFromInbox('lead_priority', v === '__none__' ? '' : v)} disabled={updatingLead}>
                          <SelectTrigger className="h-7 text-[11px]" style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                            <SelectItem value="__none__" className="text-[11px]">—</SelectItem>
                            {['HOT','WARM','COLD'].map(p => (
                              <SelectItem key={p} value={p} className="text-[11px]">{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <span className="text-dim block text-[10px] uppercase tracking-wider">Assigned</span>
                        <span className="text-text font-medium">{leadInfo.assigned_to || 'Unassigned'}</span>
                      </div>
                      <div className="col-span-2 sm:col-span-4">
                        {inboxActiveDelegation ? (
                          <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[11px]" style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)' }}>
                            <span style={{ color: 'var(--color-accent)' }}>
                              {inboxActiveDelegation.to_agent_name} supporting{inboxActiveDelegation.expires_at ? ` until ${inboxActiveDelegation.expires_at.slice(0, 10)}` : ''}
                            </span>
                            <button onClick={handleInboxEndDelegation} disabled={inboxEndingDelegation} className="text-[10px] text-dim hover:text-danger transition-colors disabled:opacity-50">End</button>
                          </div>
                        ) : (
                          <button onClick={() => setShowInboxDelegateModal(true)} className="text-[11px] px-2.5 py-1 rounded border border-border bg-elevated hover:bg-border text-muted transition-colors flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                            Ask for Help
                          </button>
                        )}
                      </div>
                      <div>
                        <span className="text-dim block text-[10px] uppercase tracking-wider">Score</span>
                        <span className="text-text font-medium">{leadInfo.lead_score ?? '—'}</span>
                        {leadInfo.next_followup && (
                          <span className="text-dim block text-[9px] mt-0.5">Follow-up: {new Date(leadInfo.next_followup).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Call History */}
                  {activePhone && <CallHistory phone={activePhone} refreshKey={callHistoryKey} />}

                  {/* AI Voice Agent — only for leads */}
                  {activeContact?.is_lead && activePhone && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <VoiceAgentCard
                        phone={activePhone}
                        leadName={activeContact.name || ''}
                        leadId={String(leadInfo?.row_number || activeContact.lead_row || '')}
                      />
                    </div>
                  )}

                  {/* Notes */}
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <span className="text-[10px] text-dim uppercase tracking-wider block mb-2">Notes</span>
                    <div className="flex gap-2 mb-2">
                      <input
                        value={newNote}
                        onChange={e => setNewNote(e.target.value)}
                        placeholder="Add a note (e.g. wants Meerut, budget 5L)..."
                        className="flex-1 bg-elevated border border-border rounded-lg px-2.5 py-1.5 text-xs text-text placeholder-dim focus:outline-none focus:border-accent/50"
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveNote() }}
                      />
                      <button
                        onClick={handleSaveNote}
                        disabled={savingNote || !newNote.trim()}
                        className="text-[10px] bg-accent/20 hover:bg-accent/30 text-accent px-2.5 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-50"
                      >
                        {savingNote ? '...' : 'Add'}
                      </button>
                    </div>
                    {leadNotes.length > 0 ? (
                      <div className="space-y-1.5 max-h-28 overflow-y-auto border-l-2 border-accent/20 pl-3">
                        {leadNotes.slice(0, 10).map(n => (
                          <div key={n.id} className="text-[11px] flex items-start gap-2">
                            <span className="text-dim flex-shrink-0">{formatTime(n.created_at)}</span>
                            <span className="text-muted flex-shrink-0">{n.created_by}</span>
                            <span className="text-text">{n.note}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-dim">No notes yet</p>
                    )}
                  </div>
                  {activeContact?.is_lead && activeContact.lead_row && (
                    <div className="mt-3">
                      <ActivityLog lead_row={activeContact.lead_row} phone={activeContact.phone} />
                    </div>
                  )}
                </div>
              )}

              {/* Messages Area */}
              <div
                className="flex-1 overflow-y-auto px-4 py-3"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23f5c518' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}
              >
                {msgLoading ? (
                  <div className="space-y-3 py-4">
                    {[
                      { side: 'left', w: 'w-3/5' },
                      { side: 'right', w: 'w-2/5' },
                      { side: 'left', w: 'w-1/2' },
                      { side: 'right', w: 'w-3/5' },
                      { side: 'left', w: 'w-2/5' },
                    ].map((s, i) => (
                      <div key={i} className={`flex ${s.side === 'right' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`${s.w} h-10 rounded-2xl bg-elevated animate-pulse`} />
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-dim text-sm">
                    <p>No messages yet</p>
                    <p className="text-xs mt-1">Send a template to start the conversation</p>
                  </div>
                ) : (
                  <>
                    {messages.map((msg, idx) => {
                      const showDate = idx === 0 ||
                        getDateLabel(msg.timestamp) !== getDateLabel(messages[idx - 1].timestamp)

                      return (
                        <div key={msg.id || idx}>
                          {showDate && (
                            <div className="flex justify-center my-3">
                              <span className="glass text-dim text-[10px] px-3 py-1 rounded-full">
                                {getDateLabel(msg.timestamp)}
                              </span>
                            </div>
                          )}
                          <div className={`flex mb-1.5 ${msg.direction === 'sent' ? 'justify-end' : 'justify-start'}`}>
                            <div
                              className={`max-w-[85%] sm:max-w-[75%] px-3 py-2 overflow-hidden shadow-sm shadow-black/10 ${
                                msg.direction === 'sent'
                                  ? 'bg-wa-sent text-wa-text rounded-2xl rounded-br-md shadow-[0_0_8px_rgba(37,211,102,0.08)]'
                                  : 'bg-wa-received text-wa-text rounded-2xl rounded-bl-md'
                              }`}
                            >
                              {/* Template badge */}
                              {msg.template_used && (
                                <div className="text-[9px] text-accent/70 mb-1 flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                  </svg>
                                  Template: {msg.template_used}
                                </div>
                              )}
                              {/* Media render — image / video / audio / document */}
                              {msg.media_type && msg.wa_message_id && (() => {
                                const src = `/api/media/${encodeURIComponent(msg.wa_message_id)}`
                                const fname = msg.media_filename || msg.media_type
                                if (msg.media_type === 'image' || msg.media_type === 'sticker') {
                                  return (
                                    <a href={src} target="_blank" rel="noreferrer" className="block mb-1.5">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={src} alt={fname} className="rounded-lg max-w-full max-h-[320px] object-contain" loading="lazy" />
                                    </a>
                                  )
                                }
                                if (msg.media_type === 'video') {
                                  return (
                                    <video controls preload="metadata" className="rounded-lg max-w-full max-h-[320px] mb-1.5" src={src}>
                                      Your browser does not support video playback.
                                    </video>
                                  )
                                }
                                if (msg.media_type === 'audio') {
                                  return (
                                    <audio controls preload="metadata" className="w-full mb-1.5" src={src}>
                                      Your browser does not support audio playback.
                                    </audio>
                                  )
                                }
                                // document or unknown — show as a download chip
                                return (
                                  <a href={src} target="_blank" rel="noreferrer" download={fname} className="flex items-center gap-2 mb-1.5 px-2.5 py-2 rounded-lg bg-black/15 hover:bg-black/25 transition-colors">
                                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3V11.25M5.625 21H18a2.25 2.25 0 002.25-2.25V11.25a9 9 0 00-9-9H5.625C4.504 2.25 4 2.754 4 3.375v16.25c0 .621.504 1.125 1.125 1.125z" />
                                    </svg>
                                    <span className="text-[12px] truncate flex-1">{fname}</span>
                                    <span className="text-[10px] opacity-70 shrink-0">{msg.media_mime?.split('/')[1] || 'file'}</span>
                                  </a>
                                )
                              })()}
                              {msg.text && !(msg.text.startsWith('[Image]') || msg.text.startsWith('[Video]') || msg.text.startsWith('[Audio') || msg.text.startsWith('[Document]') || msg.text.startsWith('[Sticker]')) && (
                                <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere' }}>{msg.text}</p>
                              )}
                              {msg.text && (msg.text.startsWith('[Image]') || msg.text.startsWith('[Video]') || msg.text.startsWith('[Document]')) && msg.text.replace(/^\[(Image|Video|Document)\]\s*/, '').trim() && (
                                <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere' }}>{msg.text.replace(/^\[(Image|Video|Document)\]\s*/, '')}</p>
                              )}
                              {!msg.media_type && !msg.text && (
                                <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words text-wa-meta italic">(empty)</p>
                              )}
                              <div className="flex items-center justify-end gap-1 mt-0.5">
                                {msg.media_type && msg.wa_message_id && msg.media_path && (
                                  <button
                                    type="button"
                                    onClick={() => { setForwardSrc(msg); setForwardTarget(''); setForwardCaption('') }}
                                    className="text-[9px] text-wa-meta hover:text-accent transition-colors mr-1 flex items-center gap-0.5"
                                    title="Forward this media"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061A1.125 1.125 0 013 16.811V8.69zM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061a1.125 1.125 0 01-1.683-.977V8.69z" />
                                    </svg>
                                    Forward
                                  </button>
                                )}
                                {msg.direction === 'sent' && msg.sent_by && (
                                  <span className="text-[9px] text-wa-meta">{msg.sent_by}</span>
                                )}
                                <span className="text-[10px] text-wa-meta">{formatMsgTime(msg.timestamp)}</span>
                                {msg.direction === 'sent' && (
                                  <span className="text-[10px]">
                                    {msg.status === 'failed' || msg.status === 'undelivered' ? (
                                      <span className="text-red-400" title={`Status: ${msg.status}`}>&#9888; Not delivered</span>
                                    ) : msg.status === 'read' ? (
                                      <span className="text-[#53bdeb]">&#10003;&#10003;</span>
                                    ) : msg.status === 'delivered' ? (
                                      <span className="text-wa-meta">&#10003;&#10003;</span>
                                    ) : (
                                      <span className="text-wa-meta">&#10003;</span>
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Quick Replies Dropdown — Categorized */}
              {showQuickReplies && (
                <div className="border-t border-border bg-card px-3 py-2 max-h-52 overflow-y-auto">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted">Quick Replies</span>
                    <button onClick={() => setShowQuickReplies(false)} className="text-dim hover:text-text text-xs">Close</button>
                  </div>
                  {quickReplies.length === 0 ? (
                    <p className="text-[10px] text-dim">No quick replies yet. Add them in the Quick Replies page.</p>
                  ) : (
                    Object.entries(
                      quickReplies.reduce<Record<string, QuickReply[]>>((acc, qr) => {
                        const cat = qr.category || 'General'
                        if (!acc[cat]) acc[cat] = []
                        acc[cat].push(qr)
                        return acc
                      }, {})
                    ).map(([category, replies]) => (
                      <div key={category} className="mb-2">
                        <span className="text-[9px] text-dim uppercase tracking-wider font-medium">{category}</span>
                        <div className="mt-1 space-y-0.5">
                          {replies.map(qr => (
                            <button
                              key={qr.id}
                              onClick={() => {
                                setInputText(qr.message)
                                setShowQuickReplies(false)
                              }}
                              className="w-full text-left bg-elevated hover:bg-border rounded px-2.5 py-1.5 text-xs transition-colors group"
                              title={qr.message}
                            >
                              <span className="text-text font-medium">{qr.title}</span>
                              <span className="text-dim ml-2 text-[10px] truncate hidden group-hover:inline">
                                {qr.message.substring(0, 60)}...
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Templates Dropdown */}
              {showTemplates && (
                <div className="border-t border-border glass-nav px-3 py-2 animate-scale-in">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-muted">Send Template</span>
                    <button onClick={() => setShowTemplates(false)} className="text-dim hover:text-text text-xs">Close</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {waTemplates.length === 0 ? (
                      <span className="text-xs text-dim">No approved templates. Create one in Templates page.</span>
                    ) : waTemplates.map(t => (
                      <button
                        key={t.name}
                        onClick={() => sendTemplateMsg(t.name, t.param_count)}
                        disabled={sending}
                        className="bg-accent/15 hover:bg-accent/25 text-accent text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {t.label}
                        <span className={`text-[9px] px-1 py-0.5 rounded ${
                          t.category === 'UTILITY' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'
                        }`}>
                          {t.category === 'UTILITY' ? 'U' : 'M'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Replies */}
              {activeContact?.is_lead && leadInfo?.lead_status && SUGGESTED_REPLIES[leadInfo.lead_status] && (
                <div className="border-t border-border bg-card/50 px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto">
                  <span className="text-[9px] text-dim uppercase tracking-wider flex-shrink-0">Suggest:</span>
                  {SUGGESTED_REPLIES[leadInfo.lead_status].map((sr, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setInputText(
                        sr.message
                          .replace(/\{name\}/g, activeContact?.name || 'there')
                          .replace(/\{city\}/g, leadInfo?.city || activeContact?.city || 'your city')
                      )}
                      className="text-[10px] bg-accent/10 hover:bg-accent/20 text-accent px-2 py-1 rounded-full transition-colors whitespace-nowrap flex-shrink-0"
                    >
                      {sr.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Message Input — sticky to bottom of thread on mobile */}
              <form onSubmit={handleSend} className="sticky bottom-0 border-t border-border glass-nav px-3 py-2.5 flex items-center gap-2 flex-shrink-0 safe-bottom">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={async e => {
                    const f = e.target.files?.[0]
                    if (!f || !activePhone || uploadingMedia) return
                    setUploadingMedia(true)
                    try {
                      const fd = new FormData()
                      fd.append('file', f)
                      fd.append('phone', activePhone)
                      fd.append('caption', inputText)
                      fd.append('contact_name', activeContact?.name || '')
                      const res = await fetch('/api/whatsapp/send-media', { method: 'POST', body: fd })
                      const data = await res.json()
                      if (data.success) {
                        setInputText('')
                        await fetchMessages(activePhone)
                      } else {
                        alert(`Send failed: ${data.error || 'unknown error'}`)
                      }
                    } catch (err) {
                      alert(`Send failed: ${err}`)
                    }
                    setUploadingMedia(false)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                />

                {/* Attach media button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingMedia || !activePhone}
                  className="text-dim hover:text-muted transition-colors p-1 flex-shrink-0 disabled:opacity-40"
                  title="Send photo / video / document"
                >
                  {uploadingMedia ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path d="M12 2v4m0 12v4m-8-10H2m20 0h-4m-2.343-5.657L14.828 7.172m-5.656 9.656l-2.829 2.829m11.314 0l-2.829-2.829m-5.656-9.656L6.343 4.343" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                    </svg>
                  )}
                </button>

                {/* Quick reply button */}
                <button
                  type="button"
                  onClick={() => { setShowQuickReplies(!showQuickReplies); setShowTemplates(false) }}
                  className="text-dim hover:text-muted transition-colors p-1 flex-shrink-0"
                  title="Quick replies"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>

                {/* Template button */}
                <button
                  type="button"
                  onClick={() => { setShowTemplates(!showTemplates); setShowQuickReplies(false) }}
                  className="text-dim hover:text-muted transition-colors p-1 flex-shrink-0"
                  title="Send template"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </button>

                {/* AI Suggest button */}
                <button
                  type="button"
                  onClick={async () => {
                    if (!activePhone || aiLoading) return
                    setAiLoading(true)
                    try {
                      const res = await fetch('/api/inbox/ai-suggest', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: activePhone }),
                      })
                      const data = await res.json()
                      if (data.success && data.data?.suggestion) {
                        setInputText(data.data.suggestion)
                      }
                    } catch { /* silent */ }
                    setAiLoading(false)
                  }}
                  disabled={aiLoading || !activePhone}
                  className="text-dim hover:text-accent transition-colors p-1 flex-shrink-0 disabled:opacity-40"
                  title="AI-suggest a reply"
                >
                  {aiLoading ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path d="M12 2v4m0 12v4m-8-10H2m20 0h-4m-2.343-5.657L14.828 7.172m-5.656 9.656l-2.829 2.829m11.314 0l-2.829-2.829m-5.656-9.656L6.343 4.343" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.456-2.456L14.25 6l1.035-.259a3.375 3.375 0 002.456-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                  )}
                </button>

                {/* Text input */}
                <input
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder={isWithin24h ? 'Type a message...' : 'Use a template (outside 24hr window)'}
                  disabled={sending}
                  className="flex-1 bg-elevated/60 backdrop-blur-sm border border-border rounded-2xl px-4 py-2.5 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50 transition-all disabled:opacity-50 min-w-0"
                />

                {/* Send button */}
                <button
                  type="submit"
                  disabled={sending || !inputText.trim()}
                  className="bg-[#25d366] hover:bg-[#20bd5a] hover:shadow-[0_0_12px_rgba(37,211,102,0.4)] text-white rounded-full w-9 h-9 flex items-center justify-center transition-all disabled:opacity-30 flex-shrink-0"
                >
                  {sending ? (
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M12 2v4m0 12v4m-8-10H2m20 0h-4m-2.343-5.657L14.828 7.172m-5.656 9.656l-2.829 2.829m11.314 0l-2.829-2.829m-5.656-9.656L6.343 4.343" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                    </svg>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* ─── Mobile Lead Context Drawer (slide-in from right, <md only) ── */}
      {activeContact && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setContextDrawerOpen(false)}
            className={`md:hidden fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${
              contextDrawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            aria-hidden="true"
          />
          {/* Drawer */}
          <aside
            className={`md:hidden fixed top-0 right-0 z-50 h-full w-[88vw] max-w-[360px] bg-card border-l border-border shadow-2xl transition-transform duration-200 ease-out flex flex-col ${
              contextDrawerOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
            role="dialog"
            aria-label="Lead details"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <span className="text-sm font-semibold text-text">Lead details</span>
              <button
                onClick={() => setContextDrawerOpen(false)}
                className="text-dim hover:text-text"
                aria-label="Close lead details"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {(() => {
                const canEdit = leadInfo && (sessionUser?.role === 'admin' || sessionUser?.can_edit_leads === true)
                const inlineField = (field: string, currentVal: string) => (
                  <input
                    key={field}
                    defaultValue={currentVal}
                    onBlur={e => { if (e.target.value !== currentVal) updateLeadFromInbox(field, e.target.value) }}
                    disabled={updatingLead}
                    className="w-full bg-elevated border border-border rounded px-1.5 py-0.5 text-xs text-text focus:outline-none focus:border-accent/50 disabled:opacity-50 font-medium"
                  />
                )
                return (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-dim block text-[10px] uppercase tracking-wider">Name</span>
                      {canEdit ? inlineField('full_name', leadInfo?.full_name || activeContact.name || '') : <span className="text-text font-medium">{activeContact.name || 'Unknown'}</span>}
                    </div>
                    <div>
                      <span className="text-dim block text-[10px] uppercase tracking-wider">Phone</span>
                      <span className="text-text font-medium">+{activeContact.phone}</span>
                    </div>
                    <div>
                      <span className="text-dim block text-[10px] uppercase tracking-wider">City</span>
                      {canEdit ? inlineField('city', leadInfo?.city || activeContact.city || '') : <span className="text-text font-medium">{leadInfo?.city || activeContact.city || 'N/A'}</span>}
                    </div>
                    <div>
                      <span className="text-dim block text-[10px] uppercase tracking-wider">State</span>
                      {canEdit ? inlineField('state', leadInfo?.state || '') : <span className="text-text font-medium">{leadInfo?.state || 'N/A'}</span>}
                    </div>
                    <div>
                      <span className="text-dim block text-[10px] uppercase tracking-wider">Email</span>
                      {canEdit ? inlineField('email', leadInfo?.email || '') : <span className="text-text font-medium">{leadInfo?.email || 'N/A'}</span>}
                    </div>
                    <div>
                      <span className="text-dim block text-[10px] uppercase tracking-wider">Model Interest</span>
                      {canEdit ? inlineField('model_interest', leadInfo?.model_interest || '') : <span className="text-text font-medium">{leadInfo?.model_interest || 'N/A'}</span>}
                    </div>
                    <div>
                      <span className="text-dim block text-[10px] uppercase tracking-wider">Type</span>
                      <span className="text-text font-medium">{activeContact.is_lead ? 'Lead' : 'Contact'}</span>
                    </div>
                  </div>
                )
              })()}

              {leadInfo && (
                <div className="grid grid-cols-2 gap-3 text-xs mt-4 pt-3 border-t border-border/50">
                  <div>
                    <span className="text-dim block text-[10px] uppercase tracking-wider mb-1">Status</span>
                    <Select value={leadInfo.lead_status} onValueChange={v => v && updateLeadFromInbox('lead_status', v)} disabled={updatingLead}>
                      <SelectTrigger className="h-7 text-[11px]" style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                        {['NEW','DECK_SENT','REPLIED','NO_RESPONSE','CALL_DONE_INTERESTED','HOT','FINAL_NEGOTIATION','CONVERTED','DELAYED','LOST'].map(s => (
                          <SelectItem key={s} value={s} className="text-[11px]">{s.replace('_', ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <span className="text-dim block text-[10px] uppercase tracking-wider mb-1">Priority</span>
                    <Select value={leadInfo.lead_priority || '__none__'} onValueChange={v => v && updateLeadFromInbox('lead_priority', v === '__none__' ? '' : v)} disabled={updatingLead}>
                      <SelectTrigger className="h-7 text-[11px]" style={{ background: 'var(--color-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                        <SelectItem value="__none__" className="text-[11px]">—</SelectItem>
                        {['HOT','WARM','COLD'].map(p => (
                          <SelectItem key={p} value={p} className="text-[11px]">{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <span className="text-dim block text-[10px] uppercase tracking-wider">Assigned</span>
                    <span className="text-text font-medium">{leadInfo.assigned_to || 'Unassigned'}</span>
                  </div>
                  <div>
                    <span className="text-dim block text-[10px] uppercase tracking-wider">Score</span>
                    <span className="text-text font-medium">{leadInfo.lead_score ?? '—'}</span>
                    {leadInfo.next_followup && (
                      <span className="text-dim block text-[9px] mt-0.5">Follow-up: {new Date(leadInfo.next_followup).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</span>
                    )}
                  </div>
                </div>
              )}

              {activePhone && <CallHistory phone={activePhone} refreshKey={callHistoryKey} />}

              {/* AI Voice Agent — only for leads */}
              {activeContact?.is_lead && activePhone && (
                <div className="mt-4 pt-3 border-t border-border/50">
                  <VoiceAgentCard
                    phone={activePhone}
                    leadName={activeContact.name || ''}
                    leadId={String(leadInfo?.row_number || activeContact.lead_row || '')}
                  />
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-border/50">
                <span className="text-[10px] text-dim uppercase tracking-wider block mb-2">Notes</span>
                <div className="flex gap-2 mb-2">
                  <input
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    placeholder="Add a note..."
                    className="flex-1 min-w-0 bg-elevated border border-border rounded-lg px-2.5 py-1.5 text-xs text-text placeholder-dim focus:outline-none focus:border-accent/50"
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveNote() }}
                  />
                  <button
                    onClick={handleSaveNote}
                    disabled={savingNote || !newNote.trim()}
                    className="text-[10px] bg-accent/20 hover:bg-accent/30 text-accent px-2.5 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-50 flex-shrink-0"
                  >
                    {savingNote ? '...' : 'Add'}
                  </button>
                </div>
                {leadNotes.length > 0 ? (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto border-l-2 border-accent/20 pl-3">
                    {leadNotes.slice(0, 10).map(n => (
                      <div key={n.id} className="text-[11px] flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-dim">{formatTime(n.created_at)}</span>
                          <span className="text-muted">{n.created_by}</span>
                        </div>
                        <span className="text-text">{n.note}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-dim">No notes yet</p>
                )}
              </div>
              {activeContact?.is_lead && activeContact.lead_row && (
                <div className="mt-3">
                  <ActivityLog lead_row={activeContact.lead_row} phone={activeContact.phone} />
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {/* ─── Forward Media Modal ──────────────────────────────────────── */}
      {forwardSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !forwarding && setForwardSrc(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text">Forward {forwardSrc.media_type}</h2>
              <button onClick={() => !forwarding && setForwardSrc(null)} className="text-dim hover:text-text" disabled={forwarding} aria-label="Close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* Source preview */}
              <div className="text-[11px] text-dim">
                Forwarding {forwardSrc.media_type} ({forwardSrc.media_filename || 'file'})
                {forwardSrc.text && !forwardSrc.text.startsWith('[') && (
                  <span className="block mt-1 italic text-muted">&ldquo;{forwardSrc.text.slice(0, 80)}{forwardSrc.text.length > 80 ? '…' : ''}&rdquo;</span>
                )}
              </div>
              {/* Recipient picker */}
              <div>
                <label className="block text-xs font-medium text-dim mb-1">Send to (existing contact)</label>
                <select
                  value={forwardTarget}
                  onChange={e => setForwardTarget(e.target.value)}
                  className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
                >
                  <option value="">— pick a contact —</option>
                  {contacts.filter(c => c.phone !== forwardSrc.phone).slice(0, 200).map(c => (
                    <option key={c.phone} value={c.phone}>
                      {c.name || formatPhoneDisplay(c.phone)} · {formatPhoneDisplay(c.phone)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-dim mb-1">Or enter a new phone (E.164 / 91XXXXXXXXXX)</label>
                <input
                  type="tel"
                  value={forwardTarget.startsWith('91') || /^\d/.test(forwardTarget) ? forwardTarget : ''}
                  onChange={e => setForwardTarget(e.target.value)}
                  placeholder="919876543210"
                  className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
                />
              </div>
              {(forwardSrc.media_type === 'image' || forwardSrc.media_type === 'video' || forwardSrc.media_type === 'document') && (
                <div>
                  <label className="block text-xs font-medium text-dim mb-1">Caption (optional)</label>
                  <textarea
                    value={forwardCaption}
                    onChange={e => setForwardCaption(e.target.value)}
                    rows={2}
                    placeholder="Add a note before sending…"
                    className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50 resize-none"
                  />
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
              <button onClick={() => !forwarding && setForwardSrc(null)} disabled={forwarding} className="text-sm text-dim hover:text-text px-3 py-1.5 rounded-md transition-colors">Cancel</button>
              <button
                onClick={async () => {
                  if (!forwardTarget.trim() || !forwardSrc.wa_message_id) return
                  setForwarding(true)
                  try {
                    const res = await fetch('/api/whatsapp/forward-media', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        source_wa_message_id: forwardSrc.wa_message_id,
                        to_phone: forwardTarget.trim(),
                        caption: forwardCaption.trim() || undefined,
                      }),
                    })
                    const data = await res.json()
                    if (data.success) {
                      setForwardSrc(null)
                      setForwardTarget('')
                      setForwardCaption('')
                      setToast(`Forwarded to ${data.data?.to || forwardTarget}`)
                      setTimeout(() => setToast(''), 3000)
                    } else {
                      alert(`Forward failed: ${data.error || 'unknown'}`)
                    }
                  } catch (err) {
                    alert(`Forward failed: ${err}`)
                  }
                  setForwarding(false)
                }}
                disabled={!forwardTarget.trim() || forwarding}
                className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-[#1a1209] text-sm font-semibold px-4 py-1.5 rounded-md transition-colors"
              >
                {forwarding ? 'Sending…' : 'Forward'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inbox Delegate Modal */}
      {showInboxDelegateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-text">Ask for Help</h3>
            <div>
              <label className="text-xs text-dim block mb-1">Agent to support</label>
              <select
                value={inboxDelegateToId}
                onChange={e => setInboxDelegateToId(e.target.value)}
                className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
              >
                <option value="">Select agent...</option>
                {inboxAgents
                  .filter(u => u.role !== 'telecaller' && u.active)
                  .map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-dim block mb-1">Until (optional)</label>
              <input
                type="date"
                value={inboxDelegateExpires}
                onChange={e => setInboxDelegateExpires(e.target.value)}
                className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label className="text-xs text-dim block mb-1">Note (optional)</label>
              <textarea
                value={inboxDelegateMessage}
                onChange={e => setInboxDelegateMessage(e.target.value)}
                rows={2}
                placeholder="Any context for the supporting agent..."
                className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50 resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowInboxDelegateModal(false)}
                className="text-xs px-3 py-2 rounded-md border border-border text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInboxDelegate}
                disabled={!inboxDelegateToId || inboxDelegating}
                className="text-xs px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50"
                style={{ background: 'var(--color-accent)', color: '#1a1209' }}
              >
                {inboxDelegating ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatPhoneDisplay(phone: string): string {
  if (phone.length === 12 && phone.startsWith('91')) {
    return `+91 ${phone.slice(2, 7)} ${phone.slice(7)}`
  }
  return `+${phone}`
}
