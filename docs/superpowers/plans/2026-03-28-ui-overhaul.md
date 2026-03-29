# UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Dark Luxury + Warm Parchment design system to the Sales Hub — theme toggle pill, correct light-theme colors, and role-aware landing pages.

**Architecture:** Four focused changes: (1) fix Warm Parchment color tokens in theme.css, (2) redesign ThemeToggle to pill style, (3) build AgentQueue component, (4) make dashboard role-aware. No new API routes needed — AgentQueue reuses existing `/api/leads`.

**Tech Stack:** Next.js 15, TypeScript, Tailwind v4, CSS custom properties on `<html>` element class

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `src/styles/theme.css` | Modify | `.light` class gets Warm Parchment color values |
| `src/components/ThemeToggle.tsx` | Modify | Icon button → pill with icon + label |
| `src/components/AgentQueue.tsx` | Create | Agent action queue component |
| `src/app/dashboard/page.tsx` | Modify | Role-aware: render AgentQueue for agents |

---

## Task 1: Warm Parchment Light Theme

**Files:**
- Modify: `src/styles/theme.css` (`.light` class, lines 98–140)

- [ ] **Step 1: Replace `.light` color values with Warm Parchment palette**

Replace the entire `.light` block (lines 98–140) in `src/styles/theme.css`:

```css
/* ── Light Theme (Warm Parchment) ─────────────────────────── */
.light {
  color-scheme: light;
  --color-bg: #faf6f0;
  --color-card: #ffffff;
  --color-elevated: #f5ede0;
  --color-border: #e8ddd0;
  --color-border-light: #f0e6d6;
  --color-text: #2d1f0a;
  --color-muted: #8a7055;
  --color-dim: #b0967a;
  --color-accent: #b8932a;
  --color-accent-hover: #9a7600;
  --color-accent-soft: #b8932a20;
  --color-success: #15803d;
  --color-warning: #b45309;
  --color-danger: #dc2626;
  --color-hot: #c2410c;
  --color-wa-sent: #d1f0e0;
  --color-wa-received: #faf6f0;
  --color-wa-text: #1a0f00;
  --color-wa-meta: rgba(0,0,0,0.45);
  --color-option-bg: #ffffff;
  --color-option-text: #2d1f0a;
  /* Status colors — saturated for warm light bg */
  --color-status-new: #1d4ed8;
  --color-status-deck-sent: #6d28d9;
  --color-status-replied: #15803d;
  --color-status-calling: #92400e;
  --color-status-call-done: #0f766e;
  --color-status-interested: #0e7490;
  --color-status-negotiation: #be185d;
  --color-status-converted: #065f46;
  --color-status-delayed: #92400e;
  --color-status-lost: #991b1b;
  --color-priority-hot: #c2410c;
  --color-priority-warm: #b45309;
  --color-priority-cold: #1d4ed8;
  --color-score-great: #15803d;
  --color-score-good: #1d4ed8;
  --color-score-fair: #b45309;
  --color-score-low: #c2410c;
  --color-score-poor: #dc2626;
}
```

- [ ] **Step 2: Verify theme toggles correctly in browser**

Open http://localhost:3458, click the theme toggle in the navbar. Page should shift from deep brown/gold dark to a warm cream/parchment light. Check that:
- Background is warm off-white (#faf6f0), not pure white or grey
- Text is deep brown (#2d1f0a), easy to read
- Accent gold is visible but darker (#b8932a)
- Status badges remain readable

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/gavis/Documents/ClaudeTBWX/TBWX/tbwx-sales-hub" add src/styles/theme.css
git -C "c:/Users/gavis/Documents/ClaudeTBWX/TBWX/tbwx-sales-hub" commit -m "feat: warm parchment light theme — replaces generic light with approved palette"
```

---

## Task 2: ThemeToggle Pill Redesign

**Files:**
- Modify: `src/components/ThemeToggle.tsx`

- [ ] **Step 1: Replace ThemeToggle with pill style**

Replace the entire contents of `src/components/ThemeToggle.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null
    if (saved) {
      setTheme(saved)
      document.documentElement.className = saved
    }
    setMounted(true)
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.className = next
    localStorage.setItem('theme', next)
  }

  // Avoid hydration mismatch
  if (!mounted) return <div className="h-8 w-20" />

  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggle}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-200"
      style={{
        background: isDark ? 'rgba(212,175,55,0.10)' : 'rgba(184,147,42,0.10)',
        borderColor: isDark ? 'rgba(212,175,55,0.28)' : 'rgba(184,147,42,0.32)',
      }}
    >
      {isDark ? (
        <svg className="w-3.5 h-3.5 text-accent shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 text-accent shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      )}
      <span className="text-[10px] font-600 text-accent leading-none">
        {isDark ? 'Dark' : 'Light'}
      </span>
    </button>
  )
}
```

- [ ] **Step 2: Verify pill appears correctly in navbar**

Open http://localhost:3458. The toggle should now show as a small pill with moon icon + "Dark" label. Clicking should change to sun icon + "Light" label and switch the page to parchment theme. Verify no layout shifts in the navbar.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/gavis/Documents/ClaudeTBWX/TBWX/tbwx-sales-hub" add src/components/ThemeToggle.tsx
git -C "c:/Users/gavis/Documents/ClaudeTBWX/TBWX/tbwx-sales-hub" commit -m "feat: theme toggle redesigned as pill with icon + label"
```

---

## Task 3: AgentQueue Component

**Files:**
- Create: `src/components/AgentQueue.tsx`

This component is the agent's action-first landing page. It fetches leads, filters them to show only what requires action from the logged-in agent, and presents them as clear action cards.

- [ ] **Step 1: Create `src/components/AgentQueue.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'

interface Lead {
  row_number: number
  full_name: string
  phone: string
  city: string
  lead_status: string
  lead_priority: string
  assigned_to: string
  next_followup: string
  created_time: string
}

interface SessionUser {
  name: string
  role: string
}

function isToday(dateStr: string): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
}

function isPast(dateStr: string): boolean {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '-'
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function AgentQueue({ user }: { user: SessionUser }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/leads')
      .then(r => r.json())
      .then(d => {
        if (d.success) setLeads(d.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const myLeads = leads.filter(l =>
    l.assigned_to?.toLowerCase() === user.name.toLowerCase()
  )

  const repliesWaiting = myLeads.filter(l => l.lead_status === 'REPLIED')
  const followupsDue = myLeads.filter(l =>
    l.next_followup &&
    (isToday(l.next_followup) || isPast(l.next_followup)) &&
    !['CONVERTED', 'LOST'].includes(l.lead_status) &&
    l.lead_status !== 'REPLIED'
  )
  const hotLeads = myLeads.filter(l =>
    l.lead_priority === 'HOT' &&
    !['CONVERTED', 'LOST'].includes(l.lead_status) &&
    l.lead_status !== 'REPLIED' &&
    !(l.next_followup && (isToday(l.next_followup) || isPast(l.next_followup)))
  )

  const totalActions = repliesWaiting.length + followupsDue.length + hotLeads.length
  const totalContacted = myLeads.filter(l =>
    !['NEW', 'DECK_SENT'].includes(l.lead_status)
  ).length
  const dailyGoal = 10
  const progressPct = Math.min(100, Math.round((totalContacted / dailyGoal) * 100))

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Greeting */}
        <div className="mb-6">
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
            {greeting}, {user.name} 👋
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
            {totalActions > 0
              ? `You have ${totalActions} action${totalActions === 1 ? '' : 's'} waiting — let's close some deals.`
              : 'All caught up! Check back soon or reach out to new leads.'}
          </p>
        </div>

        {/* Daily progress bar */}
        <div
          className="rounded-xl p-4 mb-5 border"
          style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
              Daily Progress
            </span>
            <span className="text-xs font-bold" style={{ color: 'var(--color-accent)' }}>
              {totalContacted} / {dailyGoal} leads
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progressPct}%`,
                background: progressPct >= 80
                  ? 'linear-gradient(90deg, var(--color-success), #22c55e)'
                  : 'linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))',
              }}
            />
          </div>
        </div>

        {loading && (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--color-muted)' }}>
            Loading your queue...
          </div>
        )}

        {!loading && totalActions === 0 && (
          <div
            className="rounded-xl p-8 text-center border"
            style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="text-3xl mb-3">🎉</div>
            <div className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>Queue is clear!</div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>No replies, follow-ups, or hot leads need attention right now.</div>
            <Link href="/leads" className="inline-block mt-4 text-xs font-semibold px-4 py-2 rounded-lg transition-colors" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
              Browse all leads →
            </Link>
          </div>
        )}

        {/* Replies Waiting */}
        {repliesWaiting.length > 0 && (
          <section className="mb-5">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-muted)' }}>
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
              Replies Waiting ({repliesWaiting.length})
            </h2>
            <div className="flex flex-col gap-2">
              {repliesWaiting.map(lead => (
                <Link
                  key={lead.row_number}
                  href={`/inbox?phone=${lead.phone}`}
                  className="flex items-center justify-between rounded-xl px-4 py-3 border transition-all duration-150 group"
                  style={{ background: 'var(--color-card)', borderColor: 'rgba(34,197,94,0.25)' }}
                >
                  <div>
                    <div className="text-sm font-semibold group-hover:text-accent transition-colors" style={{ color: 'var(--color-text)' }}>
                      {lead.full_name}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-muted)' }}>
                      {lead.city} · replied {timeAgo(lead.created_time)}
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-md" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                    Reply →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Follow-ups Due */}
        {followupsDue.length > 0 && (
          <section className="mb-5">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-muted)' }}>
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              Follow-ups Due ({followupsDue.length})
            </h2>
            <div className="flex flex-col gap-2">
              {followupsDue.map(lead => (
                <Link
                  key={lead.row_number}
                  href={`/leads/${lead.row_number}`}
                  className="flex items-center justify-between rounded-xl px-4 py-3 border transition-all duration-150 group"
                  style={{ background: 'var(--color-card)', borderColor: 'rgba(245,158,11,0.25)' }}
                >
                  <div>
                    <div className="text-sm font-semibold group-hover:text-accent transition-colors" style={{ color: 'var(--color-text)' }}>
                      {lead.full_name}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-muted)' }}>
                      {lead.city} · {lead.lead_status.replace('_', ' ')}
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-md" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                    Follow up →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Hot Leads */}
        {hotLeads.length > 0 && (
          <section className="mb-5">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-muted)' }}>
              <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
              Hot Leads ({hotLeads.length})
            </h2>
            <div className="flex flex-col gap-2">
              {hotLeads.map(lead => (
                <Link
                  key={lead.row_number}
                  href={`/leads/${lead.row_number}`}
                  className="flex items-center justify-between rounded-xl px-4 py-3 border transition-all duration-150 group"
                  style={{ background: 'var(--color-card)', borderColor: 'rgba(249,115,22,0.25)' }}
                >
                  <div>
                    <div className="text-sm font-semibold group-hover:text-accent transition-colors" style={{ color: 'var(--color-text)' }}>
                      🔥 {lead.full_name}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-muted)' }}>
                      {lead.city} · {lead.lead_status.replace('_', ' ')}
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-md" style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316' }}>
                    Call now →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* All my leads link */}
        {!loading && (
          <Link
            href="/leads"
            className="block text-center text-xs font-semibold py-3 rounded-xl border transition-colors mt-2"
            style={{ color: 'var(--color-muted)', borderColor: 'var(--color-border)', background: 'var(--color-card)' }}
          >
            View all my leads →
          </Link>
        )}

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git -C "c:/Users/gavis/Documents/ClaudeTBWX/TBWX/tbwx-sales-hub" add src/components/AgentQueue.tsx
git -C "c:/Users/gavis/Documents/ClaudeTBWX/TBWX/tbwx-sales-hub" commit -m "feat: AgentQueue component — action-first landing for sales agents"
```

---

## Task 4: Role-Aware Dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`

The dashboard page already fetches the user via `fetchUser()`. We need to add a conditional: if the user's role is `agent`, return the `AgentQueue` component instead of the admin dashboard.

- [ ] **Step 1: Add AgentQueue import at the top of `src/app/dashboard/page.tsx`**

After the existing imports (around line 8), add:

```tsx
import AgentQueue from '@/components/AgentQueue'
```

So the import block looks like:
```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'
import AgentQueue from '@/components/AgentQueue'
```

- [ ] **Step 2: Add agent role early return inside the component**

Find the block inside `DashboardPage()` where `user` state is checked (around line 200–210). After the `user` state is set and `loading` is false, add an early return.

Locate the section where `useEffect` for initial data load is called. Find the existing `useEffect` that calls `fetchUser` first, then loads other data. After it sets `user`, add the role check by finding where the main `return (...)` JSX begins.

Search for the first `return (` in `DashboardPage` (the loading state return or the main return). Add this immediately **before** the existing `return (` statements in the render logic:

Find the block that looks like:
```tsx
  if (loading) {
    return (
```

Add before that block:
```tsx
  // Role-aware: agents see action queue, not the full admin dashboard
  if (!loading && user && user.role === 'agent') {
    return <AgentQueue user={user} />
  }
```

- [ ] **Step 3: Verify role-aware routing works**

Log in as an agent user at http://localhost:3458. The dashboard should show the AgentQueue (greeting, progress bar, action cards). Log in as admin — should show the existing full dashboard with stats and lead table.

If you don't have a second agent user to test with, check the admin panel at `/admin` to see user roles, or temporarily change the role check to `user.role === 'admin'` to preview the AgentQueue as the admin, then revert.

- [ ] **Step 4: Commit**

```bash
git -C "c:/Users/gavis/Documents/ClaudeTBWX/TBWX/tbwx-sales-hub" add src/app/dashboard/page.tsx
git -C "c:/Users/gavis/Documents/ClaudeTBWX/TBWX/tbwx-sales-hub" commit -m "feat: role-aware dashboard — agents see action queue, admins see full dashboard"
```

---

## Task 5: Deploy to Production

- [ ] **Step 1: Push to GitHub (triggers CI/CD build)**

```bash
git -C "c:/Users/gavis/Documents/ClaudeTBWX/TBWX/tbwx-sales-hub" push origin main
```

- [ ] **Step 2: Wait for GitHub Actions to build and push image**

Check https://github.com/tbwxpress/tbwx-sales-hub/actions — wait for the workflow to complete (usually 2–3 minutes). The action builds the Docker image and pushes to GHCR.

- [ ] **Step 3: SSH into VPS and pull new image**

Run via Python paramiko (using VPS credentials from `Claude-Memory/API-KEYS.env`):

```python
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('187.124.99.176', username='root', password='TBWXdeploy-2026')
_, stdout, stderr = ssh.exec_command('cd /docker/saleshub && docker compose pull && docker compose up -d')
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
```

Save this to `c:/tmp/deploy_saleshub.py` and run: `python c:/tmp/deploy_saleshub.py`

- [ ] **Step 4: Verify live at sales.tbwxpress.com**

Open https://sales.tbwxpress.com — theme toggle pill should be visible in the navbar. Toggle between dark and light (Warm Parchment). Confirm no white flash on load (localStorage restore script in layout.tsx handles this).

---

## Self-Review

**Spec coverage check:**
- ✅ Dark Luxury theme tokens: existing `.dark` is unchanged (already correct)
- ✅ Warm Parchment tokens: Task 1
- ✅ ThemeToggle pill with icon + label: Task 2
- ✅ Role-aware landing (admin stats vs agent queue): Tasks 3 + 4
- ✅ Agent action queue (replies, follow-ups, hot leads): Task 3
- ✅ Theme persistence via localStorage: unchanged (already works)
- ✅ Navbar centered links: already implemented in current Navbar.tsx (links render with gold underline active state)
- ✅ Deploy: Task 5

**Placeholders:** None — all code blocks are complete and runnable.

**Type consistency:**
- `SessionUser { name, role }` — defined in both AgentQueue.tsx and dashboard/page.tsx (matching)
- `Lead` interface in AgentQueue.tsx uses only fields present in the `/api/leads` response (verified against dashboard types)
- AgentQueue receives `user` prop typed as `SessionUser` — matches what dashboard passes
