'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Navbar from '@/components/Navbar'
import {
  ArrowLeft,
  Zap,
  PhoneCall,
  Handshake,
  PauseCircle,
  AlertTriangle,
  Target,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

type WorkMode = 'guided' | 'free'
type GuidedSurface = 'guided_free' | 'guided_inbox'
type AgentRole = 'telecaller' | 'closer' | null

interface AgentUser {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  work_mode: WorkMode
  guided_surface: GuidedSurface
  agent_role: AgentRole
  daily_target: number
  receives_new_leads: boolean
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AdminAgentsPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null)
  const [users, setUsers] = useState<AgentUser[]>([])
  const [loading, setLoading] = useState(true)
  const [killing, setKilling] = useState(false)
  const [confirmKill, setConfirmKill] = useState(false)
  // Per-row in-flight guard (disable while a PATCH is mid-air for that user).
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  // Auth gate — admin-only, same pattern as the rest of /admin.
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setCurrentUser(d.data)
          if (d.data.role !== 'admin') router.push('/dashboard')
        } else {
          router.push('/login')
        }
      })
      .catch(() => router.push('/login'))
  }, [router])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      if (data.success) {
        const mapped: AgentUser[] = (data.data as Array<Record<string, unknown>>).map(u => ({
          id: String(u.id),
          name: String(u.name),
          email: String(u.email),
          role: String(u.role),
          active: Boolean(u.active),
          work_mode: (u.work_mode === 'guided' ? 'guided' : 'free') as WorkMode,
          guided_surface: (u.guided_surface === 'guided_inbox' ? 'guided_inbox' : 'guided_free') as GuidedSurface,
          agent_role:
            u.agent_role === 'telecaller' || u.agent_role === 'closer'
              ? (u.agent_role as AgentRole)
              : null,
          daily_target: typeof u.daily_target === 'number' ? u.daily_target : Number(u.daily_target) || 40,
          receives_new_leads: u.receives_new_leads !== false,
        }))
        setUsers(mapped)
      }
    } catch {
      toast.error('Could not load agents')
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  // ── Optimistic PATCH helper ────────────────────────────────────────────────
  // Applies the change to local state immediately, fires the PATCH, and rolls
  // back to the prior snapshot on failure. Lossless + instant, as the spec demands.
  async function patchAgent(
    id: string,
    patch: Partial<Pick<AgentUser, 'work_mode' | 'guided_surface' | 'agent_role' | 'daily_target' | 'receives_new_leads'>>,
    successMsg: string,
  ) {
    const prev = users
    setBusy(b => ({ ...b, [id]: true }))
    setUsers(list => list.map(u => (u.id === id ? { ...u, ...patch } : u)))
    try {
      const res = await fetch(`/api/admin/agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Update failed')
      // Reconcile with the server's authoritative values.
      setUsers(list =>
        list.map(u =>
          u.id === id
            ? {
                ...u,
                work_mode: data.data.work_mode,
                guided_surface: data.data.guided_surface,
                agent_role: data.data.agent_role,
                daily_target: data.data.daily_target,
                receives_new_leads: data.data.receives_new_leads,
              }
            : u,
        ),
      )
      toast.success(successMsg)
    } catch (err) {
      setUsers(prev) // rollback
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(b => ({ ...b, [id]: false }))
    }
  }

  async function killSwitch() {
    setKilling(true)
    const prev = users
    // Optimistic: everyone to Free immediately.
    setUsers(list => list.map(u => ({ ...u, work_mode: 'free' as WorkMode })))
    try {
      const res = await fetch('/api/admin/agents/all-to-free', { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed')
      toast.success(
        data.data.updated > 0
          ? `Experiment paused — ${data.data.updated} agent(s) switched to Free.`
          : 'Everyone is already on Free.',
      )
      // Re-sync from source of truth.
      fetchUsers()
    } catch (err) {
      setUsers(prev)
      toast.error(err instanceof Error ? err.message : 'Could not switch everyone to Free')
    } finally {
      setKilling(false)
      setConfirmKill(false)
    }
  }

  if (!currentUser || currentUser.role !== 'admin') return null

  const guidedCount = users.filter(u => u.work_mode === 'guided').length
  // Only agents are candidates for the rail; admins/support stay off it.
  const agents = users.filter(u => u.role === 'agent')

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-6 flex-1 w-full">

        {/* Header + back link */}
        <button
          onClick={() => router.push('/admin')}
          className="inline-flex items-center gap-1.5 text-xs text-dim hover:text-accent transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
          Back to Admin
        </button>

        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-accent-soft)' }}>
              <Zap className="w-5 h-5 text-accent" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text leading-tight">Agents · Work Mode</h1>
              <p className="text-sm text-dim leading-tight">
                {guidedCount > 0
                  ? `${guidedCount} agent${guidedCount === 1 ? '' : 's'} on the Guided rail`
                  : 'Everyone on Free (today’s app)'}
              </p>
            </div>
          </div>
        </div>

        {/* Explainer band — sets the experiment posture */}
        <div
          className="rounded-xl p-4 my-5 flex items-start gap-3"
          style={{ background: 'var(--color-accent-soft)', border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)' }}
        >
          <Target className="w-4 h-4 mt-0.5 shrink-0 text-accent" strokeWidth={2} />
          <div className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            <span className="font-semibold text-text">Experiment — default Free.</span>{' '}
            Guided puts an agent on a single-focus &ldquo;work rail&rdquo; (lands on <span className="font-mono text-[11px]">/work</span>, stripped nav, forced cadence).
            Free is today&apos;s full app, unchanged. Switching is <span className="font-semibold text-text">instant and lossless</span> — both modes drive the same shared leads, statuses and history, so you can flip anyone back at any time with nothing lost.
          </div>
        </div>

        {/* Kill-switch */}
        <div
          className="rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{ background: 'var(--color-card)', border: '1px solid color-mix(in srgb, var(--color-warning) 35%, transparent)' }}
        >
          <div className="flex items-start gap-3">
            <PauseCircle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: 'var(--color-warning)' }} strokeWidth={2} />
            <div>
              <p className="text-sm font-semibold text-text">Pause the experiment</p>
              <p className="text-xs text-dim mt-0.5 max-w-md">
                Switch <span className="font-semibold">everyone</span> back to Free in one click. Lossless — no data, history, or assignment is touched, only the driver.
              </p>
            </div>
          </div>
          {!confirmKill ? (
            <button
              onClick={() => setConfirmKill(true)}
              disabled={killing || guidedCount === 0}
              className="shrink-0 inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'color-mix(in srgb, var(--color-warning) 18%, transparent)', color: 'var(--color-warning)', border: '1px solid color-mix(in srgb, var(--color-warning) 45%, transparent)' }}
            >
              <PauseCircle className="w-4 h-4" strokeWidth={2} />
              Switch everyone to Free
            </button>
          ) : (
            <div className="shrink-0 flex items-center gap-2">
              <span className="text-xs text-muted hidden sm:inline">Sure?</span>
              <button
                onClick={killSwitch}
                disabled={killing}
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors disabled:opacity-50"
                style={{ background: 'var(--color-warning)', color: '#1a1209' }}
              >
                <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2.5} />
                {killing ? 'Switching…' : 'Yes, pause it'}
              </button>
              <button
                onClick={() => setConfirmKill(false)}
                disabled={killing}
                className="text-sm font-medium px-3 py-2 rounded-lg text-muted hover:text-text transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Agent roster */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : agents.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
            <p className="text-sm text-muted">No agents yet. Add users with role = Agent in <button onClick={() => router.push('/admin')} className="text-accent hover:underline">User Management</button>.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map(u => {
              const isGuided = u.work_mode === 'guided'
              const rowBusy = !!busy[u.id]
              return (
                <div
                  key={u.id}
                  className="rounded-xl p-4 transition-colors"
                  style={{
                    background: 'var(--color-card)',
                    border: isGuided
                      ? '1px solid color-mix(in srgb, var(--color-accent) 45%, transparent)'
                      : '1px solid var(--color-border)',
                  }}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                    {/* Identity + status */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: isGuided ? 'var(--color-accent-soft)' : 'var(--color-elevated)' }}>
                        <span className="text-sm font-bold" style={{ color: isGuided ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                          {u.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-text text-sm truncate">{u.name}</span>
                          {isGuided ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: 'var(--color-accent)', color: '#1a1209' }}>
                              <Zap className="w-2.5 h-2.5" strokeWidth={3} />
                              Guided
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-elevated text-dim">
                              Free
                            </span>
                          )}
                          {!u.active && <span className="text-[10px] text-danger font-medium">(Inactive)</span>}
                        </div>
                        <p className="text-xs text-dim mt-0.5 truncate">
                          {u.agent_role
                            ? `${u.agent_role === 'telecaller' ? 'Telecaller' : 'Closer'} · target ${u.daily_target}/day`
                            : 'No role set'}
                        </p>
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">

                      {/* Role select */}
                      <label className="flex items-center gap-1.5 text-xs text-dim">
                        <span className="hidden lg:inline">Role</span>
                        {u.agent_role === 'telecaller'
                          ? <PhoneCall className="w-3.5 h-3.5 text-muted" strokeWidth={2} />
                          : <Handshake className="w-3.5 h-3.5 text-muted" strokeWidth={2} />}
                        <select
                          value={u.agent_role ?? ''}
                          disabled={rowBusy}
                          onChange={e => patchAgent(u.id, { agent_role: e.target.value as 'telecaller' | 'closer' }, `${u.name} → ${e.target.value}`)}
                          className="bg-elevated border border-border rounded-md px-2 py-1 text-xs text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
                        >
                          <option value="" disabled>— role —</option>
                          <option value="telecaller">Telecaller</option>
                          <option value="closer">Closer</option>
                        </select>
                      </label>

                      {/* Daily target */}
                      <label className="flex items-center gap-1.5 text-xs text-dim">
                        <Target className="w-3.5 h-3.5 text-muted" strokeWidth={2} />
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          defaultValue={u.daily_target}
                          disabled={rowBusy}
                          onBlur={e => {
                            const n = Math.max(0, Math.min(1000, Math.round(Number(e.target.value) || 0)))
                            if (n !== u.daily_target) patchAgent(u.id, { daily_target: n }, `${u.name} target → ${n}/day`)
                            else e.target.value = String(u.daily_target)
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          className="w-16 bg-elevated border border-border rounded-md px-2 py-1 text-xs text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
                          aria-label={`Daily target for ${u.name}`}
                        />
                        <span className="hidden lg:inline text-dim">/day</span>
                      </label>

                      {/* Mode toggle */}
                      <label className="flex items-center gap-2 text-xs cursor-pointer" title="Guided = on the rail (lands on /work). Free = today's full app.">
                        <span className={isGuided ? 'text-accent font-semibold' : 'text-dim'}>Guided</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isGuided}
                          aria-label={`${isGuided ? 'Switch to Free' : 'Switch to Guided'} for ${u.name}`}
                          disabled={rowBusy}
                          onClick={() => patchAgent(
                            u.id,
                            { work_mode: isGuided ? 'free' : 'guided' },
                            isGuided ? `${u.name} → Free` : `${u.name} → Guided`,
                          )}
                          className="w-11 h-6 rounded-full transition-colors relative disabled:opacity-50"
                          style={{ background: isGuided ? 'var(--color-accent)' : 'var(--color-border)' }}
                        >
                          <span
                            className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                            style={{ left: isGuided ? '22px' : '2px' }}
                          />
                        </button>
                      </label>

                      {/* Guided surface select — only shown when this agent is Guided.
                          Guided + Free = full nav + a Work tab (roams freely).
                          Guided + Inbox = locked to the rail + WhatsApp Inbox only. */}
                      {isGuided && (
                        <label className="flex items-center gap-1.5 text-xs text-dim" title="Guided + Free = full app plus a Work tab. Guided + Inbox = locked to the work rail and the WhatsApp Inbox only.">
                          <span className="hidden lg:inline">Surface</span>
                          <select
                            value={u.guided_surface}
                            disabled={rowBusy}
                            onChange={e => patchAgent(u.id, { guided_surface: e.target.value as GuidedSurface }, `${u.name} → ${e.target.value === 'guided_inbox' ? 'Guided + Inbox' : 'Guided + Free'}`)}
                            className="bg-elevated border border-border rounded-md px-2 py-1 text-xs text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
                          >
                            <option value="guided_free">Guided + Free</option>
                            <option value="guided_inbox">Guided + Inbox</option>
                          </select>
                        </label>
                      )}

                      {/* Receives-new-leads toggle (the lead-distribution pool) */}
                      <label className="flex items-center gap-2 text-xs cursor-pointer" title="On = this agent is in the pool for new + routed leads (qualified handoffs to closers, re-warm bounces to telecallers). Off = they only keep leads already assigned to them.">
                        <span className={u.receives_new_leads ? 'text-success font-semibold' : 'text-dim'}>New leads</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={u.receives_new_leads}
                          aria-label={`${u.receives_new_leads ? 'Stop' : 'Start'} sending new leads to ${u.name}`}
                          disabled={rowBusy}
                          onClick={() => patchAgent(
                            u.id,
                            { receives_new_leads: !u.receives_new_leads },
                            u.receives_new_leads ? `${u.name} → not receiving new leads` : `${u.name} → receiving new leads`,
                          )}
                          className="w-11 h-6 rounded-full transition-colors relative disabled:opacity-50"
                          style={{ background: u.receives_new_leads ? 'var(--color-success)' : 'var(--color-border)' }}
                        >
                          <span
                            className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                            style={{ left: u.receives_new_leads ? '22px' : '2px' }}
                          />
                        </button>
                      </label>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
