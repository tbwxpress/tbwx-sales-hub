'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'
import { BRAND } from '@/config/client'

interface CheckResult {
  label: string
  status: 'ok' | 'warn' | 'error'
  message: string
}

interface SetupData {
  overall: 'healthy' | 'warnings' | 'errors'
  error_count: number
  warn_count: number
  sections: {
    auth: CheckResult[]
    whatsapp: CheckResult[]
    sheets: CheckResult[]
    database: CheckResult[]
    brand: CheckResult[]
  }
}

function StatusIcon({ status }: { status: 'ok' | 'warn' | 'error' | 'loading' }) {
  if (status === 'loading') {
    return <div className="w-4 h-4 border-2 border-muted border-t-transparent rounded-full animate-spin flex-shrink-0" />
  }
  if (status === 'ok') {
    return (
      <svg className="w-4 h-4 text-status-replied flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    )
  }
  if (status === 'warn') {
    return (
      <svg className="w-4 h-4 text-warning flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    )
  }
  return (
    <svg className="w-4 h-4 text-danger flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function CheckRow({ check, loading }: { check: CheckResult; loading: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0">
      <div className="mt-0.5">
        <StatusIcon status={loading ? 'loading' : check.status} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text">{check.label}</p>
        <p className={`text-xs mt-0.5 ${
          check.status === 'ok' ? 'text-muted' :
          check.status === 'warn' ? 'text-warning' :
          'text-danger'
        }`}>{check.message}</p>
      </div>
    </div>
  )
}

function Section({
  title, icon, checks, loading, description,
}: {
  title: string
  icon: string
  checks: CheckResult[]
  loading: boolean
  description?: string
}) {
  const hasError = checks.some(c => c.status === 'error')
  const hasWarn = checks.some(c => c.status === 'warn') && !hasError
  const borderColor = loading ? 'border-border' : hasError ? 'border-danger/40' : hasWarn ? 'border-warning/40' : 'border-status-replied/30'

  return (
    <div className={`bg-card border ${borderColor} rounded-xl overflow-hidden`}>
      <div className="px-5 py-3.5 border-b border-border/60 flex items-center gap-2.5">
        <span className="text-lg">{icon}</span>
        <div>
          <h3 className="font-semibold text-text text-sm">{title}</h3>
          {description && <p className="text-[11px] text-dim mt-0.5">{description}</p>}
        </div>
        <div className="ml-auto">
          {!loading && (
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              hasError ? 'bg-danger/10 text-danger' :
              hasWarn ? 'bg-warning/10 text-warning' :
              'bg-status-replied/10 text-status-replied'
            }`}>
              {hasError ? 'Issues Found' : hasWarn ? 'Warnings' : 'All Good'}
            </span>
          )}
        </div>
      </div>
      <div className="px-5 py-1">
        {checks.map((check, i) => (
          <CheckRow key={i} check={check} loading={loading} />
        ))}
      </div>
    </div>
  )
}

export default function SetupPage() {
  const router = useRouter()
  const [data, setData] = useState<SetupData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const runChecks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/setup-check')
      if (res.status === 403) { router.push('/dashboard'); return }
      const json = await res.json()
      if (json.success) {
        setData(json.data)
        setLastChecked(new Date())
      } else {
        setError(json.error || 'Check failed')
      }
    } catch {
      setError('Network error — could not run checks')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    runChecks()
  }, [runChecks])

  const empty: CheckResult[] = []
  const sections = data?.sections

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-text">Setup Health Check</h1>
            <p className="text-sm text-muted mt-1">
              Verify all connections are working for <span className="text-accent font-medium">{BRAND.name}</span>
            </p>
            {lastChecked && (
              <p className="text-[11px] text-dim mt-1">
                Last checked: {lastChecked.toLocaleTimeString()}
              </p>
            )}
          </div>
          <button
            onClick={runChecks}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {loading ? 'Checking…' : 'Re-check'}
          </button>
        </div>

        {/* Overall status banner */}
        {!loading && data && (
          <div className={`mb-6 px-5 py-4 rounded-xl border flex items-center gap-3 ${
            data.overall === 'healthy'
              ? 'bg-status-replied/10 border-status-replied/30'
              : data.overall === 'warnings'
              ? 'bg-warning/10 border-warning/30'
              : 'bg-danger/10 border-danger/30'
          }`}>
            <StatusIcon status={data.overall === 'healthy' ? 'ok' : data.overall === 'warnings' ? 'warn' : 'error'} />
            <div>
              <p className={`font-semibold text-sm ${
                data.overall === 'healthy' ? 'text-status-replied' :
                data.overall === 'warnings' ? 'text-warning' : 'text-danger'
              }`}>
                {data.overall === 'healthy' ? 'Everything looks good!' :
                 data.overall === 'warnings' ? `${data.warn_count} warning${data.warn_count !== 1 ? 's' : ''} — non-critical` :
                 `${data.error_count} error${data.error_count !== 1 ? 's' : ''} — action required`}
              </p>
              <p className="text-xs text-muted mt-0.5">
                {data.overall === 'healthy'
                  ? `${BRAND.name} is fully configured and ready to use.`
                  : data.overall === 'warnings'
                  ? 'Core functionality works, but some optional items need attention.'
                  : 'Some critical components are not configured. Fix the errors before going live.'}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 px-4 py-3 bg-danger/10 border border-danger/30 rounded-xl text-danger text-sm">
            {error}
          </div>
        )}

        {/* Sections grid */}
        <div className="grid gap-4 md:grid-cols-2">
          <Section
            title="Authentication"
            icon="🔐"
            checks={sections?.auth ?? empty}
            loading={loading}
            description="JWT secret, CRON key"
          />
          <Section
            title="WhatsApp"
            icon="📱"
            checks={sections?.whatsapp ?? empty}
            loading={loading}
            description="Cloud API connection + webhook"
          />
          <Section
            title="Google Sheets"
            icon="📊"
            checks={sections?.sheets ?? empty}
            loading={loading}
            description="OAuth + leads data access"
          />
          <Section
            title="Database"
            icon="🗄️"
            checks={sections?.database ?? empty}
            loading={loading}
            description="SQLite / Turso + user accounts"
          />
          <Section
            title="Brand"
            icon="🎨"
            checks={sections?.brand ?? empty}
            loading={loading}
            description="White-label configuration"
          />

          {/* Quick actions card */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border/60 flex items-center gap-2.5">
              <span className="text-lg">⚡</span>
              <h3 className="font-semibold text-text text-sm">Quick Actions</h3>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              {[
                { label: 'Manage Users', href: '/admin', desc: 'Add agents + admins' },
                { label: 'WA Templates', href: '/templates', desc: 'View approved templates' },
                { label: 'Quick Replies', href: '/quick-replies', desc: 'Pre-set reply shortcuts' },
                { label: 'Knowledge Base', href: '/knowledge-base', desc: 'Product/sales FAQs' },
              ].map(action => (
                <a
                  key={action.href}
                  href={action.href}
                  className="flex items-center justify-between group px-3 py-2 rounded-lg hover:bg-elevated transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-text group-hover:text-accent transition-colors">{action.label}</p>
                    <p className="text-[11px] text-dim">{action.desc}</p>
                  </div>
                  <svg className="w-4 h-4 text-dim group-hover:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Deployment info */}
        <div className="mt-6 bg-card border border-border rounded-xl px-5 py-4">
          <h3 className="text-sm font-semibold text-text mb-3">Deployment Info</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            {[
              { label: 'App URL', value: process.env.NEXT_PUBLIC_APP_URL || 'localhost' },
              { label: 'Brand', value: BRAND.short },
              { label: 'Node Env', value: process.env.NODE_ENV || 'development' },
              { label: 'DB Mode', value: process.env.TURSO_DATABASE_URL ? 'Turso Cloud' : 'Local SQLite' },
            ].map(item => (
              <div key={item.label}>
                <p className="text-[10px] text-dim uppercase tracking-wider">{item.label}</p>
                <p className="text-sm font-medium text-text mt-0.5 truncate">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <PoweredBy />
      </main>
    </div>
  )
}
