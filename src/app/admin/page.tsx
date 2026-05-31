'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'
// Heavy below-the-fold dashboard — defer to keep /admin first-load JS lean.
const MetaAdsDashboard = dynamic(() => import('@/components/MetaAdsDashboard'), {
  loading: () => null,
  ssr: false,
})
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

interface User {
  id: string; name: string; email: string; role: string;
  can_assign: boolean; can_edit_leads: boolean; active: boolean; in_lead_pool: boolean; is_closer: boolean; is_telecaller: boolean; lead_pool_paused: boolean
}

type AgentType = 'closer' | 'telecaller' | 'none'

function userType(u: { in_lead_pool: boolean; is_telecaller: boolean }): AgentType {
  if (u.is_telecaller) return 'telecaller'
  if (u.in_lead_pool) return 'closer'
  return 'none'
}

function flagsForType(t: AgentType): { in_lead_pool: boolean; is_telecaller: boolean; is_closer?: boolean } {
  if (t === 'closer') return { in_lead_pool: true, is_telecaller: false }
  if (t === 'telecaller') return { in_lead_pool: false, is_telecaller: true, is_closer: false }
  return { in_lead_pool: false, is_telecaller: false, is_closer: false }
}

export default function AdminPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('agent')
  const [canAssign, setCanAssign] = useState(false)
  const [newType, setNewType] = useState<AgentType>('none')
  const [newHotPriority, setNewHotPriority] = useState(false)

  // Telecaller auto-queue
  const [aqEnabled, setAqEnabled] = useState(false)
  const [aqUserId, setAqUserId] = useState('')
  const [aqStatuses, setAqStatuses] = useState<string[]>([])
  const [savingAq, setSavingAq] = useState(false)
  const [aqMsg, setAqMsg] = useState('')

  // Meta CAPI
  const [capiSettings, setCapiSettings] = useState<{
    pixel_id: string; enabled: boolean; has_token: boolean; test_event_code: string;
    purchase_value: number; lead_value: number; currency: string; event_source_url: string;
  } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [capiRecent, setCapiRecent] = useState<any[]>([])
  const [capiStats, setCapiStats] = useState<{ sent_24h: number; failed_24h: number; test_24h: number; total: number } | null>(null)
  const [capiTokenInput, setCapiTokenInput] = useState('')
  const [savingCapi, setSavingCapi] = useState(false)
  const [capiMsg, setCapiMsg] = useState('')
  const [capiTesting, setCapiTesting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null)
  const currentUserId = currentUser?.id || ''

  // Edit user modal state
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editErr, setEditErr] = useState('')
  const [formError, setFormError] = useState('')

  // Bulk delegate state
  const [bulkFromAgent, setBulkFromAgent] = useState('')
  const [bulkToAgent, setBulkToAgent] = useState('')
  const [bulkExpires, setBulkExpires] = useState('')
  const [bulkEligibleLeads, setBulkEligibleLeads] = useState<Array<{ row_number: number; full_name: string; lead_status: string }>>([])
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set())
  const [bulkSearching, setBulkSearching] = useState(false)
  const [bulkDelegating, setBulkDelegating] = useState(false)
  const [bulkMsg, setBulkMsg] = useState('')

  // Voice agent settings
  const [autoCallEnabled, setAutoCallEnabled] = useState(false)
  const [togglingAutoCall, setTogglingAutoCall] = useState(false)

  // WhatsApp template settings
  const [templateOptIn, setTemplateOptIn] = useState('')
  const [templateMarketingFirst, setTemplateMarketingFirst] = useState('')
  const [approvedTemplates, setApprovedTemplates] = useState<{ name: string; category: string; status: string }[]>([])
  const [savingTemplates, setSavingTemplates] = useState(false)
  const [templateMsg, setTemplateMsg] = useState('')

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.success) {
        setCurrentUser(d.data)
        if (d.data.role !== 'admin') router.push('/dashboard')
      }
    })
    fetchUsers()
    fetchVoiceAgentSettings()
    fetchTemplateSettings()
    fetchAutoQueue()
    fetchCapi()
  }, [router])

  async function fetchCapi() {
    try {
      const res = await fetch('/api/settings/meta-capi')
      const data = await res.json()
      if (data.success) {
        setCapiSettings(data.data.settings)
        setCapiRecent(data.data.recent || [])
        setCapiStats(data.data.stats || null)
      }
    } catch { /* silent */ }
  }

  async function saveCapi(patch: Record<string, unknown>) {
    setSavingCapi(true)
    setCapiMsg('')
    try {
      const res = await fetch('/api/settings/meta-capi', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (data.success) {
        setCapiSettings(data.data.settings)
        setCapiTokenInput('')
        setCapiMsg('Saved.')
      } else {
        setCapiMsg(data.error || 'Save failed')
      }
    } catch (err) { setCapiMsg(String(err)) }
    setSavingCapi(false)
    setTimeout(() => setCapiMsg(''), 3500)
  }

  async function fireCapiTest() {
    setCapiTesting(true)
    setCapiMsg('')
    try {
      const res = await fetch('/api/admin/meta-capi-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.success) {
        setCapiMsg(`Sent — Meta accepted ${data.data?.events_received ?? '?'} event(s). ${data.data?.test_mode ? 'Check Meta Events Manager → Test Events tab.' : 'Visible in Events Manager → Overview.'}`)
      } else {
        setCapiMsg(`Failed: ${data.data?.error || data.error || 'unknown'}`)
      }
      await fetchCapi()
    } catch (err) { setCapiMsg(String(err)) }
    setCapiTesting(false)
  }

  async function fetchTemplateSettings() {
    try {
      const [s, t] = await Promise.all([
        fetch('/api/settings/templates').then(r => r.json()),
        fetch('/api/templates').then(r => r.json()),
      ])
      if (s.success) {
        setTemplateOptIn(s.data.opt_in || '')
        setTemplateMarketingFirst(s.data.marketing_first || '')
      }
      if (t.success) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setApprovedTemplates((t.data || []).map((tpl: any) => ({ name: tpl.name, category: tpl.category, status: tpl.status })))
      }
    } catch { /* silent */ }
  }

  async function saveTemplateSettings() {
    setSavingTemplates(true)
    setTemplateMsg('')
    try {
      const res = await fetch('/api/settings/templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opt_in: templateOptIn, marketing_first: templateMarketingFirst }),
      })
      const data = await res.json()
      if (data.success) setTemplateMsg('Saved — changes take effect on next inbound lead.')
      else setTemplateMsg(data.error || 'Save failed')
    } catch (err) {
      setTemplateMsg(String(err))
    }
    setSavingTemplates(false)
    setTimeout(() => setTemplateMsg(''), 4000)
  }

  async function fetchVoiceAgentSettings() {
    try {
      const res = await fetch('/api/settings/voice-agent')
      const data = await res.json()
      setAutoCallEnabled(data.auto_call_enabled || false)
    } catch { /* silent */ }
  }

  async function toggleAutoCall() {
    setTogglingAutoCall(true)
    try {
      const res = await fetch('/api/settings/voice-agent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !autoCallEnabled }),
      })
      const data = await res.json()
      if (data.success) setAutoCallEnabled(data.auto_call_enabled)
    } catch { /* silent */ }
    setTogglingAutoCall(false)
  }

  async function fetchUsers() {
    const res = await fetch('/api/users')
    const data = await res.json()
    if (data.success) setUsers(data.data)
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const flags = flagsForType(newType)
    const is_closer = newType === 'closer' ? newHotPriority : false
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, email, password, role,
        can_assign: canAssign,
        in_lead_pool: flags.in_lead_pool,
        is_telecaller: flags.is_telecaller,
        is_closer,
      }),
    })
    const data = await res.json()
    if (data.success) {
      setName(''); setEmail(''); setPassword(''); setRole('agent'); setCanAssign(false); setNewType('none'); setNewHotPriority(false)
      setFormError('')
      setShowForm(false)
      fetchUsers()
    } else {
      setFormError(data.error || 'Failed to create user')
    }
  }

  async function toggleField(userId: string, field: 'can_assign' | 'can_edit_leads' | 'active' | 'in_lead_pool' | 'is_closer' | 'is_telecaller' | 'lead_pool_paused', currentValue: boolean) {
    await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, [field]: !currentValue }),
    })
    fetchUsers()
  }

  function openEditUser(u: User) {
    setEditingUser(u)
    setEditName(u.name)
    setEditEmail(u.email)
    setEditPassword('')
    setEditErr('')
  }

  function closeEditUser() {
    setEditingUser(null)
    setEditName('')
    setEditEmail('')
    setEditPassword('')
    setEditErr('')
  }

  async function saveEditUser() {
    if (!editingUser) return
    setEditSaving(true)
    setEditErr('')
    const body: Record<string, unknown> = { user_id: editingUser.id }
    if (editName.trim() && editName.trim() !== editingUser.name) body.name = editName.trim()
    if (editEmail.trim().toLowerCase() !== editingUser.email.toLowerCase()) body.email = editEmail.trim()
    if (editPassword.trim()) body.password = editPassword.trim()

    if (Object.keys(body).length === 1) {
      // Only user_id, nothing changed
      closeEditUser()
      setEditSaving(false)
      return
    }

    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (data.success) {
      const renamed = data.data?.leads_renamed
      closeEditUser()
      if (renamed > 0) alert(`Saved — ${renamed} lead(s) re-attributed to the new name.`)
      fetchUsers()
    } else {
      setEditErr(data.error || 'Save failed')
    }
    setEditSaving(false)
  }

  async function deleteUser(userId: string, userName: string) {
    if (!window.confirm(`Permanently delete ${userName}? This cannot be undone.`)) return

    // Try delete; server is authoritative about whether reassignment is required.
    let res = await fetch('/api/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    })
    let data = await res.json()

    if (!data.success && data.requires_reassign) {
      const candidates = users.filter(u => u.id !== userId && u.active && u.in_lead_pool)
      if (candidates.length === 0) {
        alert(`Cannot delete ${userName}: they own ${data.owned_leads} active lead(s) and there's no other active Closer to reassign to. Add another active Closer first, or mark ${userName} inactive instead of deleting.`)
        return
      }
      const promptText = `${userName} owns ${data.owned_leads} active lead(s). Reassign to which user?\n\n${candidates.map((u, i) => `${i + 1}. ${u.name}`).join('\n')}\n\nEnter the number:`
      const pick = window.prompt(promptText)
      const idx = pick ? parseInt(pick, 10) - 1 : -1
      if (idx < 0 || idx >= candidates.length) {
        alert('Cancelled — invalid choice.')
        return
      }
      const newOwner = candidates[idx].name
      if (!window.confirm(`Reassign ${data.owned_leads} lead(s) to ${newOwner} and delete ${userName}?`)) return

      res = await fetch('/api/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, reassign_leads_to: newOwner }),
      })
      data = await res.json()
    }

    if (!data.success) {
      alert(`Cannot delete ${userName}: ${data.error}`)
      return
    }

    const parts: string[] = []
    if (data.data?.leads_reassigned) parts.push(`${data.data.leads_reassigned} lead(s) reassigned`)
    if (data.data?.telecaller_assignments_cleared) parts.push(`${data.data.telecaller_assignments_cleared} telecaller assignment(s) cleared`)
    if (data.data?.auto_queue_reset) parts.push('auto-queue reset')
    alert(`${userName} deleted${parts.length ? ' — ' + parts.join(', ') : ''}.`)
    fetchUsers()
    fetchAutoQueue()
  }


  async function changeUserType(userId: string, newType: AgentType) {
    const flags = flagsForType(newType)
    const body: Record<string, unknown> = { user_id: userId, in_lead_pool: flags.in_lead_pool, is_telecaller: flags.is_telecaller }
    // When switching away from Closer, clear is_closer (HOT priority) too
    if (newType !== 'closer') body.is_closer = false
    await fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    fetchUsers()
  }

  // --- Telecaller auto-queue load + save ---
  async function fetchAutoQueue() {
    try {
      const res = await fetch('/api/settings/telecaller-auto-queue')
      const data = await res.json()
      if (data.success) {
        setAqEnabled(data.data.enabled)
        setAqUserId(data.data.user_id || '')
        setAqStatuses(data.data.statuses || [])
      }
    } catch { /* silent */ }
  }

  async function saveAutoQueue() {
    setSavingAq(true)
    setAqMsg('')
    try {
      const res = await fetch('/api/settings/telecaller-auto-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: aqEnabled, user_id: aqUserId, statuses: aqStatuses }),
      })
      const data = await res.json()
      if (data.success) setAqMsg('Saved.')
      else setAqMsg(data.error || 'Save failed')
    } catch (err) { setAqMsg(String(err)) }
    setSavingAq(false)
    setTimeout(() => setAqMsg(''), 3500)
  }

  if (!currentUser || currentUser.role !== 'admin') return null

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-6 flex-1">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text">User Management</h1>
            <p className="text-sm text-dim mt-0.5">{users.length} users configured</p>
            <div className="flex items-center gap-4 mt-1">
              <a href="/admin/setup" className="text-xs text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Setup Health Check
              </a>
              <a href="/admin/activity" className="text-xs text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Activity Log
              </a>
            </div>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            {showForm ? (
              'Cancel'
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add User
              </>
            )}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-card border border-border rounded-xl p-5 mb-6 space-y-4">
            <h2 className="text-sm font-semibold text-muted">New User</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-dim mb-1">Name</label>
                <input value={name} onChange={e => setName(e.target.value)} required className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50" placeholder="Full name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-dim mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50" placeholder="user@tbwxpress.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-dim mb-1">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50" placeholder="Set password" />
              </div>
              <div>
                <label className="block text-xs font-medium text-dim mb-1">Role</label>
                <select value={role} onChange={e => setRole(e.target.value)} className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50">
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-dim mb-1">Type</label>
                <select value={newType} onChange={e => setNewType(e.target.value as AgentType)} className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50">
                  <option value="none">None (admin / support)</option>
                  <option value="closer">Closer (owns leads, gets auto-assigned)</option>
                  <option value="telecaller">Telecaller (assists with calls)</option>
                </select>
              </div>
              {newType === 'closer' && (
                <label className="flex items-center gap-2 text-sm text-muted cursor-pointer mt-6">
                  <input type="checkbox" checked={newHotPriority} onChange={e => setNewHotPriority(e.target.checked)} className="rounded accent-accent" />
                  HOT lead priority (gets the hottest leads first)
                </label>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
              <input type="checkbox" checked={canAssign} onChange={e => setCanAssign(e.target.checked)} className="rounded accent-accent" />
              Can assign / reassign leads (manager permission)
            </label>
            {formError && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--color-danger)', background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)' }}>{formError}</p>
            )}
            <button type="submit" className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              Create User
            </button>
          </form>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Lead Pool status banner */}
            {(() => {
              const closers = users.filter(u => u.active && u.in_lead_pool)
              const receiving = closers.filter(u => !u.lead_pool_paused)
              const paused = closers.filter(u => u.lead_pool_paused)
              const hasReceiving = receiving.length > 0
              const bg = hasReceiving ? 'var(--color-accent-soft)' : 'var(--color-elevated)'
              const border = hasReceiving ? 'color-mix(in srgb, var(--color-accent) 35%, transparent)' : 'var(--color-border)'

              let summary: string
              if (closers.length === 0) {
                summary = 'No Closers configured. Set someone’s Type = Closer to start receiving auto-assigned leads.'
              } else if (!hasReceiving) {
                summary = `All ${closers.length} Closer(s) are paused. New leads will stay unassigned until at least one is set to Receiving = ON.`
              } else if (receiving.length === 1) {
                summary = `New leads go to ${receiving[0].name}.${paused.length > 0 ? ` ${paused.map(p => p.name).join(', ')} paused.` : ''}`
              } else {
                summary = `New leads alternate between ${receiving.map(r => r.name).join(' → ')}.${paused.length > 0 ? ` ${paused.map(p => p.name).join(', ')} paused.` : ''}`
              }

              return (
                <div className="rounded-lg p-3 mb-2 flex items-start gap-3" style={{ background: bg, border: `1px solid ${border}` }}>
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--color-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-text">Lead Alternation {hasReceiving ? `(${receiving.length} active${paused.length > 0 ? `, ${paused.length} paused` : ''})` : '— paused'}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{summary}</p>
                  </div>
                </div>
              )
            })()}
            {users.map(u => (
              <div key={u.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between hover:border-border-light transition-colors">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    u.role === 'admin' ? 'bg-accent/20' : 'bg-elevated'
                  }`}>
                    <span className={`text-sm font-bold ${u.role === 'admin' ? 'text-accent' : 'text-muted'}`}>
                      {u.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text text-sm">{u.name}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        u.role === 'admin'
                          ? 'bg-accent/15 text-accent'
                          : 'bg-elevated text-muted'
                      }`}>
                        {u.role}
                      </span>
                      {!u.active && <span className="text-[10px] text-danger font-medium">(Inactive)</span>}
                    </div>
                    <p className="text-xs text-dim mt-0.5">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-dim" title="Type defines this user's role in the lead flow">
                    <span>Type</span>
                    <select
                      value={userType(u)}
                      onChange={e => changeUserType(u.id, e.target.value as AgentType)}
                      className="bg-elevated border border-border rounded-md px-2 py-1 text-xs text-text focus:outline-none focus:border-accent/50"
                    >
                      <option value="none">None</option>
                      <option value="closer">Closer</option>
                      <option value="telecaller">Telecaller</option>
                    </select>
                  </label>
                  {u.in_lead_pool && (
                    <label className="flex items-center gap-2 text-xs text-dim cursor-pointer" title="When ON, this Closer receives auto-assigned new leads. OFF = paused (still a Closer, just not in the alternation cycle).">
                      <span>Receiving</span>
                      <button
                        onClick={() => toggleField(u.id, 'lead_pool_paused', u.lead_pool_paused)}
                        className={`w-10 h-5 rounded-full transition-colors relative ${!u.lead_pool_paused ? 'bg-success' : 'bg-border'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${!u.lead_pool_paused ? 'left-5' : 'left-0.5'}`} />
                      </button>
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-xs text-dim cursor-pointer" title="When on, this user can manually reassign leads">
                    <span>Can Assign</span>
                    <button
                      onClick={() => toggleField(u.id, 'can_assign', u.can_assign)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${u.can_assign ? 'bg-accent' : 'bg-border'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${u.can_assign ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-dim cursor-pointer" title="When on, this user can edit lead contact details (name, email, city, state, model interest)">
                    <span>Can Edit Leads</span>
                    <button
                      onClick={() => toggleField(u.id, 'can_edit_leads', u.can_edit_leads)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${u.can_edit_leads ? 'bg-accent' : 'bg-border'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${u.can_edit_leads ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-dim cursor-pointer">
                    <span>Active</span>
                    <button
                      onClick={() => toggleField(u.id, 'active', u.active)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${u.active ? 'bg-success' : 'bg-border'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${u.active ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => openEditUser(u)}
                        className="p-1.5 rounded-md text-dim hover:text-accent hover:bg-accent/10 transition-colors"
                        aria-label={`Edit ${u.name}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>edit user</TooltipContent>
                  </Tooltip>
                  {u.id !== currentUserId && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => deleteUser(u.id, u.name)}
                          className="p-1.5 rounded-md text-dim hover:text-danger hover:bg-danger/10 transition-colors"
                          aria-label={`Delete ${u.name}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>delete user</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bulk Delegate */}
        <div className="mt-8 mb-6">
          <h2 className="text-lg font-bold text-text mb-1">Bulk Delegate</h2>
          <p className="text-sm text-dim mb-4">Cover an agent&apos;s leads while they&apos;re on leave. Creates active delegations instantly (no approval needed).</p>
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted block mb-1">From Agent (on leave)</label>
                <select
                  value={bulkFromAgent}
                  onChange={e => { setBulkFromAgent(e.target.value); setBulkEligibleLeads([]); setBulkSelected(new Set()); setBulkMsg('') }}
                  className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
                >
                  <option value="">Select agent...</option>
                  {users.filter(u => u.role === 'agent' && u.active).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted block mb-1">To Agent (covering)</label>
                <select
                  value={bulkToAgent}
                  onChange={e => { setBulkToAgent(e.target.value); setBulkMsg('') }}
                  className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
                >
                  <option value="">Select agent...</option>
                  {users.filter(u => u.role === 'agent' && u.active && u.id !== bulkFromAgent).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted block mb-1">Until (optional)</label>
                <input
                  type="date"
                  value={bulkExpires}
                  onChange={e => setBulkExpires(e.target.value)}
                  className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
                />
              </div>
            </div>
            <button
              disabled={!bulkFromAgent || bulkSearching}
              onClick={async () => {
                setBulkSearching(true)
                setBulkMsg('')
                try {
                  const fromUser = users.find(u => u.id === bulkFromAgent)
                  const res = await fetch(`/api/leads?assigned=${encodeURIComponent(fromUser?.name || '')}`)
                  const data = await res.json()
                  if (data.success) {
                    const eligible = data.data.filter((l: { lead_status: string }) =>
                      !['CONVERTED', 'LOST', 'ARCHIVED'].includes(l.lead_status)
                    )
                    setBulkEligibleLeads(eligible)
                    setBulkSelected(new Set(eligible.map((l: { row_number: number }) => l.row_number)))
                  }
                } catch { setBulkMsg('Failed to fetch leads') }
                setBulkSearching(false)
              }}
              className="text-xs px-4 py-2 rounded-lg border border-border bg-elevated hover:bg-border text-muted transition-colors disabled:opacity-50"
            >
              {bulkSearching ? 'Loading...' : 'Show Eligible Leads'}
            </button>

            {bulkEligibleLeads.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dim">{bulkSelected.size} of {bulkEligibleLeads.length} selected</span>
                  <button
                    onClick={() => setBulkSelected(
                      bulkSelected.size === bulkEligibleLeads.length
                        ? new Set()
                        : new Set(bulkEligibleLeads.map(l => l.row_number))
                    )}
                    className="text-xs text-accent hover:text-accent-hover transition-colors"
                  >
                    {bulkSelected.size === bulkEligibleLeads.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border/50">
                  {bulkEligibleLeads.map(l => (
                    <label key={l.row_number} className="flex items-center gap-3 px-3 py-2 hover:bg-elevated/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkSelected.has(l.row_number)}
                        onChange={e => {
                          const next = new Set(bulkSelected)
                          e.target.checked ? next.add(l.row_number) : next.delete(l.row_number)
                          setBulkSelected(next)
                        }}
                        className="accent-accent"
                      />
                      <span className="text-xs text-text flex-1">#{l.row_number} {l.full_name}</span>
                      <span className="text-[10px] text-dim">{l.lead_status}</span>
                    </label>
                  ))}
                </div>
                <button
                  disabled={bulkSelected.size === 0 || !bulkToAgent || bulkDelegating}
                  onClick={async () => {
                    setBulkDelegating(true)
                    setBulkMsg('')
                    try {
                      const res = await fetch('/api/admin/delegations/bulk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          lead_rows: Array.from(bulkSelected),
                          from_agent_id: bulkFromAgent,
                          to_agent_id: bulkToAgent,
                          expires_at: bulkExpires || undefined,
                        }),
                      })
                      const data = await res.json()
                      if (data.success) {
                        setBulkMsg(`${data.data.created} delegation(s) created`)
                        setBulkEligibleLeads([])
                        setBulkSelected(new Set())
                        setBulkFromAgent('')
                        setBulkToAgent('')
                        setBulkExpires('')
                      } else {
                        setBulkMsg(data.error || 'Failed')
                      }
                    } catch { setBulkMsg('Failed to delegate') }
                    setBulkDelegating(false)
                  }}
                  className="w-full py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                  style={{ background: 'var(--color-accent)', color: '#1a1209' }}
                >
                  {bulkDelegating ? 'Creating...' : `Delegate ${bulkSelected.size} lead(s)`}
                </button>
                {bulkMsg && (
                  <p className="text-xs text-center" style={{ color: bulkMsg.includes('created') ? 'var(--color-success)' : 'var(--color-danger)' }}>{bulkMsg}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Meta Ads Dashboard */}
        <div className="mt-8 mb-6">
          <h2 className="text-lg font-bold text-text mb-1">Meta Ads</h2>
          <p className="text-sm text-dim mb-4">Campaign performance from your Meta ad account</p>
          <MetaAdsDashboard />
        </div>

        {/* WhatsApp Templates */}
        <div className="mt-8 mb-6">
          <h2 className="text-lg font-bold text-text mb-1">WhatsApp Templates</h2>
          <p className="text-sm text-dim mb-4">Choose which approved Meta template each automation uses. Changes take effect on the next inbound lead — no redeploy required.</p>
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            {(() => {
              const approved = approvedTemplates.filter(t => t.status === 'APPROVED')
              const optInStatus = approvedTemplates.find(t => t.name === templateOptIn)?.status
              const marketingStatus = approvedTemplates.find(t => t.name === templateMarketingFirst)?.status
              const renderStatusPill = (status: string | undefined) => {
                if (!status) return <span className="text-[10px] text-dim">unknown</span>
                if (status === 'APPROVED') return <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-success)' }}>Approved</span>
                if (status === 'PENDING') return <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-warning)' }}>Pending</span>
                return <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-danger)' }}>{status}</span>
              }
              return (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-muted">Opt-in template (auto-send cron)</label>
                      {renderStatusPill(optInStatus)}
                    </div>
                    <select value={templateOptIn} onChange={e => setTemplateOptIn(e.target.value)} className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50">
                      {!approved.find(t => t.name === templateOptIn) && templateOptIn && (
                        <option value={templateOptIn}>{templateOptIn} (current — not in approved list)</option>
                      )}
                      {approved.map(t => (
                        <option key={t.name} value={t.name}>{t.name} · {t.category}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-dim mt-1">Sent to every new lead from the form. Should be UTILITY category.</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-muted">First marketing template (sent on opt-in / first reply)</label>
                      {renderStatusPill(marketingStatus)}
                    </div>
                    <select value={templateMarketingFirst} onChange={e => setTemplateMarketingFirst(e.target.value)} className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50">
                      {!approved.find(t => t.name === templateMarketingFirst) && templateMarketingFirst && (
                        <option value={templateMarketingFirst}>{templateMarketingFirst} (current — not in approved list)</option>
                      )}
                      {approved.map(t => (
                        <option key={t.name} value={t.name}>{t.name} · {t.category}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-dim mt-1">Carries the franchise deck. Sent the moment the lead replies to the opt-in.</p>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-dim">{templateMsg || `${approved.length} approved template${approved.length === 1 ? '' : 's'} available`}</span>
                    <button onClick={saveTemplateSettings} disabled={savingTemplates} className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                      {savingTemplates ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>

        {/* Voice Agent Settings */}
        <div className="mt-8 mb-6">
          <h2 className="text-lg font-bold text-text mb-1">AI Voice Agent</h2>
          <p className="text-sm text-dim mb-4">Configure the AI calling agent for franchise leads</p>

          <div className="bg-card border border-border rounded-xl p-5 space-y-5">
            {/* Auto-call toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-accent-soft)' }}>
                  <svg className="w-5 h-5" style={{ color: 'var(--color-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-text">Auto-call new leads</p>
                  <p className="text-xs text-dim mt-0.5">
                    When enabled, the AI agent automatically calls every new lead that comes in
                  </p>
                </div>
              </div>
              <button
                onClick={toggleAutoCall}
                disabled={togglingAutoCall}
                className="relative w-12 h-6 rounded-full transition-colors duration-200 disabled:opacity-50"
                style={{ background: autoCallEnabled ? 'var(--color-accent)' : 'var(--color-border)' }}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                  autoCallEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {/* Status indicator */}
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-elevated border border-border">
              <span className={`w-2 h-2 rounded-full ${autoCallEnabled ? 'animate-pulse' : ''}`} style={{ background: autoCallEnabled ? 'var(--color-accent)' : 'var(--color-dim)' }} />
              <span className="text-xs text-muted">
                {autoCallEnabled
                  ? 'AI agent will call new leads automatically'
                  : 'Auto-calling is off — use the manual "Call via AI" button on each lead'}
              </span>
            </div>

            {/* Info box */}
            <div className="rounded-lg p-3" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                The AI voice agent introduces TBWX, answers franchise questions, checks if the WhatsApp deck was received,
                and gauges interest level. Call summaries and transcripts are logged on each lead&apos;s detail page.
              </p>
            </div>
          </div>
        </div>

        {/* Telecaller Auto-Queue */}
        <div className="mt-8 mb-6">
          <h2 className="text-lg font-bold text-text mb-1">Telecaller Auto-Queue</h2>
          <p className="text-sm text-dim mb-4">When enabled, leads matching the chosen statuses are auto-routed to the picked telecaller&apos;s queue (lead owner stays the agent). Opted-out leads are excluded.</p>
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            {(() => {
              const telecallers = users.filter(u => u.is_telecaller && u.active)
              const allStatuses = ['NEW', 'DECK_SENT', 'REPLIED', 'NO_RESPONSE', 'CALL_DONE_INTERESTED', 'HOT', 'FINAL_NEGOTIATION', 'CONVERTED', 'DELAYED', 'LOST']
              const noTelecallers = telecallers.length === 0
              return (
                <>
                  {noTelecallers && (
                    <div className="rounded-lg p-3 text-xs" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
                      No telecallers configured yet. Add a user above and set Type = Telecaller to enable this.
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text">Enable auto-queue</p>
                      <p className="text-xs text-dim mt-0.5">Off by default — leads only land in telecaller queue when assigned manually.</p>
                    </div>
                    <button
                      onClick={() => setAqEnabled(!aqEnabled)}
                      disabled={noTelecallers}
                      className="relative w-12 h-6 rounded-full transition-colors duration-200 disabled:opacity-50"
                      style={{ background: aqEnabled ? 'var(--color-accent)' : 'var(--color-border)' }}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${aqEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">Telecaller</label>
                    <select value={aqUserId} onChange={e => setAqUserId(e.target.value)} disabled={noTelecallers || !aqEnabled} className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text disabled:opacity-50 focus:outline-none focus:border-accent/50">
                      <option value="">— pick a telecaller —</option>
                      {telecallers.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">Auto-queue statuses</label>
                    <div className="flex flex-wrap gap-2">
                      {allStatuses.map(s => {
                        const checked = aqStatuses.includes(s)
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setAqStatuses(checked ? aqStatuses.filter(x => x !== s) : [...aqStatuses, s])}
                            disabled={!aqEnabled}
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${checked ? 'bg-accent text-[#1a1209] border-accent' : 'bg-elevated text-muted border-border hover:border-accent/40'}`}
                          >
                            {s}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-[11px] text-dim mt-2">Leads matching ANY checked status flow into the telecaller&apos;s queue automatically.</p>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-dim">{aqMsg}</span>
                    <button onClick={saveAutoQueue} disabled={savingAq || noTelecallers} className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                      {savingAq ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>

        {/* Meta Conversions API */}
        <div className="mt-8 mb-6">
          <h2 className="text-lg font-bold text-text mb-1">Meta Conversions API <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ml-2" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>Lead Quality</span></h2>
          <p className="text-sm text-dim mb-4">Sends real conversion signals (HOT, CONVERTED) back to Meta so the algorithm optimizes for actual buyers — not just form-fillers. Industry benchmark: 30–50% CPL reduction on quality leads within 4–6 weeks.</p>
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            {!capiSettings ? (
              <p className="text-xs text-dim">Loading…</p>
            ) : (
              <>
                {/* Status row */}
                <div className="flex items-center justify-between gap-4 pb-3 border-b border-border">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${capiSettings.enabled ? 'animate-pulse' : ''}`} style={{ background: capiSettings.enabled ? 'var(--color-success)' : 'var(--color-dim)' }} />
                      <p className="text-sm font-medium text-text">{capiSettings.enabled ? 'Live — events firing on status changes' : 'Disabled — no events sent'}</p>
                    </div>
                    {capiSettings.test_event_code && (
                      <p className="text-[11px] mt-1" style={{ color: 'var(--color-warning)' }}>⚠ Test mode active — events route to Meta &ldquo;Test Events&rdquo; tab only. Clear test_event_code for production firing.</p>
                    )}
                    {!capiSettings.has_token && (
                      <p className="text-[11px] mt-1" style={{ color: 'var(--color-danger)' }}>No access token — set one below or rely on WHATSAPP_TOKEN env var.</p>
                    )}
                  </div>
                  <button
                    onClick={() => saveCapi({ enabled: !capiSettings.enabled })}
                    disabled={savingCapi || !capiSettings.has_token}
                    className="relative w-12 h-6 rounded-full transition-colors duration-200 disabled:opacity-50 shrink-0"
                    style={{ background: capiSettings.enabled ? 'var(--color-success)' : 'var(--color-border)' }}
                    title={capiSettings.enabled ? 'Disable CAPI' : 'Enable CAPI'}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${capiSettings.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                {/* 24h stats */}
                {capiStats && (
                  <div className="grid grid-cols-4 gap-2">
                    <div className="rounded-lg p-2 text-center" style={{ background: 'var(--color-elevated)' }}>
                      <div className="text-lg font-bold" style={{ color: 'var(--color-success)' }}>{capiStats.sent_24h}</div>
                      <div className="text-[10px] text-dim uppercase tracking-wider">Sent 24h</div>
                    </div>
                    <div className="rounded-lg p-2 text-center" style={{ background: 'var(--color-elevated)' }}>
                      <div className="text-lg font-bold" style={{ color: 'var(--color-warning)' }}>{capiStats.test_24h}</div>
                      <div className="text-[10px] text-dim uppercase tracking-wider">Test 24h</div>
                    </div>
                    <div className="rounded-lg p-2 text-center" style={{ background: 'var(--color-elevated)' }}>
                      <div className="text-lg font-bold" style={{ color: 'var(--color-danger)' }}>{capiStats.failed_24h}</div>
                      <div className="text-[10px] text-dim uppercase tracking-wider">Failed 24h</div>
                    </div>
                    <div className="rounded-lg p-2 text-center" style={{ background: 'var(--color-elevated)' }}>
                      <div className="text-lg font-bold text-text">{capiStats.total}</div>
                      <div className="text-[10px] text-dim uppercase tracking-wider">All-time</div>
                    </div>
                  </div>
                )}

                {/* Pixel + token */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Pixel ID</label>
                    <input
                      type="text"
                      defaultValue={capiSettings.pixel_id}
                      onBlur={e => { if (e.target.value !== capiSettings.pixel_id) saveCapi({ pixel_id: e.target.value }) }}
                      className="w-full bg-elevated border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Test Event Code <span className="text-[10px] text-dim">(optional)</span></label>
                    <input
                      type="text"
                      defaultValue={capiSettings.test_event_code}
                      onBlur={e => { if (e.target.value !== capiSettings.test_event_code) saveCapi({ test_event_code: e.target.value }) }}
                      placeholder="TEST12345 — leave blank for production"
                      className="w-full bg-elevated border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50 font-mono"
                    />
                  </div>
                </div>

                {/* Access token */}
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Access Token override <span className="text-[10px] text-dim">(default: WHATSAPP_TOKEN env)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={capiTokenInput}
                      onChange={e => setCapiTokenInput(e.target.value)}
                      placeholder={capiSettings.has_token ? '•••••• (set — leave blank to keep)' : 'Paste a long-lived ads_management token'}
                      className="flex-1 bg-elevated border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50 font-mono"
                    />
                    <button
                      onClick={() => capiTokenInput.trim() && saveCapi({ access_token: capiTokenInput.trim() })}
                      disabled={!capiTokenInput.trim() || savingCapi}
                      className="text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-50"
                      style={{ background: 'var(--color-elevated)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                    >
                      Save token
                    </button>
                  </div>
                </div>

                {/* Values */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Lead value (HOT)</label>
                    <input
                      type="number"
                      defaultValue={capiSettings.lead_value}
                      onBlur={e => { const n = Number(e.target.value); if (n > 0 && n !== capiSettings.lead_value) saveCapi({ lead_value: n }) }}
                      className="w-full bg-elevated border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Purchase value (CONVERTED)</label>
                    <input
                      type="number"
                      defaultValue={capiSettings.purchase_value}
                      onBlur={e => { const n = Number(e.target.value); if (n > 0 && n !== capiSettings.purchase_value) saveCapi({ purchase_value: n }) }}
                      className="w-full bg-elevated border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Currency</label>
                    <input
                      type="text"
                      defaultValue={capiSettings.currency}
                      onBlur={e => { if (e.target.value && e.target.value !== capiSettings.currency) saveCapi({ currency: e.target.value }) }}
                      className="w-full bg-elevated border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent/50"
                    />
                  </div>
                </div>

                {/* Test + status message */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-xs text-dim flex-1">{capiMsg}</span>
                  <button
                    onClick={fireCapiTest}
                    disabled={capiTesting || !capiSettings.has_token}
                    className="text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                    style={{ background: 'var(--color-accent)', color: '#1a1209' }}
                  >
                    {capiTesting ? 'Sending…' : 'Send test event'}
                  </button>
                </div>

                {/* Recent events log */}
                {capiRecent.length > 0 && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Recent CAPI events</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-dim border-b border-border/50">
                            <th className="px-2 py-1.5 text-left font-medium">When</th>
                            <th className="px-2 py-1.5 text-left font-medium">Event</th>
                            <th className="px-2 py-1.5 text-right font-medium">Value</th>
                            <th className="px-2 py-1.5 text-center font-medium">Status</th>
                            <th className="px-2 py-1.5 text-left font-medium">Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {capiRecent.map(e => (
                            <tr key={e.id} className="border-b border-border/30 last:border-b-0">
                              <td className="px-2 py-1.5 text-dim whitespace-nowrap">{e.created_at?.slice(5, 16) || ''}</td>
                              <td className="px-2 py-1.5 text-text">{e.event_name}</td>
                              <td className="px-2 py-1.5 text-right text-muted">{e.currency || ''} {Number(e.value || 0).toLocaleString('en-IN')}</td>
                              <td className="px-2 py-1.5 text-center">
                                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{
                                  background: e.status === 'sent' ? 'color-mix(in srgb, var(--color-success) 15%, transparent)' :
                                             e.status === 'failed' ? 'color-mix(in srgb, var(--color-danger) 15%, transparent)' :
                                             e.status === 'test' ? 'color-mix(in srgb, var(--color-warning) 15%, transparent)' :
                                             'var(--color-elevated)',
                                  color: e.status === 'sent' ? 'var(--color-success)' :
                                         e.status === 'failed' ? 'var(--color-danger)' :
                                         e.status === 'test' ? 'var(--color-warning)' :
                                         'var(--color-muted)',
                                }}>{e.status}</span>
                              </td>
                              <td className="px-2 py-1.5 text-dim truncate max-w-[24ch]" title={e.last_error || ''}>
                                {e.meta_events_received !== null ? `accepted ${e.meta_events_received}` : (e.last_error || '')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Quick guide */}
                <details className="pt-2 border-t border-border">
                  <summary className="text-xs text-dim cursor-pointer hover:text-muted">How this works + verification steps</summary>
                  <div className="mt-2 text-xs space-y-1.5" style={{ color: 'var(--color-muted)' }}>
                    <p><span className="font-semibold text-text">Triggers:</span> when a lead status is changed to <span className="text-accent">HOT</span>, a <code className="text-[10px] px-1 rounded" style={{ background: 'var(--color-elevated)' }}>Lead</code> event fires; on <span className="text-accent">CONVERTED</span>, a <code className="text-[10px] px-1 rounded" style={{ background: 'var(--color-elevated)' }}>Purchase</code> event fires with the value above.</p>
                    <p><span className="font-semibold text-text">Privacy:</span> phone &amp; email are SHA-256 hashed before sending. Raw values never logged.</p>
                    <p><span className="font-semibold text-text">Verify before going live:</span> (1) Set a Test Event Code from Events Manager → Test Events → click &ldquo;Test events&rdquo; → grab the code. (2) Save it above + flip Enable on. (3) Click &ldquo;Send test event&rdquo;. (4) Watch Events Manager → Test Events tab — should appear within seconds. (5) Once verified, clear the Test Event Code and events go live.</p>
                  </div>
                </details>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── Edit User Modal ─────────────────────────────────────── */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeEditUser}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-text">Edit user</h2>
              <button onClick={closeEditUser} className="text-dim hover:text-text transition-colors" aria-label="Close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-dim mb-1">Name</label>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
                />
                <p className="text-[11px] text-dim mt-1">Renaming this user will re-attribute all of their leads in the Sheet (assigned_to gets bulk-rewritten).</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-dim mb-1">Email (login)</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-dim mb-1">Reset password</label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={e => setEditPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
                />
                <p className="text-[11px] text-dim mt-1">Min 6 chars. Leave blank to keep the user&apos;s current password.</p>
              </div>
              {editErr && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--color-danger)', background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)' }}>{editErr}</p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
              <button onClick={closeEditUser} className="text-sm text-dim hover:text-text px-3 py-1.5 rounded-md transition-colors">Cancel</button>
              <button
                onClick={saveEditUser}
                disabled={editSaving}
                className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-[#1a1209] text-sm font-semibold px-4 py-1.5 rounded-md transition-colors"
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <PoweredBy />
    </div>
  )
}
