# TBWX Sales Hub — UI Overhaul Design Spec
**Date:** 2026-03-28
**Status:** Approved
**Scope:** Full UI redesign of TBWX Sales Hub — production app and future NoFluff-branded demo

---

## 1. Goals

- Elevate the visual quality to "god level" — production-grade, premium, and demo-worthy
- Make the app immediately useful for both Admin and Sales Agent without confusion
- Support a future white-label demo on `demo.nofluff.pro` with fake seed data
- Lay a clean design system foundation so future pages are consistent

---

## 2. Design Decisions (all approved)

| Decision | Choice |
|----------|--------|
| Visual direction | Dark Luxury Elevated |
| Component style | Refined & Minimal |
| Navigation layout | Top navbar |
| Navbar treatment | Centered links, gold underline active |
| Landing page | Role-aware (Admin sees stats, Agent sees action queue) |
| Light theme | Warm Parchment |
| Theme switching | One-click toggle in navbar, persists per user |

---

## 3. Design System — Color Tokens

### Dark Theme (`.dark`)
```
--bg:            #0f0a04   (deep black-brown)
--surface-1:     #160f08   (card base)
--surface-2:     #1e1510   (elevated surface)
--border:        rgba(255,255,255,0.06)
--border-accent: rgba(212,175,55,0.2)
--accent:        #d4af37   (gold)
--accent-dim:    #9b8b6a
--text-primary:  #f5ead4   (warm cream)
--text-secondary:#9b8b6a
--text-dim:      #6b5d3f
--nav-bg:        linear-gradient(90deg,#0f0a04,#1a1209,#0f0a04)
--card-bg:       linear-gradient(145deg,#1e1510,#160f08)
--stat-green:    #4ade80
--stat-orange:   #fb923c
--toggle-bg:     rgba(212,175,55,0.12)
--toggle-border: rgba(212,175,55,0.3)
```

### Light Theme — Warm Parchment (`.light-parchment`)
```
--bg:            #faf6f0   (warm off-white)
--surface-1:     #ffffff
--surface-2:     #f5ede0   (warm cream)
--border:        #e8ddd0
--border-accent: #d4af37
--accent:        #b8932a   (darker gold for contrast)
--accent-dim:    #8a7055
--text-primary:  #2d1f0a   (deep warm brown)
--text-secondary:#8a7055
--text-dim:      #b0967a
--nav-bg:        linear-gradient(90deg,#faf6f0,#f5ede0,#faf6f0)
--card-bg:       #ffffff
--stat-green:    #15803d
--stat-orange:   #c2410c
--toggle-bg:     rgba(184,147,42,0.12)
--toggle-border: rgba(184,147,42,0.35)
```

---

## 4. Typography

| Use | Size | Weight | Color token |
|-----|------|--------|-------------|
| Page heading | 18px | 700 | `--text-primary` |
| Section label | 8px uppercase, 1.5px letter-spacing | 600 | `--text-secondary` |
| Body | 12px | 400 | `--text-primary` |
| Stat value | 26px | 800 | contextual |
| Stat sub | 9px | 400 | `--text-dim` |
| Nav links | 10px | 500 active 700 | `--text-dim` / `--accent` |
| Badge/label | 9–10px | 600 | contextual |
| Font family | `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` | | |

---

## 5. Component Patterns

### Cards
- Background: `var(--card-bg)`
- Border: `1px solid var(--border)`
- Border-radius: `12px`
- Padding: `16px`
- Transition: `all 0.3s`
- No heavy drop shadows — let the subtle gradient carry the depth in dark mode

### Stat Cards
- 4-column grid
- Stat value large (26px, 800 weight), colored by meaning (green = good, orange = alert, gold = primary)
- Uppercase label + sub-line

### Navbar
- Height: `54px`
- Sticky top
- Left: logo box (30×30, gold gradient, "TB") + brand name
- Center: nav links with `border-bottom: 2px solid transparent` → gold on active
- Right: theme toggle pill + avatar
- Background: `var(--nav-bg)` with subtle gradient, `1px solid var(--border-accent)` bottom border

### Theme Toggle Pill
- Pill shape: `border-radius: 20px`, `padding: 5px 12px`
- Background: `var(--toggle-bg)`, border: `var(--toggle-border)`
- Icon (🌙 / ☀️) + label ("Dark" / "Light")
- Switches body class between `dark` and `light-parchment`
- Persists in `localStorage` key: `tbwx-theme`

### Panels (2-column grid)
- Same card pattern
- Agent performance bars: avatar + bar track + percentage
- Stale leads panel: left border `3px solid #fb923c` (orange alert)

---

## 6. Role-Aware Landing Pages

The app detects the logged-in user's role and renders a different default landing experience.

### Admin Landing
- Greeting: "Good morning, [name]" + date
- 4 stat cards: Total Leads, Replied, Hot Leads, Converted
- Agent Performance panel (bar chart per agent)
- Stale Leads panel (orange alert, CTA button)

### Agent Landing
- Greeting: "Here's your queue, [name]" + motivational line
- Act Now section: replies waiting, follow-ups due today, hot leads
- Each item is a direct action card — one tap to open the lead/conversation
- Daily progress bar: leads contacted / daily goal
- No stats noise — purely action-oriented

### Implementation
- Read role from session/JWT
- `if role === 'admin'` → render `<AdminDashboard />`
- `if role === 'agent'` → render `<AgentQueue />`
- Both use the same layout shell (navbar, theme, spacing)

---

## 7. Theme Persistence

```ts
// On mount
const saved = localStorage.getItem('tbwx-theme') ?? 'dark'
document.body.className = saved

// On toggle
const next = current === 'dark' ? 'light-parchment' : 'dark'
document.body.className = next
localStorage.setItem('tbwx-theme', next)
```

---

## 8. CSS Architecture

**File:** `src/app/globals.css` (extend existing)

- All color tokens defined under `.dark` and `.light-parchment` class selectors on `body`
- Tailwind `@theme inline` block maps token names to utility classes
- No inline styles except for dynamic values (e.g., bar widths)
- All page components use `var(--token-name)` — never hardcoded colors

---

## 9. Implementation Sequence

1. **Design tokens** — add all CSS variables to `globals.css`, remove all hardcoded colors
2. **Theme toggle component** — `<ThemeToggle />` with localStorage persistence, placed in navbar
3. **Navbar** — rebuild to spec: logo, centered links, theme toggle, avatar
4. **Admin landing page** — role-aware with stat cards, agent bars, stale panel
5. **Agent landing page** — action queue view, daily progress
6. **Apply tokens to all other pages** — Leads, Inbox, Pipeline, Stats, Follow-ups, Templates
7. **Polish pass** — transitions, hover states, spacing consistency

---

## 10. Out of Scope (this spec)

- NoFluff demo instance deployment (`demo.nofluff.pro`) — separate task after UI is done
- New feature development (new pages, new API routes)
- Mobile responsiveness overhaul (existing is acceptable for now)
- Animation system (GSAP/Framer — future enhancement)
