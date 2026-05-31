'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import {
  Calendar,
  LayoutDashboard,
  MessageSquare,
  Users,
  Kanban,
  CreditCard,
  Zap,
  FileText,
  BookOpen,
  ChartColumn,
  Banknote,
  Settings,
  ChevronDown,
  Search,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import NotificationBell from './NotificationBell'
import UpdateRequestsBadge from './UpdateRequestsBadge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

interface User {
  name: string
  role: string
}

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
    function handleMoreClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    if (moreOpen) document.addEventListener('mousedown', handleMoreClick)
    return () => document.removeEventListener('mousedown', handleMoreClick)
  }, [moreOpen])

  // Close avatar dropdown on outside click
  useEffect(() => {
    function handleAvatarClick(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false)
      }
    }
    if (avatarOpen) document.addEventListener('mousedown', handleAvatarClick)
    return () => document.removeEventListener('mousedown', handleAvatarClick)
  }, [avatarOpen])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  type NavLink = { href: string; label: string; Icon: LucideIcon; badge?: number | null }

  const primaryLinks: NavLink[] = [
    { href: '/today', label: 'Today', Icon: Calendar, badge: null },
    { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard, badge: null },
    { href: '/inbox', label: 'Inbox', Icon: MessageSquare, badge: unreadCount },
    { href: '/leads', label: 'Leads', Icon: Users, badge: null },
    { href: '/pipeline', label: 'Pipeline', Icon: Kanban, badge: null },
  ]

  const secondaryLinks: NavLink[] = [
    { href: '/payment-followups', label: 'Payment Followups', Icon: CreditCard },
    { href: '/quick-replies', label: 'Quick Replies', Icon: Zap },
    { href: '/templates', label: 'Templates', Icon: FileText },
    { href: '/knowledge-base', label: 'Knowledge Base', Icon: BookOpen },
    { href: '/analytics', label: 'Analytics', Icon: ChartColumn },
    { href: '/commissions', label: 'Commissions', Icon: Banknote },
    // Stats link: admins get the full leaderboard, agents/telecallers get their self view
    // from the same /agent-stats page (the API serves a different shape based on role).
    { href: '/agent-stats', label: user?.role === 'admin' ? 'Agent Stats' : 'My Stats', Icon: ChartColumn },
    ...(user?.role === 'admin' ? [
      { href: '/admin', label: 'Admin', Icon: Settings } as NavLink,
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
        height: 'clamp(54px, 56px, 58px)',
      }}
      ref={menuRef}
    >
      <div className="max-w-7xl mx-auto px-4 h-full">
        {/* ── Desktop: 3-zone grid ── */}
        <div className="hidden md:grid grid-cols-3 h-full items-center">

          {/* LEFT: Logo */}
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center gap-2.5 group shrink-0">
              <Image
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
                  <span className="absolute -top-0.5 -right-0.5 bg-[#25d366] text-white text-caption font-bold rounded-full min-w-[14px] h-3.5 px-1 flex items-center justify-center badge-pulse">
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
                <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${moreOpen ? 'rotate-180' : ''}`} strokeWidth={2.5} />
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
                      <link.Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
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
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors duration-150"
                  style={{ color: 'var(--color-muted)' }}
                  aria-label="Search"
                >
                  <Search className="w-3.5 h-3.5" strokeWidth={2} />
                  <kbd className="text-[9px] font-mono px-1 py-0.5 rounded hidden lg:inline" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>⌘K</kbd>
                </button>
              </TooltipTrigger>
              <TooltipContent>search (⌘K)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    const event = new KeyboardEvent('keydown', { key: '?' })
                    window.dispatchEvent(event)
                  }}
                  className="w-6 h-6 flex items-center justify-center rounded-md text-caption transition-colors duration-150"
                  style={{ color: 'var(--color-dim)' }}
                  aria-label="Keyboard shortcuts"
                  onMouseEnter={e => {
                    e.currentTarget.style.color = 'var(--color-text)'
                    e.currentTarget.style.background = 'var(--color-elevated)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = 'var(--color-dim)'
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  ?
                </button>
              </TooltipTrigger>
              <TooltipContent>shortcuts (?)</TooltipContent>
            </Tooltip>
            <UpdateRequestsBadge />
            <NotificationBell />
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
                      <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
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
            <Image src={brandLogo} alt={brandShort} width={28} height={28} className="rounded-md" />
            <span className="text-sm font-bold" style={{ color: 'var(--color-accent)' }}>Sales Hub</span>
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="flex items-center justify-center w-10 h-10 rounded-md transition-colors duration-200"
                  style={{ color: 'var(--color-muted)' }}
                  aria-label="Toggle menu"
                >
                  {mobileMenuOpen
                    ? <X className="w-5 h-5" strokeWidth={1.5} />
                    : <Menu className="w-5 h-5" strokeWidth={1.5} />
                  }
                </button>
              </TooltipTrigger>
              <TooltipContent>{mobileMenuOpen ? 'close menu' : 'open menu'}</TooltipContent>
            </Tooltip>
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
                <link.Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                {link.label}
                {'badge' in link && typeof link.badge === 'number' && link.badge > 0 && (
                  <span className="ml-auto bg-[#25d366] text-white text-caption font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
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
                <LogOut className="w-4 h-4" strokeWidth={1.5} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
