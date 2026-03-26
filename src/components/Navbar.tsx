'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'

interface User {
  name: string
  role: string
}

const brandName = process.env.NEXT_PUBLIC_BRAND_NAME || 'Sales Hub'
const brandShort = process.env.NEXT_PUBLIC_BRAND_SHORT || 'SH'
const brandLogo = process.env.NEXT_PUBLIC_BRAND_LOGO || '/logo.png'

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const links = [
    { href: '/dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { href: '/inbox', label: 'Inbox', icon: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4', badge: unreadCount },
    { href: '/follow-ups', label: 'Follow-ups', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { href: '/pipeline', label: 'Pipeline', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
    { href: '/quick-replies', label: 'Quick Replies', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { href: '/templates', label: 'Templates', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
    { href: '/knowledge-base', label: 'KB', icon: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25' },
  ]

  if (user?.role === 'admin') {
    links.push({ href: '/agent-stats', label: 'Agent Stats', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', badge: 0 })
    links.push({ href: '/admin', label: 'Admin', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', badge: 0 })
  }

  function isActive(href: string) {
    return pathname === href || (href === '/inbox' && pathname?.startsWith('/inbox'))
  }

  return (
    <nav className="glass-nav border-b border-border sticky top-0 z-50" ref={menuRef}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-4 lg:gap-6">
            {/* Logo + Brand */}
            <Link href="/dashboard" className="flex items-center gap-2.5 group shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={brandLogo}
                alt={brandShort}
                width={32}
                height={32}
                className="rounded-md transition-transform duration-200 group-hover:scale-105"
              />
              <div className="flex flex-col">
                <span className="text-sm font-bold text-accent leading-tight">Sales Hub</span>
                <span className="text-[10px] text-dim leading-tight tracking-wide">{brandShort}</span>
              </div>
            </Link>

            {/* Separator — hidden on mobile */}
            <div className="w-px h-6 bg-border hidden lg:block" />

            {/* Desktop nav links — hidden below lg */}
            <div className="hidden lg:flex gap-1">
              {links.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                    isActive(link.href)
                      ? 'text-accent'
                      : 'text-muted hover:text-text hover:bg-elevated'
                  }`}
                >
                  <svg
                    className="w-4 h-4 transition-transform duration-200 hover:scale-110"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={link.icon} />
                  </svg>
                  {link.label}
                  {/* Active bottom accent line */}
                  {isActive(link.href) && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent rounded-full" />
                  )}
                  {/* Unread badge with pulse */}
                  {'badge' in link && (link.badge ?? 0) > 0 && (
                    <span className="absolute -top-1 -right-1 bg-[#25d366] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center badge-pulse">
                      {(link.badge ?? 0) > 9 ? '9+' : link.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>

            {/* Medium screens (md only): icon-only nav — hidden on mobile and lg+ */}
            <div className="hidden md:flex lg:hidden gap-1">
              {links.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  title={link.label}
                  className={`relative flex items-center justify-center w-9 h-9 rounded-md transition-all duration-200 ${
                    isActive(link.href)
                      ? 'text-accent'
                      : 'text-muted hover:text-text hover:bg-elevated'
                  }`}
                >
                  <svg
                    className="w-4.5 h-4.5 transition-transform duration-200 hover:scale-110"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={link.icon} />
                  </svg>
                  {/* Active bottom accent line */}
                  {isActive(link.href) && (
                    <span className="absolute bottom-0 left-1.5 right-1.5 h-[2px] bg-accent rounded-full" />
                  )}
                  {/* Unread badge with pulse */}
                  {'badge' in link && (link.badge ?? 0) > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-[#25d366] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center badge-pulse">
                      {(link.badge ?? 0) > 9 ? '9+' : link.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* User info — hidden on small screens */}
            {user && (
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center">
                  <span className="text-xs font-bold text-accent">{user.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text leading-tight">{user.name}</span>
                  <span className="text-[10px] text-dim leading-tight capitalize">{user.role}</span>
                </div>
              </div>
            )}
            <button
              onClick={logout}
              className="hidden sm:block text-xs text-dim hover:text-danger transition-colors duration-200 px-2 py-1 rounded hover:bg-danger/10"
            >
              Logout
            </button>

            {/* Mobile hamburger — visible below md */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-md text-muted hover:text-text hover:bg-elevated transition-colors duration-200"
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                )}
              </svg>
              {/* Show unread dot on hamburger when menu closed */}
              {!mobileMenuOpen && unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-[#25d366] rounded-full badge-pulse" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="md:hidden glass-nav border-t border-border menu-slide-down">
          <div className="px-4 py-3 space-y-1">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
                  isActive(link.href)
                    ? 'text-accent bg-accent/10 border-l-2 border-accent'
                    : 'text-muted hover:text-text hover:bg-elevated'
                }`}
              >
                <svg
                  className="w-4.5 h-4.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={link.icon} />
                </svg>
                {link.label}
                {/* Unread badge */}
                {'badge' in link && (link.badge ?? 0) > 0 && (
                  <span className="ml-auto bg-[#25d366] text-white text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center badge-pulse">
                    {(link.badge ?? 0) > 9 ? '9+' : link.badge}
                  </span>
                )}
              </Link>
            ))}

            {/* Mobile user info + logout */}
            <div className="border-t border-border mt-2 pt-2">
              {user && (
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-accent">{user.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-text leading-tight">{user.name}</span>
                    <span className="text-[10px] text-dim leading-tight capitalize">{user.role}</span>
                  </div>
                </div>
              )}
              <button
                onClick={logout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-danger/70 hover:text-danger hover:bg-danger/10 transition-colors duration-200"
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3-3h-9m9 0l-3-3m3 3l-3 3" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
