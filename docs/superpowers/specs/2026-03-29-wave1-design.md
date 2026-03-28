# TBWX Sales Hub — Wave 1 Design Spec
**Date:** 2026-03-29
**Status:** Approved
**Scope:** Navbar redesign · Login page split-screen · Admin dashboard overhaul

---

## Goals

- Make the app look and feel production-grade — "god level" visual quality
- First impression (Login) should be brand-forward and demo-worthy
- Navbar should reflect the Dark Luxury direction with centered links and clear hierarchy
- Admin dashboard should surface the most important data at a glance

---

## Decisions (all approved in brainstorm)

| Component | Decision |
|-----------|----------|
| Login layout | Split screen — left brand panel, right form |
| Navbar structure | Logo (left) · centered primary 4 links · More dropdown · toggle + avatar (right) |
| Admin dashboard | 4 stat cards + recent leads table + agent performance bars + stale leads panel |
| Visual direction | Dark Luxury Elevated (existing `.dark` tokens) + Warm Parchment toggle (existing `.light`) |

---

## 1. Navbar Redesign

**File:** `src/components/Navbar.tsx` (modify existing)

### Layout
Three-zone horizontal layout:
- **Left zone:** Logo box (30×30 gold gradient, "TB" initials) + "Sales Hub" label + brand short
- **Center zone:** 4 primary nav links in a `<nav>` with `flex justify-center`
- **Right zone:** ThemeToggle pill + "More ▾" dropdown + avatar circle with initials

### Primary links (center)
Dashboard · Inbox · Follow-ups · Pipeline

Each link:
- Text only (no icons) at `text-[11px] font-medium`
- Default color: `var(--color-muted)`
- Active state: `var(--color-accent)` text + `border-bottom: 2px solid var(--color-accent)` (absolute positioned)
- Hover: `var(--color-text)`
- Inbox retains the green unread badge (existing logic kept as-is)

### "More ▾" dropdown (right of center links)
Trigger: small pill button `text-[11px]` with a chevron icon
Contains: Quick Replies · Templates · Knowledge Base · Agent Stats (admin only) · Admin (admin only)
Dropdown: `position: absolute`, `top: 100%`, right-aligned, `background: var(--color-card)`, `border: 1px solid var(--color-border)`, `border-radius: 10px`, `box-shadow: 0 8px 32px rgba(0,0,0,0.4)`
Each item: `px-4 py-2 text-xs text-muted hover:text-text hover:bg-elevated`

### Background
`background: linear-gradient(90deg, var(--color-bg) 0%, var(--color-card) 50%, var(--color-bg) 100%)`
`border-bottom: 1px solid rgba(212,175,55,0.15)` (dark) / `rgba(184,147,42,0.2)` (light — use CSS var)
Height: 54px, sticky top-0, z-50

### Avatar (right zone)
30×30 circle, `background: var(--color-accent-soft)`, `border: 1px solid var(--color-accent)`
User initials at `text-xs font-bold text-accent`
On click: shows a small dropdown with user name, role badge, and "Logout" button

### Mobile
Keep existing mobile hamburger menu behaviour unchanged — it works well.

---

## 2. Login Page — Split Screen

**File:** `src/app/login/page.tsx` (replace layout, keep form logic)

### Layout
Full-screen flex row, two 50% halves:

```
┌──────────────────────┬──────────────────────┐
│   LEFT BRAND PANEL   │    RIGHT FORM PANEL  │
│   (dark gradient)    │    (dark surface)    │
│                      │                      │
│  🧇 (large, soft)    │  [form card]         │
│                      │                      │
│  TBWX                │                      │
│  Sales Hub           │                      │
│                      │                      │
│  "Just Waffle It."   │                      │
│                      │                      │
│  — — — — — —         │                      │
│  Powered by          │                      │
│  NoFluff.Pro         │                      │
└──────────────────────┴──────────────────────┘
```

### Left panel (brand)
- `background: linear-gradient(145deg, #1e1510 0%, #0f0a04 100%)`
- `border-right: 1px solid rgba(212,175,55,0.12)`
- Waffle emoji `text-[80px]` with soft drop shadow, `opacity-90`
- `TBWX` in `text-3xl font-800 text-accent tracking-tight`
- `Sales Hub` in `text-sm text-muted`
- Decorative gold divider line `w-12 h-px bg-accent opacity-40 my-4`
- `"Just Waffle It."` in `text-xs italic text-dim`
- Bottom: "Powered by NoFluff.Pro" in `text-[10px] text-dim`

### Right panel (form)
- `background: var(--color-bg)`
- Centered vertically
- Contains existing form card (`glass` rounded, email + password + submit)
- Keep all existing form logic, validation, error handling, loading state unchanged
- Add "Welcome back" heading above the form: `text-lg font-bold text-text`
- Subtitle: "Sign in to your workspace" in `text-xs text-muted`

### Responsive
Below `md` breakpoint: hide left panel, show only form panel full-width (existing centered layout).

---

## 3. Admin Dashboard Overhaul

**File:** `src/app/dashboard/page.tsx` (modify admin rendering section)

The dashboard already has state management, data fetching, and lead filtering logic. We're changing the visual layout of what admins see — not the data logic.

### Layout (admin view)

```
Greeting row
─────────────────────────────
4 stat cards (grid-cols-4)
─────────────────────────────
Recent Leads mini-table     (full width)
─────────────────────────────
Agent Performance  |  Stale Leads
(left col, ~55%)      (right col, ~45%)
```

### Greeting row
`Good morning/afternoon/evening, [name] 👋`
`text-lg font-bold text-text` + date in `text-xs text-muted`

### Stat cards
4-column grid. Each card:
- `background: var(--color-card)`, `border: 1px solid var(--color-border)`, `border-radius: 12px`, `padding: 16px`
- Large value: `text-3xl font-extrabold` in contextual color
- Uppercase label: `text-[9px] font-semibold tracking-widest text-muted`
- Optional sub-line: `text-[10px] text-dim`

| Card | Value source | Color |
|------|-------------|-------|
| Total Leads | `leads.length` | `var(--color-accent)` |
| Replied | leads with `lead_status === 'REPLIED'` | `var(--color-success)` |
| Hot | leads with `lead_priority === 'HOT'` and not CONVERTED/LOST | `var(--color-hot)` |
| Converted | leads with `lead_status === 'CONVERTED'` | `var(--color-status-converted)` |

### Recent Leads mini-table
Shows last 8 leads by `created_time` desc (most recent first).
Card container: same card style.
Header: section label `RECENT LEADS` + "View all →" link to `/leads`

Table columns: Name · City · Status badge · Priority badge · Assigned to · Created
- Status badges: use `var(--color-status-*)` tokens
- Priority badges: use `var(--color-priority-*)` tokens
- Clicking a row opens `/leads/[id]`
- Alternating row background: `bg-elevated/30` every other row

### Agent Performance panel
Card container.
Header: `AGENT PERFORMANCE` label
For each unique agent in leads:
- Avatar circle (initial) + name
- Progress bar: `leads_contacted / total_assigned` ratio
  - `leads_contacted` = count of leads assigned to agent where status not in `['NEW', 'DECK_SENT']`
- Percentage label right-aligned
- Bar: gold gradient `linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))`
- Bar track: `var(--color-elevated)`, `height: 6px`, `border-radius: 3px`

### Stale Leads panel
Card container with `border-left: 3px solid var(--color-warning)`.
Header: `⚠ STALE LEADS` in `var(--color-warning)`
Definition: leads where `next_followup` is more than 3 days in the past AND status not CONVERTED/LOST.
Each row: name + city + "Xd no contact" in warning color + link to lead detail
Max 5 rows shown, "View all →" link to `/leads?filter=stale`

---

## 4. File Map

| File | Action | What changes |
|------|--------|-------------|
| `src/components/Navbar.tsx` | Modify | Three-zone layout, centered links, More dropdown, avatar dropdown, gradient bg |
| `src/app/login/page.tsx` | Modify | Split-screen layout (left brand panel, right existing form) |
| `src/app/dashboard/page.tsx` | Modify | Admin section: stat cards + recent leads table + agent bars + stale panel |

---

## 5. Out of Scope (this wave)

- Wave 2: Leads page, Inbox, Pipeline
- Wave 3: New features (notifications, search, etc.)
- Wave 4: NoFluff demo instance
- Agent-role dashboard (AgentQueue — already built in previous wave)
- Any new API routes (all data comes from existing `/api/leads`, `/api/auth/me`, `/api/inbox/unread`)
