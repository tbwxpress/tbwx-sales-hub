# Update Request System — Design Spec

**Date:** 2026-05-28
**Status:** Approved for implementation
**Author:** Gavish (admin) + Claude
**Project:** TBWX Sales Hub

---

## Problem

Admin (Gavish) needs a structured way to ask sales agents for status updates on specific leads from their roster. Today this happens over WhatsApp / Slack / verbally, and there's no audit trail of "did Happy ever respond about lead X?" The volume makes informal nudging unreliable.

## Goal

A lightweight in-app workflow so admin can pick a handful of leads from an agent's roster, set a due date, and have the agent answer inside the existing notes flow. Answered/overdue/pending state is tracked persistently so nothing slips.

## Non-goals (v1)

- Recurring update requests ("ask every Friday").
- WhatsApp/email notifications to agent.
- Auto-generated requests for stale leads.
- Cross-agent batching ("request from 3 agents at once").
- Telecaller-targeted requests (only sales-manager/agent role for v1).

---

## Role model (3 levels, name-agnostic)

| Role | Can do |
|---|---|
| **Admin** | Create requests, cancel requests, view all requests, view answer notes. |
| **Agent / Sales Manager** | Answer their own requests (by adding a note). See pending requests in dashboard widget. |
| **Telecaller** | Not in v1 (telecallers don't own leads in the sheet sense). |

---

## User flows

### 1. Admin creates a request (entry point: agent's stats card)

1. Admin opens `/agent-stats` and expands an agent's card (existing UI).
2. New button inside the expanded card: **"Request updates from {agent name}"**.
3. Click → modal opens scoped to that agent. Modal contains:
   - That agent's roster, filterable by status (default: HOT, WARM, NEW). Sort by stalest-first.
   - Checkbox per lead. Header row "Select all visible" / "Clear".
   - **Due date** picker. Default: today + 2 business days.
   - **Reason** text field (optional, ≤ 200 chars).
   - "Send" button (disabled until ≥ 1 lead selected).
4. Submit → POST `/api/update-requests` with `{ agent_id, lead_rows: [...], due_date, reason }`. One row per lead inserted into `update_requests`.
5. Modal closes, toast: "5 update requests sent to Happy."

### 2. Agent sees and answers the request

**Dashboard widget — top of `/dashboard`, before all existing widgets:**

```
🔔 Updates Requested by Sales Head   (3 pending)
┌────────────────────────────────────────────────────┐
│ • Rohit Mehta (Mumbai)        due TODAY    →       │
│ • Pankaj Singh (Delhi)        due Tomorrow →       │
│ • Saurabh Joshi (Pune)        due 2 Jun    →       │
└────────────────────────────────────────────────────┘
```

- Red border around the whole widget if any item is overdue.
- Click a row → navigates to that lead's detail page.

**Inside the lead detail page** (when a pending request exists for the current agent on this lead):

A banner above the Notes section:

> 🟡 **Sales Head requested an update on this lead — due 28 May 2026.**
> *"haven't heard back in 2 weeks"* (reason, if provided)
>
> Add a note below to answer this request.

The existing "Add Note" input gets a subtle hint:
*"This note will close the update request."*

### 3. Auto-answer detection

When the assigned agent adds a note to a lead (POST `/api/inbox/[phone]/notes`):
- Find any open `update_requests` row where `lead_row` matches the lead, `agent_id` matches the note author, and `status = 'PENDING'`.
- If found:
  - Mark `status = 'ANSWERED'`.
  - Set `answered_at = now()`, `answer_note_id = <new note id>`.
- Notes shorter than 5 trimmed chars don't trigger answer (prevents accidental closure from a typo).
- If multiple notes are added, only the first qualifying one closes the request.

### 4. Admin tracks and reviews

New page `/admin/update-requests` with 4 tabs:

| Tab | Default sort | Columns |
|---|---|---|
| **Pending** | due_date ASC | Agent, Lead, Due, Days Waiting, Reason |
| **Overdue** | due_date ASC | Agent, Lead, Due, Days Overdue, Reason |
| **Answered** | answered_at DESC | Agent, Lead, Asked, Answered, Answer note |
| **Cancelled** | cancelled_at DESC | Agent, Lead, Asked, Cancelled at |

- Click any row → opens the lead detail page.
- Pending/Overdue rows have a **Cancel** action (sets status = `CANCELLED`).
- Answered rows show the answer note inline (expandable if long).

### 5. Admin notification

- Navbar link to `/admin/update-requests` shows a badge with count of newly answered since admin's last visit.
- Last-visit timestamp stored per admin in `user_meta` (or a simple key `admin.update_requests.last_seen` in `settings`).
- Optional toast on the admin's dashboard when navigating to it.

---

## Data model

New SQLite table:

```sql
CREATE TABLE update_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_row INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,         -- denormalized for quick rendering / agent renames
  requested_by TEXT NOT NULL,       -- admin user.id
  reason TEXT,                      -- nullable, ≤ 500 chars
  due_date TEXT NOT NULL,           -- YYYY-MM-DD (date-only, no time)
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ANSWERED','CANCELLED')),
  created_at TEXT NOT NULL,         -- ISO timestamp
  answered_at TEXT,
  answer_note_id INTEGER,           -- soft FK to notes.id
  cancelled_at TEXT,
  cancelled_by TEXT
);

CREATE INDEX idx_update_requests_agent_status ON update_requests(agent_id, status);
CREATE INDEX idx_update_requests_lead ON update_requests(lead_row);
CREATE INDEX idx_update_requests_status_due ON update_requests(status, due_date);
```

**Why these indexes:**
- `(agent_id, status)` — agent's dashboard widget query: "all my PENDING".
- `(lead_row)` — banner check on lead detail page; auto-answer detection.
- `(status, due_date)` — admin's Pending/Overdue tab sort.

---

## API surface

### Admin endpoints

| Method | Path | Body | Auth |
|---|---|---|---|
| `POST` | `/api/update-requests` | `{ agent_id, lead_rows: number[], due_date, reason? }` | admin |
| `PATCH` | `/api/update-requests/:id` | `{ status: 'CANCELLED' }` | admin |
| `GET` | `/api/update-requests?status=PENDING&overdue=true` | — | admin |

### Agent endpoints

| Method | Path | Body | Auth |
|---|---|---|---|
| `GET` | `/api/update-requests/mine?status=PENDING` | — | agent (filtered to own) |
| `GET` | `/api/update-requests/for-lead/:row` | — | agent (must be assignee) |

### Implicit hook

- POST `/api/inbox/[phone]/notes` — when called, after inserting the note, check for and auto-close matching pending requests. No new endpoint needed.

---

## Permissions

| Action | Admin | Owner agent | Other agent | Telecaller |
|---|---|---|---|---|
| Create request | ✅ | ❌ | ❌ | ❌ |
| Cancel request | ✅ | ❌ | ❌ | ❌ |
| Answer (via note) | n/a | ✅ if owns the lead | ❌ | ❌ |
| See pending requests | All | Own only | None | None |
| See answered/cancelled | All | Own only | None | None |

Enforced server-side in every endpoint — never trust client state.

---

## UI components (new)

| Component | Where | Purpose |
|---|---|---|
| `RequestUpdatesButton` | `/agent-stats` expanded agent card | Opens the picker modal scoped to that agent. |
| `RequestUpdatesModal` | Mounted by button | Lead picker + due date + reason + submit. |
| `UpdateRequestWidget` | Top of `/dashboard` | Agent's pending list, click-through to leads. Red border if any overdue. |
| `UpdateRequestBanner` | Lead detail page | Shows when pending request exists for current viewer + this lead. |
| `AdminUpdateRequestsPage` | `/admin/update-requests` | 4-tab list. |
| `UpdateRequestsBadge` | Navbar (admin only) | Count of newly answered since last visit. |

---

## Edge cases handled

| Case | Behavior |
|---|---|
| Admin cancels a request after agent answered | No-op (status already ANSWERED, can't go back). |
| Agent reassigned to different role mid-request | Pending requests still visible/answerable until cancelled. |
| Lead reassigned to a different agent | Original request stays bound to original agent (audit value). Admin can cancel and re-request from the new owner. |
| Agent adds 5 notes on the lead | First qualifying note closes the request; subsequent notes are just normal notes. |
| Multiple pending requests on the same lead from same agent | First qualifying note closes the OLDEST pending request only. (Edge case — unlikely, but defined.) |
| Lead deleted | Request stays in DB for audit; UI gracefully shows "Lead unavailable" if `lead_row` no longer resolves. |
| Empty `reason` field | Banner omits the italic line; everything else same. |

---

## Out of scope confirmations

These were considered and explicitly excluded from v1:

- ❌ Recurring schedules — added complexity, low demand right now.
- ❌ WhatsApp/email notifications — dashboard widget is enough; can add later if agents miss requests.
- ❌ Auto-generated requests ("any lead untouched for 14 days") — separate problem domain.
- ❌ Telecaller targets — telecallers don't "own" leads in the same way; would need different model.
- ❌ Bulk-import requests from CSV — manual entry is fine for v1 scale.

---

## Open questions

None at spec time. If any surface during implementation, append here.
