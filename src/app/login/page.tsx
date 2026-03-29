'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BRAND } from '@/config/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (data.success) {
        router.push('/dashboard')
      } else {
        setError(data.error || 'Login failed')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--color-bg)' }}>

      {/* ── Left: Brand Panel (hidden on mobile) ── */}
      <div
        className="hidden md:flex flex-col items-center justify-center w-1/2 relative overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #1e1510 0%, #0f0a04 100%)',
          borderRight: '1px solid rgba(212,175,55,0.12)',
        }}
      >
        {/* Subtle waffle grid */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 48px, var(--color-accent) 48px, var(--color-accent) 49px),
                              repeating-linear-gradient(90deg, transparent, transparent 48px, var(--color-accent) 48px, var(--color-accent) 49px)`,
          }}
        />
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center px-12">
          <div className="text-8xl mb-6 drop-shadow-2xl select-none" style={{ filter: 'drop-shadow(0 0 32px rgba(212,175,55,0.3))' }}>
            🧇
          </div>
          <div className="text-4xl font-extrabold tracking-tight mb-1" style={{ color: 'var(--color-accent)' }}>
            TBWX
          </div>
          <div className="text-base font-semibold mb-6" style={{ color: 'var(--color-text)' }}>
            Sales Hub
          </div>
          <div className="w-12 h-px mb-6" style={{ background: 'var(--color-accent)', opacity: 0.4 }} />
          <div className="text-sm italic mb-12" style={{ color: 'var(--color-dim)' }}>
            &quot;Just Waffle It.&quot;
          </div>
          <div className="flex items-center gap-1.5" style={{ color: 'var(--color-dim)' }}>
            <span className="text-[10px]">Powered by</span>
            <a
              href="https://nofluff.pro"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-semibold transition-colors"
              style={{ color: '#5cc8ff' }}
            >
              NoFluff.Pro
            </a>
          </div>
        </div>
      </div>

      {/* ── Right: Form Panel ── */}
      <div className="flex flex-col items-center justify-center w-full md:w-1/2 px-6 relative overflow-hidden">
        {/* Radial glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, var(--color-accent) 0%, transparent 70%)', opacity: 0.05 }}
        />

        <div className="w-full max-w-[380px] relative z-10">
          {/* Mobile-only logo */}
          <div className="flex flex-col items-center mb-8 md:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.logo} alt={BRAND.name} width={72} height={72} className="rounded-2xl mb-4 shadow-2xl shadow-black/40" />
            <h1 className="text-xl font-bold" style={{ color: 'var(--color-accent)' }}>Sales Hub</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>{BRAND.short}</p>
          </div>

          {/* Welcome heading */}
          <div className="mb-7">
            <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Welcome back</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>Sign in to your workspace</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="rounded-2xl p-7 space-y-5 shadow-2xl shadow-black/30" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
            {error && (
              <div
                className="text-sm rounded-xl p-3 flex items-center gap-2"
                style={{ background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)', color: 'var(--color-danger)' }}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {error}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-muted)' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-xl px-4 py-3 text-sm transition-all focus:outline-none"
                style={{
                  background: 'var(--color-elevated)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
                placeholder={BRAND.supportEmail || 'you@example.com'}
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-muted)' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-xl px-4 py-3 text-sm transition-all focus:outline-none"
                style={{
                  background: 'var(--color-elevated)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full font-bold rounded-xl px-4 py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm tracking-wide"
              style={{ background: 'var(--color-accent)', color: '#1a1209' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#1a1209] border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          {/* Mobile tagline */}
          <div className="text-center mt-6 md:hidden">
            <p className="text-xs italic" style={{ color: 'var(--color-dim)' }}>{BRAND.tagline}</p>
          </div>
        </div>
      </div>

    </div>
  )
}
