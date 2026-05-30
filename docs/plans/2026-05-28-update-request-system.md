# Update Request System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-app workflow so admin can request status updates on specific leads from each agent's roster, with due dates and inline note-based answers.

**Architecture:** New `update_requests` SQLite table; helper module in `src/lib/update-requests.ts`; 5 API endpoints (3 admin, 2 agent); 1 hook into existing notes POST for auto-answer detection; 6 UI components plus 4 page-level mounts.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vitest, libsql/Turso, Tailwind CSS 4.

**Spec:** [docs/specs/2026-05-28-update-request-system.md](../specs/2026-05-28-update-request-system.md)

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/lib/update-requests.ts` | DB helpers: create, cancel, list, auto-answer detection. Single source of truth for the table. |
| `src/lib/__tests__/update-requests.test.ts` | Unit tests for the helpers (vitest). |
| `src/app/api/update-requests/route.ts` | POST (admin create) and GET (admin list with status filter). |
| `src/app/api/update-requests/[id]/route.ts` | PATCH (admin cancel). |
| `src/app/api/update-requests/mine/route.ts` | GET (agent's pending requests for dashboard widget). |
| `src/app/api/update-requests/for-lead/[row]/route.ts` | GET (single pending request for the banner on lead detail). |
| `src/components/RequestUpdatesButton.tsx` | Admin-only button on agent-stats card. Opens modal. |
| `src/components/RequestUpdatesModal.tsx` | Lead picker + due date + reason form. |
| `src/components/UpdateRequestWidget.tsx` | Agent dashboard widget showing pending requests. |
| `src/components/UpdateRequestBanner.tsx` | Banner on lead detail page. |
| `src/components/UpdateRequestsBadge.tsx` | Navbar badge for admin (newly answered count). |
| `src/app/admin/update-requests/page.tsx` | Admin list page with 4 tabs. |

### Modified files

| Path | Modification |
|---|---|
| `src/lib/db.ts` | Add `CREATE TABLE IF NOT EXISTS update_requests` + 3 indexes inside `ensureInit()`. |
| `src/app/api/inbox/[phone]/notes/route.ts` | After inserting a note, call `autoAnswerForNote(...)` from update-requests helper. |
| `src/app/agent-stats/page.tsx` | Mount `<RequestUpdatesButton>` inside the expanded-agent card. |
| `src/app/dashboard/page.tsx` | Mount `<UpdateRequestWidget>` at the top, above all existing widgets. |
| `src/app/leads/[id]/page.tsx` | Mount `<UpdateRequestBanner>` above the Lead Notes section. |
| `src/components/Navbar.tsx` | Mount `<UpdateRequestsBadge>` (admin only). |

---

## Task 1: Add `update_requests` table to DB schema

**Files:**
- Modify: `src/lib/db.ts` (inside `ensureInit()`, after the last existing `CREATE TABLE`)

- [ ] **Step 1.1: Add table + indexes to schema**

Open `src/lib/db.ts`, find `async function ensureInit()` (around line 44), and append a new `CREATE TABLE` block before the closing of the init function. Use the same `await db.execute(...)` pattern as the other tables.

```ts
await db.execute(`
  CREATE TABLE IF NOT EXISTS update_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_row INTEGER NOT NULL,
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    reason TEXT,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ANSWERED','CANCELLED')),
    created_at TEXT NOT NULL,
    answered_at TEXT,
    answer_note_id INTEGER,
    cancelled_at TEXT,
    cancelled_by TEXT
  )
`)
await db.execute(`CREATE INDEX IF NOT EXISTS idx_update_requests_agent_status ON update_requests(agent_id, status)`)
await db.execute(`CREATE INDEX IF NOT EXISTS idx_update_requests_lead ON update_requests(lead_row)`)
await db.execute(`CREATE INDEX IF NOT EXISTS idx_update_requests_status_due ON update_requests(status, due_date)`)
```

- [ ] **Step 1.2: Verify schema creation runs without error**

Run: `npm run dev` and hit any API route (e.g. `curl http://localhost:3458/api/inbox/unread` after auth, or just load `/leads`). The init runs on first DB access — if the table syntax is wrong, the server logs an error.

Expected: no error in dev console; visiting any DB-backed page loads as before.

- [ ] **Step 1.3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat(db): add update_requests table for update-request system"
```

---

## Task 2: DB helper — `createUpdateRequests`

**Files:**
- Create: `src/lib/update-requests.ts`
- Create: `src/lib/__tests__/update-requests.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `src/lib/__tests__/update-requests.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createUpdateRequests, getRequestById } from '../update-requests'

describe('createUpdateRequests', () => {
  it('inserts one row per lead with PENDING status', async () => {
    const ids = await createUpdateRequests({
      agent_id: 'user_happy',
      agent_name: 'Happy',
      requested_by: 'admin_1',
      lead_rows: [101, 102, 103],
      due_date: '2026-06-01',
      reason: 'quarterly check-in',
    })
    expect(ids).toHaveLength(3)
    const first = await getRequestById(ids[0])
    expect(first?.status).toBe('PENDING')
    expect(first?.lead_row).toBe(101)
    expect(first?.due_date).toBe('2026-06-01')
    expect(first?.reason).toBe('quarterly check-in')
  })

  it('handles empty reason as null', async () => {
    const ids = await createUpdateRequests({
      agent_id: 'user_happy',
      agent_name: 'Happy',
      requested_by: 'admin_1',
      lead_rows: [200],
      due_date: '2026-06-01',
      reason: '',
    })
    const row = await getRequestById(ids[0])
    expect(row?.reason).toBeNull()
  })
})
```

- [ ] **Step 2.2: Run test, verify it fails**

Run: `npm test -- src/lib/__tests__/update-requests.test.ts`
Expected: FAIL with module-not-found for `../update-requests`.

- [ ] **Step 2.3: Implement helper**

Create `src/lib/update-requests.ts`:

```ts
import { ensureInit, serializeRows } from './db'

export type UpdateRequestStatus = 'PENDING' | 'ANSWERED' | 'CANCELLED'

export interface UpdateRequest {
  id: number
  lead_row: number
  agent_id: string
  agent_name: string
  requested_by: string
  reason: string | null
  due_date: string
  status: UpdateRequestStatus
  created_at: string
  answered_at: string | null
  answer_note_id: number | null
  cancelled_at: string | null
  cancelled_by: string | null
}

export async function createUpdateRequests(input: {
  agent_id: string
  agent_name: string
  requested_by: string
  lead_rows: number[]
  due_date: string
  reason?: string
}): Promise<number[]> {
  const db = await ensureInit()
  const createdAt = new Date().toISOString()
  const reason = input.reason?.trim() ? input.reason.trim().slice(0, 500) : null
  const ids: number[] = []
  for (const lead_row of input.lead_rows) {
    const result = await db.execute({
      sql: `INSERT INTO update_requests
        (lead_row, agent_id, agent_name, requested_by, reason, due_date, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      args: [lead_row, input.agent_id, input.agent_name, input.requested_by, reason, input.due_date, createdAt],
    })
    ids.push(Number(result.lastInsertRowid))
  }
  return ids
}

export async function getRequestById(id: number): Promise<UpdateRequest | null> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM update_requests WHERE id = ?`,
    args: [id],
  })
  const rows = serializeRows(result.rows)
  return rows[0] ? (rows[0] as unknown as UpdateRequest) : null
}
```

Note: this requires `serializeRows` to be exported from `db.ts`. Check the file — if it's not exported, export it. (Search for `function serializeRows` and add `export` if missing.)

- [ ] **Step 2.4: Run test, verify it passes**

Run: `npm test -- src/lib/__tests__/update-requests.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/update-requests.ts src/lib/__tests__/update-requests.test.ts src/lib/db.ts
git commit -m "feat(update-requests): createUpdateRequests + getRequestById helpers"
```

---

## Task 3: DB helper — `listPendingForAgent` and `getPendingForLeadAndAgent`

**Files:**
- Modify: `src/lib/update-requests.ts`
- Modify: `src/lib/__tests__/update-requests.test.ts`

- [ ] **Step 3.1: Add failing tests**

Append to `src/lib/__tests__/update-requests.test.ts`:

```ts
import { listPendingForAgent, getPendingForLeadAndAgent } from '../update-requests'

describe('listPendingForAgent', () => {
  it('returns only PENDING for the given agent, sorted by due_date asc', async () => {
    await createUpdateRequests({
      agent_id: 'agent_a', agent_name: 'A', requested_by: 'admin_1',
      lead_rows: [300], due_date: '2026-06-05',
    })
    await createUpdateRequests({
      agent_id: 'agent_a', agent_name: 'A', requested_by: 'admin_1',
      lead_rows: [301], due_date: '2026-06-01',
    })
    await createUpdateRequests({
      agent_id: 'agent_b', agent_name: 'B', requested_by: 'admin_1',
      lead_rows: [302], due_date: '2026-06-01',
    })

    const aList = await listPendingForAgent('agent_a')
    expect(aList.map(r => r.lead_row)).toEqual([301, 300])

    const bList = await listPendingForAgent('agent_b')
    expect(bList.map(r => r.lead_row)).toEqual([302])
  })
})

describe('getPendingForLeadAndAgent', () => {
  it('returns the oldest pending request for that (lead, agent) pair, or null', async () => {
    const [id1] = await createUpdateRequests({
      agent_id: 'agent_c', agent_name: 'C', requested_by: 'admin_1',
      lead_rows: [400], due_date: '2026-06-10',
    })
    // Add a second one (rare but possible)
    await createUpdateRequests({
      agent_id: 'agent_c', agent_name: 'C', requested_by: 'admin_1',
      lead_rows: [400], due_date: '2026-07-10',
    })
    const r = await getPendingForLeadAndAgent(400, 'agent_c')
    expect(r?.id).toBe(id1)  // oldest by created_at
    expect(r?.status).toBe('PENDING')

    const missing = await getPendingForLeadAndAgent(999, 'agent_c')
    expect(missing).toBeNull()
  })
})
```

- [ ] **Step 3.2: Run tests, verify they fail**

Run: `npm test -- src/lib/__tests__/update-requests.test.ts`
Expected: FAIL for `listPendingForAgent` and `getPendingForLeadAndAgent` (not exported).

- [ ] **Step 3.3: Implement helpers**

Append to `src/lib/update-requests.ts`:

```ts
export async function listPendingForAgent(agent_id: string): Promise<UpdateRequest[]> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM update_requests
          WHERE agent_id = ? AND status = 'PENDING'
          ORDER BY due_date ASC, created_at ASC`,
    args: [agent_id],
  })
  return serializeRows(result.rows) as unknown as UpdateRequest[]
}

export async function getPendingForLeadAndAgent(
  lead_row: number,
  agent_id: string
): Promise<UpdateRequest | null> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM update_requests
          WHERE lead_row = ? AND agent_id = ? AND status = 'PENDING'
          ORDER BY created_at ASC LIMIT 1`,
    args: [lead_row, agent_id],
  })
  const rows = serializeRows(result.rows)
  return rows[0] ? (rows[0] as unknown as UpdateRequest) : null
}
```

- [ ] **Step 3.4: Run tests, verify they pass**

Run: `npm test -- src/lib/__tests__/update-requests.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/update-requests.ts src/lib/__tests__/update-requests.test.ts
git commit -m "feat(update-requests): listPendingForAgent + getPendingForLeadAndAgent"
```

---

## Task 4: DB helper — admin list with filters + cancel

**Files:**
- Modify: `src/lib/update-requests.ts`
- Modify: `src/lib/__tests__/update-requests.test.ts`

- [ ] **Step 4.1: Add failing tests**

```ts
import { listRequestsForAdmin, cancelRequest } from '../update-requests'

describe('listRequestsForAdmin', () => {
  it('filters by status', async () => {
    const pending = await listRequestsForAdmin({ status: 'PENDING' })
    expect(pending.every(r => r.status === 'PENDING')).toBe(true)
  })

  it('"overdue" returns only PENDING where due_date < today', async () => {
    await createUpdateRequests({
      agent_id: 'agent_d', agent_name: 'D', requested_by: 'admin_1',
      lead_rows: [500], due_date: '2020-01-01',
    })
    const overdue = await listRequestsForAdmin({ overdue: true })
    expect(overdue.some(r => r.lead_row === 500)).toBe(true)
    expect(overdue.every(r => r.status === 'PENDING')).toBe(true)
  })
})

describe('cancelRequest', () => {
  it('flips status to CANCELLED and records who/when', async () => {
    const [id] = await createUpdateRequests({
      agent_id: 'agent_e', agent_name: 'E', requested_by: 'admin_1',
      lead_rows: [600], due_date: '2026-06-15',
    })
    await cancelRequest(id, 'admin_1')
    const r = await getRequestById(id)
    expect(r?.status).toBe('CANCELLED')
    expect(r?.cancelled_by).toBe('admin_1')
    expect(r?.cancelled_at).toBeTruthy()
  })

  it('refuses to cancel an already-answered request', async () => {
    // Setup: insert a request then manually mark answered
    const [id] = await createUpdateRequests({
      agent_id: 'agent_f', agent_name: 'F', requested_by: 'admin_1',
      lead_rows: [700], due_date: '2026-06-15',
    })
    // Use raw exec to simulate an answered state without going through autoAnswer
    const { ensureInit } = await import('../db')
    const db = await ensureInit()
    await db.execute({
      sql: `UPDATE update_requests SET status = 'ANSWERED', answered_at = ?, answer_note_id = 1 WHERE id = ?`,
      args: [new Date().toISOString(), id],
    })

    await expect(cancelRequest(id, 'admin_1')).rejects.toThrow(/cannot cancel/i)
  })
})
```

- [ ] **Step 4.2: Run tests, verify they fail**

Run: `npm test -- src/lib/__tests__/update-requests.test.ts`
Expected: FAIL for `listRequestsForAdmin` and `cancelRequest` (not exported).

- [ ] **Step 4.3: Implement helpers**

Append to `src/lib/update-requests.ts`:

```ts
export async function listRequestsForAdmin(opts: {
  status?: UpdateRequestStatus
  overdue?: boolean
} = {}): Promise<UpdateRequest[]> {
  const db = await ensureInit()
  const today = new Date().toISOString().slice(0, 10)

  if (opts.overdue) {
    const result = await db.execute({
      sql: `SELECT * FROM update_requests
            WHERE status = 'PENDING' AND due_date < ?
            ORDER BY due_date ASC, created_at ASC`,
      args: [today],
    })
    return serializeRows(result.rows) as unknown as UpdateRequest[]
  }

  if (opts.status) {
    const order = opts.status === 'ANSWERED'
      ? 'answered_at DESC'
      : opts.status === 'CANCELLED'
        ? 'cancelled_at DESC'
        : 'due_date ASC, created_at ASC'
    const result = await db.execute({
      sql: `SELECT * FROM update_requests WHERE status = ? ORDER BY ${order}`,
      args: [opts.status],
    })
    return serializeRows(result.rows) as unknown as UpdateRequest[]
  }

  const result = await db.execute({
    sql: `SELECT * FROM update_requests ORDER BY created_at DESC`,
  })
  return serializeRows(result.rows) as unknown as UpdateRequest[]
}

export async function cancelRequest(id: number, cancelled_by: string): Promise<void> {
  const db = await ensureInit()
  const existing = await getRequestById(id)
  if (!existing) throw new Error('Request not found')
  if (existing.status !== 'PENDING') {
    throw new Error(`Cannot cancel request in status ${existing.status}`)
  }
  await db.execute({
    sql: `UPDATE update_requests
          SET status = 'CANCELLED', cancelled_at = ?, cancelled_by = ?
          WHERE id = ?`,
    args: [new Date().toISOString(), cancelled_by, id],
  })
}
```

- [ ] **Step 4.4: Run tests, verify they pass**

Run: `npm test -- src/lib/__tests__/update-requests.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/update-requests.ts src/lib/__tests__/update-requests.test.ts
git commit -m "feat(update-requests): listRequestsForAdmin + cancelRequest"
```

---

## Task 5: DB helper — `autoAnswerForNote`

**Files:**
- Modify: `src/lib/update-requests.ts`
- Modify: `src/lib/__tests__/update-requests.test.ts`

- [ ] **Step 5.1: Add failing tests**

```ts
import { autoAnswerForNote } from '../update-requests'

describe('autoAnswerForNote', () => {
  it('closes the oldest pending request and stores the note id', async () => {
    const [id] = await createUpdateRequests({
      agent_id: 'agent_g', agent_name: 'G', requested_by: 'admin_1',
      lead_rows: [800], due_date: '2026-06-20',
    })
    const closed = await autoAnswerForNote({
      lead_row: 800,
      agent_id: 'agent_g',
      note_id: 42,
      note_text: 'Called him, sending the deck tomorrow.',
    })
    expect(closed?.id).toBe(id)
    const r = await getRequestById(id)
    expect(r?.status).toBe('ANSWERED')
    expect(r?.answer_note_id).toBe(42)
    expect(r?.answered_at).toBeTruthy()
  })

  it('ignores notes shorter than 5 trimmed chars', async () => {
    await createUpdateRequests({
      agent_id: 'agent_h', agent_name: 'H', requested_by: 'admin_1',
      lead_rows: [900], due_date: '2026-06-20',
    })
    const closed = await autoAnswerForNote({
      lead_row: 900, agent_id: 'agent_h', note_id: 50, note_text: 'ok',
    })
    expect(closed).toBeNull()
  })

  it('returns null when no pending request exists', async () => {
    const closed = await autoAnswerForNote({
      lead_row: 9999, agent_id: 'agent_z', note_id: 99, note_text: 'Hello there',
    })
    expect(closed).toBeNull()
  })
})
```

- [ ] **Step 5.2: Run tests, verify they fail**

Run: `npm test -- src/lib/__tests__/update-requests.test.ts`
Expected: FAIL for `autoAnswerForNote` (not exported).

- [ ] **Step 5.3: Implement helper**

Append to `src/lib/update-requests.ts`:

```ts
const MIN_ANSWER_NOTE_CHARS = 5

export async function autoAnswerForNote(input: {
  lead_row: number
  agent_id: string
  note_id: number
  note_text: string
}): Promise<UpdateRequest | null> {
  if (input.note_text.trim().length < MIN_ANSWER_NOTE_CHARS) return null

  const pending = await getPendingForLeadAndAgent(input.lead_row, input.agent_id)
  if (!pending) return null

  const db = await ensureInit()
  await db.execute({
    sql: `UPDATE update_requests
          SET status = 'ANSWERED', answered_at = ?, answer_note_id = ?
          WHERE id = ?`,
    args: [new Date().toISOString(), input.note_id, pending.id],
  })
  return { ...pending, status: 'ANSWERED', answered_at: new Date().toISOString(), answer_note_id: input.note_id }
}
```

- [ ] **Step 5.4: Run tests, verify they pass**

Run: `npm test -- src/lib/__tests__/update-requests.test.ts`
Expected: PASS (all 10 tests).

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/update-requests.ts src/lib/__tests__/update-requests.test.ts
git commit -m "feat(update-requests): autoAnswerForNote helper"
```

---

## Task 6: Wire auto-answer into the notes POST endpoint

**Files:**
- Modify: `src/app/api/inbox/[phone]/notes/route.ts`

- [ ] **Step 6.1: Modify the notes POST handler**

Open `src/app/api/inbox/[phone]/notes/route.ts`. The POST currently inserts a note and returns `{ id }`. After the insert, look up which lead (by phone), then call `autoAnswerForNote`.

Add imports at the top:
```ts
import { getLeads } from '@/lib/sheets'
import { autoAnswerForNote } from '@/lib/update-requests'
```

Replace the POST body — keep existing insertNote, then add auto-answer check:

```ts
export async function POST(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { phone } = await params
    const body = await req.json()
    const { note } = body

    if (!note?.trim()) {
      return NextResponse.json({ success: false, error: 'Note text is required' }, { status: 400 })
    }

    const noteId = await insertNote({ phone, note: note.trim(), created_by: user.name })

    // Best-effort: if this lead has a pending update request for this user,
    // mark it answered. Failures here must not block note creation.
    try {
      const leads = await getLeads()
      const phone10 = phone.replace(/\D/g, '').slice(-10)
      const lead = leads.find(l => l.phone.replace(/\D/g, '').slice(-10) === phone10)
      if (lead && lead.assigned_to === user.name) {
        await autoAnswerForNote({
          lead_row: lead.row_number,
          agent_id: user.id,
          note_id: noteId,
          note_text: note,
        })
      }
    } catch (e) {
      console.error('[notes POST] auto-answer check failed (non-fatal):', e)
    }

    return NextResponse.json({ success: true, id: noteId })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed to save note') },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 6.2: Manual smoke test**

Run `npm run dev`. Log in as an agent. Open any lead the agent owns. Add a note ≥ 5 chars. Hit a SQL inspector / `sqlite3` to confirm no errors (the helper silently no-ops if no pending request exists).

To test the happy path (no fixture for an existing pending request yet — we'll test end-to-end after Task 12).

- [ ] **Step 6.3: Commit**

```bash
git add src/app/api/inbox/[phone]/notes/route.ts
git commit -m "feat(notes): auto-answer pending update requests on agent's note"
```

---

## Task 7: API — `POST /api/update-requests` (admin create)

**Files:**
- Create: `src/app/api/update-requests/route.ts`

- [ ] **Step 7.1: Implement POST**

Create `src/app/api/update-requests/route.ts`:

```ts
import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { createUpdateRequests, listRequestsForAdmin } from '@/lib/update-requests'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const { agent_id, lead_rows, due_date, reason } = body
    if (!agent_id || !Array.isArray(lead_rows) || lead_rows.length === 0 || !due_date) {
      return NextResponse.json(
        { success: false, error: 'agent_id, lead_rows[], and due_date are required' },
        { status: 400 }
      )
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(due_date))) {
      return NextResponse.json({ success: false, error: 'due_date must be YYYY-MM-DD' }, { status: 400 })
    }

    const agent = await getUserById(agent_id)
    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 })
    }

    const ids = await createUpdateRequests({
      agent_id,
      agent_name: agent.name,
      requested_by: user.id,
      lead_rows: lead_rows.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)),
      due_date,
      reason: typeof reason === 'string' ? reason : undefined,
    })
    return NextResponse.json({ success: true, data: { ids, count: ids.length } })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed to create update requests') },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }
    const status = req.nextUrl.searchParams.get('status') as
      'PENDING' | 'ANSWERED' | 'CANCELLED' | null
    const overdue = req.nextUrl.searchParams.get('overdue') === 'true'
    const rows = await listRequestsForAdmin({
      status: status ?? undefined,
      overdue,
    })
    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed to list update requests') },
      { status: 500 }
    )
  }
}
```

Note: this assumes `getUserById` exists in `@/lib/users`. Check the file — if it doesn't exist (look for `getUserByEmail` instead), add it:

```ts
export async function getUserById(id: string): Promise<User | null> {
  await ensureTable()
  const db = getClient()
  const result = await db.execute({
    sql: `SELECT * FROM users WHERE id = ?`,
    args: [id],
  })
  return result.rows[0] ? rowToUser(result.rows[0]) : null
}
```

- [ ] **Step 7.2: Manual smoke test**

```bash
# Admin POST (replace cookie with your admin session)
curl -X POST http://localhost:3458/api/update-requests \
  -H "Content-Type: application/json" \
  -H "Cookie: saleshub_session=YOUR_TOKEN" \
  -d '{"agent_id":"user_happy","lead_rows":[123,124],"due_date":"2026-06-05","reason":"check-in"}'

# Expected: {"success":true,"data":{"ids":[N,N+1],"count":2}}

# Admin GET
curl "http://localhost:3458/api/update-requests?status=PENDING" \
  -H "Cookie: saleshub_session=YOUR_TOKEN"
# Expected: {"success":true,"data":[...]}
```

- [ ] **Step 7.3: Commit**

```bash
git add src/app/api/update-requests/route.ts src/lib/users.ts
git commit -m "feat(api): POST + GET /api/update-requests (admin create + list)"
```

---

## Task 8: API — `PATCH /api/update-requests/[id]` (admin cancel)

**Files:**
- Create: `src/app/api/update-requests/[id]/route.ts`

- [ ] **Step 8.1: Implement PATCH**

```ts
import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { cancelRequest } from '@/lib/update-requests'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }

    const { id } = await params
    const numericId = Number(id)
    if (!Number.isFinite(numericId)) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
    }
    const body = await req.json().catch(() => ({}))
    if (body.status !== 'CANCELLED') {
      return NextResponse.json(
        { success: false, error: "Only { status: 'CANCELLED' } is supported" },
        { status: 400 }
      )
    }

    await cancelRequest(numericId, user.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed to cancel request') },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 8.2: Manual smoke test**

```bash
curl -X PATCH http://localhost:3458/api/update-requests/1 \
  -H "Content-Type: application/json" \
  -H "Cookie: saleshub_session=YOUR_TOKEN" \
  -d '{"status":"CANCELLED"}'
# Expected: {"success":true}
```

Verify in DB the row's status is now `CANCELLED`.

- [ ] **Step 8.3: Commit**

```bash
git add src/app/api/update-requests/[id]/route.ts
git commit -m "feat(api): PATCH /api/update-requests/[id] (admin cancel)"
```

---

## Task 9: API — `GET /api/update-requests/mine` (agent pending list)

**Files:**
- Create: `src/app/api/update-requests/mine/route.ts`

- [ ] **Step 9.1: Implement GET**

```ts
import { apiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { listPendingForAgent } from '@/lib/update-requests'
import { getLeads } from '@/lib/sheets'

export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const rows = await listPendingForAgent(user.id)
    if (rows.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    // Decorate with lead name + city so the widget renders without an extra fetch
    const leads = await getLeads()
    const leadByRow = new Map(leads.map(l => [l.row_number, l]))
    const decorated = rows.map(r => {
      const lead = leadByRow.get(r.lead_row)
      return {
        ...r,
        lead_name: lead?.full_name || `Lead #${r.lead_row}`,
        lead_city: lead?.city || '',
        overdue: r.due_date < new Date().toISOString().slice(0, 10),
      }
    })
    return NextResponse.json({ success: true, data: decorated })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed to list my update requests') },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 9.2: Manual smoke test**

```bash
# Log in as an agent that has pending requests (use one created in Task 7)
curl http://localhost:3458/api/update-requests/mine \
  -H "Cookie: saleshub_session=AGENT_TOKEN"
# Expected: array with lead_name + lead_city + overdue boolean per item
```

- [ ] **Step 9.3: Commit**

```bash
git add src/app/api/update-requests/mine/route.ts
git commit -m "feat(api): GET /api/update-requests/mine (agent dashboard data)"
```

---

## Task 10: API — `GET /api/update-requests/for-lead/[row]` (banner)

**Files:**
- Create: `src/app/api/update-requests/for-lead/[row]/route.ts`

- [ ] **Step 10.1: Implement GET**

```ts
import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getPendingForLeadAndAgent } from '@/lib/update-requests'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ row: string }> }
) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { row } = await params
    const leadRow = Number(row)
    if (!Number.isFinite(leadRow)) {
      return NextResponse.json({ success: false, error: 'Invalid row' }, { status: 400 })
    }

    // Banner is only shown to the assigned agent (admins use the dedicated admin page).
    // Agents only see their own pending request for this lead.
    const r = await getPendingForLeadAndAgent(leadRow, user.id)
    return NextResponse.json({ success: true, data: r })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: apiError(err, 'Failed') },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 10.2: Manual smoke test**

```bash
curl http://localhost:3458/api/update-requests/for-lead/123 \
  -H "Cookie: saleshub_session=AGENT_TOKEN"
# Expected: {"success":true,"data": {...request} OR null}
```

- [ ] **Step 10.3: Commit**

```bash
git add src/app/api/update-requests/for-lead/[row]/route.ts
git commit -m "feat(api): GET /api/update-requests/for-lead/[row]"
```

---

## Task 11: UI — `RequestUpdatesModal` component

**Files:**
- Create: `src/components/RequestUpdatesModal.tsx`

- [ ] **Step 11.1: Implement the modal**

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'

interface Lead {
  row_number: number
  full_name: string
  city: string
  lead_status: string
  lead_priority: string
  next_followup: string
}

interface Props {
  open: boolean
  onClose: () => void
  agentId: string
  agentName: string
  onSent?: (count: number) => void
}

const STATUS_OPTIONS = ['NEW', 'DECK_SENT', 'REPLIED', 'NO_RESPONSE', 'CALL_DONE_INTERESTED', 'HOT'] as const
const DEFAULT_VISIBLE_STATUSES = new Set<string>(['HOT', 'CALL_DONE_INTERESTED', 'NEW'])

function defaultDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  return d.toISOString().slice(0, 10)
}

export default function RequestUpdatesModal({ open, onClose, agentId, agentName, onSent }: Props) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [visibleStatuses, setVisibleStatuses] = useState<Set<string>>(new Set(DEFAULT_VISIBLE_STATUSES))
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [dueDate, setDueDate] = useState<string>(defaultDueDate())
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setSelected(new Set())
    setReason('')
    setError('')
    fetch(`/api/leads?assigned=${encodeURIComponent(agentName)}`)
      .then(r => r.json())
      .then(d => { if (d.success) setLeads(d.data) })
      .catch(() => setError('Failed to load roster'))
      .finally(() => setLoading(false))
  }, [open, agentName])

  const visibleLeads = useMemo(() => {
    return leads
      .filter(l => visibleStatuses.has(l.lead_status))
      .sort((a, b) => (a.next_followup || '').localeCompare(b.next_followup || ''))
  }, [leads, visibleStatuses])

  function toggleStatus(s: string) {
    const next = new Set(visibleStatuses)
    if (next.has(s)) next.delete(s); else next.add(s)
    setVisibleStatuses(next)
  }

  function toggleLead(row: number) {
    const next = new Set(selected)
    if (next.has(row)) next.delete(row); else next.add(row)
    setSelected(next)
  }

  function selectAllVisible() {
    setSelected(new Set(visibleLeads.map(l => l.row_number)))
  }

  async function submit() {
    if (selected.size === 0) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/update-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          lead_rows: Array.from(selected),
          due_date: dueDate,
          reason,
        }),
      })
      const data = await res.json()
      if (data.success) {
        onSent?.(data.data.count)
        onClose()
      } else {
        setError(data.error || 'Failed to send')
      }
    } catch {
      setError('Network error')
    }
    setSending(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Request updates from {agentName}</h2>
          <button onClick={onClose} className="text-dim hover:text-text text-lg leading-none">×</button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {/* Filters */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`text-[10px] px-2 py-1 rounded border ${
                  visibleStatuses.has(s)
                    ? 'bg-accent/20 border-accent/40 text-accent'
                    : 'border-border text-dim hover:text-text'
                }`}
              >
                {s.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          {/* Roster */}
          <div className="border border-border rounded-md max-h-72 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-xs text-dim text-center">Loading roster…</div>
            ) : visibleLeads.length === 0 ? (
              <div className="p-4 text-xs text-dim text-center">No leads in this agent's roster match the selected statuses.</div>
            ) : (
              <>
                <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between text-[10px] text-dim">
                  <span>{visibleLeads.length} leads · {selected.size} selected</span>
                  <button onClick={selectAllVisible} className="text-accent hover:underline">Select all visible</button>
                </div>
                {visibleLeads.map(lead => (
                  <label key={lead.row_number} className="flex items-center gap-3 px-3 py-2 hover:bg-elevated cursor-pointer border-b border-border/30 last:border-b-0">
                    <input
                      type="checkbox"
                      checked={selected.has(lead.row_number)}
                      onChange={() => toggleLead(lead.row_number)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-text truncate">{lead.full_name}</div>
                      <div className="text-[10px] text-dim">{lead.lead_status} · {lead.city || '—'}</div>
                    </div>
                  </label>
                ))}
              </>
            )}
          </div>

          {/* Due date */}
          <div>
            <label className="text-[10px] text-dim block mb-1">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="bg-elevated border border-border rounded-md px-2 py-1.5 text-xs text-text"
            />
          </div>

          {/* Reason */}
          <div>
            <label className="text-[10px] text-dim block mb-1">Reason (optional, ≤ 200 chars)</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 200))}
              rows={2}
              placeholder="e.g. haven't heard back in 2 weeks"
              className="w-full bg-elevated border border-border rounded-md px-2 py-1.5 text-xs text-text resize-none"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-xs bg-elevated border border-border rounded-md px-3 py-1.5 text-muted hover:text-text">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={selected.size === 0 || sending}
            className="text-xs bg-accent text-bg rounded-md px-3 py-1.5 font-medium disabled:opacity-50"
          >
            {sending ? 'Sending…' : `Send (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 11.2: Manual visual check**

The modal is exported but not yet mounted. We verify in Task 12.

- [ ] **Step 11.3: Commit**

```bash
git add src/components/RequestUpdatesModal.tsx
git commit -m "feat(ui): RequestUpdatesModal — lead picker + due date + reason"
```

---

## Task 12: UI — `RequestUpdatesButton` + mount in agent-stats

**Files:**
- Create: `src/components/RequestUpdatesButton.tsx`
- Modify: `src/app/agent-stats/page.tsx`

- [ ] **Step 12.1: Implement the button**

```tsx
'use client'
import { useState } from 'react'
import RequestUpdatesModal from './RequestUpdatesModal'

interface Props {
  agentId: string
  agentName: string
}

export default function RequestUpdatesButton({ agentId, agentName }: Props) {
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState('')

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs bg-accent/15 hover:bg-accent/25 border border-accent/40 text-accent rounded-md px-3 py-1.5 font-medium transition-colors"
      >
        🔔 Request updates from {agentName}
      </button>
      <RequestUpdatesModal
        open={open}
        onClose={() => setOpen(false)}
        agentId={agentId}
        agentName={agentName}
        onSent={(n) => setToast(`Sent ${n} update requests to ${agentName}`)}
      />
      {toast && (
        <div className="fixed bottom-4 right-4 bg-success/20 border border-success/40 text-success text-xs px-3 py-2 rounded-md z-50">
          {toast}
          <button onClick={() => setToast('')} className="ml-2 text-success/70">×</button>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 12.2: Mount it in the expanded agent card**

Open `src/app/agent-stats/page.tsx`. Find where the expanded agent card renders (around line 622-669, identified earlier). Inside the expanded block, add the button. Search for the pattern that renders inside `isExpanded ?` — add this near the card actions (use Grep on `isExpanded` to locate; insert near where other agent-specific actions appear).

Add import at top:
```tsx
import RequestUpdatesButton from '@/components/RequestUpdatesButton'
```

In the JSX, inside the expanded card, add (after the existing stats block):
```tsx
<div className="pt-3 border-t border-border/50">
  <RequestUpdatesButton agentId={a.user_id} agentName={a.name} />
</div>
```

(Adapt `a.user_id` / `a.name` to whatever variable name the map uses — likely already `a`.)

- [ ] **Step 12.3: Browser test**

Run `npm run dev`. Log in as admin → `/agent-stats` → expand any agent's card → click "Request updates from {agent}" → modal opens → roster loads → select 2 leads → set due date → click Send → toast confirms.

Verify DB row count in `update_requests` table matches selection count.

- [ ] **Step 12.4: Commit**

```bash
git add src/components/RequestUpdatesButton.tsx src/app/agent-stats/page.tsx
git commit -m "feat(ui): mount RequestUpdatesButton in agent-stats expanded card"
```

---

## Task 13: UI — `UpdateRequestBanner` on lead detail

**Files:**
- Create: `src/components/UpdateRequestBanner.tsx`
- Modify: `src/app/leads/[id]/page.tsx`

- [ ] **Step 13.1: Implement the banner**

```tsx
'use client'
import { useEffect, useState } from 'react'

interface PendingRequest {
  id: number
  due_date: string
  reason: string | null
  agent_name: string
}

interface Props {
  leadRow: number
}

export default function UpdateRequestBanner({ leadRow }: Props) {
  const [request, setRequest] = useState<PendingRequest | null>(null)

  useEffect(() => {
    fetch(`/api/update-requests/for-lead/${leadRow}`)
      .then(r => r.json())
      .then(d => { if (d.success) setRequest(d.data) })
      .catch(() => {})
  }, [leadRow])

  if (!request) return null

  const isOverdue = request.due_date < new Date().toISOString().slice(0, 10)
  const dueLabel = new Date(request.due_date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div
      className={`rounded-md border p-3 mb-3 ${
        isOverdue
          ? 'bg-danger/10 border-danger/40 text-danger'
          : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
      }`}
    >
      <div className="text-xs font-semibold">
        🟡 Sales Head requested an update on this lead — due {dueLabel}{isOverdue ? ' (OVERDUE)' : ''}.
      </div>
      {request.reason && (
        <div className="text-[11px] italic mt-1 text-current/80">"{request.reason}"</div>
      )}
      <div className="text-[10px] mt-1.5 text-current/70">
        Add a note below to answer this request.
      </div>
    </div>
  )
}
```

- [ ] **Step 13.2: Mount above the Lead Notes section**

Open `src/app/leads/[id]/page.tsx`. Find the `LeadNotes` component usage (search for `<LeadNotes`). Add the banner right above it.

Add import:
```tsx
import UpdateRequestBanner from '@/components/UpdateRequestBanner'
```

Just above the `<LeadNotes phone={lead.phone} />` (or whichever line mounts it):
```tsx
<UpdateRequestBanner leadRow={lead.row_number} />
```

- [ ] **Step 13.3: Browser test**

In dev, create a pending update request for an agent on a specific lead (via curl from Task 7). Log in as that agent. Open the lead's detail page. Banner should appear with due date + reason. Add a note ≥ 5 chars. Refresh page. Banner gone (request now ANSWERED).

Verify DB: `SELECT status, answer_note_id FROM update_requests WHERE id = N;` shows `ANSWERED` with the new note's id.

- [ ] **Step 13.4: Commit**

```bash
git add src/components/UpdateRequestBanner.tsx src/app/leads/[id]/page.tsx
git commit -m "feat(ui): UpdateRequestBanner on lead detail + answer-on-note flow"
```

---

## Task 14: UI — `UpdateRequestWidget` on dashboard

**Files:**
- Create: `src/components/UpdateRequestWidget.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 14.1: Implement the widget**

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface PendingRequest {
  id: number
  lead_row: number
  lead_name: string
  lead_city: string
  due_date: string
  reason: string | null
  overdue: boolean
}

function dueLabel(d: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)
  if (d === today) return 'TODAY'
  if (d === tomorrowStr) return 'Tomorrow'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function UpdateRequestWidget() {
  const [requests, setRequests] = useState<PendingRequest[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/update-requests/mine')
      .then(r => r.json())
      .then(d => { if (d.success) setRequests(d.data) })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  if (!loaded || requests.length === 0) return null

  const anyOverdue = requests.some(r => r.overdue)
  return (
    <div className={`rounded-lg border p-4 mb-4 ${
      anyOverdue ? 'border-danger/60' : 'border-amber-500/40'
    } bg-card`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-text">
          🔔 Updates Requested by Sales Head <span className="text-dim text-xs ml-1">({requests.length} pending)</span>
        </h2>
      </div>
      <div className="space-y-1">
        {requests.map(r => (
          <Link
            key={r.id}
            href={`/leads/${r.lead_row}`}
            className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-elevated transition-colors"
          >
            <span className="text-xs text-text truncate">
              • {r.lead_name}{r.lead_city ? ` (${r.lead_city})` : ''}
            </span>
            <span className={`text-[10px] font-medium ${r.overdue ? 'text-danger' : 'text-amber-400'}`}>
              due {dueLabel(r.due_date)} →
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 14.2: Mount at the top of `/dashboard`**

Open `src/app/dashboard/page.tsx`. Add import:
```tsx
import UpdateRequestWidget from '@/components/UpdateRequestWidget'
```

Find the main content container (search for the first `<main>` or top-level `<div>` after Navbar) and insert the widget as the very first child of that container:
```tsx
<UpdateRequestWidget />
```

- [ ] **Step 14.3: Browser test**

Log in as an agent with pending requests. Visit `/dashboard`. Widget appears at the top with all pending requests. Click any row → navigates to that lead's detail page. Verify overdue items show red border on the widget.

- [ ] **Step 14.4: Commit**

```bash
git add src/components/UpdateRequestWidget.tsx src/app/dashboard/page.tsx
git commit -m "feat(ui): UpdateRequestWidget on agent dashboard"
```

---

## Task 15: UI — Admin page `/admin/update-requests` with 4 tabs

**Files:**
- Create: `src/app/admin/update-requests/page.tsx`

- [ ] **Step 15.1: Implement the page**

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'

interface Request {
  id: number
  lead_row: number
  agent_id: string
  agent_name: string
  reason: string | null
  due_date: string
  status: 'PENDING' | 'ANSWERED' | 'CANCELLED'
  created_at: string
  answered_at: string | null
  cancelled_at: string | null
}

type Tab = 'pending' | 'overdue' | 'answered' | 'cancelled'

export default function AdminUpdateRequestsPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const [rows, setRows] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    let qs = ''
    if (tab === 'pending') qs = '?status=PENDING'
    else if (tab === 'overdue') qs = '?overdue=true'
    else if (tab === 'answered') qs = '?status=ANSWERED'
    else if (tab === 'cancelled') qs = '?status=CANCELLED'

    const res = await fetch(`/api/update-requests${qs}`)
    const data = await res.json()
    if (data.success) setRows(data.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [tab])

  async function cancel(id: number) {
    if (!confirm('Cancel this update request?')) return
    const res = await fetch(`/api/update-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED' }),
    })
    const data = await res.json()
    if (data.success) load()
    else alert(data.error || 'Failed')
  }

  const today = new Date().toISOString().slice(0, 10)
  function daysFrom(d: string): string {
    const diff = Math.floor((new Date(today).getTime() - new Date(d).getTime()) / 86400000)
    if (diff === 0) return 'today'
    if (diff > 0) return `${diff}d ago`
    return `in ${-diff}d`
  }

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-4">
        <h1 className="text-lg font-bold text-text mb-3">Update Requests</h1>

        <div className="flex gap-1 mb-4 border-b border-border">
          {(['pending', 'overdue', 'answered', 'cancelled'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 ${
                tab === t ? 'border-accent text-accent' : 'border-transparent text-dim hover:text-text'
              }`}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-xs text-dim text-center py-8">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-xs text-dim text-center py-8">No requests in this view.</div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-elevated text-dim">
                <tr>
                  <th className="text-left px-3 py-2">Agent</th>
                  <th className="text-left px-3 py-2">Lead</th>
                  <th className="text-left px-3 py-2">Due</th>
                  <th className="text-left px-3 py-2">Reason</th>
                  <th className="text-right px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-border/40 hover:bg-elevated/40">
                    <td className="px-3 py-2 text-text">{r.agent_name}</td>
                    <td className="px-3 py-2">
                      <Link href={`/leads/${r.lead_row}`} className="text-accent hover:underline">
                        #{r.lead_row}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {r.due_date} <span className="text-dim">({daysFrom(r.due_date)})</span>
                    </td>
                    <td className="px-3 py-2 text-muted truncate max-w-xs">{r.reason || '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {r.status === 'PENDING' && (
                        <button onClick={() => cancel(r.id)} className="text-dim hover:text-danger">
                          Cancel
                        </button>
                      )}
                      {r.status === 'ANSWERED' && (
                        <span className="text-success text-[10px]">Answered {r.answered_at?.slice(0, 10)}</span>
                      )}
                      {r.status === 'CANCELLED' && (
                        <span className="text-dim text-[10px]">Cancelled {r.cancelled_at?.slice(0, 10)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 15.2: Browser test**

Log in as admin. Visit `/admin/update-requests`. All 4 tabs load. Pending tab shows requests created in Task 7. Click "Cancel" on any pending row → confirms → list refreshes with row gone (and visible in Cancelled tab).

- [ ] **Step 15.3: Commit**

```bash
git add src/app/admin/update-requests/page.tsx
git commit -m "feat(ui): /admin/update-requests page with 4 status tabs"
```

---

## Task 16: UI — `UpdateRequestsBadge` in Navbar

**Files:**
- Create: `src/components/UpdateRequestsBadge.tsx`
- Modify: `src/components/Navbar.tsx`

- [ ] **Step 16.1: Add a `last_seen` settings key**

The badge counts requests answered since admin's last visit to `/admin/update-requests`. Persist the timestamp in the `settings` table (already exists).

Add helper to `src/lib/update-requests.ts`:

```ts
import { getSetting, setSetting } from './db'

const ADMIN_LAST_SEEN_KEY = 'admin.update_requests.last_seen'

export async function getAdminLastSeen(): Promise<string | null> {
  const v = await getSetting(ADMIN_LAST_SEEN_KEY)
  return v || null
}

export async function setAdminLastSeen(ts: string): Promise<void> {
  await setSetting(ADMIN_LAST_SEEN_KEY, ts)
}

export async function countAnsweredSince(ts: string | null): Promise<number> {
  const db = await ensureInit()
  if (!ts) {
    const result = await db.execute({
      sql: `SELECT COUNT(*) as n FROM update_requests WHERE status = 'ANSWERED'`,
    })
    return Number(result.rows[0]?.n ?? 0)
  }
  const result = await db.execute({
    sql: `SELECT COUNT(*) as n FROM update_requests WHERE status = 'ANSWERED' AND answered_at > ?`,
    args: [ts],
  })
  return Number(result.rows[0]?.n ?? 0)
}
```

Confirm `getSetting` and `setSetting` exist in `src/lib/db.ts`. If not, add minimal versions:

```ts
export async function getSetting(key: string): Promise<string | null> {
  const db = await ensureInit()
  const r = await db.execute({ sql: `SELECT value FROM settings WHERE key = ?`, args: [key] })
  return (r.rows[0]?.value as string) || null
}
export async function setSetting(key: string, value: string): Promise<void> {
  const db = await ensureInit()
  await db.execute({
    sql: `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [key, value],
  })
}
```

- [ ] **Step 16.2: Add admin endpoint to mark last-seen**

Create `src/app/api/update-requests/mark-seen/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { setAdminLastSeen, getAdminLastSeen, countAnsweredSince } from '@/lib/update-requests'
import { apiError } from '@/lib/api-error'

export async function GET() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }
    const lastSeen = await getAdminLastSeen()
    const count = await countAnsweredSince(lastSeen)
    return NextResponse.json({ success: true, data: { count } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function POST() {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }
    await setAdminLastSeen(new Date().toISOString())
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
```

- [ ] **Step 16.3: Implement the badge component**

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function UpdateRequestsBadge() {
  const [count, setCount] = useState(0)
  const [role, setRole] = useState('')

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d.success) setRole(d.data.role) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (role !== 'admin') return
    const tick = () => fetch('/api/update-requests/mark-seen')
      .then(r => r.json())
      .then(d => { if (d.success) setCount(d.data.count) })
      .catch(() => {})
    tick()
    const i = setInterval(tick, 60000)
    return () => clearInterval(i)
  }, [role])

  if (role !== 'admin') return null

  return (
    <Link
      href="/admin/update-requests"
      onClick={() => { fetch('/api/update-requests/mark-seen', { method: 'POST' }); setCount(0) }}
      className="relative text-xs text-dim hover:text-text"
    >
      Update Requests
      {count > 0 && (
        <span className="absolute -top-2 -right-3 bg-accent text-bg text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  )
}
```

- [ ] **Step 16.4: Mount in Navbar**

Open `src/components/Navbar.tsx`. Add import:
```tsx
import UpdateRequestsBadge from './UpdateRequestsBadge'
```

Find the nav links section (links to /leads, /inbox, etc.) and add `<UpdateRequestsBadge />` alongside them.

- [ ] **Step 16.5: Browser test**

As an agent, answer a pending request (add a qualifying note). Switch to admin session. Navbar shows badge with count ≥ 1. Click → page opens, badge resets to 0. Refresh: badge stays 0. Have agent answer another → badge increments after a minute (or page reload).

- [ ] **Step 16.6: Commit**

```bash
git add src/components/UpdateRequestsBadge.tsx src/components/Navbar.tsx src/app/api/update-requests/mark-seen/route.ts src/lib/update-requests.ts src/lib/db.ts
git commit -m "feat(ui): admin navbar badge for newly-answered update requests"
```

---

## Task 17: End-to-end smoke test + deploy

**No new files. Validation only.**

- [ ] **Step 17.1: Full flow check on localhost**

1. Admin → `/agent-stats` → expand "Happy" → "Request updates from Happy".
2. Modal opens, roster loads, select 3 leads, due date = today + 2, reason = "test e2e".
3. Send. Toast confirms 3 sent.
4. Log out / log in as Happy.
5. `/dashboard` → widget shows 3 pending items.
6. Click one → lead detail page opens → banner visible above Notes.
7. Add note: "Spoke today, will follow up Friday."
8. Reload → banner gone.
9. Repeat 6-8 for the other two.
10. Log out / log in as admin.
11. Navbar badge shows "3".
12. Click → `/admin/update-requests` → Answered tab has 3 rows.
13. Badge resets to 0.

If any step fails, fix before deploy.

- [ ] **Step 17.2: TypeScript + tests pass**

```bash
npm test
npx tsc --noEmit
```

Expected: all tests pass, zero TS errors.

- [ ] **Step 17.3: Push to master + deploy**

```bash
git push origin master
# Wait for GitHub Actions to build the new image
gh run watch --exit-status
# SSH deploy
ssh -i ~/.ssh/hostinger_vps root@srv1461512.hstgr.cloud "cd /docker/saleshub && docker compose -p saleshub up -d --pull always"
```

(Per the user's CLAUDE.md, the deploy step requires explicit user authorization — ask before running.)

- [ ] **Step 17.4: Post-deploy smoke test on production**

Repeat the relevant pieces of Step 17.1 against `sales.tbwxpress.com` to confirm production behaviour matches dev.

---

## Out of scope reminders

These are explicitly NOT in this plan — they are documented in the spec as "v2 candidates":

- Recurring update requests.
- WhatsApp notifications to agents.
- Email digest to admin.
- Auto-generated requests for stale leads.
- Telecaller-scoped requests.
- Bulk import from CSV.

If any of these come up during implementation, stop and discuss before adding scope.

---

## Self-review (post-write)

- ✅ All spec sections have at least one task (data model → 1, helpers → 2-5, API → 7-10, UI → 11-15, notifications → 16, e2e → 17).
- ✅ No "TBD" / "TODO" / "similar to" placeholders.
- ✅ Type names consistent: `UpdateRequest`, `UpdateRequestStatus`, field names match SQL columns throughout.
- ✅ Auto-answer detection: spec says 5+ chars, plan enforces it in code.
- ✅ Permissions enforced server-side in every API route (admin gate explicit on /api/update-requests, /api/update-requests/[id], /admin/* endpoints; agent gate via session.id for /mine and /for-lead).
- ✅ Frequent commits — one per task (17 commits total).
