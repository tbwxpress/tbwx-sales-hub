# TBWX Sales Hub — sales.tbwxpress.com

## Stack
- Next.js 16 (App Router) + Tailwind CSS 4
- SQLite (local) / Turso (production) for messages, contacts, tasks
- Google Sheets for leads data + sent messages + quick replies
- Docker on VPS (srv1461512.hstgr.cloud) via GHCR + Traefik
- Port 3458 local dev

## Deploy Process
1. `git push origin master` → GitHub Actions builds Docker image → pushes to GHCR
2. SSH into VPS → `cd /docker/saleshub && docker compose -p saleshub up -d --pull always`

## Key Paths
- Leads API: `src/app/api/leads/route.ts`
- Sheets layer: `src/lib/sheets.ts` (reads from Google Sheets)
- DB layer: `src/lib/db.ts` (SQLite/Turso for messages, tasks)
- Auth: `src/lib/auth.ts` (JWT + bcryptjs)
- Config: `src/config/client.ts` (column mappings, statuses, brand)
- Theme: `src/styles/theme.css` + `src/app/globals.css`

## Theme
- Dark luxe: bg `#1a1209`, card `#241a0e`, accent `#f5c518`
- Text colors: `--color-text` (#faf5eb), `--color-body` (#e8dcc8), `--color-muted` (#d9c9a8), `--color-dim` (#b8a088)
- IMPORTANT: shadcn variables in globals.css must NOT override TBWX theme vars (--color-card, --color-muted, --color-accent, --color-border are owned by theme.css)

## Leads System
- Leads sourced from Google Sheet tab `AI Campaign Leads`
- Column mapping in `src/config/client.ts` (LEAD_COLUMN_MAP)
- Agent role filtering: agents see only their assigned leads + unassigned (if can_assign)
- Lead scoring: `src/lib/scoring.ts`

## WhatsApp
- Cloud API (NOT Business App)
- Templates: franchise_lead_welcome_v3, sales_lead_alert, lead_reply_alert
- Auto-send cron: `src/app/api/cron/auto-send/route.ts`

## Rules
- Test on localhost:3458 before deploying
- Always verify build passes before pushing
- Cookie name: `tbwx_session` (production), `saleshub_session` (local)
