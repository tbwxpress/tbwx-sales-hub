'use client'

// WhatsApp lines (Coexistence) admin — connect agents' WhatsApp-Business-app
// numbers to the Hub via Meta's Embedded Signup, assign each line to an agent,
// and pull the 180-day chat history. The page needs Meta's JS SDK, so
// next.config carves a scoped CSP exception for exactly this route.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, MessageCircle, RefreshCw, Link2, DownloadCloud } from 'lucide-react'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'

interface WaNumberRow {
  phone_number_id: string
  display_number: string
  verified_name: string
  agent_name: string
  is_main: number
  contacts_synced_at: string
  history_synced_at: string
  history_progress: { phase?: string | number; progress?: string | number; last_chunk_at?: string; last_chunk_inserted?: number } | null
}

interface PageData {
  numbers: WaNumberRow[]
  app_id: string
  config_id: string
  dialog_url: string
  main_phone_number_id: string
  waba_id: string
}

interface HubUser { id: string; name: string; role: string; active: number | boolean }

type FbSdk = {
  init: (opts: Record<string, unknown>) => void
  login: (cb: (resp: { status?: string; authResponse?: { code?: string } | null }) => void, opts: Record<string, unknown>) => void
}

const GRAPH_VERSION = 'v23.0'

export default function WaNumbersAdminPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null)
  const [data, setData] = useState<PageData | null>(null)
  const [users, setUsers] = useState<HubUser[]>([])
  const [appId, setAppId] = useState('')
  const [configId, setConfigId] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState<string>('')
  const [connectLog, setConnectLog] = useState<string[]>([])
  const [sdkFailed, setSdkFailed] = useState(false)
  const sdkLoaded = useRef(false)

  const log = useCallback((line: string) => {
    setConnectLog(prev => [...prev.slice(-14), `${new Date().toLocaleTimeString()} — ${line}`])
  }, [])

  const load = useCallback(async () => {
    try {
      const [numsRes, usersRes] = await Promise.all([
        fetch('/api/admin/wa-numbers').then(r => r.json()),
        fetch('/api/users').then(r => r.json()),
      ])
      if (numsRes.success) {
        setData(numsRes.data)
        setAppId(numsRes.data.app_id || '')
        setConfigId(numsRes.data.config_id || '')
      }
      if (usersRes.success) setUsers((usersRes.data || []).filter((u: HubUser) => u.active))
    } catch { /* surfaces as empty page state */ }
  }, [])

  // Admin guard — mirrors /admin: bounce non-admins, render nothing until confirmed.
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.success) {
        setCurrentUser(d.data)
        if (d.data.role !== 'admin') router.push('/dashboard')
      } else {
        router.push('/login')
      }
    }).catch(() => router.push('/login'))
  }, [router])

  useEffect(() => { if (currentUser?.role === 'admin') load() }, [currentUser, load])

  // Embedded Signup posts session-info events to this window (SDK popup and
  // manual-dialog popup both target the opener).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!String(event.origin).includes('facebook.com')) return
      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return
        log(`Meta event: ${payload.event || 'unknown'}${payload?.data?.waba_id ? ` (WABA ${payload.data.waba_id})` : ''}`)
        if (String(payload.event || '').startsWith('FINISH')) {
          log('Onboarding finished — refreshing numbers from Meta…')
          fetch('/api/admin/wa-numbers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'refresh' }),
          }).then(() => load())
        }
        if (payload.event === 'CANCEL' || payload.event === 'CLOSE') {
          log('Signup window closed before finishing.')
        }
      } catch { /* non-JSON frames from FB are normal — ignore */ }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [load, log])

  const saveConfig = async () => {
    setSavingConfig(true)
    try {
      const res = await fetch('/api/admin/wa-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'config', app_id: appId, config_id: configId }),
      }).then(r => r.json())
      if (!res.success) alert(res.error || 'Could not save')
      else await load()
    } finally {
      setSavingConfig(false)
    }
  }

  const refreshNumbers = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/wa-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' }),
      }).then(r => r.json())
      if (!res.success) alert(res.error || 'Could not refresh from Meta')
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const assign = async (phoneNumberId: string, agentName: string) => {
    await fetch('/api/admin/wa-numbers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assign', phone_number_id: phoneNumberId, agent_name: agentName }),
    })
    await load()
  }

  const syncHistory = async (phoneNumberId: string) => {
    setSyncing(phoneNumberId)
    try {
      const res = await fetch('/api/admin/wa-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync', phone_number_id: phoneNumberId }),
      }).then(r => r.json())
      if (res.success) {
        log('Sync requested — contacts + up to 180 days of chats will stream in over the next minutes.')
      } else {
        alert(res.error || 'Sync request failed')
      }
      await load()
    } finally {
      setSyncing('')
    }
  }

  const launchSignup = () => {
    if (!appId || !configId) {
      alert('Save the Meta App ID and Configuration ID first (Setup card).')
      return
    }
    const w = window as unknown as { FB?: FbSdk }
    const startLogin = () => {
      w.FB!.login(
        resp => {
          if (resp?.authResponse?.code) log('Signup authorised (code received).')
          else log(`Signup dialog closed (status: ${resp?.status || 'unknown'}).`)
        },
        {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: 'whatsapp_business_app_onboarding',
            sessionInfoVersion: '3',
          },
        }
      )
    }
    if (w.FB && sdkLoaded.current) { startLogin(); return }
    log('Loading Meta SDK…')
    const script = document.createElement('script')
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.onload = () => {
      try {
        w.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: GRAPH_VERSION })
        sdkLoaded.current = true
        log('Meta SDK ready — opening signup…')
        startLogin()
      } catch {
        setSdkFailed(true)
        log('SDK loaded but failed to start — use the fallback button below.')
      }
    }
    script.onerror = () => {
      setSdkFailed(true)
      log('Could not load Meta SDK — use the fallback button below.')
    }
    document.body.appendChild(script)
  }

  const launchFallback = () => {
    if (!data?.dialog_url) {
      alert('Save the Meta App ID and Configuration ID first (Setup card).')
      return
    }
    log('Opening signup popup (fallback mode)…')
    window.open(data.dialog_url, 'wa-coex-signup', 'width=680,height=760')
  }

  if (!currentUser || currentUser.role !== 'admin') return null

  const numbers = data?.numbers || []

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-6 flex-1 w-full animate-fade-in">
        <a
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs text-dim hover:text-accent transition-colors mb-4 focus-ring rounded-md"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Admin
        </a>

        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-accent-soft)' }}>
            <MessageCircle className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text">WhatsApp Lines (Coexistence)</h1>
            <p className="text-sm text-dim mt-0.5">
              Connect agents&apos; WhatsApp Business app numbers so every chat mirrors into the Hub automatically.
              Agents keep using the app on their phones — nothing changes for them.
            </p>
          </div>
        </div>

        {/* Setup card */}
        <div className="bg-card border border-border rounded-xl p-5 mb-4">
          <h2 className="text-sm font-semibold text-text mb-1">1 · Meta setup</h2>
          <p className="text-xs text-dim mb-3">
            From <span className="text-body">developers.facebook.com → your app</span>: the App ID (app settings) and an
            Embedded Signup <span className="text-body">Configuration ID</span> (Facebook Login for Business → Configurations,
            type &ldquo;WhatsApp Embedded Signup&rdquo;). Saved here — no redeploy needed.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              value={appId}
              onChange={e => setAppId(e.target.value)}
              placeholder="Meta App ID"
              className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text w-48 focus-ring"
            />
            <input
              value={configId}
              onChange={e => setConfigId(e.target.value)}
              placeholder="Embedded Signup Configuration ID"
              className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text w-64 focus-ring"
            />
            <button
              onClick={saveConfig}
              disabled={savingConfig}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-accent text-black hover:opacity-90 disabled:opacity-50 focus-ring"
            >
              {savingConfig ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* Connect card */}
        <div className="bg-card border border-border rounded-xl p-5 mb-4">
          <h2 className="text-sm font-semibold text-text mb-1">2 · Connect a number</h2>
          <p className="text-xs text-dim mb-3">
            The agent&apos;s phone must have the <span className="text-body">WhatsApp Business app</span> (updated) with the
            number active on it. Click connect, sign in with the TBWX Facebook admin account, choose
            &ldquo;connect your existing WhatsApp Business app number&rdquo;, then scan the QR from the agent&apos;s phone
            (WhatsApp Business app → Settings → Linked devices).
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={launchSignup}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-accent text-black hover:opacity-90 focus-ring"
            >
              <Link2 className="w-4 h-4" /> Connect a WhatsApp number
            </button>
            {sdkFailed && (
              <button
                onClick={launchFallback}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-border text-body hover:text-accent focus-ring"
              >
                Fallback: open signup popup
              </button>
            )}
          </div>
          {connectLog.length > 0 && (
            <div className="mt-3 bg-bg border border-border rounded-lg p-3 text-xs text-dim font-mono space-y-1 max-h-40 overflow-y-auto">
              {connectLog.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
        </div>

        {/* Numbers card */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text">3 · Lines on this WhatsApp account</h2>
            <button
              onClick={refreshNumbers}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-body hover:text-accent disabled:opacity-50 focus-ring"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh from Meta
            </button>
          </div>

          {numbers.length === 0 ? (
            <p className="text-sm text-dim">No lines yet — hit &ldquo;Refresh from Meta&rdquo; to pull the numbers on the WhatsApp business account.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-dim border-b border-border">
                    <th className="py-2 pr-3 font-medium">Number</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Belongs to</th>
                    <th className="py-2 pr-3 font-medium">History import</th>
                    <th className="py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {numbers.map(n => (
                    <tr key={n.phone_number_id} className="border-b border-border/50">
                      <td className="py-2.5 pr-3">
                        <div className="text-text">{n.display_number || n.phone_number_id}</div>
                        <div className="text-xs text-dim">{n.verified_name}</div>
                      </td>
                      <td className="py-2.5 pr-3">
                        {n.is_main ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent">Main (bots + templates)</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full border border-border text-body">Agent app line</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        {n.is_main ? (
                          <span className="text-xs text-dim">—</span>
                        ) : (
                          <select
                            value={n.agent_name || ''}
                            onChange={e => assign(n.phone_number_id, e.target.value)}
                            className="bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-text focus-ring"
                          >
                            <option value="">Unassigned</option>
                            {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-dim">
                        {n.is_main ? '—'
                          : n.history_progress
                            ? `phase ${String(n.history_progress.phase ?? '?')} · ${String(n.history_progress.progress ?? '…')}${n.history_progress.last_chunk_at ? ` · last chunk ${new Date(n.history_progress.last_chunk_at).toLocaleTimeString()}` : ''}`
                            : n.history_synced_at ? `requested ${n.history_synced_at}` : 'not requested'}
                      </td>
                      <td className="py-2.5 text-right">
                        {!n.is_main && (
                          <button
                            onClick={() => syncHistory(n.phone_number_id)}
                            disabled={syncing === n.phone_number_id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border text-body hover:text-accent disabled:opacity-50 focus-ring"
                            title="Pull contacts + up to 180 days of past chats into the Hub"
                          >
                            <DownloadCloud className="w-3.5 h-3.5" /> {syncing === n.phone_number_id ? 'Requesting…' : 'Import history'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-dim mt-3">
            Assigning a line to an agent credits their app replies on the scoreboard and routes new-message
            notifications to them. The main line keeps all automations; agent lines are mirror-only.
          </p>
        </div>
      </div>
      <PoweredBy />
    </div>
  )
}
