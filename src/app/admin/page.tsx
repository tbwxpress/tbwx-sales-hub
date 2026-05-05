'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'
import MetaAdsDashboard from '@/components/MetaAdsDashboard'

interface User {
  id: string; name: string; email: string; role: string;
  can_assign: boolean; active: boolean; in_lead_pool: boolean; is_closer: boolean; is_telecaller: boolean
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
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ role: string } | null>(null)
  const [formError, setFormError] = useState('')

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
  }, [router])

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

  async function toggleField(userId: string, field: 'can_assign' | 'active' | 'in_lead_pool' | 'is_closer' | 'is_telecaller', currentValue: boolean) {
    await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, [field]: !currentValue }),
    })
    fetchUsers()
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
            <a href="/admin/setup" className="text-xs text-accent hover:text-accent-hover transition-colors mt-1 inline-flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Setup Health Check
            </a>
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
              const poolUsers = users.filter(u => u.active && u.in_lead_pool)
              const poolNames = poolUsers.map(u => u.name)
              const closerNames = poolUsers.filter(u => u.is_closer).map(u => u.name)
              const hasPool = poolNames.length > 0
              const bg = hasPool ? 'var(--color-accent-soft)' : 'var(--color-elevated)'
              const border = hasPool ? 'color-mix(in srgb, var(--color-accent) 35%, transparent)' : 'var(--color-border)'

              let summary: string
              if (!hasPool) {
                summary = 'No one is set to receive auto-assigned leads. Toggle Lead Pool on for at least one agent.'
              } else {
                const base = poolNames.length === 1
                  ? `New leads go to ${poolNames[0]}.`
                  : `New leads round-robin between ${poolNames.join(', ')}.`
                const hotPart = closerNames.length === 0
                  ? ' HOT leads use the same round-robin (no closer set).'
                  : closerNames.length === 1
                    ? ` HOT leads prefer ${closerNames[0]}.`
                    : ` HOT leads round-robin between closers ${closerNames.join(', ')}.`
                summary = base + hotPart
              }

              return (
                <div className="rounded-lg p-3 mb-2 flex items-start gap-3" style={{ background: bg, border: `1px solid ${border}` }}>
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--color-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-text">Lead Pool {hasPool ? `(${poolNames.length})` : '— empty'}</p>
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
                    <label className="flex items-center gap-2 text-xs text-dim cursor-pointer" title="When on, HOT leads prefer this user">
                      <span>HOT Priority</span>
                      <button
                        onClick={() => toggleField(u.id, 'is_closer', u.is_closer)}
                        className={`w-10 h-5 rounded-full transition-colors relative ${u.is_closer ? 'bg-accent' : 'bg-border'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${u.is_closer ? 'left-5' : 'left-0.5'}`} />
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
                  <label className="flex items-center gap-2 text-xs text-dim cursor-pointer">
                    <span>Active</span>
                    <button
                      onClick={() => toggleField(u.id, 'active', u.active)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${u.active ? 'bg-success' : 'bg-border'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${u.active ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

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
      </div>
      <PoweredBy />
    </div>
  )
}
