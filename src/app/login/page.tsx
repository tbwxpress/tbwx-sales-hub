'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 relative overflow-hidden">
      {/* Radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.07]"
        style={{ background: 'radial-gradient(circle, #f5c518 0%, transparent 70%)' }}
      />

      {/* Subtle waffle grid */}
      <div className="fixed inset-0 opacity-[0.02]" style={{
        backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 48px, #f5c518 48px, #f5c518 49px),
                          repeating-linear-gradient(90deg, transparent, transparent 48px, #f5c518 48px, #f5c518 49px)`,
      }} />

      <div className="w-full max-w-[380px] relative z-10 animate-fade-in-up">
        {/* Logo + Brand */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-tbwx.png"
              alt="The Belgian Waffle Xpress"
              width={88}
              height={88}
              className="rounded-2xl shadow-2xl shadow-black/40 ring-1 ring-white/5"
            />
          </div>
          <h1 className="text-2xl font-bold text-gradient-gold tracking-tight">Sales Hub</h1>
          <p className="text-muted mt-1.5 text-sm">The Belgian Waffle Xpress</p>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-2xl p-7 space-y-5 shadow-2xl shadow-black/30">
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl p-3 flex items-center gap-2 animate-scale-in">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5 uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-elevated/80 border border-border rounded-xl px-4 py-3 text-text placeholder-dim focus:outline-none focus:border-accent/60 transition-all text-sm"
              placeholder="you@tbwxpress.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5 uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-elevated/80 border border-border rounded-xl px-4 py-3 text-text placeholder-dim focus:outline-none focus:border-accent/60 transition-all text-sm"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-[#1a1209] font-bold rounded-xl px-4 py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm tracking-wide glow-accent-sm hover:glow-accent"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-[#1a1209] border-t-transparent rounded-full animate-spin" />
                Signing in...
              </span>
            ) : 'Sign In'}
          </button>
        </form>

        <div className="text-center mt-8 space-y-2">
          <p className="text-dim text-xs italic">Just Waffle It.</p>
          <div className="flex items-center justify-center gap-1.5 text-dim">
            <span className="text-[10px]">Powered & Built by</span>
            <a href="https://nofluff.pro" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] font-semibold text-[#5cc8ff] hover:text-[#7dd6ff] transition-colors">
              NoFluff.Pro
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
