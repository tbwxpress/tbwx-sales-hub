# TBWX Sales Hub MCP Server

A small, self-contained [MCP](https://modelcontextprotocol.io) server that exposes the
**TBWX Sales Hub** CRM (leads pipeline + WhatsApp inbox) to Claude (Desktop / Code)
and n8n. It lets an agent **query** the CRM and make a few **safe, audited updates** —
without going through the Next.js app.

It connects **directly to the same libsql/Turso SQLite database** the Sales Hub app uses,
reusing the app's env var names, phone normalization, and write/audit SQL patterns so it
never diverges from the app's data conventions.

- **Transport:** stdio
- **Validation:** [zod](https://zod.dev)
- **DB client:** `@libsql/client` (same as the app)
- **Backend only** — does not touch or depend on the Next.js app's source.

> **Safety:** No deletes. No bulk operations. The only writes are appending a note,
> changing a single lead's status (validated against the pipeline, fully audited), and
> creating a single follow-up task. Every write is attributed to the configured actor.

---

## Tools

### Read (safe)

| Tool | Signature | Returns |
|------|-----------|---------|
| `search_leads` | `(name?, phone?, city?, status?, priority?, limit=25, offset=0)` | Matching leads (key fields) + `total` + `hasMore` |
| `get_lead` | `(row_number? \| phone?)` | Full lead profile + recent notes + recent status changes + message count |
| `get_conversation` | `(phone, limit=30)` | Recent WhatsApp messages for a phone, oldest→newest |
| `list_recent_messages` | `(limit=20)` | Latest inbound messages across all leads, newest first |
| `lead_stats` | `()` | Totals, counts by status & priority, conversions, conversion rate, new-today |
| `list_pipeline_stages` | `(include_inactive=false)` | Pipeline stages from `pipeline_stages` (their `key` is the valid `new_status`) |

### Write (limited, safe, audited)

| Tool | Signature | Effect |
|------|-----------|--------|
| `add_lead_note` | `(phone, text)` | Inserts one row into `lead_notes` (attributed + timestamped) |
| `update_lead_status` | `(row_number? \| phone?, new_status)` | Validates `new_status` against `pipeline_stages.key`, updates the lead, writes a `lead_status_changes` audit row with `source = 'mcp'` |
| `create_task` | `(phone?, title, due_at)` | Inserts one follow-up task into `tasks` |

Phone numbers are accepted in any format and normalized to the app's canonical
`91XXXXXXXXXX` form (and matched on the last 10 digits for lookups).

---

## Required environment variables

These are the **same names the Sales Hub app uses**, so a shared `.env` works for both.
See `.env.example`.

| Var | Required | Description |
|-----|----------|-------------|
| `TURSO_DATABASE_URL` | Recommended | libsql/Turso URL (`libsql://…`) in prod, or a `file:` URL locally. Falls back to `file:data/inbox.db` if unset (same default as the app). |
| `TURSO_AUTH_TOKEN` | For remote DBs | Turso auth token. Leave blank for a local `file:` database. |
| `MCP_ACTOR` | Optional | Label stamped on audited writes (`created_by` / `changed_by`). Defaults to `MCP`. e.g. `Claude (n8n)`. |

---

## Install, build & run

```bash
cd mcp-server
cp .env.example .env      # then fill in TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
npm install
npm run build             # compiles src/ -> dist/ (tsc)
npm start                 # runs dist/index.js over stdio
```

Useful scripts:

- `npm run typecheck` — `tsc --noEmit` (no emit, just verify types)
- `npm run dev` — `tsc --watch`
- `npm run build` — compile to `dist/`
- `npm start` — run the compiled server

MCP clients normally launch the server themselves (see registration below); you rarely
run `npm start` by hand except to smoke-test.

---

## Register with an MCP client

The server reads `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` from the environment, so pass
them in the `env` block of the registration. Use absolute paths.

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "tbwx-saleshub": {
      "command": "node",
      "args": [
        "C:/Users/gavis/Documents/ClaudeTBWX/TBWX/tbwx-sales-hub/mcp-server/dist/index.js"
      ],
      "env": {
        "TURSO_DATABASE_URL": "libsql://your-db-name.turso.io",
        "TURSO_AUTH_TOKEN": "your-turso-auth-token",
        "MCP_ACTOR": "Claude (Desktop)"
      }
    }
  }
}
```

### Claude Code (`.mcp.json` / `claude mcp add` JSON)

```json
{
  "mcpServers": {
    "tbwx-saleshub": {
      "command": "node",
      "args": [
        "C:/Users/gavis/Documents/ClaudeTBWX/TBWX/tbwx-sales-hub/mcp-server/dist/index.js"
      ],
      "env": {
        "TURSO_DATABASE_URL": "libsql://your-db-name.turso.io",
        "TURSO_AUTH_TOKEN": "your-turso-auth-token",
        "MCP_ACTOR": "Claude (Code)"
      }
    }
  }
}
```

> Run `npm run build` first — the registration points at the compiled `dist/index.js`.
> For a **local file DB**, set `TURSO_DATABASE_URL` to a `file:` URL (absolute path
> recommended, e.g. `file:C:/Users/gavis/Documents/ClaudeTBWX/TBWX/tbwx-sales-hub/data/inbox.db`)
> and omit `TURSO_AUTH_TOKEN`.

### n8n (MCP Client node)

Point the n8n **MCP Client** node at a Command/stdio connection with:

- **Command:** `node`
- **Arguments:** `C:/Users/gavis/Documents/ClaudeTBWX/TBWX/tbwx-sales-hub/mcp-server/dist/index.js`
- **Environment:** `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `MCP_ACTOR`

---

## How it stays consistent with the app

- **Same DB & env vars** — `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` (`src/lib/db.ts`).
- **Same phone normalization** — `91` + last 10 digits (`normalizePhone`).
- **Same write patterns** — `lead_notes` insert mirrors `insertNote`; the status update
  mirrors the app's PATCH flow (`dbUpdateLeadFields` + `insertStatusChange`) and stamps
  `source = 'mcp'`; `create_task` mirrors `insertTask`.
- **Schema is owned by the app** — this server never creates or migrates tables; it only
  reads existing tables and performs the three additive, audited writes above.
```
