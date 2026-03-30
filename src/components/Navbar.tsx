'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import ThemeToggle from './ThemeToggle'

interface User {
  name: string
  role: string
}

const brandName = process.env.NEXT_PUBLIC_BRAND_NAME || 'TBWX Sales Hub'
const brandShort = process.env.NEXT_PUBLIC_BRAND_SHORT || 'TBWX'
const brandLogo = process.env.NEXT_PUBLIC_BRAND_LOGO || '/logo-tbwx.png'

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d.success) setUser(d.data) })
      .catch(() => {})
  }, [])

  // Poll unread count
  useEffect(() => {
    function fetchUnread() {
      fetch('/api/inbox/unread')
        .then(r => r.json())
        .then(d => { if (d.success) setUnreadCount(d.data.count) })
        .catch(() => {})
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 10000)
    return () => clearInterval(interval)
  }, [])

  // Close mobile menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false)
      }
    }
    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mobileMenuOpen])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  // Close More dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    if (moreOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [moreOpen])

  // Close avatar dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false)
      }
    }
    if (avatarOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [avatarOpen])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const primaryLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', badge: null as number | null },
    { href: '/inbox', label: 'Inbox', icon: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4', badge: unreadCount },
    { href: '/leads', label: 'Leads', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', badge: null as number | null },
    { href: '/follow-ups', label: 'Follow-ups', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', badge: null as number | null },
    { href: '/pipeline', label: 'Pipeline', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', badge: null as number | null },
  ]

  const secondaryLinks = [
    { href: '/quick-replies', label: 'Quick Replies', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { href: '/templates', label: 'Templates', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
    { href: '/knowledge-base', label: 'Knowledge Base', icon: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0118 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25' },
    ...(user?.role === 'admin' ? [
      { href: '/agent-stats', label: 'Agent Stats', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
      { href: '/admin', label: 'Admin', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    ] : []),
  ]

  const moreActive = secondaryLinks.some(l => isActive(l.href))

  function isActive(href: string) {
    return pathname === href || (href === '/inbox' && pathname?.startsWith('/inbox'))
  }

  return (
    <nav
      className="sticky top-0 z-50 border-b"
      style={{
        background: 'linear-gradient(90deg, var(--color-bg) 0%, var(--color-card) 50%, var(--color-bg) 100%)',
        borderColor: 'rgba(212,175,55,0.15)',
        height: '54px',
      }}
      ref={menuRef}
    >
      <div className="max-w-7xl mx-auto px-4 h-full">
        {/* ── Desktop: 3-zone grid ── */}
        <div className="hidden md:grid grid-cols-3 h-full items-center">

          {/* LEFT: Logo */}
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center gap-2.5 group shrink-0">
              <img
                src={brandLogo}
                alt={brandShort}
                width={30}
                height={30}
                className="rounded-lg transition-transform duration-200 group-hover:scale-105"
              />
              <div className="flex flex-col leading-tight">
                <span className="text-[13px] font-bold" style={{ color: 'var(--color-accent)' }}>Sales Hub</span>
                <span className="text-[9px] tracking-widest uppercase" style={{ color: 'var(--color-dim)' }}>{brandShort}</span>
              </div>
            </Link>
          </div>

          {/* CENTER: Primary nav links */}
          <div className="flex items-center justify-center gap-0.5">
            {primaryLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="relative px-3 py-1.5 text-[11px] font-medium transition-colors duration-150"
                style={{ color: isActive(link.href) ? 'var(--color-accent)' : 'var(--color-muted)' }}
              >
                {link.label}
                {isActive(link.href) && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                    style={{ background: 'var(--color-accent)' }}
                  />
                )}
                {link.badge != null && link.badge > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-[#25d366] text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center badge-pulse">
                    {link.badge > 9 ? '9+' : link.badge}
                  </span>
                )}
              </Link>
            ))}

            {/* More dropdown */}
            <div className="relative" ref={moreRef}>
              <button
                onClick={() => setMoreOpen(v => !v)}
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium transition-colors duration-150"
                style={{ color: moreActive ? 'var(--color-accent)' : 'var(--color-muted)' }}
              >
                More
                <svg className={`w-3 h-3 transition-transform duration-150 ${moreOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                {moreActive && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                    style={{ background: 'var(--color-accent)' }}
                  />
                )}
              </button>
              {moreOpen && (
                <div
                  className="absolute top-full right-0 mt-1 w-44 rounded-xl py-1 z-[60]"
                  style={{
                    background: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  }}
                >
                  {secondaryLinks.map(link => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-xs transition-colors duration-150"
                      style={{ color: isActive(link.href) ? 'var(--color-accent)' : 'var(--color-muted)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
                      onMouseLeave={e => (e.currentTarget.style.color = isActive(link.href) ? 'var(--color-accent)' : 'var(--color-muted)')}
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={link.icon} />
                      </svg>
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Controls */}
          <div className="flex items-center justify-end gap-2">
            {/* Search trigger */}
            <button
              onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors duration-150"
              style={{ color: 'var(--color-muted)' }}
              title="Search (⌘K)"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <kbd className="text-[9px] font-mono px-1 py-0.5 rounded hidden lg:inline" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>⌘K</kbd>
            </button>
            <ThemeToggle />
            {/* Avatar with dropdown */}
            {user && (
              <div className="relative" ref={avatarRef}>
                <button
                  onClick={() => setAvatarOpen(v => !v)}
                  className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 transition-colors duration-150"
                  style={{ background: avatarOpen ? 'var(--color-elevated)' : 'transparent' }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: 'var(--color-accent-soft)',
                      border: '1px solid var(--color-accent)',
                    }}
                  >
                    <span className="text-xs font-bold" style={{ color: 'var(--color-accent)' }}>
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-col items-start leading-tight">
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text)' }}>{user.name}</span>
                    <span className="text-[9px] capitalize" style={{ color: 'var(--color-dim)' }}>{user.role}</span>
                  </div>
                </button>
                {avatarOpen && (
                  <div
                    className="absolute top-full right-0 mt-1 w-40 rounded-xl py-1 z-[60]"
                    style={{
                      background: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    }}
                  >
                    <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                      <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{user.name}</div>
                      <div className="text-[10px] capitalize mt-0.5" style={{ color: 'var(--color-muted)' }}>{user.role}</div>
                    </div>
                    <button
                      onClick={() => { setAvatarOpen(false); logout() }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs transition-colors duration-150 text-left"
                      style={{ color: 'var(--color-danger)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-elevated)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3-3h-9m9 0l-3-3m3 3l-3 3" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Mobile: logo + hamburger ── */}
        <div className="flex md:hidden items-center justify-between h-full">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <img src={brandLogo} alt={brandShort} width={28} height={28} className="rounded-md" />
            <span className="text-sm font-bold" style={{ color: 'var(--color-accent)' }}>Sales Hub</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex items-center justify-center w-8 h-8 rounded-md transition-colors duration-200"
              style={{ color: 'var(--color-muted)' }}
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                {mobileMenuOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                }
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t" style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
          <div className="px-4 py-3 space-y-1">
            {[...primaryLinks, ...secondaryLinks].map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150"
                style={{
                  color: isActive(link.href) ? 'var(--color-accent)' : 'var(--color-muted)',
                  background: isActive(link.href) ? 'var(--color-accent-soft)' : 'transparent',
                }}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={link.icon} />
                </svg>
                {link.label}
                {'badge' in link && typeof link.badge === 'number' && link.badge > 0 && (
                  <span className="ml-auto bg-[#25d366] text-white text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {link.badge > 9 ? '9+' : link.badge}
                  </span>
                )}
              </Link>
            ))}
            <div className="border-t pt-2 mt-2" style={{ borderColor: 'var(--color-border)' }}>
              {user && (
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent)' }}>
                    <span className="text-xs font-bold" style={{ color: 'var(--color-accent)' }}>{user.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{user.name}</div>
                    <div className="text-[10px] capitalize" style={{ color: 'var(--color-dim)' }}>{user.role}</div>
                  </div>
                </div>
              )}
              <button
                onClick={logout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150"
                style={{ color: 'var(--color-danger)' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3-3h-9m9 0l-3-3m3 3l-3 3" />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
