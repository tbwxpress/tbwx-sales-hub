import fs from 'fs'
import path from 'path'
import { createClient, type Client, type Row } from '@libsql/client'
import type { Delegation, PaymentFollowup, PaymentFollowupUpdate, PaymentFollowupStatus } from './types'
import type { SavedViewFilters, SavedView } from '@/lib/stages'
import { LEAD_STATUSES, STATUS_LABELS, STATUS_COLORS } from '@/config/client'
import { isNegativeReply } from '@/lib/negative-replies'

// Convert BigInt values to Number so JSON.stringify works
function serializeRow(row: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(row)) {
    out[key] = typeof val === 'bigint' ? Number(val) : val
  }
  return out
}

export function serializeRows(rows: Row[]) {
  return rows.map(serializeRow)
}

// In production, use TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
// Locally, falls back to a file-based SQLite database
const dbUrl = process.env.TURSO_DATABASE_URL || 'file:data/inbox.db'
const authToken = process.env.TURSO_AUTH_TOKEN || undefined

let _db: Client | null = null
let _initialized = false

function getClient(): Client {
  if (!_db) {
    // Ensure data directory exists for local file mode
    if (dbUrl.startsWith('file:')) {
      const filePath = dbUrl.replace('file:', '')
      const dir = path.dirname(path.resolve(process.cwd(), filePath))
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    }

    _db = createClient({
      url: dbUrl,
      authToken,
    })
  }
  return _db
}

export async function ensureInit(): Promise<Client> {
  const db = getClient()
  if (!_initialized) {
    await db.executeMultiple(`
      CREATE TABLE IF NOT EXISTS contacts (
        phone TEXT PRIMARY KEY,
        name TEXT DEFAULT '',
        is_lead INTEGER DEFAULT 0,
        lead_row INTEGER,
        lead_id TEXT,
        city TEXT DEFAULT '',
        avatar_color TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('sent', 'received')),
        text TEXT NOT NULL DEFAULT '',
        timestamp TEXT NOT NULL,
        sent_by TEXT DEFAULT '',
        wa_message_id TEXT DEFAULT '',
        status TEXT DEFAULT '',
        template_used TEXT DEFAULT '',
        read INTEGER DEFAULT 0,
        media_type TEXT DEFAULT '',
        media_id TEXT DEFAULT '',
        media_mime TEXT DEFAULT '',
        media_filename TEXT DEFAULT '',
        media_path TEXT DEFAULT '',
        FOREIGN KEY (phone) REFERENCES contacts(phone) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(wa_message_id);

      CREATE TABLE IF NOT EXISTS call_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        duration TEXT DEFAULT '',
        outcome TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        logged_by TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (phone) REFERENCES contacts(phone) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_call_logs_phone ON call_logs(phone);

      CREATE TABLE IF NOT EXISTS lead_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_by TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (phone) REFERENCES contacts(phone) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_lead_notes_phone ON lead_notes(phone);

      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT,
        title TEXT NOT NULL DEFAULT '',
        due_at TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        completed_at TEXT,
        created_by TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (phone) REFERENCES contacts(phone) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_phone ON tasks(phone);

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'agent' CHECK(role IN ('admin', 'agent')),
        can_assign INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

      CREATE TABLE IF NOT EXISTS drip_state (
        phone TEXT PRIMARY KEY,
        sequence TEXT NOT NULL DEFAULT '',
        current_step INTEGER DEFAULT 0,
        last_sent_at TEXT,
        enabled INTEGER DEFAULT 1,
        paused_at TEXT,
        pause_reason TEXT,
        opted_out INTEGER DEFAULT 0,
        opted_out_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_drip_phone ON drip_state(phone);

      CREATE TABLE IF NOT EXISTS drip_sequences (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        priority_band TEXT NOT NULL CHECK(priority_band IN ('HOT','WARM','COLD')),
        steps TEXT NOT NULL DEFAULT '[]',
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS assignment_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_row INTEGER NOT NULL,
        phone TEXT DEFAULT '',
        from_agent TEXT DEFAULT '',
        to_agent TEXT DEFAULT '',
        assigned_by TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_assignment_log_row ON assignment_log(lead_row);
      CREATE INDEX IF NOT EXISTS idx_assignment_log_phone ON assignment_log(phone);

      CREATE TABLE IF NOT EXISTS voice_agent_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        lead_id TEXT DEFAULT '',
        call_sid TEXT DEFAULT '',
        status TEXT DEFAULT 'initiated',
        duration_seconds INTEGER DEFAULT 0,
        interest_level TEXT DEFAULT '',
        preferred_city TEXT DEFAULT '',
        callback_time TEXT DEFAULT '',
        questions TEXT DEFAULT '',
        summary TEXT DEFAULT '',
        transcript TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (phone) REFERENCES contacts(phone) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_voice_calls_phone ON voice_agent_calls(phone);
      CREATE INDEX IF NOT EXISTS idx_voice_calls_sid ON voice_agent_calls(call_sid);

      CREATE TABLE IF NOT EXISTS sla_metrics (
        phone TEXT PRIMARY KEY,
        lead_created_at TEXT,
        first_response_at TEXT,
        first_response_seconds INTEGER,
        closed_at TEXT,
        time_to_close_seconds INTEGER,
        closed_status TEXT DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_sla_phone ON sla_metrics(phone);

      CREATE TABLE IF NOT EXISTS meta_ads_snapshots (
        snapshot_type TEXT PRIMARY KEY,
        data TEXT NOT NULL DEFAULT '',
        fetched_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS agreements (
        id TEXT PRIMARY KEY,
        lead_phone TEXT,
        lead_row INTEGER,
        doc_type TEXT NOT NULL CHECK(doc_type IN ('FBA', 'FRANCHISE_AGREEMENT')),
        status TEXT DEFAULT 'DRAFT',
        fields TEXT NOT NULL DEFAULT '{}',
        pdf_data TEXT,
        generated_by TEXT,
        generated_at TEXT,
        reviewed_by TEXT,
        reviewed_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_agreements_phone ON agreements(lead_phone);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS lead_telecaller_assignments (
        lead_row INTEGER PRIMARY KEY,
        telecaller_user_id TEXT NOT NULL,
        assigned_by_user_id TEXT NOT NULL,
        assigned_at TEXT DEFAULT (datetime('now')),
        notes TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_telecaller_assignments_user ON lead_telecaller_assignments(telecaller_user_id);

      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        ref_phone TEXT,
        ref_lead_row INTEGER,
        read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read, created_at DESC);

      CREATE TABLE IF NOT EXISTS lead_status_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_row INTEGER NOT NULL,
        phone TEXT DEFAULT '',
        old_status TEXT DEFAULT '',
        new_status TEXT NOT NULL,
        changed_by TEXT NOT NULL,
        changed_by_id TEXT DEFAULT '',
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_lsc_changed_by_date ON lead_status_changes(changed_by, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_lsc_lead ON lead_status_changes(lead_row);

      CREATE TABLE IF NOT EXISTS meta_capi_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_row INTEGER,
        phone TEXT NOT NULL DEFAULT '',
        event_name TEXT NOT NULL,
        event_id TEXT NOT NULL,
        value REAL DEFAULT 0,
        currency TEXT DEFAULT 'INR',
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed', 'test')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        meta_response TEXT,
        meta_events_received INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        sent_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_meta_capi_events_status ON meta_capi_events(status);
      CREATE INDEX IF NOT EXISTS idx_meta_capi_events_event_id ON meta_capi_events(event_id);
      CREATE INDEX IF NOT EXISTS idx_meta_capi_events_phone ON meta_capi_events(phone);

      CREATE TABLE IF NOT EXISTS commission_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        closer_user_id TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        lead_rows TEXT NOT NULL DEFAULT '[]',
        amount REAL NOT NULL DEFAULT 0,
        paid INTEGER NOT NULL DEFAULT 0,
        paid_at TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_commission_payments_closer ON commission_payments(closer_user_id, paid);

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        last_used_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

      CREATE TABLE IF NOT EXISTS lead_edits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_row INTEGER NOT NULL,
        phone TEXT DEFAULT '',
        field_name TEXT NOT NULL,
        old_value TEXT DEFAULT '',
        new_value TEXT DEFAULT '',
        changed_by TEXT NOT NULL,
        changed_by_id TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_lead_edits_row ON lead_edits(lead_row);
      CREATE INDEX IF NOT EXISTS idx_lead_edits_changed_by_date ON lead_edits(changed_by, created_at DESC);

      CREATE TABLE IF NOT EXISTS lead_delegations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_row INTEGER NOT NULL,
        phone TEXT DEFAULT '',
        from_agent_id TEXT NOT NULL,
        from_agent_name TEXT NOT NULL,
        to_agent_id TEXT NOT NULL,
        to_agent_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        message TEXT DEFAULT '',
        expires_at TEXT DEFAULT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        responded_at TEXT DEFAULT NULL,
        ended_at TEXT DEFAULT NULL,
        ended_by TEXT DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_delegations_to_status ON lead_delegations(to_agent_id, status);
      CREATE INDEX IF NOT EXISTS idx_delegations_lead_status ON lead_delegations(lead_row, status);
      CREATE INDEX IF NOT EXISTS idx_delegations_expires ON lead_delegations(expires_at) WHERE status='active';

      CREATE TABLE IF NOT EXISTS payment_followups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_row INTEGER DEFAULT NULL,
        phone TEXT DEFAULT '',
        franchise_name TEXT NOT NULL,
        amount REAL DEFAULT 0,
        currency TEXT DEFAULT '₹',
        due_date TEXT DEFAULT NULL,
        assigned_to_id TEXT NOT NULL,
        assigned_to_name TEXT NOT NULL,
        created_by_id TEXT NOT NULL,
        created_by_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        reason TEXT DEFAULT '',
        cleared_at TEXT DEFAULT NULL,
        cleared_by_id TEXT DEFAULT '',
        cleared_amount REAL DEFAULT 0,
        notes TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_pf_assigned_status ON payment_followups(assigned_to_id, status);
      CREATE INDEX IF NOT EXISTS idx_pf_status_due ON payment_followups(status, due_date);
      CREATE INDEX IF NOT EXISTS idx_pf_lead ON payment_followups(lead_row);

      CREATE TABLE IF NOT EXISTS payment_followup_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        followup_id INTEGER NOT NULL,
        old_status TEXT DEFAULT '',
        new_status TEXT NOT NULL,
        reason TEXT DEFAULT '',
        amount_change REAL DEFAULT 0,
        note TEXT DEFAULT '',
        updated_by_id TEXT NOT NULL,
        updated_by_name TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (followup_id) REFERENCES payment_followups(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_pfu_followup ON payment_followup_updates(followup_id, created_at);

      -- Leads system of record. Mirrors the Google Sheet (which is now intake-only):
      -- new rows are synced IN from the sheet; agent edits are written here first and
      -- mirrored back to the sheet as a backup. row_number is the sheet row and the
      -- shared key used by lead_telecaller_assignments / lead_status_changes / etc.
      CREATE TABLE IF NOT EXISTS leads (
        row_number INTEGER PRIMARY KEY,
        id TEXT DEFAULT '',
        created_time TEXT DEFAULT '',
        campaign_name TEXT DEFAULT '',
        full_name TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        city TEXT DEFAULT '',
        state TEXT DEFAULT '',
        model_interest TEXT DEFAULT '',
        experience TEXT DEFAULT '',
        timeline TEXT DEFAULT '',
        platform TEXT DEFAULT '',
        lead_status TEXT DEFAULT 'NEW',
        attempted_contact TEXT DEFAULT '',
        first_call_date TEXT DEFAULT '',
        wa_message_id TEXT DEFAULT '',
        lead_priority TEXT DEFAULT '',
        assigned_to TEXT DEFAULT '',
        next_followup TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(lead_status);
      CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);

      -- Pipeline stages: the editable funnel definition. Seeded (once) from the
      -- LEAD_STATUSES constants in config/client.ts. The key column equals the
      -- lead_status string stored on every lead and is IMMUTABLE — labels/colors
      -- can change, the key never does.
      CREATE TABLE IF NOT EXISTS pipeline_stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL,
        color TEXT,
        sort_order INTEGER,
        is_active INTEGER DEFAULT 1,
        is_won INTEGER DEFAULT 0,
        is_lost INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_pipeline_stages_sort ON pipeline_stages(sort_order);

      -- Saved views: per-user (or shared) snapshots of the /leads filter state.
      CREATE TABLE IF NOT EXISTS saved_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        scope TEXT DEFAULT 'private',
        filters TEXT,
        is_default INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_saved_views_owner ON saved_views(owner_user_id);
      CREATE INDEX IF NOT EXISTS idx_saved_views_scope ON saved_views(scope);

      -- Lead comments: threaded discussion on a lead, keyed by lead row_number.
      -- mentions is a JSON array of mentioned user ids; each mention also spawns a
      -- row in the notifications table (type 'mention').
      CREATE TABLE IF NOT EXISTS lead_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_row INTEGER NOT NULL,
        author_id TEXT,
        author_name TEXT,
        body TEXT NOT NULL,
        mentions TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_lead_comments_lead ON lead_comments(lead_row, created_at);

      -- Favorites: per-user starred leads or saved views.
      -- kind = 'lead' (ref = lead_row as string) | 'view' (ref = saved_view id).
      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        ref TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, kind, ref)
      );
      CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

      -- Per-user table column preferences (order + visibility), one row per
      -- (user, table_key). columns is a JSON array of { key, visible }.
      CREATE TABLE IF NOT EXISTS user_table_prefs (
        user_id TEXT NOT NULL,
        table_key TEXT NOT NULL,
        columns TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY(user_id, table_key)
      );

      -- Duplicate-merge audit trail. One row per merged source lead.
      -- moved is a JSON object { table: count } of child rows reassigned.
      CREATE TABLE IF NOT EXISTS lead_merges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_row INTEGER,
        source_row INTEGER,
        merged_by TEXT,
        moved TEXT,
        merged_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_lead_merges_target ON lead_merges(target_row);
      CREATE INDEX IF NOT EXISTS idx_lead_merges_source ON lead_merges(source_row);

      -- Guided Work Mode (additive, reversible experiment). One row per logged
      -- action an agent takes on the work rail — the single source of truth for
      -- "did the work happen": powers cleared-today / streaks / owner panel.
      -- channel = 'call' | 'whatsapp' | 'template' | 'system'.
      CREATE TABLE IF NOT EXISTS work_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT DEFAULT '',
        user_name TEXT DEFAULT '',
        lead_row INTEGER,
        role TEXT DEFAULT '',
        channel TEXT DEFAULT '',
        action TEXT DEFAULT '',
        outcome TEXT DEFAULT '',
        also_whatsapp INTEGER DEFAULT 0,
        objection TEXT,
        sentiment TEXT,
        connected INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_work_events_user_date ON work_events(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_work_events_lead ON work_events(lead_row);
    `)

    await db.execute(`
      -- "Shouldn't be here?" — Guided-rail ranking feedback. An agent flags that a
      -- card was surfaced wrongly; we record WHY the system showed it (queue_reason
      -- + score + lead_status at flag-time) alongside the agent's reason so the
      -- owner sees the exact mismatch. Never changes the lead or advances the card.
      CREATE TABLE IF NOT EXISTS work_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT DEFAULT '',
        user_name TEXT DEFAULT '',
        lead_row INTEGER,
        role TEXT DEFAULT '',
        reason_code TEXT DEFAULT '',
        note TEXT DEFAULT '',
        queue_reason TEXT DEFAULT '',
        score INTEGER,
        lead_status TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_work_feedback_date ON work_feedback(created_at);
    `)

    await db.execute(`
      -- Sales-AI: the LATEST structured signals per lead (a projection updated by
      -- BOTH Guided-mode outcomes AND Free-mode lead edits) — the shared brain so
      -- a senior rep on Free mode and a novice on Guided mode feed the same scorer.
      CREATE TABLE IF NOT EXISTS lead_signals (
        lead_row INTEGER PRIMARY KEY,
        objection TEXT,
        sentiment TEXT,
        capital_readiness TEXT,
        decision_maker TEXT,
        buyer_persona TEXT,
        next_step TEXT,
        connected_ever INTEGER DEFAULT 0,
        updated_by TEXT DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `)

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

    // Recorded telecalling calls. One row per click-to-call bridge: a telecaller
    // is rung, connected to the lead, and the conversation is recorded by the
    // telephony provider (Twilio today, TeleCMI/Exotel later). When the recording
    // lands, Gemini transcribes + scores it and we store the report_card JSON.
    // status: initiated → ringing/in-progress → completed (scored) |
    //         recorded_unscored (audio saved, scoring failed) | failed/no_answer/busy.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS call_recordings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_row INTEGER,
        lead_phone TEXT NOT NULL DEFAULT '',
        lead_name TEXT DEFAULT '',
        agent_name TEXT DEFAULT '',
        agent_phone TEXT DEFAULT '',
        ref TEXT DEFAULT '',
        call_sid TEXT DEFAULT '',
        recording_sid TEXT DEFAULT '',
        recording_url TEXT DEFAULT '',
        duration_seconds INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'initiated',
        transcript TEXT DEFAULT '',
        report_card TEXT DEFAULT '',
        overall_score REAL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_call_recordings_phone ON call_recordings(lead_phone)`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_call_recordings_sid ON call_recordings(call_sid)`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_call_recordings_created ON call_recordings(created_at DESC)`)

    // Additive migrations (try-catch for existing DBs)
    try { await db.execute('ALTER TABLE drip_state ADD COLUMN resumed_at TEXT') } catch { /* column may already exist */ }
    try { await db.execute('ALTER TABLE drip_state ADD COLUMN opted_out INTEGER DEFAULT 0') } catch { /* column may already exist */ }
    try { await db.execute('ALTER TABLE drip_state ADD COLUMN opted_out_at TEXT') } catch { /* column may already exist */ }
    try { await db.execute("ALTER TABLE messages ADD COLUMN media_type TEXT DEFAULT ''") } catch { /* column may already exist */ }
    try { await db.execute("ALTER TABLE messages ADD COLUMN media_id TEXT DEFAULT ''") } catch { /* column may already exist */ }
    try { await db.execute("ALTER TABLE messages ADD COLUMN media_mime TEXT DEFAULT ''") } catch { /* column may already exist */ }
    try { await db.execute("ALTER TABLE messages ADD COLUMN media_filename TEXT DEFAULT ''") } catch { /* column may already exist */ }
    try { await db.execute("ALTER TABLE messages ADD COLUMN media_path TEXT DEFAULT ''") } catch { /* column may already exist */ }
    try { await db.execute("ALTER TABLE messages ADD COLUMN error_code TEXT DEFAULT ''") } catch { /* column may already exist */ }
    try { await db.execute("ALTER TABLE messages ADD COLUMN error_message TEXT DEFAULT ''") } catch { /* column may already exist */ }
    // Duplicate-merge: target row_number a source lead was merged into (NULL = not merged).
    try { await db.execute('ALTER TABLE leads ADD COLUMN merged_into INTEGER') } catch { /* column may already exist */ }

    // Guided Work Mode (additive). work_mode DEFAULT 'free' is critical — nobody
    // is on the rail until the owner opts them in, so Free mode is unchanged.
    try { await db.execute("ALTER TABLE users ADD COLUMN work_mode TEXT DEFAULT 'free'") } catch { /* column may already exist */ }
    try { await db.execute('ALTER TABLE users ADD COLUMN agent_role TEXT') } catch { /* column may already exist */ }
    try { await db.execute('ALTER TABLE users ADD COLUMN daily_target INTEGER DEFAULT 40') } catch { /* column may already exist */ }

    // Sales-AI structured signals (additive). work_events gets per-touch why/temp;
    // lead_signals (created above) holds the per-lead latest projection.
    try { await db.execute('ALTER TABLE work_events ADD COLUMN objection TEXT') } catch { /* column may already exist */ }
    try { await db.execute('ALTER TABLE work_events ADD COLUMN sentiment TEXT') } catch { /* column may already exist */ }
    try { await db.execute('ALTER TABLE work_events ADD COLUMN connected INTEGER') } catch { /* column may already exist */ }

    // Lost-reason audit: LOST transitions carry a structured reason key so
    // management can answer "why are we losing" without mining free text.
    try { await db.execute('ALTER TABLE lead_status_changes ADD COLUMN reason TEXT DEFAULT \'\'') } catch { /* column may already exist */ }

    // Owner-approved automated follow-ups (DELAYED / CALL_DONE_INTERESTED):
    // each row = one daily ask answered (sent or skipped). Drives dedupe so a
    // lead is never asked twice the same day / re-sent within the cooldown.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS followup_nudges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_row INTEGER NOT NULL,
        phone TEXT DEFAULT '',
        decision TEXT NOT NULL CHECK(decision IN ('sent','skipped','failed')),
        decided_by TEXT DEFAULT '',
        template_used TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)
    try { await db.execute('CREATE INDEX IF NOT EXISTS idx_followup_nudges_lead ON followup_nudges(lead_row, created_at)') } catch { /* non-critical */ }

    // Wait up to 5s for a lock instead of failing with SQLITE_BUSY — matters now that
    // auto-send writes every ~2 min alongside agent activity and the sheet-backup job.
    try { await db.execute('PRAGMA busy_timeout = 5000') } catch { /* non-critical */ }

    // WAL: readers no longer block the writer (and vice-versa). Under concurrent
    // agent load the default rollback journal ('delete') serialized everything
    // behind one lock → app-wide slowness + SQLITE_BUSY write failures. WAL is a
    // persistent property of the file; we set it on every boot so a restore from
    // a non-WAL backup can't silently drop back to the slow mode.
    try { await db.execute('PRAGMA journal_mode = WAL') } catch { /* non-critical */ }

    // Seed pipeline_stages once from the config/client.ts status constants.
    try { await seedPipelineStages(db) } catch (err) { console.error('[seedPipelineStages] non-critical:', err) }

    _initialized = true
  }
  return db
}

// --- Phone normalization ---
// Always store phones as "91XXXXXXXXXX" (12 digits, India country code + 10 digit number)
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const last10 = digits.slice(-10)
  if (last10.length < 10) return digits // can't normalize, return as-is
  return `91${last10}`
}

// --- Contact operations ---

// Ensure a contacts row exists for a normalized phone before inserting into any
// table whose `phone` column FK-references contacts(phone) — lead_notes,
// call_logs, messages. Leads created outside the messaging flow (Google-Sheet
// sync, manual/bulk add) may have no contact row yet, so a note/call/message
// insert on them bounces with SQLITE_CONSTRAINT_FOREIGNKEY. This stubs a
// contact from the matching lead record (best-effort). No-op if one exists.
async function ensureContactExists(normPhone: string): Promise<void> {
  const db = await ensureInit()
  const existing = await db.execute({ sql: 'SELECT 1 FROM contacts WHERE phone = ?', args: [normPhone] })
  if (existing.rows.length > 0) return
  const leadRes = await db.execute({
    sql: `SELECT row_number, id, full_name, city FROM leads WHERE substr(replace(phone, '+', ''), -10) = substr(?, -10) LIMIT 1`,
    args: [normPhone],
  })
  const l = leadRes.rows[0]
  await db.execute({
    sql: 'INSERT OR IGNORE INTO contacts (phone, name, is_lead, lead_row, lead_id, city) VALUES (?, ?, ?, ?, ?, ?)',
    args: [
      normPhone,
      l ? String(l.full_name || '') : '',
      l ? 1 : 0,
      l ? Number(l.row_number) : null,
      l ? String(l.id || '') : null,
      l ? String(l.city || '') : '',
    ],
  })
}

export async function upsertContact(phone: string, data: {
  name?: string
  is_lead?: boolean
  lead_row?: number
  lead_id?: string
  city?: string
}) {
  const db = await ensureInit()
  phone = normalizePhone(phone)
  const existing = await db.execute({ sql: 'SELECT * FROM contacts WHERE phone = ?', args: [phone] })

  if (existing.rows.length > 0) {
    const updates: string[] = []
    const values: (string | number | null)[] = []
    if (data.name) { updates.push('name = ?'); values.push(data.name) }
    if (data.is_lead !== undefined) { updates.push('is_lead = ?'); values.push(data.is_lead ? 1 : 0) }
    if (data.lead_row) { updates.push('lead_row = ?'); values.push(data.lead_row) }
    if (data.lead_id) { updates.push('lead_id = ?'); values.push(data.lead_id) }
    if (data.city) { updates.push('city = ?'); values.push(data.city) }
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')")
      values.push(phone)
      await db.execute({ sql: `UPDATE contacts SET ${updates.join(', ')} WHERE phone = ?`, args: values })
    }
  } else {
    const colors = ['#f97316', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#f5c518']
    const color = colors[Math.floor(Math.random() * colors.length)]
    await db.execute({
      sql: `INSERT INTO contacts (phone, name, is_lead, lead_row, lead_id, city, avatar_color)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        phone,
        data.name || '',
        data.is_lead ? 1 : 0,
        data.lead_row || null,
        data.lead_id || '',
        data.city || '',
        color,
      ],
    })
  }
}

// Derive the inbox-triage booleans + normalize the joined lead fields on a
// serialized contact row.
// awaiting_reply: the LAST message in the thread was inbound (the customer
//   messaged last and we haven't replied since) — derived from last_direction.
// negative_hint: awaiting_reply AND that last inbound text reads as a negative
//   reply (powers the inbox "Mark Lost?" suggestion). It NEVER auto-changes
//   a lead's status — it is a hint only.
function withTriageHints(row: Record<string, unknown>): Record<string, unknown> {
  const awaiting_reply = String(row.last_direction ?? '') === 'received'
  const negative_hint = awaiting_reply && isNegativeReply(String(row.last_message ?? ''))
  return {
    ...row,
    lead_status: (row.lead_status ?? null) as string | null,
    lead_priority: (row.lead_priority ?? null) as string | null,
    assigned_to: (row.assigned_to ?? null) as string | null,
    awaiting_reply,
    negative_hint,
  }
}

export async function getContacts() {
  const db = await ensureInit()
  const result = await db.execute(`
    SELECT
      c.*,
      m.text AS last_message,
      m.direction AS last_direction,
      m.timestamp AS last_message_at,
      l.lead_status AS lead_status,
      l.lead_priority AS lead_priority,
      l.assigned_to AS assigned_to,
      (SELECT COUNT(*) FROM messages WHERE phone = c.phone AND read = 0 AND direction = 'received') AS unread_count
    FROM contacts c
    LEFT JOIN messages m ON m.phone = c.phone AND m.timestamp = (
      SELECT MAX(timestamp) FROM messages WHERE phone = c.phone
    )
    LEFT JOIN leads l ON l.row_number = c.lead_row
    ORDER BY (unread_count > 0) DESC, m.timestamp DESC NULLS LAST
  `)
  // Unread (a human is being waited on) pins above everything else — otherwise
  // the auto-send drain (~60 templates/hr) re-tops its own threads and buries
  // every customer reply within minutes.
  return serializeRows(result.rows).map(withTriageHints)
}

// Chunk size kept well under SQLite/libsql's ~999 parameter ceiling.
const PHONE_QUERY_CHUNK = 500

export async function getContactsForAgent(
  assignedPhones: string[],
  opts: { limit?: number; offset?: number } = {}
): Promise<{ contacts: any[]; total: number; hasMore: boolean }> {
  const db = await ensureInit()
  if (assignedPhones.length === 0) return { contacts: [], total: 0, hasMore: false }

  const limit = Math.max(opts.limit ?? 200, 1)
  const offset = Math.max(opts.offset ?? 0, 0)

  const phones10 = Array.from(
    new Set(
      assignedPhones
        .map(p => String(p).replace(/\D/g, '').slice(-10))
        .filter(p => p.length === 10)
    )
  )
  if (phones10.length === 0) return { contacts: [], total: 0, hasMore: false }

  const seen = new Set<string>()
  const merged: any[] = []

  for (let i = 0; i < phones10.length; i += PHONE_QUERY_CHUNK) {
    const batch = phones10.slice(i, i + PHONE_QUERY_CHUNK)
    const conditions = batch.map(() => 'SUBSTR(c.phone, -10) = ?').join(' OR ')
    const result = await db.execute({
      sql: `
        SELECT
          c.*,
          m.text AS last_message,
          m.direction AS last_direction,
          m.timestamp AS last_message_at,
          l.lead_status AS lead_status,
          l.lead_priority AS lead_priority,
          l.assigned_to AS assigned_to,
          (SELECT COUNT(*) FROM messages WHERE phone = c.phone AND read = 0 AND direction = 'received') AS unread_count
        FROM contacts c
        LEFT JOIN messages m ON m.phone = c.phone AND m.timestamp = (
          SELECT MAX(timestamp) FROM messages WHERE phone = c.phone
        )
        LEFT JOIN leads l ON l.row_number = c.lead_row
        WHERE ${conditions}
      `,
      args: batch,
    })
    for (const row of serializeRows(result.rows)) {
      const phoneKey = String(row.phone ?? '')
      if (!seen.has(phoneKey)) {
        seen.add(phoneKey)
        merged.push(withTriageHints(row))
      }
    }
  }

  merged.sort((a, b) => {
    // Unread-first: a thread where the customer is waiting on a human always
    // outranks auto-send churn (which otherwise re-tops its own threads and
    // buries replies). Within each bucket, newest last message first.
    const ua = Number(a.unread_count) > 0 ? 0 : 1
    const ub = Number(b.unread_count) > 0 ? 0 : 1
    if (ua !== ub) return ua - ub
    if (!a.last_message_at && !b.last_message_at) return 0
    if (!a.last_message_at) return 1
    if (!b.last_message_at) return -1
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  })

  const page = merged.slice(offset, offset + limit)
  return { contacts: page, total: merged.length, hasMore: merged.length > offset + limit }
}

export async function getUnreadCountForAgent(assignedPhones: string[]) {
  const db = await ensureInit()
  if (assignedPhones.length === 0) return 0

  const phones10 = Array.from(
    new Set(
      assignedPhones
        .map(p => String(p).replace(/\D/g, '').slice(-10))
        .filter(p => p.length === 10)
    )
  )
  if (phones10.length === 0) return 0

  let total = 0
  for (let i = 0; i < phones10.length; i += PHONE_QUERY_CHUNK) {
    const batch = phones10.slice(i, i + PHONE_QUERY_CHUNK)
    const conditions = batch.map(() => 'SUBSTR(phone, -10) = ?').join(' OR ')
    const result = await db.execute({
      sql: `SELECT COUNT(*) as count FROM messages WHERE read = 0 AND direction = 'received' AND (${conditions})`,
      args: batch,
    })
    total += Number(result.rows[0]?.count ?? 0)
  }
  return total
}

export async function getContact(phone: string) {
  const db = await ensureInit()
  phone = normalizePhone(phone)
  const result = await db.execute({ sql: 'SELECT * FROM contacts WHERE phone = ?', args: [phone] })
  return result.rows[0] ? serializeRow(result.rows[0]) : null
}

// --- Message operations ---

export async function insertMessage(data: {
  phone: string
  direction: 'sent' | 'received'
  text: string
  timestamp: string
  sent_by?: string
  wa_message_id?: string
  status?: string
  template_used?: string
  read?: boolean
  media_type?: string
  media_id?: string
  media_mime?: string
  media_filename?: string
  media_path?: string
}) {
  const db = await ensureInit()
  data.phone = normalizePhone(data.phone)

  // Check for duplicate wa_message_id
  if (data.wa_message_id) {
    const existing = await db.execute({ sql: 'SELECT id FROM messages WHERE wa_message_id = ?', args: [data.wa_message_id] })
    if (existing.rows.length > 0) return null
  }

  const result = await db.execute({
    sql: `INSERT INTO messages
            (phone, direction, text, timestamp, sent_by, wa_message_id, status, template_used, read,
             media_type, media_id, media_mime, media_filename, media_path)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      data.phone,
      data.direction,
      data.text,
      data.timestamp,
      data.sent_by || '',
      data.wa_message_id || '',
      data.status || '',
      data.template_used || '',
      data.read ? 1 : 0,
      data.media_type || '',
      data.media_id || '',
      data.media_mime || '',
      data.media_filename || '',
      data.media_path || '',
    ],
  })

  // Update contact's updated_at
  await db.execute({ sql: "UPDATE contacts SET updated_at = datetime('now') WHERE phone = ?", args: [data.phone] })

  return Number(result.lastInsertRowid)
}

export async function getMessages(phone: string, limit = 100, offset = 0) {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  // Query both normalized and original to catch old data. Take the NEWEST
  // `limit` rows, then re-sort ascending for display — a plain ASC LIMIT kept
  // the oldest N, so long threads silently hid their most recent messages.
  const result = await db.execute({
    sql: `SELECT * FROM (
            SELECT * FROM messages WHERE phone = ? OR phone = ?
            ORDER BY timestamp DESC LIMIT ? OFFSET ?
          ) ORDER BY timestamp ASC`,
    args: [norm, phone, limit, offset],
  })
  return serializeRows(result.rows)
}

export async function markMessagesRead(phone: string) {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  await db.execute({
    sql: "UPDATE messages SET read = 1 WHERE (phone = ? OR phone = ?) AND read = 0 AND direction = 'received'",
    args: [norm, phone],
  })
}

export async function getUnreadCount() {
  const db = await ensureInit()
  const result = await db.execute("SELECT COUNT(*) as count FROM messages WHERE read = 0 AND direction = 'received'")
  return Number(result.rows[0]?.count ?? 0)
}

// --- Owner-approved follow-up nudges ---

// Latest nudge decision per lead_row (for eligibility filtering). Returns a
// map lead_row → { decision, created_at } of the MOST RECENT row per lead.
export async function getLatestNudgeByLead(): Promise<Map<number, { decision: string; created_at: string }>> {
  const db = await ensureInit()
  const r = await db.execute(`
    SELECT n.lead_row, n.decision, n.created_at FROM followup_nudges n
    JOIN (SELECT lead_row, MAX(id) mid FROM followup_nudges GROUP BY lead_row) last
      ON last.lead_row = n.lead_row AND last.mid = n.id
  `)
  const out = new Map<number, { decision: string; created_at: string }>()
  for (const row of r.rows) out.set(Number(row.lead_row), { decision: String(row.decision), created_at: String(row.created_at) })
  return out
}

export async function recordFollowupNudge(data: {
  lead_row: number
  phone: string
  decision: 'sent' | 'skipped' | 'failed'
  decided_by: string
  template_used?: string
}): Promise<void> {
  const db = await ensureInit()
  await db.execute({
    sql: 'INSERT INTO followup_nudges (lead_row, phone, decision, decided_by, template_used) VALUES (?, ?, ?, ?, ?)',
    args: [data.lead_row, normalizePhone(data.phone || ''), data.decision, data.decided_by, data.template_used || ''],
  })
}

// Deck-automation heartbeat for the admin Today page. The July starvation
// outage ran 16 days unnoticed because nothing surfaced "cron fires but sends
// nothing". stale = there IS a NEW backlog but auto-send hasn't moved a lead
// in over 2 hours — the exact starvation signature (an empty backlog with no
// recent sends is fine and NOT stale).
export async function getAutoSendHeartbeat(): Promise<{ last_at: string | null; new_count: number; stale: boolean }> {
  const db = await ensureInit()
  const [lastRes, newRes] = await Promise.all([
    db.execute("SELECT MAX(created_at) AS m FROM lead_status_changes WHERE source = 'auto-send'"),
    db.execute("SELECT COUNT(*) AS n FROM leads WHERE lead_status = 'NEW' AND merged_into IS NULL"),
  ])
  const last_at = lastRes.rows[0]?.m ? String(lastRes.rows[0].m) : null
  const new_count = Number(newRes.rows[0]?.n ?? 0)
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000
  // created_at is sqlite datetime('now') = UTC "YYYY-MM-DD HH:MM:SS".
  const lastMs = last_at ? new Date(last_at.replace(' ', 'T') + 'Z').getTime() : 0
  const stale = new_count > 20 && (!lastMs || Date.now() - lastMs > TWO_HOURS_MS)
  return { last_at, new_count, stale }
}

export async function searchMessages(query: string) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT m.*, c.name as contact_name
          FROM messages m
          JOIN contacts c ON c.phone = m.phone
          WHERE m.text LIKE ? OR c.name LIKE ? OR c.phone LIKE ?
          ORDER BY m.timestamp DESC
          LIMIT 50`,
    args: [`%${query}%`, `%${query}%`, `%${query}%`],
  })
  return serializeRows(result.rows)
}

// Search received/sent messages whose text contains any of the keywords.
// Used by the opt-out backfill to find STOP/unsubscribe replies retroactively.
export async function getMessagesContainingText(
  direction: 'sent' | 'received',
  keywords: string[],
): Promise<Array<{ phone: string; text: string; timestamp: string }>> {
  if (!keywords.length) return []
  const db = await ensureInit()
  const likeClauses = keywords.map(() => 'LOWER(text) LIKE ?').join(' OR ')
  const args: string[] = [direction, ...keywords.map(k => `%${k.toLowerCase()}%`)]
  const result = await db.execute({
    sql: `SELECT phone, text, timestamp FROM messages WHERE direction = ? AND (${likeClauses}) ORDER BY timestamp ASC`,
    args,
  })
  return result.rows.map(r => ({
    phone: String(r.phone || ''),
    text: String(r.text || ''),
    timestamp: String(r.timestamp || ''),
  }))
}

export async function updateMessageStatus(
  waMessageId: string,
  status: string,
  errorCode?: string,
  errorMessage?: string,
) {
  const db = await ensureInit()
  if (errorCode || errorMessage) {
    await db.execute({
      sql: 'UPDATE messages SET status = ?, error_code = ?, error_message = ? WHERE wa_message_id = ?',
      args: [status, errorCode || '', errorMessage || '', waMessageId],
    })
  } else {
    await db.execute({
      sql: 'UPDATE messages SET status = ? WHERE wa_message_id = ?',
      args: [status, waMessageId],
    })
  }
}

/**
 * Get the delivery status of the first automated message for a lead.
 * Checks by wa_message_id first, then falls back to finding the first
 * sent template message for the phone number.
 */
export async function getAutoMessageStatus(waMessageId: string, phone: string): Promise<{
  status: string
  timestamp: string
  template_used: string
  source: 'db_by_id' | 'db_by_phone' | 'not_found'
}> {
  const db = await ensureInit()

  // Try to find by exact wa_message_id
  if (waMessageId) {
    const result = await db.execute({
      sql: 'SELECT status, timestamp, template_used FROM messages WHERE wa_message_id = ? LIMIT 1',
      args: [waMessageId],
    })
    if (result.rows.length > 0) {
      const row = result.rows[0]
      return {
        status: String(row.status || 'sent'),
        timestamp: String(row.timestamp || ''),
        template_used: String(row.template_used || ''),
        source: 'db_by_id',
      }
    }
  }

  // Fallback: find the first sent template message for this phone
  if (phone) {
    const result = await db.execute({
      sql: `SELECT status, timestamp, template_used FROM messages
            WHERE phone LIKE ? AND direction = 'sent' AND template_used != ''
            ORDER BY timestamp ASC LIMIT 1`,
      args: [`%${phone.slice(-10)}`],
    })
    if (result.rows.length > 0) {
      const row = result.rows[0]
      return {
        status: String(row.status || 'sent'),
        timestamp: String(row.timestamp || ''),
        template_used: String(row.template_used || ''),
        source: 'db_by_phone',
      }
    }
  }

  // If wa_message_id exists but not in our DB, it was sent by n8n
  // (n8n sends via its own WhatsApp node, so it won't be in our SQLite)
  if (waMessageId) {
    return {
      status: 'sent',
      timestamp: '',
      template_used: '',
      source: 'not_found',
    }
  }

  return {
    status: 'none',
    timestamp: '',
    template_used: '',
    source: 'not_found',
  }
}

/**
 * Get the delivery status of the first sent template message for all phones.
 * Returns a map of phone -> { status, template_used, timestamp }.
 * Used by dashboard to show WA delivery status for all leads at once.
 */
export async function getBulkAutoMessageStatus(): Promise<
  Record<string, { status: string; template_used: string; timestamp: string }>
> {
  const db = await ensureInit()

  // Get the first (earliest) sent template message per phone
  const result = await db.execute(`
    SELECT m.phone, m.status, m.template_used, m.timestamp
    FROM messages m
    INNER JOIN (
      SELECT phone, MIN(timestamp) as first_ts
      FROM messages
      WHERE direction = 'sent' AND template_used != ''
      GROUP BY phone
    ) first ON m.phone = first.phone AND m.timestamp = first.first_ts
    WHERE m.direction = 'sent' AND m.template_used != ''
  `)

  const map: Record<string, { status: string; template_used: string; timestamp: string }> = {}
  for (const row of result.rows) {
    const phone = String(row.phone || '')
    // Store by last 10 digits for matching with leads
    const key = phone.slice(-10)
    map[key] = {
      status: String(row.status || 'sent'),
      template_used: String(row.template_used || ''),
      timestamp: String(row.timestamp || ''),
    }
  }

  return map
}

// Latest message per phone (one row per phone), keyed by last-10-digits.
// Single GROUP-BY read that replaces per-lead getMessages() N+1 loops (e.g. /api/today).
export async function getLastMessageByPhone(): Promise<Map<string, { direction: string; timestamp: string; text: string }>> {
  try {
    const db = await ensureInit()
    const result = await db.execute(`
      SELECT m.phone, m.direction, m.text, m.timestamp
      FROM messages m
      INNER JOIN (
        SELECT phone, MAX(timestamp) AS last_ts FROM messages GROUP BY phone
      ) last ON m.phone = last.phone AND m.timestamp = last.last_ts
    `)
    const map = new Map<string, { direction: string; timestamp: string; text: string }>()
    for (const row of result.rows) {
      const key = String(row.phone || '').replace(/\D/g, '').slice(-10)
      if (!key) continue
      const candidate = {
        direction: String(row.direction || ''),
        timestamp: String(row.timestamp || ''),
        text: String(row.text || ''),
      }
      const existing = map.get(key)
      if (!existing || candidate.timestamp > existing.timestamp) map.set(key, candidate)
    }
    return map
  } catch (err) {
    console.error('[getLastMessageByPhone] non-critical:', err)
    return new Map()
  }
}

// Last INBOUND (received) message timestamp per phone, keyed by last-10 digits
// (matching getLastMessageByPhone). Lets the closer re-engage bucket spot leads
// that replied at some point even when the agent's later follow-up is now the
// absolute-latest message.
export async function getLastReceivedMessageByPhone(): Promise<Map<string, { last_received_at: string }>> {
  try {
    const db = await ensureInit()
    const result = await db.execute(`
      SELECT phone, MAX(timestamp) AS last_received_at
      FROM messages
      WHERE direction = 'received'
      GROUP BY phone
    `)
    const map = new Map<string, { last_received_at: string }>()
    for (const row of result.rows) {
      const key = String(row.phone || '').replace(/\D/g, '').slice(-10)
      if (!key) continue
      const candidate = { last_received_at: String(row.last_received_at || '') }
      const existing = map.get(key)
      if (!existing || candidate.last_received_at > existing.last_received_at) map.set(key, candidate)
    }
    return map
  } catch (err) {
    console.error('[getLastReceivedMessageByPhone] non-critical:', err)
    return new Map()
  }
}

// --- Call log operations ---

export async function insertCallLog(data: {
  phone: string
  duration?: string
  outcome?: string
  notes?: string
  logged_by?: string
}) {
  const db = await ensureInit()
  data.phone = normalizePhone(data.phone)
  await ensureContactExists(data.phone) // call_logs.phone FK → contacts(phone)
  const result = await db.execute({
    sql: `INSERT INTO call_logs (phone, duration, outcome, notes, logged_by) VALUES (?, ?, ?, ?, ?)`,
    args: [data.phone, data.duration || '', data.outcome || '', data.notes || '', data.logged_by || ''],
  })
  return Number(result.lastInsertRowid)
}

export async function getCallLogs(phone: string) {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  const result = await db.execute({
    sql: 'SELECT * FROM call_logs WHERE phone = ? OR phone = ? ORDER BY created_at DESC',
    args: [norm, phone],
  })
  return serializeRows(result.rows)
}

// --- Recorded call operations (click-to-call + AI scoring) ---

export async function insertCallRecording(data: {
  lead_row?: number | null
  lead_phone: string
  lead_name?: string
  agent_name?: string
  agent_phone?: string
  ref?: string
  call_sid?: string
  status?: string
}): Promise<number> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `INSERT INTO call_recordings
            (lead_row, lead_phone, lead_name, agent_name, agent_phone, ref, call_sid, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      data.lead_row ?? null,
      normalizePhone(data.lead_phone),
      data.lead_name || '',
      data.agent_name || '',
      data.agent_phone || '',
      data.ref || '',
      data.call_sid || '',
      data.status || 'initiated',
    ],
  })
  return Number(result.lastInsertRowid)
}

// Patch a recording row found by its provider call id. Only the provided fields
// are written. Used by the recording-status and call-status webhooks.
export async function updateCallRecordingByCallSid(
  callSid: string,
  fields: {
    recording_sid?: string
    recording_url?: string
    duration_seconds?: number
    status?: string
    transcript?: string
    report_card?: string
    overall_score?: number | null
  }
): Promise<void> {
  if (!callSid) return
  const db = await ensureInit()
  // Whitelist columns so a key can never be interpolated into SQL unsafely.
  const ALLOWED = new Set([
    'recording_sid', 'recording_url', 'duration_seconds',
    'status', 'transcript', 'report_card', 'overall_score',
  ])
  const sets: string[] = []
  const args: (string | number | null)[] = []
  for (const [key, val] of Object.entries(fields)) {
    if (val === undefined || !ALLOWED.has(key)) continue
    sets.push(`${key} = ?`)
    args.push(val as string | number | null)
  }
  if (sets.length === 0) return
  args.push(callSid)
  await db.execute({
    sql: `UPDATE call_recordings SET ${sets.join(', ')} WHERE call_sid = ?`,
    args,
  })
}

export async function getCallRecordingsByPhone(phone: string) {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  const result = await db.execute({
    sql: 'SELECT * FROM call_recordings WHERE lead_phone = ? OR lead_phone = ? ORDER BY created_at DESC',
    args: [norm, phone],
  })
  return serializeRows(result.rows)
}

export async function getCallRecordingById(id: number) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT * FROM call_recordings WHERE id = ?',
    args: [id],
  })
  return result.rows[0] ? serializeRow(result.rows[0]) : null
}

export async function getCallRecordingByCallSid(callSid: string): Promise<Record<string, unknown> | null> {
  if (!callSid) return null
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT * FROM call_recordings WHERE call_sid = ? LIMIT 1',
    args: [callSid],
  })
  return result.rows[0] ? serializeRow(result.rows[0]) : null
}

export async function listRecentCallRecordings(limit = 100) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT * FROM call_recordings ORDER BY created_at DESC LIMIT ?',
    args: [limit],
  })
  return serializeRows(result.rows)
}

// Per-telecaller call-quality roll-up since `sinceSql` (SQLite datetime format,
// 'YYYY-MM-DD HH:MM:SS' — NOT raw ISO, so it string-compares against created_at).
// avg_score / avg_duration are over SCORED calls only; NULL agents → no scored
// calls yet (sorted last by the DESC default NULL ordering).
export async function getTelecallerScorecard(sinceSql: string) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `
      SELECT
        agent_name,
        COUNT(*) AS total_recorded,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS scored,
        AVG(CASE WHEN status = 'completed' THEN overall_score END) AS avg_score,
        AVG(CASE WHEN duration_seconds > 0 THEN duration_seconds END) AS avg_duration,
        SUM(CASE WHEN status = 'completed' AND overall_score < 5 THEN 1 ELSE 0 END) AS low_score,
        MAX(created_at) AS last_call_at
      FROM call_recordings
      WHERE created_at >= ? AND agent_name != ''
      GROUP BY agent_name
      ORDER BY avg_score DESC
    `,
    args: [sinceSql],
  })
  return serializeRows(result.rows)
}

// Recent recordings since `sinceSql`, newest first. Powers the manager QA feed.
export async function listCallRecordingsSince(sinceSql: string, limit = 200) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT * FROM call_recordings WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?',
    args: [sinceSql, limit],
  })
  return serializeRows(result.rows)
}

// --- Last discussion lookup (lead list view) ---
// Returns a Map from normalized phone (91XXXXXXXXXX) to the most recent
// human-curated interaction across notes, calls, and inbound messages.
// Auto-sent templates and system messages are excluded — they're not "discussion."
export interface LastDiscussion {
  source: 'note' | 'call' | 'message_in' | 'message_out'
  text: string
  by: string
  at: string
}
export async function getLastDiscussionByPhone(): Promise<Map<string, LastDiscussion>> {
  try {
    const db = await ensureInit()
    const map = new Map<string, LastDiscussion>()

    // Helper: keep the most recent entry per phone
    const consider = (phone: string, candidate: LastDiscussion) => {
      const existing = map.get(phone)
      if (!existing || candidate.at > existing.at) map.set(phone, candidate)
    }

    // Latest note per phone — SQLite "bare column with MAX" trick gives
    // the row that owns the MAX value
    const notesRes = await db.execute(
      "SELECT phone, note, created_by, MAX(created_at) AS at FROM lead_notes GROUP BY phone"
    )
    for (const r of notesRes.rows) {
      const phone = normalizePhone(String(r.phone))
      consider(phone, {
        source: 'note',
        text: String(r.note || ''),
        by: String(r.created_by || ''),
        at: String(r.at || ''),
      })
    }

    // Latest call log per phone — prefer notes field, fall back to outcome
    const callsRes = await db.execute(
      "SELECT phone, outcome, notes, logged_by, MAX(created_at) AS at FROM call_logs GROUP BY phone"
    )
    for (const r of callsRes.rows) {
      const phone = normalizePhone(String(r.phone))
      const text = String(r.notes || r.outcome || '').trim()
      if (!text) continue
      consider(phone, {
        source: 'call',
        text,
        by: String(r.logged_by || ''),
        at: String(r.at || ''),
      })
    }

    // Latest non-template, non-auto message per phone (both directions)
    // Skip messages where text starts with "[Template:" or "[Auto]" or sent_by is auto
    const msgsRes = await db.execute(
      `SELECT phone, text, direction, sent_by, MAX(timestamp) AS at
       FROM messages
       WHERE text NOT LIKE '[Template:%'
         AND text NOT LIKE '[Auto]%'
         AND sent_by NOT IN ('auto-send', 'System (Auto)')
       GROUP BY phone`
    )
    for (const r of msgsRes.rows) {
      const phone = normalizePhone(String(r.phone))
      const text = String(r.text || '').trim()
      if (!text) continue
      consider(phone, {
        source: String(r.direction) === 'received' ? 'message_in' : 'message_out',
        text,
        by: String(r.sent_by || (String(r.direction) === 'received' ? 'lead' : '')),
        at: String(r.at || ''),
      })
    }

    return map
  } catch (err) {
    console.error('[getLastDiscussionByPhone] non-critical:', err)
    return new Map()
  }
}

// --- Lead notes ---

export async function insertNote(data: { phone: string; note: string; created_by?: string }) {
  const db = await ensureInit()
  data.phone = normalizePhone(data.phone)
  await ensureContactExists(data.phone) // lead_notes.phone FK → contacts(phone)
  const result = await db.execute({
    sql: 'INSERT INTO lead_notes (phone, note, created_by) VALUES (?, ?, ?)',
    args: [data.phone, data.note, data.created_by || ''],
  })
  return Number(result.lastInsertRowid)
}

export async function getNotes(phone: string) {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  const result = await db.execute({
    sql: 'SELECT * FROM lead_notes WHERE phone = ? OR phone = ? ORDER BY created_at DESC',
    args: [norm, phone],
  })
  return serializeRows(result.rows)
}

// --- Lead status change audit log ---
// Captures every transition with actor + source so the daily activity tracker
// can answer "which agent moved which lead through which stage today".
// Source = 'manual' (user PATCHed) | 'auto-send' (cron set DECK_SENT) |
// 'webhook' (button auto-classify or REPLIED) | 'cron' (other cron paths).

export async function insertStatusChange(data: {
  lead_row: number
  phone?: string
  old_status?: string
  new_status: string
  changed_by: string
  changed_by_id?: string
  source?: 'manual' | 'auto-send' | 'webhook' | 'cron' | 'work'
  reason?: string
}): Promise<number | null> {
  try {
    const db = await ensureInit()
    const r = await db.execute({
      sql: `INSERT INTO lead_status_changes
              (lead_row, phone, old_status, new_status, changed_by, changed_by_id, source, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        data.lead_row,
        data.phone ? normalizePhone(data.phone) : '',
        data.old_status || '',
        data.new_status,
        data.changed_by,
        data.changed_by_id || '',
        data.source || 'manual',
        data.reason || '',
      ],
    })
    return Number(r.lastInsertRowid)
  } catch (err) {
    // Audit logging must never break the main flow
    console.error('[insertStatusChange] non-critical:', err)
    return null
  }
}

export async function getStatusChangesByAgent(opts: {
  changed_by: string
  since: string  // ISO timestamp inclusive
  until: string  // ISO timestamp exclusive
}) {
  const db = await ensureInit()
  const r = await db.execute({
    sql: `SELECT id, lead_row, phone, old_status, new_status, source, created_at
          FROM lead_status_changes
          WHERE changed_by = ? AND created_at >= ? AND created_at < ?
          ORDER BY created_at DESC`,
    args: [opts.changed_by, opts.since, opts.until],
  })
  return serializeRows(r.rows)
}

export async function getStatusChangesForLead(leadRow: number) {
  const db = await ensureInit()
  const r = await db.execute({
    sql: `SELECT id, lead_row, phone, old_status, new_status, changed_by, changed_by_id, source, created_at
          FROM lead_status_changes
          WHERE lead_row = ?
          ORDER BY created_at DESC`,
    args: [leadRow],
  })
  return serializeRows(r.rows)
}

// --- Guided Work Mode: work_events ---
// One row per logged action on the work rail. The single source of truth for
// "did the work happen" — powers cleared-today / streaks / owner panel.

export interface WorkEvent {
  id: number
  user_id: string
  user_name: string
  lead_row: number | null
  role: string
  channel: string
  action: string
  outcome: string
  also_whatsapp: boolean
  objection: string | null
  sentiment: string | null
  connected: boolean | null
  created_at: string
}

function rowToWorkEvent(r: Record<string, unknown>): WorkEvent {
  return {
    id: Number(r.id),
    user_id: String(r.user_id || ''),
    user_name: String(r.user_name || ''),
    lead_row: r.lead_row == null ? null : Number(r.lead_row),
    role: String(r.role || ''),
    channel: String(r.channel || ''),
    action: String(r.action || ''),
    outcome: String(r.outcome || ''),
    also_whatsapp: Number(r.also_whatsapp ?? 0) === 1,
    objection: r.objection == null ? null : String(r.objection),
    sentiment: r.sentiment == null ? null : String(r.sentiment),
    connected: r.connected == null ? null : Number(r.connected) === 1,
    created_at: String(r.created_at || ''),
  }
}

export async function insertWorkEvent(data: {
  user_id: string
  user_name: string
  lead_row: number
  role: string
  channel: string
  action: string
  outcome: string
  also_whatsapp?: boolean
  objection?: string | null
  sentiment?: string | null
  connected?: boolean | null
}): Promise<number | null> {
  try {
    const db = await ensureInit()
    const r = await db.execute({
      sql: `INSERT INTO work_events
              (user_id, user_name, lead_row, role, channel, action, outcome, also_whatsapp, objection, sentiment, connected)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        data.user_id,
        data.user_name,
        data.lead_row,
        data.role,
        data.channel,
        data.action,
        data.outcome,
        data.also_whatsapp ? 1 : 0,
        data.objection ?? null,
        data.sentiment ?? null,
        data.connected == null ? null : (data.connected ? 1 : 0),
      ],
    })
    return Number(r.lastInsertRowid)
  } catch (err) {
    console.error('[insertWorkEvent] non-critical:', err)
    return null
  }
}

// --- Guided Work Mode: work_feedback ("Shouldn't be here?") ---
// One row per "this card was surfaced wrongly" flag. Captures the agent's reason
// PLUS the system's case for showing it (queue_reason + score + lead_status at
// flag-time) so the owner sees the exact ranking mismatch. Read-only learning
// signal — it never touches the lead or the queue.

export async function insertWorkFeedback(data: {
  user_id: string
  user_name: string
  lead_row: number
  role: string
  reason_code: string
  note?: string | null
  queue_reason?: string | null
  score?: number | null
  lead_status?: string | null
}): Promise<number | null> {
  try {
    const db = await ensureInit()
    const r = await db.execute({
      sql: `INSERT INTO work_feedback
              (user_id, user_name, lead_row, role, reason_code, note, queue_reason, score, lead_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        data.user_id,
        data.user_name,
        data.lead_row,
        data.role,
        data.reason_code,
        data.note ?? '',
        data.queue_reason ?? '',
        data.score ?? null,
        data.lead_status ?? '',
      ],
    })
    return Number(r.lastInsertRowid)
  } catch (err) {
    console.error('[insertWorkFeedback] non-critical:', err)
    return null
  }
}

// Recent ranking-feedback rows for the owner panel, enriched with the lead's name
// + city (LEFT JOIN so a flag survives even if the lead row is gone).
export async function getRecentWorkFeedback(limit = 100) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `
      SELECT
        w.id, w.user_id, w.user_name, w.lead_row, w.role, w.reason_code, w.note,
        w.queue_reason, w.score, w.lead_status, w.created_at,
        l.full_name AS full_name,
        l.city AS city
      FROM work_feedback w
      LEFT JOIN leads l ON l.row_number = w.lead_row
      ORDER BY w.created_at DESC
      LIMIT ?
    `,
    args: [limit],
  })
  return serializeRows(result.rows)
}

// --- Sales-AI: per-lead LATEST structured signals (shared by Guided + Free) ---

export interface LeadSignal {
  lead_row: number
  objection: string | null
  sentiment: string | null
  capital_readiness: string | null
  decision_maker: string | null
  buyer_persona: string | null
  next_step: string | null
  connected_ever: boolean
  updated_by: string
  updated_at: string
}

function rowToLeadSignal(r: Record<string, unknown>): LeadSignal {
  return {
    lead_row: Number(r.lead_row),
    objection: r.objection == null ? null : String(r.objection),
    sentiment: r.sentiment == null ? null : String(r.sentiment),
    capital_readiness: r.capital_readiness == null ? null : String(r.capital_readiness),
    decision_maker: r.decision_maker == null ? null : String(r.decision_maker),
    buyer_persona: r.buyer_persona == null ? null : String(r.buyer_persona),
    next_step: r.next_step == null ? null : String(r.next_step),
    connected_ever: Number(r.connected_ever ?? 0) === 1,
    updated_by: String(r.updated_by || ''),
    updated_at: String(r.updated_at || ''),
  }
}

// Latest signals for a set of leads, keyed by lead_row. Best-effort (never throws).
export async function getLeadSignalsByRows(leadRows: number[]): Promise<Map<number, LeadSignal>> {
  const map = new Map<number, LeadSignal>()
  if (leadRows.length === 0) return map
  try {
    const db = await ensureInit()
    for (let i = 0; i < leadRows.length; i += 500) {
      const batch = leadRows.slice(i, i + 500)
      const placeholders = batch.map(() => '?').join(',')
      const r = await db.execute({
        sql: `SELECT * FROM lead_signals WHERE lead_row IN (${placeholders})`,
        args: batch,
      })
      for (const row of serializeRows(r.rows).map(rowToLeadSignal)) map.set(row.lead_row, row)
    }
  } catch (err) {
    console.error('[getLeadSignalsByRows] non-critical:', err)
  }
  return map
}

export async function getLeadSignal(leadRow: number): Promise<LeadSignal | null> {
  const m = await getLeadSignalsByRows([leadRow])
  return m.get(leadRow) || null
}

// Upsert the latest signals for a lead. Only fields explicitly passed (not
// undefined) overwrite — so a partial capture (e.g. just sentiment) never wipes a
// previously-set objection. connected_ever is sticky-true (once they pick up, it
// stays 1). Called from BOTH the Guided outcome path and Free-mode lead edits.
export async function upsertLeadSignal(
  leadRow: number,
  patch: {
    objection?: string | null
    sentiment?: string | null
    capital_readiness?: string | null
    decision_maker?: string | null
    buyer_persona?: string | null
    next_step?: string | null
    connected_ever?: boolean
    updated_by?: string
  },
): Promise<void> {
  try {
    const db = await ensureInit()
    await db.execute({ sql: `INSERT OR IGNORE INTO lead_signals (lead_row) VALUES (?)`, args: [leadRow] })
    const sets: string[] = []
    const args: (string | number | null)[] = []
    for (const col of ['objection', 'sentiment', 'capital_readiness', 'decision_maker', 'buyer_persona', 'next_step'] as const) {
      const v = patch[col]
      if (v !== undefined) {
        sets.push(`${col} = ?`)
        args.push(v === null ? null : String(v))
      }
    }
    if (patch.connected_ever !== undefined) {
      sets.push(`connected_ever = MAX(connected_ever, ?)`)
      args.push(patch.connected_ever ? 1 : 0)
    }
    sets.push(`updated_by = ?`)
    args.push(patch.updated_by || '')
    sets.push(`updated_at = datetime('now')`)
    args.push(leadRow)
    await db.execute({ sql: `UPDATE lead_signals SET ${sets.join(', ')} WHERE lead_row = ?`, args })
  } catch (err) {
    console.error('[upsertLeadSignal] non-critical:', err)
  }
}

// Best-time-to-call: the lead's MODAL inbound-message hour in IST (0–23), or null
// if we've never received a message from them. Used to schedule dials into the
// hour they actually reply (attacks the high no-answer rate). Best-effort.
export async function getReplyHourForPhone(phone: string): Promise<number | null> {
  const p10 = String(phone || '').replace(/\D/g, '').slice(-10)
  if (!p10) return null
  try {
    const db = await ensureInit()
    // Index-friendly: match the known stored phone forms exactly (insertMessage
    // writes '91'+last10) instead of a non-indexable replace()+leading-wildcard LIKE.
    const r = await db.execute({
      sql: `SELECT timestamp FROM messages WHERE direction='received' AND timestamp != '' AND phone IN (?, ?, ?, ?)`,
      args: ['91' + p10, '+91' + p10, p10, '0' + p10],
    })
    const counts = new Array(24).fill(0)
    let total = 0
    for (const row of serializeRows(r.rows)) {
      let s = String(row.timestamp).trim().replace(' ', 'T')
      // Pin a zone-less timestamp to UTC (matches tsToMs/lastReceivedMs) before getUTC*.
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(s)) s += 'Z'
      const t = new Date(s)
      if (Number.isNaN(t.getTime())) continue
      const istMinutes = (t.getUTCHours() * 60 + t.getUTCMinutes() + 330) % 1440
      counts[Math.floor(istMinutes / 60)]++
      total++
    }
    // Need enough signal to trust a "best hour" — never give time advice off n=1.
    if (total < 3) return null
    let best = 0
    for (let h = 1; h < 24; h++) if (counts[h] > counts[best]) best = h
    if (counts[best] < 2) return null
    return best
  } catch (err) {
    console.error('[getReplyHourForPhone] non-critical:', err)
    return null
  }
}

// Number of human contact attempts (call / whatsapp work_events) logged on a lead
// — drives the "Attempt N of 7" counter. Best-effort.
export async function getContactCountForLead(leadRow: number): Promise<number> {
  try {
    const db = await ensureInit()
    const r = await db.execute({
      sql: `SELECT COUNT(*) AS c FROM work_events WHERE lead_row = ? AND channel IN ('call','whatsapp')`,
      args: [leadRow],
    })
    return Number(serializeRows(r.rows)[0]?.c ?? 0)
  } catch (err) {
    console.error('[getContactCountForLead] non-critical:', err)
    return 0
  }
}

// Unified CALL attempt count across the three call stores (work-rail call
// outcomes + manual call logs + recorded bridge calls). The stores don't
// cross-write automatically, so summing is a fair dial count; the one manual
// overlap (an agent bridge-records a call AND separately logs it) double-counts
// in the lenient direction, which is acceptable for a guard. Drives the block
// on parking a lead as NO_RESPONSE before MIN_CALL_ATTEMPTS_BEFORE_NO_RESPONSE.
export async function countCallAttempts(leadRow: number, phone: string): Promise<number> {
  try {
    const db = await ensureInit()
    const norm = normalizePhone(phone || '')
    const r = await db.execute({
      sql: `SELECT
              (SELECT COUNT(*) FROM work_events WHERE lead_row = ? AND channel = 'call')
            + (SELECT COUNT(*) FROM call_logs WHERE phone IN (?, ?))
            + (SELECT COUNT(*) FROM call_recordings WHERE (lead_row = ? OR lead_phone IN (?, ?))
                 AND status NOT IN ('initiated', 'failed', 'canceled')) AS c`,
      args: [leadRow, norm, phone || '', leadRow, norm, phone || ''],
    })
    return Number(serializeRows(r.rows)[0]?.c ?? 0)
  } catch (err) {
    // -1 = "count unavailable" (DB error). Callers must treat this as
    // guard-bypass, NOT as zero attempts — otherwise a transient DB failure
    // blocks every agent from parking leads as NO_RESPONSE.
    console.error('[countCallAttempts] DB error — returning -1 (guard bypass):', err)
    return -1
  }
}

// Hand-raisers: phones that tapped a positive quick-reply during a drip /
// reactivation blast ("yes, tell me more", "yes, lock my price", ...). Keyed by
// last-10 digits → paused_at, so the work rail can surface leads still parked
// in NO_RESPONSE despite having said YES. Best-effort (empty map on error).
export async function getPositiveDripPhones(): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    const db = await ensureInit()
    const r = await db.execute({
      sql: `SELECT phone, paused_at FROM drip_state
            WHERE paused_at IS NOT NULL AND opted_out = 0
              AND (pause_reason LIKE 'yes%' OR pause_reason LIKE '%interested%' OR pause_reason LIKE '%call me%')`,
      args: [],
    })
    for (const row of serializeRows(r.rows)) {
      const p = String(row.phone || '').replace(/\D/g, '').slice(-10)
      if (p.length === 10) out.set(p, String(row.paused_at || ''))
    }
  } catch (err) {
    console.error('[getPositiveDripPhones] non-critical:', err)
  }
  return out
}

// All work_events for a user at/after an ISO cutoff (ascending). Used for
// cleared-today and streak computation.
export async function getWorkEventsForUserSince(userId: string, sinceIso: string): Promise<WorkEvent[]> {
  const db = await ensureInit()
  const r = await db.execute({
    sql: `SELECT * FROM work_events WHERE user_id = ? AND created_at >= ? ORDER BY created_at ASC`,
    args: [userId, sinceIso],
  })
  return serializeRows(r.rows).map(rowToWorkEvent)
}

// Most-recent work_event per lead_row for a set of leads, keyed by lead_row.
// Used by the queue/auto-bounce engine to find "last action on the rail".
export async function getLastWorkEventByLead(leadRows: number[]): Promise<Map<number, WorkEvent>> {
  const map = new Map<number, WorkEvent>()
  if (leadRows.length === 0) return map
  // Best-effort, like getLastMessageByPhone: a transient DB error must NOT reject
  // the whole work queue — return what we have (rankers treat a missing lastWork
  // as "not worked yet").
  try {
    const db = await ensureInit()
    for (let i = 0; i < leadRows.length; i += 500) {
      const batch = leadRows.slice(i, i + 500)
      const placeholders = batch.map(() => '?').join(',')
      const r = await db.execute({
        sql: `SELECT * FROM work_events WHERE lead_row IN (${placeholders}) ORDER BY created_at DESC`,
        args: batch,
      })
      for (const e of serializeRows(r.rows).map(rowToWorkEvent)) {
        if (e.lead_row != null && !map.has(e.lead_row)) map.set(e.lead_row, e) // DESC → first = latest
      }
    }
  } catch (err) {
    console.error('[getLastWorkEventByLead] non-critical:', err)
  }
  return map
}

// Count of work_events per user since an ISO cutoff (for the owner panel's
// cleared-today across all agents in one read), keyed by user_id.
export async function getWorkEventCountsSince(sinceIso: string): Promise<Map<string, number>> {
  const db = await ensureInit()
  const r = await db.execute({
    sql: `SELECT user_id, COUNT(*) AS n FROM work_events WHERE created_at >= ? GROUP BY user_id`,
    args: [sinceIso],
  })
  const map = new Map<string, number>()
  for (const row of r.rows) map.set(String(row.user_id || ''), Number(row.n || 0))
  return map
}

// Latest work_event timestamp per user since a cutoff (owner panel last_action_at).
export async function getLastWorkEventAtByUser(sinceIso: string): Promise<Map<string, string>> {
  const db = await ensureInit()
  const r = await db.execute({
    sql: `SELECT user_id, MAX(created_at) AS at FROM work_events WHERE created_at >= ? GROUP BY user_id`,
    args: [sinceIso],
  })
  const map = new Map<string, string>()
  for (const row of r.rows) map.set(String(row.user_id || ''), String(row.at || ''))
  return map
}

// --- Tasks/Reminders ---

export async function insertTask(data: { phone?: string; title: string; due_at: string; created_by?: string }) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'INSERT INTO tasks (phone, title, due_at, created_by) VALUES (?, ?, ?, ?)',
    args: [data.phone || null, data.title, data.due_at, data.created_by || ''],
  })
  return Number(result.lastInsertRowid)
}

export async function getTasks(filters?: { completed?: boolean; due_before?: string; phone?: string }) {
  const db = await ensureInit()
  const conditions: string[] = []
  const args: (string | number)[] = []

  if (filters?.completed !== undefined) {
    conditions.push('completed = ?')
    args.push(filters.completed ? 1 : 0)
  }
  if (filters?.due_before) {
    conditions.push('due_at <= ?')
    args.push(filters.due_before)
  }
  if (filters?.phone) {
    conditions.push('phone = ?')
    args.push(filters.phone)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const result = await db.execute({
    sql: `SELECT t.*, c.name as contact_name FROM tasks t LEFT JOIN contacts c ON c.phone = t.phone ${where} ORDER BY t.due_at ASC`,
    args,
  })
  return serializeRows(result.rows)
}

export async function completeTask(id: number) {
  const db = await ensureInit()
  await db.execute({
    sql: "UPDATE tasks SET completed = 1, completed_at = datetime('now') WHERE id = ?",
    args: [id],
  })
}

// --- Phone dedup migration ---
// Merges duplicate contacts (same last 10 digits) into one normalized entry.
// Moves all messages, call_logs, lead_notes to the normalized phone.
export async function migratePhoneNumbers(): Promise<{ merged: number; messages_moved: number; contacts_deleted: number }> {
  const db = await ensureInit()
  let merged = 0, messagesMoved = 0, contactsDeleted = 0

  // Find all contacts grouped by last 10 digits
  const contacts = await db.execute('SELECT phone, name, is_lead, lead_row, lead_id, city, avatar_color, created_at FROM contacts ORDER BY created_at ASC')
  const groups: Record<string, typeof contacts.rows> = {}
  for (const row of contacts.rows) {
    const phone = String(row.phone || '')
    const key = phone.replace(/\D/g, '').slice(-10)
    if (key.length < 10) continue
    if (!groups[key]) groups[key] = []
    groups[key].push(row)
  }

  for (const [key, rows] of Object.entries(groups)) {
    if (rows.length <= 1) continue // no duplicates

    const canonPhone = `91${key}`
    merged++

    // Pick the best contact data (prefer one with name, is_lead, etc.)
    const best = rows.find(r => r.name && String(r.name).length > 0) || rows[0]

    // Ensure canonical contact exists
    const existing = await db.execute({ sql: 'SELECT phone FROM contacts WHERE phone = ?', args: [canonPhone] })
    if (existing.rows.length === 0) {
      await db.execute({
        sql: 'INSERT INTO contacts (phone, name, is_lead, lead_row, lead_id, city, avatar_color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [canonPhone, best.name || '', best.is_lead ?? 0, best.lead_row ?? null, best.lead_id || '', best.city || '', best.avatar_color || '#3b82f6', best.created_at || new Date().toISOString()],
      })
    }

    // Move all messages, call_logs, lead_notes from duplicate phones to canonical
    for (const row of rows) {
      const oldPhone = String(row.phone || '')
      if (oldPhone === canonPhone) continue

      const moved = await db.execute({ sql: 'UPDATE messages SET phone = ? WHERE phone = ?', args: [canonPhone, oldPhone] })
      messagesMoved += Number(moved.rowsAffected || 0)
      await db.execute({ sql: 'UPDATE call_logs SET phone = ? WHERE phone = ?', args: [canonPhone, oldPhone] })
      await db.execute({ sql: 'UPDATE lead_notes SET phone = ? WHERE phone = ?', args: [canonPhone, oldPhone] })
      await db.execute({ sql: 'UPDATE tasks SET phone = ? WHERE phone = ?', args: [canonPhone, oldPhone] })
      await db.execute({ sql: 'DELETE FROM contacts WHERE phone = ?', args: [oldPhone] })
      contactsDeleted++
    }
  }

  return { merged, messages_moved: messagesMoved, contacts_deleted: contactsDeleted }
}

// --- Drip sequence operations ---

export async function getDripState(phone: string) {
  const db = await ensureInit()
  const result = await db.execute({ sql: 'SELECT * FROM drip_state WHERE phone = ?', args: [phone] })
  return result.rows[0] ? serializeRow(result.rows[0]) : null
}

export async function upsertDripState(phone: string, data: {
  sequence?: string
  current_step?: number
  last_sent_at?: string | null
  enabled?: boolean
  paused_at?: string | null
  pause_reason?: string | null
  opted_out?: boolean
  opted_out_at?: string | null
}) {
  const db = await ensureInit()
  const existing = await db.execute({ sql: 'SELECT * FROM drip_state WHERE phone = ?', args: [phone] })

  if (existing.rows.length > 0) {
    const updates: string[] = []
    const values: (string | number | null)[] = []
    if (data.sequence !== undefined) { updates.push('sequence = ?'); values.push(data.sequence) }
    if (data.current_step !== undefined) { updates.push('current_step = ?'); values.push(data.current_step) }
    if (data.last_sent_at !== undefined) { updates.push('last_sent_at = ?'); values.push(data.last_sent_at) }
    if (data.enabled !== undefined) { updates.push('enabled = ?'); values.push(data.enabled ? 1 : 0) }
    if (data.paused_at !== undefined) { updates.push('paused_at = ?'); values.push(data.paused_at) }
    if (data.pause_reason !== undefined) { updates.push('pause_reason = ?'); values.push(data.pause_reason) }
    if (data.opted_out !== undefined) { updates.push('opted_out = ?'); values.push(data.opted_out ? 1 : 0) }
    if (data.opted_out_at !== undefined) { updates.push('opted_out_at = ?'); values.push(data.opted_out_at) }
    if (updates.length > 0) {
      values.push(phone)
      await db.execute({ sql: `UPDATE drip_state SET ${updates.join(', ')} WHERE phone = ?`, args: values })
    }
  } else {
    await db.execute({
      sql: `INSERT INTO drip_state (phone, sequence, current_step, last_sent_at, enabled, paused_at, pause_reason, opted_out, opted_out_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        phone,
        data.sequence || '',
        data.current_step ?? 0,
        data.last_sent_at || null,
        data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
        data.paused_at || null,
        data.pause_reason || null,
        data.opted_out ? 1 : 0,
        data.opted_out_at || null,
      ],
    })
  }
}

export async function getDripLeads(includesPaused: boolean = false): Promise<Record<string, unknown>[]> {
  const db = await ensureInit()
  const sql = includesPaused
    ? 'SELECT * FROM drip_state WHERE enabled = 1'
    : 'SELECT * FROM drip_state WHERE enabled = 1 AND paused_at IS NULL'
  const result = await db.execute(sql)
  return serializeRows(result.rows) as Record<string, unknown>[]
}

export async function toggleDrip(phone: string, enabled: boolean) {
  const db = await ensureInit()
  const existing = await db.execute({ sql: 'SELECT * FROM drip_state WHERE phone = ?', args: [phone] })
  if (existing.rows.length > 0) {
    await db.execute({ sql: 'UPDATE drip_state SET enabled = ? WHERE phone = ?', args: [enabled ? 1 : 0, phone] })
  } else {
    await db.execute({
      sql: 'INSERT INTO drip_state (phone, enabled) VALUES (?, ?)',
      args: [phone, enabled ? 1 : 0],
    })
  }
}

export async function getBulkDripState(): Promise<Record<string, { enabled: boolean; sequence: string; current_step: number; paused_at: string | null }>> {
  const db = await ensureInit()
  const result = await db.execute('SELECT * FROM drip_state')
  const map: Record<string, { enabled: boolean; sequence: string; current_step: number; paused_at: string | null }> = {}
  for (const row of result.rows) {
    const phone = String(row.phone || '')
    const key = phone.slice(-10)
    map[key] = {
      enabled: row.enabled === 1,
      sequence: String(row.sequence || ''),
      current_step: Number(row.current_step || 0),
      paused_at: row.paused_at ? String(row.paused_at) : null,
    }
  }
  return map
}

// --- Assignment Log ---

export async function logAssignment(data: {
  lead_row: number
  phone?: string
  from_agent: string
  to_agent: string
  assigned_by: string
}) {
  const db = await ensureInit()
  await db.execute({
    sql: 'INSERT INTO assignment_log (lead_row, phone, from_agent, to_agent, assigned_by) VALUES (?, ?, ?, ?, ?)',
    args: [data.lead_row, data.phone || '', data.from_agent, data.to_agent, data.assigned_by],
  })
}

export async function getAssignmentHistory(leadRow: number) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT * FROM assignment_log WHERE lead_row = ? ORDER BY created_at DESC',
    args: [leadRow],
  })
  return serializeRows(result.rows)
}

// --- Lead Edits Audit Log ---

export async function insertLeadEdit(opts: {
  lead_row: number
  phone: string
  field_name: string
  old_value: string
  new_value: string
  changed_by: string
  changed_by_id: string
}): Promise<void> {
  try {
    const db = await ensureInit()
    await db.execute({
      sql: `INSERT INTO lead_edits (lead_row, phone, field_name, old_value, new_value, changed_by, changed_by_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        opts.lead_row,
        opts.phone ? normalizePhone(opts.phone) : '',
        opts.field_name,
        opts.old_value ?? '',
        opts.new_value ?? '',
        opts.changed_by,
        opts.changed_by_id,
      ],
    })
  } catch (err) {
    // Audit logging must never break the main flow
    console.error('[insertLeadEdit] non-critical:', err)
  }
}

export async function getLeadEdits(leadRow: number, limit = 50) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM lead_edits WHERE lead_row = ? ORDER BY created_at DESC LIMIT ?`,
    args: [leadRow, limit],
  })
  return serializeRows(result.rows)
}

export async function getRecentLeadEdits(days: number, filters?: { changed_by_id?: string; field_name?: string }) {
  const db = await ensureInit()
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 19)
  const conditions: string[] = ['created_at >= ?']
  const args: (string | number)[] = [cutoff]

  if (filters?.changed_by_id) {
    conditions.push('changed_by_id = ?')
    args.push(filters.changed_by_id)
  }
  if (filters?.field_name) {
    conditions.push('field_name = ?')
    args.push(filters.field_name)
  }

  const result = await db.execute({
    sql: `SELECT * FROM lead_edits WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 500`,
    args,
  })
  return serializeRows(result.rows)
}

// --- Voice Agent Call operations ---

export async function insertVoiceAgentCall(data: {
  phone: string
  lead_id?: string
  call_sid?: string
  status?: string
  duration_seconds?: number
  interest_level?: string
  preferred_city?: string
  callback_time?: string
  questions?: string
  summary?: string
  transcript?: string
}) {
  const db = await ensureInit()
  data.phone = normalizePhone(data.phone)
  const result = await db.execute({
    sql: `INSERT INTO voice_agent_calls (phone, lead_id, call_sid, status, duration_seconds, interest_level, preferred_city, callback_time, questions, summary, transcript)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      data.phone,
      data.lead_id || '',
      data.call_sid || '',
      data.status || 'initiated',
      data.duration_seconds || 0,
      data.interest_level || '',
      data.preferred_city || '',
      data.callback_time || '',
      data.questions || '',
      data.summary || '',
      data.transcript || '',
    ],
  })
  return Number(result.lastInsertRowid)
}

export async function updateVoiceAgentCall(callSid: string, data: {
  status?: string
  duration_seconds?: number
  interest_level?: string
  preferred_city?: string
  callback_time?: string
  questions?: string
  summary?: string
  transcript?: string
}) {
  const db = await ensureInit()
  const updates: string[] = []
  const values: (string | number | null)[] = []
  if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status) }
  if (data.duration_seconds !== undefined) { updates.push('duration_seconds = ?'); values.push(data.duration_seconds) }
  if (data.interest_level !== undefined) { updates.push('interest_level = ?'); values.push(data.interest_level) }
  if (data.preferred_city !== undefined) { updates.push('preferred_city = ?'); values.push(data.preferred_city) }
  if (data.callback_time !== undefined) { updates.push('callback_time = ?'); values.push(data.callback_time) }
  if (data.questions !== undefined) { updates.push('questions = ?'); values.push(data.questions) }
  if (data.summary !== undefined) { updates.push('summary = ?'); values.push(data.summary) }
  if (data.transcript !== undefined) { updates.push('transcript = ?'); values.push(data.transcript) }
  if (updates.length > 0) {
    values.push(callSid)
    await db.execute({ sql: `UPDATE voice_agent_calls SET ${updates.join(', ')} WHERE call_sid = ?`, args: values })
  }
}

export async function getVoiceAgentCalls(phone: string) {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  const result = await db.execute({
    sql: 'SELECT * FROM voice_agent_calls WHERE phone = ? OR phone = ? ORDER BY created_at DESC',
    args: [norm, phone],
  })
  return serializeRows(result.rows)
}

export async function getVoiceAgentCallBySid(callSid: string) {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT * FROM voice_agent_calls WHERE call_sid = ? LIMIT 1',
    args: [callSid],
  })
  return result.rows[0] ? serializeRow(result.rows[0]) : null
}

// --- Phones that received a given template but the latest delivery was failed ---
// Used to retry only the leads where Meta dropped delivery for a campaign batch.
export async function getFailedPhonesForTemplate(templateName: string): Promise<Set<string>> {
  try {
    const db = await ensureInit()
    // For each phone that has any row with this template, take the latest one.
    // If that latest row is status='failed', include it.
    const result = await db.execute({
      sql: `
        SELECT phone, status FROM messages m1
        WHERE template_used = ?
          AND timestamp = (
            SELECT MAX(timestamp) FROM messages m2
            WHERE m2.phone = m1.phone AND m2.template_used = ?
          )
      `,
      args: [templateName, templateName],
    })
    return new Set(
      result.rows
        .filter(r => String(r.status) === 'failed')
        .map(r => normalizePhone(String(r.phone))),
    )
  } catch (err) {
    console.error('[getFailedPhonesForTemplate] non-critical:', err)
    return new Set()
  }
}

// --- Opted-out lookup (used to exclude leads who tapped Not Interested) ---
// Defensive: if the opted_out column is missing on an older DB schema, return
// an empty set rather than throw — never block the leads route over this.
export async function getOptedOutPhones(): Promise<Set<string>> {
  try {
    const db = await ensureInit()
    const result = await db.execute('SELECT phone FROM drip_state WHERE opted_out = 1')
    return new Set(result.rows.map(r => normalizePhone(String(r.phone))))
  } catch (err) {
    console.error('[getOptedOutPhones] non-critical:', err)
    return new Set()
  }
}

// --- Settings operations ---

export async function getSetting(key: string): Promise<string | null> {
  const db = await ensureInit()
  const result = await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] })
  return result.rows[0] ? String(result.rows[0].value) : null
}

export async function setSetting(key: string, value: string) {
  const db = await ensureInit()
  await db.execute({
    sql: `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`,
    args: [key, value, value],
  })
}

// --- SLA Metrics operations ---

export async function recordFirstResponse(phone: string, leadCreatedAt: string) {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  const now = new Date()
  const created = new Date(leadCreatedAt)
  const diffSeconds = Math.max(0, Math.round((now.getTime() - created.getTime()) / 1000))

  // Only insert if no first_response_at exists yet
  const existing = await db.execute({ sql: 'SELECT first_response_at FROM sla_metrics WHERE phone = ?', args: [norm] })
  if (existing.rows.length > 0 && existing.rows[0].first_response_at) return // Already recorded

  await db.execute({
    sql: `INSERT INTO sla_metrics (phone, lead_created_at, first_response_at, first_response_seconds)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(phone) DO UPDATE SET
            first_response_at = CASE WHEN first_response_at IS NULL THEN ? ELSE first_response_at END,
            first_response_seconds = CASE WHEN first_response_at IS NULL THEN ? ELSE first_response_seconds END`,
    args: [norm, leadCreatedAt, now.toISOString(), diffSeconds, now.toISOString(), diffSeconds],
  })
}

export async function recordLeadClose(phone: string, status: string) {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  const now = new Date()

  // Get lead_created_at from existing record or skip
  const existing = await db.execute({ sql: 'SELECT lead_created_at FROM sla_metrics WHERE phone = ?', args: [norm] })
  const createdAt = existing.rows.length > 0 ? String(existing.rows[0].lead_created_at || '') : ''
  const diffSeconds = createdAt ? Math.max(0, Math.round((now.getTime() - new Date(createdAt).getTime()) / 1000)) : 0

  await db.execute({
    sql: `INSERT INTO sla_metrics (phone, closed_at, time_to_close_seconds, closed_status)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(phone) DO UPDATE SET
            closed_at = ?, time_to_close_seconds = ?, closed_status = ?`,
    args: [norm, now.toISOString(), diffSeconds, status, now.toISOString(), diffSeconds, status],
  })
}

export async function getSlaForAgentPhones(phones: string[]): Promise<Record<string, unknown>[]> {
  const db = await ensureInit()
  if (phones.length === 0) return []
  const placeholders = phones.map(() => '?').join(',')
  const normalized = phones.map(normalizePhone)
  const result = await db.execute({
    sql: `SELECT * FROM sla_metrics WHERE phone IN (${placeholders})`,
    args: normalized,
  })
  return result.rows.map(serializeRow)
}

export async function getSlaAverages(): Promise<{ avg_first_response_hours: number; avg_close_days: number; total: number }> {
  const db = await ensureInit()
  const result = await db.execute(`
    SELECT
      AVG(first_response_seconds) as avg_response,
      AVG(time_to_close_seconds) as avg_close,
      COUNT(*) as total
    FROM sla_metrics WHERE first_response_seconds IS NOT NULL
  `)
  const row = result.rows[0]
  return {
    avg_first_response_hours: row?.avg_response ? Math.round(Number(row.avg_response) / 3600 * 10) / 10 : 0,
    avg_close_days: row?.avg_close ? Math.round(Number(row.avg_close) / 86400 * 10) / 10 : 0,
    total: Number(row?.total || 0),
  }
}

// --- Drip Sequences CRUD ---

export async function getDripSequences(): Promise<Record<string, unknown>[]> {
  const db = await ensureInit()
  const result = await db.execute('SELECT * FROM drip_sequences ORDER BY priority_band, created_at')
  return result.rows.map(serializeRow)
}

export async function upsertDripSequence(data: { id: string; name: string; priority_band: string; steps: string; active?: boolean }) {
  const db = await ensureInit()
  await db.execute({
    sql: `INSERT INTO drip_sequences (id, name, priority_band, steps, active, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            name = ?, priority_band = ?, steps = ?, active = ?, updated_at = datetime('now')`,
    args: [data.id, data.name, data.priority_band, data.steps, data.active !== false ? 1 : 0,
           data.name, data.priority_band, data.steps, data.active !== false ? 1 : 0],
  })
}

export async function deleteDripSequence(id: string) {
  const db = await ensureInit()
  await db.execute({ sql: 'DELETE FROM drip_sequences WHERE id = ?', args: [id] })
}

// --- Meta Ads Snapshot Cache ---

export async function getMetaAdsSnapshot(type: string = 'full'): Promise<{ data: unknown; fetched_at: string } | null> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT data, fetched_at FROM meta_ads_snapshots WHERE snapshot_type = ?',
    args: [type],
  })
  if (result.rows.length === 0) return null
  const row = result.rows[0]
  try {
    return {
      data: JSON.parse(String(row.data || 'null')),
      fetched_at: String(row.fetched_at || ''),
    }
  } catch {
    return null
  }
}

export async function setMetaAdsSnapshot(type: string, data: unknown) {
  const db = await ensureInit()
  const json = JSON.stringify(data)
  const now = new Date().toISOString()
  await db.execute({
    sql: `INSERT INTO meta_ads_snapshots (snapshot_type, data, fetched_at)
          VALUES (?, ?, ?)
          ON CONFLICT(snapshot_type) DO UPDATE SET data = ?, fetched_at = ?`,
    args: [type, json, now, json, now],
  })
}

// --- Agreements CRUD ---

export async function insertAgreement(data: {
  id: string
  lead_phone: string
  lead_row?: number
  doc_type: 'FBA' | 'FRANCHISE_AGREEMENT'
  fields: Record<string, string>
  generated_by?: string
}) {
  const db = await ensureInit()
  await db.execute({
    sql: `INSERT INTO agreements (id, lead_phone, lead_row, doc_type, status, fields, generated_by, created_at)
          VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, datetime('now'))`,
    args: [data.id, normalizePhone(data.lead_phone), data.lead_row || null, data.doc_type, JSON.stringify(data.fields), data.generated_by || ''],
  })
}

export async function getAgreementsForLead(phone: string): Promise<Record<string, unknown>[]> {
  const db = await ensureInit()
  const norm = normalizePhone(phone)
  const result = await db.execute({
    sql: 'SELECT * FROM agreements WHERE lead_phone = ? ORDER BY created_at DESC',
    args: [norm],
  })
  return result.rows.map(serializeRow)
}

export async function getAgreementById(id: string): Promise<Record<string, unknown> | null> {
  const db = await ensureInit()
  const result = await db.execute({ sql: 'SELECT * FROM agreements WHERE id = ?', args: [id] })
  return result.rows.length > 0 ? serializeRow(result.rows[0]) : null
}

export async function updateAgreement(id: string, updates: Record<string, unknown>) {
  const db = await ensureInit()
  const fields: string[] = []
  const values: (string | number | null)[] = []
  for (const [k, v] of Object.entries(updates)) {
    if (['status', 'fields', 'pdf_data', 'generated_by', 'generated_at', 'reviewed_by', 'reviewed_at'].includes(k)) {
      fields.push(`${k} = ?`)
      const val = k === 'fields' && typeof v === 'object' ? JSON.stringify(v) : v
      values.push(val == null ? null : String(val))
    }
  }
  if (fields.length === 0) return
  values.push(id)
  await db.execute({ sql: `UPDATE agreements SET ${fields.join(', ')} WHERE id = ?`, args: values })
}

export async function getAllAgreements(): Promise<Record<string, unknown>[]> {
  const db = await ensureInit()
  const result = await db.execute('SELECT * FROM agreements ORDER BY created_at DESC')
  return result.rows.map(serializeRow)
}

// ─── Push Subscriptions (Wave C) ─────────────────────────────────────────

export interface PushSubscriptionRow {
  id: number
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string
  created_at: string
  last_used_at: string | null
}

export async function upsertPushSubscription(input: {
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent?: string
}): Promise<void> {
  const db = await ensureInit()
  await db.execute({
    sql: `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET
            user_id = excluded.user_id,
            p256dh = excluded.p256dh,
            auth = excluded.auth,
            user_agent = excluded.user_agent,
            last_used_at = datetime('now')`,
    args: [input.user_id, input.endpoint, input.p256dh, input.auth, input.user_agent ?? ''],
  })
}

export async function deletePushSubscription(endpoint: string, userId?: string): Promise<void> {
  const db = await ensureInit()
  if (userId) {
    await db.execute({ sql: 'DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', args: [endpoint, userId] })
  } else {
    await db.execute({ sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?', args: [endpoint] })
  }
}

export async function getPushSubscriptionsForUser(userId: string): Promise<PushSubscriptionRow[]> {
  const db = await ensureInit()
  const r = await db.execute({ sql: 'SELECT * FROM push_subscriptions WHERE user_id = ?', args: [userId] })
  return r.rows.map(row => ({
    id: Number(row.id),
    user_id: String(row.user_id),
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
    user_agent: String(row.user_agent || ''),
    created_at: String(row.created_at),
    last_used_at: row.last_used_at ? String(row.last_used_at) : null,
  }))
}

export async function touchPushSubscription(endpoint: string): Promise<void> {
  const db = await ensureInit()
  await db.execute({ sql: "UPDATE push_subscriptions SET last_used_at = datetime('now') WHERE endpoint = ?", args: [endpoint] })
}

// --- Admin cross-lead activity helpers ---

export async function getStatusChangesForAllLeads(days: number, filters?: { changed_by_id?: string }) {
  const db = await ensureInit()
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 19)
  const conditions: string[] = ['created_at >= ?']
  const args: (string | number)[] = [cutoff]

  if (filters?.changed_by_id) {
    conditions.push('changed_by_id = ?')
    args.push(filters.changed_by_id)
  }

  const result = await db.execute({
    sql: `SELECT * FROM lead_status_changes WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 500`,
    args,
  })
  return serializeRows(result.rows)
}

export async function getAssignmentHistoryRecent(days: number, filters?: { assigned_by_id?: string }) {
  const db = await ensureInit()
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 19)
  const conditions: string[] = ['created_at >= ?']
  const args: (string | number)[] = [cutoff]

  // assignment_log stores assigned_by as name, not id — filter by name not possible without join
  // agent_id filter skipped here; admin UI filters by name via the edits/status tables
  void filters // suppress unused warning

  const result = await db.execute({
    sql: `SELECT * FROM assignment_log WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 500`,
    args,
  })
  return serializeRows(result.rows)
}

// --- Lead Delegation helpers ---

function rowToDelegation(row: Record<string, unknown>): Delegation {
  return {
    id: Number(row.id),
    lead_row: Number(row.lead_row),
    phone: String(row.phone || ''),
    from_agent_id: String(row.from_agent_id || ''),
    from_agent_name: String(row.from_agent_name || ''),
    to_agent_id: String(row.to_agent_id || ''),
    to_agent_name: String(row.to_agent_name || ''),
    status: String(row.status || 'pending') as Delegation['status'],
    message: String(row.message || ''),
    expires_at: row.expires_at ? String(row.expires_at) : null,
    created_at: String(row.created_at || ''),
    responded_at: row.responded_at ? String(row.responded_at) : null,
    ended_at: row.ended_at ? String(row.ended_at) : null,
    ended_by: String(row.ended_by || ''),
  }
}

export async function createDelegation(opts: {
  lead_row: number
  phone: string
  from_agent_id: string
  from_agent_name: string
  to_agent_id: string
  to_agent_name: string
  message?: string
  expires_at?: string
  auto_accept?: boolean
}): Promise<Delegation> {
  const db = await ensureInit()
  const status = opts.auto_accept ? 'active' : 'pending'
  const result = await db.execute({
    sql: `INSERT INTO lead_delegations
            (lead_row, phone, from_agent_id, from_agent_name, to_agent_id, to_agent_name, status, message, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      opts.lead_row,
      opts.phone || '',
      opts.from_agent_id,
      opts.from_agent_name,
      opts.to_agent_id,
      opts.to_agent_name,
      status,
      opts.message || '',
      opts.expires_at || null,
    ],
  })
  const id = Number(result.lastInsertRowid)
  const row = await db.execute({ sql: 'SELECT * FROM lead_delegations WHERE id = ?', args: [id] })
  return rowToDelegation(serializeRow(row.rows[0]))
}

export async function getPendingDelegationsFor(to_agent_id: string): Promise<Delegation[]> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM lead_delegations WHERE to_agent_id = ? AND status = 'pending' ORDER BY created_at DESC`,
    args: [to_agent_id],
  })
  return serializeRows(result.rows).map(rowToDelegation)
}

export async function getActiveDelegationsFor(to_agent_id: string): Promise<Delegation[]> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM lead_delegations WHERE to_agent_id = ? AND status = 'active' ORDER BY created_at DESC`,
    args: [to_agent_id],
  })
  return serializeRows(result.rows).map(rowToDelegation)
}

export async function getActiveDelegationForLead(lead_row: number): Promise<Delegation | null> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM lead_delegations WHERE lead_row = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    args: [lead_row],
  })
  if (result.rows.length === 0) return null
  return rowToDelegation(serializeRow(result.rows[0]))
}

// All active delegations in ONE query, keyed by lead_row (most recent wins).
// Replaces the per-lead getActiveDelegationForLead() N+1 on the admin leads list.
export async function getAllActiveDelegations(): Promise<Map<number, Delegation>> {
  const db = await ensureInit()
  const result = await db.execute(
    `SELECT * FROM lead_delegations WHERE status = 'active' ORDER BY created_at DESC`
  )
  const map = new Map<number, Delegation>()
  for (const d of serializeRows(result.rows).map(rowToDelegation)) {
    if (!map.has(d.lead_row)) map.set(d.lead_row, d) // DESC → first seen = most recent
  }
  return map
}

export async function getDelegationsForLead(lead_row: number): Promise<Delegation[]> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM lead_delegations WHERE lead_row = ? ORDER BY created_at ASC`,
    args: [lead_row],
  })
  return serializeRows(result.rows).map(rowToDelegation)
}

export async function respondToDelegation(
  id: number,
  action: 'accept' | 'decline',
  responder_id: string,
): Promise<void> {
  const db = await ensureInit()
  const existing = await db.execute({ sql: 'SELECT * FROM lead_delegations WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) throw new Error('Delegation not found')
  const row = serializeRow(existing.rows[0])
  if (String(row.to_agent_id) !== responder_id) throw new Error('Not authorized to respond to this delegation')
  const newStatus = action === 'accept' ? 'active' : 'declined'
  await db.execute({
    sql: `UPDATE lead_delegations SET status = ?, responded_at = datetime('now') WHERE id = ?`,
    args: [newStatus, id],
  })
}

export async function endDelegation(id: number, ended_by_id: string): Promise<void> {
  const db = await ensureInit()
  await db.execute({
    sql: `UPDATE lead_delegations SET status = 'ended', ended_at = datetime('now'), ended_by = ? WHERE id = ?`,
    args: [ended_by_id, id],
  })
}

export async function bulkCreateDelegations(opts: {
  lead_rows: number[]
  from_agent_id: string
  from_agent_name: string
  to_agent_id: string
  to_agent_name: string
  expires_at?: string
  admin_id: string
}): Promise<{ count: number; ids: number[] }> {
  const db = await ensureInit()
  const ids: number[] = []
  for (const lead_row of opts.lead_rows) {
    // Get lead phone from contacts (best-effort)
    let phone = ''
    try {
      const c = await db.execute({ sql: 'SELECT phone FROM contacts WHERE lead_row = ? LIMIT 1', args: [lead_row] })
      if (c.rows.length > 0) phone = String(c.rows[0].phone || '')
    } catch { /* phone not critical */ }

    const result = await db.execute({
      sql: `INSERT INTO lead_delegations
              (lead_row, phone, from_agent_id, from_agent_name, to_agent_id, to_agent_name, status, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      args: [
        lead_row,
        phone,
        opts.from_agent_id,
        opts.from_agent_name,
        opts.to_agent_id,
        opts.to_agent_name,
        opts.expires_at || null,
      ],
    })
    ids.push(Number(result.lastInsertRowid))
  }
  return { count: ids.length, ids }
}

export async function getExpiredActiveDelegations(): Promise<Delegation[]> {
  const db = await ensureInit()
  const result = await db.execute(
    `SELECT * FROM lead_delegations WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < datetime('now')`
  )
  return serializeRows(result.rows).map(rowToDelegation)
}

export async function getDelegationById(id: number): Promise<Delegation | null> {
  const db = await ensureInit()
  const result = await db.execute({ sql: 'SELECT * FROM lead_delegations WHERE id = ?', args: [id] })
  if (result.rows.length === 0) return null
  return rowToDelegation(serializeRow(result.rows[0]))
}

// ─── Payment Followup operations ─────────────────────────────────────────────

function rowToFollowup(row: Record<string, unknown>): PaymentFollowup {
  return {
    id: Number(row.id),
    lead_row: row.lead_row != null ? Number(row.lead_row) : null,
    phone: String(row.phone ?? ''),
    franchise_name: String(row.franchise_name ?? ''),
    amount: Number(row.amount ?? 0),
    currency: String(row.currency ?? '₹'),
    due_date: row.due_date != null ? String(row.due_date) : null,
    assigned_to_id: String(row.assigned_to_id ?? ''),
    assigned_to_name: String(row.assigned_to_name ?? ''),
    created_by_id: String(row.created_by_id ?? ''),
    created_by_name: String(row.created_by_name ?? ''),
    status: String(row.status ?? 'pending') as PaymentFollowupStatus,
    reason: String(row.reason ?? ''),
    cleared_at: row.cleared_at != null ? String(row.cleared_at) : null,
    cleared_by_id: String(row.cleared_by_id ?? ''),
    cleared_amount: Number(row.cleared_amount ?? 0),
    notes: String(row.notes ?? ''),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function rowToFollowupUpdate(row: Record<string, unknown>): PaymentFollowupUpdate {
  return {
    id: Number(row.id),
    followup_id: Number(row.followup_id),
    old_status: String(row.old_status ?? ''),
    new_status: String(row.new_status ?? ''),
    reason: String(row.reason ?? ''),
    amount_change: Number(row.amount_change ?? 0),
    note: String(row.note ?? ''),
    updated_by_id: String(row.updated_by_id ?? ''),
    updated_by_name: String(row.updated_by_name ?? ''),
    created_at: String(row.created_at ?? ''),
  }
}

export async function createPaymentFollowup(data: {
  lead_row?: number | null
  phone?: string
  franchise_name: string
  amount?: number
  currency?: string
  due_date?: string | null
  assigned_to_id: string
  assigned_to_name: string
  created_by_id: string
  created_by_name: string
  notes?: string
}): Promise<PaymentFollowup> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `INSERT INTO payment_followups
            (lead_row, phone, franchise_name, amount, currency, due_date, assigned_to_id, assigned_to_name,
             created_by_id, created_by_name, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      data.lead_row ?? null,
      data.phone || '',
      data.franchise_name,
      data.amount ?? 0,
      data.currency ?? '₹',
      data.due_date ?? null,
      data.assigned_to_id,
      data.assigned_to_name,
      data.created_by_id,
      data.created_by_name,
      data.notes || '',
    ],
  })
  const id = Number(result.lastInsertRowid)
  const row = await db.execute({ sql: 'SELECT * FROM payment_followups WHERE id = ?', args: [id] })
  return rowToFollowup(serializeRow(row.rows[0]))
}

export async function updatePaymentFollowup(
  id: number,
  updates: Partial<Pick<PaymentFollowup, 'franchise_name' | 'amount' | 'currency' | 'due_date' | 'assigned_to_id' | 'assigned_to_name' | 'status' | 'reason' | 'cleared_at' | 'cleared_by_id' | 'cleared_amount' | 'notes'>>,
  updated_by: { id: string; name: string },
): Promise<PaymentFollowup> {
  const db = await ensureInit()

  // Fetch current row for status diff
  const existing = await db.execute({ sql: 'SELECT * FROM payment_followups WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) throw new Error('Payment followup not found')
  const current = rowToFollowup(serializeRow(existing.rows[0]))

  const setClauses: string[] = ["updated_at = datetime('now')"]
  const values: (string | number | null)[] = []

  if (updates.franchise_name !== undefined) { setClauses.push('franchise_name = ?'); values.push(updates.franchise_name) }
  if (updates.amount !== undefined) { setClauses.push('amount = ?'); values.push(updates.amount) }
  if (updates.currency !== undefined) { setClauses.push('currency = ?'); values.push(updates.currency) }
  if (updates.due_date !== undefined) { setClauses.push('due_date = ?'); values.push(updates.due_date ?? null) }
  if (updates.assigned_to_id !== undefined) { setClauses.push('assigned_to_id = ?'); values.push(updates.assigned_to_id) }
  if (updates.assigned_to_name !== undefined) { setClauses.push('assigned_to_name = ?'); values.push(updates.assigned_to_name) }
  if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status) }
  if (updates.reason !== undefined) { setClauses.push('reason = ?'); values.push(updates.reason) }
  if (updates.cleared_at !== undefined) { setClauses.push('cleared_at = ?'); values.push(updates.cleared_at ?? null) }
  if (updates.cleared_by_id !== undefined) { setClauses.push('cleared_by_id = ?'); values.push(updates.cleared_by_id) }
  if (updates.cleared_amount !== undefined) { setClauses.push('cleared_amount = ?'); values.push(updates.cleared_amount) }
  if (updates.notes !== undefined) { setClauses.push('notes = ?'); values.push(updates.notes) }

  values.push(id)
  await db.execute({
    sql: `UPDATE payment_followups SET ${setClauses.join(', ')} WHERE id = ?`,
    args: values,
  })

  // If status changed, log it
  if (updates.status !== undefined && updates.status !== current.status) {
    const amountChange = updates.cleared_amount !== undefined ? updates.cleared_amount - current.cleared_amount : 0
    await db.execute({
      sql: `INSERT INTO payment_followup_updates
              (followup_id, old_status, new_status, reason, amount_change, note, updated_by_id, updated_by_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        current.status,
        updates.status,
        updates.reason ?? '',
        amountChange,
        updates.notes ?? '',
        updated_by.id,
        updated_by.name,
      ],
    })
  }

  const updated = await db.execute({ sql: 'SELECT * FROM payment_followups WHERE id = ?', args: [id] })
  return rowToFollowup(serializeRow(updated.rows[0]))
}

export async function getPaymentFollowupsForAgent(
  agent_id: string,
  opts?: { status?: string; includeCleared?: boolean },
): Promise<PaymentFollowup[]> {
  const db = await ensureInit()
  const conditions: string[] = ['assigned_to_id = ?']
  const args: (string | number)[] = [agent_id]

  if (!opts?.includeCleared) {
    conditions.push("status != 'cleared'")
  }
  if (opts?.status) {
    conditions.push('status = ?')
    args.push(opts.status)
  }

  const result = await db.execute({
    sql: `SELECT * FROM payment_followups WHERE ${conditions.join(' AND ')}
          ORDER BY
            CASE WHEN status IN ('pending','in_progress') THEN 0 ELSE 1 END ASC,
            due_date ASC NULLS LAST,
            created_at DESC`,
    args,
  })
  return serializeRows(result.rows).map(rowToFollowup)
}

export async function getAllPaymentFollowups(opts?: {
  status?: string
  agent_id?: string
  days?: number
}): Promise<PaymentFollowup[]> {
  const db = await ensureInit()
  const conditions: string[] = []
  const args: (string | number)[] = []

  if (opts?.status) {
    conditions.push('status = ?')
    args.push(opts.status)
  }
  if (opts?.agent_id) {
    conditions.push('assigned_to_id = ?')
    args.push(opts.agent_id)
  }
  if (opts?.days) {
    const cutoff = new Date(Date.now() - opts.days * 86400_000).toISOString().slice(0, 19)
    conditions.push('created_at >= ?')
    args.push(cutoff)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const result = await db.execute({
    sql: `SELECT * FROM payment_followups ${where}
          ORDER BY
            CASE WHEN status IN ('pending','in_progress') THEN 0 ELSE 1 END ASC,
            due_date ASC NULLS LAST,
            created_at DESC`,
    args,
  })
  return serializeRows(result.rows).map(rowToFollowup)
}

export async function getPaymentFollowup(id: number): Promise<PaymentFollowup | null> {
  const db = await ensureInit()
  const result = await db.execute({ sql: 'SELECT * FROM payment_followups WHERE id = ?', args: [id] })
  if (result.rows.length === 0) return null
  return rowToFollowup(serializeRow(result.rows[0]))
}

export async function getPaymentFollowupUpdates(followup_id: number): Promise<PaymentFollowupUpdate[]> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT * FROM payment_followup_updates WHERE followup_id = ? ORDER BY created_at ASC',
    args: [followup_id],
  })
  return serializeRows(result.rows).map(rowToFollowupUpdate)
}

export async function deletePaymentFollowup(id: number): Promise<void> {
  const db = await ensureInit()
  await db.execute({ sql: 'DELETE FROM payment_followups WHERE id = ?', args: [id] })
}

export async function getPaymentFollowupsForLead(lead_row: number): Promise<PaymentFollowup[]> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT * FROM payment_followups WHERE lead_row = ? ORDER BY created_at DESC',
    args: [lead_row],
  })
  return serializeRows(result.rows).map(rowToFollowup)
}

// ─── Pipeline stages ─────────────────────────────────────────────────
// The editable funnel definition. `key` is the immutable lead_status identifier
// stored on every lead; labels/colors/order/active are the editable bits.

export interface PipelineStage {
  key: string
  label: string
  color: string
  sortOrder: number
  isActive: boolean
  isWon: boolean
  isLost: boolean
}

function rowToStage(r: Record<string, unknown>): PipelineStage {
  return {
    key: String(r.key || ''),
    label: String(r.label || ''),
    color: r.color == null ? '' : String(r.color),
    sortOrder: Number(r.sort_order ?? 0),
    isActive: Number(r.is_active ?? 1) === 1,
    isWon: Number(r.is_won ?? 0) === 1,
    isLost: Number(r.is_lost ?? 0) === 1,
  }
}

// Build an UPPER_SNAKE key from a free-text label (e.g. "Final Negotiation"
// → "FINAL_NEGOTIATION"). Mirrors the existing lead_status identifier style.
function slugifyStageKey(label: string): string {
  return String(label)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// Seed the table ONCE from the config/client.ts status constants. Preserves the
// existing keys/labels/colors and their declared order. CONVERTED → is_won,
// LOST → is_lost. No-op if any rows already exist (so admin edits are never
// clobbered on restart).
async function seedPipelineStages(db: Client): Promise<void> {
  const existing = await db.execute('SELECT COUNT(*) AS n FROM pipeline_stages')
  if (Number(existing.rows[0]?.n ?? 0) > 0) return

  const stmts = LEAD_STATUSES.map((key, i) => ({
    sql: `INSERT OR IGNORE INTO pipeline_stages (key, label, color, sort_order, is_active, is_won, is_lost)
          VALUES (?, ?, ?, ?, 1, ?, ?)`,
    args: [
      key,
      STATUS_LABELS[key] || key,
      STATUS_COLORS[key] || '',
      i,
      key === 'CONVERTED' ? 1 : 0,
      key === 'LOST' ? 1 : 0,
    ] as (string | number)[],
  }))
  await db.batch(stmts, 'write')
}

export async function getPipelineStages(opts?: { includeInactive?: boolean }): Promise<PipelineStage[]> {
  const db = await ensureInit()
  const where = opts?.includeInactive ? '' : 'WHERE is_active = 1'
  const result = await db.execute(
    `SELECT * FROM pipeline_stages ${where} ORDER BY sort_order ASC, id ASC`
  )
  return serializeRows(result.rows).map(rowToStage)
}

export async function getPipelineStage(key: string): Promise<PipelineStage | null> {
  const db = await ensureInit()
  const result = await db.execute({ sql: 'SELECT * FROM pipeline_stages WHERE key = ?', args: [key] })
  return result.rows[0] ? rowToStage(serializeRow(result.rows[0])) : null
}

// Create a new stage. Auto-generates a unique UPPER_SNAKE key from the label and
// appends it after the current highest sort_order. Returns the created stage.
export async function createPipelineStage(data: { label: string; color?: string }): Promise<PipelineStage> {
  const db = await ensureInit()
  const label = String(data.label || '').trim()
  if (!label) throw new Error('Label is required')

  const base = slugifyStageKey(label)
  if (!base) throw new Error('Label must contain at least one alphanumeric character')

  // Ensure the key is unique — suffix _2, _3, … on collision.
  let key = base
  let suffix = 2
  while (true) {
    const clash = await db.execute({ sql: 'SELECT 1 FROM pipeline_stages WHERE key = ?', args: [key] })
    if (clash.rows.length === 0) break
    key = `${base}_${suffix++}`
  }

  const maxRes = await db.execute('SELECT MAX(sort_order) AS m FROM pipeline_stages')
  const nextOrder = Number(maxRes.rows[0]?.m ?? -1) + 1

  await db.execute({
    sql: `INSERT INTO pipeline_stages (key, label, color, sort_order, is_active, is_won, is_lost)
          VALUES (?, ?, ?, ?, 1, 0, 0)`,
    args: [key, label, data.color || '', nextOrder],
  })

  const created = await getPipelineStage(key)
  if (!created) throw new Error('Failed to create stage')
  return created
}

// Update editable fields of a stage. The `key` is immutable and never changes.
export async function updatePipelineStage(
  key: string,
  patch: { label?: string; color?: string; sortOrder?: number; isActive?: boolean },
): Promise<PipelineStage | null> {
  const db = await ensureInit()
  const updates: string[] = []
  const args: (string | number)[] = []
  if (patch.label !== undefined) { updates.push('label = ?'); args.push(String(patch.label)) }
  if (patch.color !== undefined) { updates.push('color = ?'); args.push(String(patch.color)) }
  if (patch.sortOrder !== undefined) { updates.push('sort_order = ?'); args.push(Number(patch.sortOrder)) }
  if (patch.isActive !== undefined) { updates.push('is_active = ?'); args.push(patch.isActive ? 1 : 0) }
  if (updates.length > 0) {
    args.push(key)
    await db.execute({ sql: `UPDATE pipeline_stages SET ${updates.join(', ')} WHERE key = ?`, args })
  }
  return getPipelineStage(key)
}

// Reorder stages by an ordered list of keys. sort_order is rewritten to the
// list index; keys not present in the list keep their existing order after.
export async function reorderPipelineStages(orderedKeys: string[]): Promise<void> {
  if (!orderedKeys.length) return
  const db = await ensureInit()
  const stmts = orderedKeys.map((key, i) => ({
    sql: 'UPDATE pipeline_stages SET sort_order = ? WHERE key = ?',
    args: [i, key] as (string | number)[],
  }))
  await db.batch(stmts, 'write')
}

// ─── Saved views ─────────────────────────────────────────────────────
// Per-user (or shared) snapshots of the /leads filter state.
// SavedView / SavedViewFilters types live in '@/lib/stages' (client-safe,
// single source of truth) and are imported above.

function rowToSavedView(r: Record<string, unknown>): SavedView {
  let filters: SavedViewFilters = {}
  const raw = r.filters
  if (raw) {
    try { filters = JSON.parse(String(raw)) as SavedViewFilters } catch { filters = {} }
  }
  return {
    id: Number(r.id),
    name: String(r.name || ''),
    ownerUserId: String(r.owner_user_id || ''),
    scope: (String(r.scope || 'private') === 'shared' ? 'shared' : 'private'),
    filters,
    isDefault: Number(r.is_default ?? 0) === 1,
    createdAt: String(r.created_at || ''),
  }
}

// The user's own private views PLUS every shared view (regardless of owner).
export async function listSavedViews(userId: string): Promise<SavedView[]> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: `SELECT * FROM saved_views
          WHERE owner_user_id = ? OR scope = 'shared'
          ORDER BY is_default DESC, name ASC`,
    args: [userId],
  })
  return serializeRows(result.rows).map(rowToSavedView)
}

export async function getSavedView(id: number): Promise<SavedView | null> {
  const db = await ensureInit()
  const result = await db.execute({ sql: 'SELECT * FROM saved_views WHERE id = ?', args: [id] })
  return result.rows[0] ? rowToSavedView(serializeRow(result.rows[0])) : null
}

export async function createSavedView(
  userId: string,
  data: { name: string; scope?: 'private' | 'shared'; filters?: SavedViewFilters; isDefault?: boolean },
): Promise<SavedView> {
  const db = await ensureInit()
  const name = String(data.name || '').trim()
  if (!name) throw new Error('Name is required')
  const scope = data.scope === 'shared' ? 'shared' : 'private'

  // Only one default per user — clear the rest first.
  if (data.isDefault) {
    await db.execute({ sql: 'UPDATE saved_views SET is_default = 0 WHERE owner_user_id = ?', args: [userId] })
  }

  const result = await db.execute({
    sql: `INSERT INTO saved_views (name, owner_user_id, scope, filters, is_default)
          VALUES (?, ?, ?, ?, ?)`,
    args: [name, userId, scope, JSON.stringify(data.filters || {}), data.isDefault ? 1 : 0],
  })
  const created = await getSavedView(Number(result.lastInsertRowid))
  if (!created) throw new Error('Failed to create saved view')
  return created
}

// Update a saved view. Owner can always edit their own; admins can edit any.
// Returns null if not found or not permitted.
export async function updateSavedView(
  id: number,
  userId: string,
  isAdmin: boolean,
  patch: { name?: string; filters?: SavedViewFilters; isDefault?: boolean; scope?: 'private' | 'shared' },
): Promise<SavedView | null> {
  const db = await ensureInit()
  const existing = await getSavedView(id)
  if (!existing) return null
  if (existing.ownerUserId !== userId && !isAdmin) throw new Error('Not authorized to edit this view')

  // Default toggling is scoped to the view's owner.
  if (patch.isDefault === true) {
    await db.execute({ sql: 'UPDATE saved_views SET is_default = 0 WHERE owner_user_id = ?', args: [existing.ownerUserId] })
  }

  const updates: string[] = []
  const args: (string | number)[] = []
  if (patch.name !== undefined) { updates.push('name = ?'); args.push(String(patch.name)) }
  if (patch.filters !== undefined) { updates.push('filters = ?'); args.push(JSON.stringify(patch.filters)) }
  if (patch.scope !== undefined) { updates.push('scope = ?'); args.push(patch.scope === 'shared' ? 'shared' : 'private') }
  if (patch.isDefault !== undefined) { updates.push('is_default = ?'); args.push(patch.isDefault ? 1 : 0) }
  if (updates.length > 0) {
    args.push(id)
    await db.execute({ sql: `UPDATE saved_views SET ${updates.join(', ')} WHERE id = ?`, args })
  }
  return getSavedView(id)
}

// Delete a saved view. Owner or admin only. Returns true if a row was deleted.
export async function deleteSavedView(id: number, userId: string, isAdmin: boolean): Promise<boolean> {
  const db = await ensureInit()
  const existing = await getSavedView(id)
  if (!existing) return false
  if (existing.ownerUserId !== userId && !isAdmin) throw new Error('Not authorized to delete this view')
  const res = await db.execute({ sql: 'DELETE FROM saved_views WHERE id = ?', args: [id] })
  return Number(res.rowsAffected ?? 0) > 0
}

// ─── Bulk lead import (admin CSV) ────────────────────────────────────
// Writes to the SQLite `leads` table only (NOT the Google Sheet). Dedupes by
// normalized phone. New leads get a row_number appended after the current max,
// lead_status='NEW', a WARM priority default, and a created_time stamped the
// same way createLead() does (new Date().toISOString()).

export interface BulkLeadRow {
  full_name?: string
  phone?: string
  email?: string
  city?: string
  state?: string
  model_interest?: string
  experience?: string
  timeline?: string
  platform?: string
  campaign_name?: string
  notes?: string
}

export interface BulkInsertResult {
  inserted: number
  updated: number
  skipped: number
  errors: string[]
  /** phone (normalized) -> row_number for every row that was freshly INSERTed this run */
  insertedPhoneToRow: Record<string, number>
}

// Fields a CSV row may carry into the leads table.
const BULK_IMPORT_FIELDS = [
  'full_name', 'email', 'city', 'state', 'model_interest',
  'experience', 'timeline', 'platform', 'campaign_name', 'notes',
] as const

export async function bulkInsertLeads(
  rows: BulkLeadRow[],
  opts: { dedupe: 'skip' | 'update' },
): Promise<BulkInsertResult> {
  const db = await ensureInit()
  const result: BulkInsertResult = { inserted: 0, updated: 0, skipped: 0, errors: [], insertedPhoneToRow: {} }
  if (!Array.isArray(rows) || rows.length === 0) return result

  // Map normalized phone → existing row_number, for dedupe. (Read-only; done
  // before the write transaction.)
  const existingRes = await db.execute('SELECT row_number, phone FROM leads')
  const phoneToRow = new Map<string, number>()
  for (const r of existingRes.rows) {
    const norm = normalizePhone(String(r.phone || ''))
    if (norm) phoneToRow.set(norm, Number(r.row_number))
  }

  // ── Phase 1: validate + dedupe (no DB writes) ──────────────────────
  // Resolve each row to an explicit write intent or skip it. Dedupe runs
  // against both the existing DB rows AND earlier rows in this same batch, so
  // two CSV rows sharing a phone never both insert. A duplicate of a brand-new
  // phone whose row_number isn't known until the transaction is recorded as an
  // 'update-batch' op, resolved to the allocated row_number in phase 2.
  type WriteOp =
    | { kind: 'update'; rowNumber: number; updates: string[]; args: (string | number)[] }
    | { kind: 'update-batch'; phone: string; updates: string[]; args: (string | number)[]; idx: number }
    | { kind: 'insert'; phone: string; raw: BulkLeadRow; idx: number }
  const ops: WriteOp[] = []
  // Phones newly seen in THIS batch (not yet in the DB) → pending insert.
  const batchNewPhones = new Set<string>()

  function collectUpdates(raw: BulkLeadRow): { updates: string[]; args: (string | number)[] } {
    const updates: string[] = []
    const args: (string | number)[] = []
    for (const f of BULK_IMPORT_FIELDS) {
      const val = raw[f]
      if (val !== undefined && String(val).trim() !== '') {
        updates.push(`${f} = ?`)
        args.push(String(val))
      }
    }
    return { updates, args }
  }

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] || {}
    const rawPhone = String(raw.phone || '').trim()
    if (!rawPhone) { result.errors.push(`Row ${i + 1}: missing phone`); result.skipped++; continue }

    const phone = normalizePhone(rawPhone)
    if (phone.length < 10) { result.errors.push(`Row ${i + 1}: invalid phone "${rawPhone}"`); result.skipped++; continue }

    const existingRow = phoneToRow.get(phone)
    if (existingRow !== undefined) {
      // Dedupe against an existing DB row.
      if (opts.dedupe === 'skip') { result.skipped++; continue }
      const { updates, args } = collectUpdates(raw)
      if (updates.length === 0) { result.skipped++; continue }
      ops.push({ kind: 'update', rowNumber: existingRow, updates, args })
      continue
    }

    if (batchNewPhones.has(phone)) {
      // Dedupe against a brand-new phone already queued for insert in this batch.
      if (opts.dedupe === 'skip') { result.skipped++; continue }
      const { updates, args } = collectUpdates(raw)
      if (updates.length === 0) { result.skipped++; continue }
      ops.push({ kind: 'update-batch', phone, updates, args, idx: i })
      continue
    }

    // First occurrence of a brand-new phone — queue an insert.
    ops.push({ kind: 'insert', phone, raw, idx: i })
    batchNewPhones.add(phone)
  }

  if (ops.length === 0) return result

  // ── Phase 2: atomic writes ─────────────────────────────────────────
  // Read MAX(row_number) and apply every insert/update inside one write
  // transaction so concurrent imports can't allocate the same row_number and
  // collide on the PRIMARY KEY.
  const tx = await db.transaction('write')
  try {
    const maxRes = await tx.execute('SELECT MAX(row_number) AS m FROM leads')
    let nextRow = Number(maxRes.rows[0]?.m ?? 0) + 1
    // Maps a brand-new phone to the row_number its insert was allocated, so a
    // later 'update-batch' op in the same import can target the right row.
    const batchPhoneToRow = new Map<string, number>()

    for (const op of ops) {
      try {
        if (op.kind === 'insert') {
          const rowNumber = nextRow++
          await tx.execute({
            sql: `INSERT INTO leads
                    (row_number, id, created_time, campaign_name, full_name, phone, email, city, state,
                     model_interest, experience, timeline, platform, lead_status, lead_priority, notes)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', 'WARM', ?)`,
            args: [
              rowNumber,
              `import_${Date.now()}_${rowNumber}`,
              new Date().toISOString(),
              String(op.raw.campaign_name || 'CSV Import'),
              String(op.raw.full_name || ''),
              op.phone,
              String(op.raw.email || ''),
              String(op.raw.city || ''),
              String(op.raw.state || ''),
              String(op.raw.model_interest || ''),
              String(op.raw.experience || ''),
              String(op.raw.timeline || ''),
              String(op.raw.platform || 'Import'),
              String(op.raw.notes || ''),
            ],
          })
          batchPhoneToRow.set(op.phone, rowNumber)
          result.insertedPhoneToRow[op.phone] = rowNumber
          result.inserted++
        } else {
          // 'update' (known DB row) or 'update-batch' (row inserted earlier here).
          const rowNumber = op.kind === 'update' ? op.rowNumber : batchPhoneToRow.get(op.phone)
          if (rowNumber === undefined) {
            // The dependent insert failed earlier in this batch — nothing to update.
            result.skipped++
            continue
          }
          // Compare incoming values against existing row — skip UPDATE when nothing actually changed
          // so re-imports/syncs stop stamping updated_at on untouched rows.
          const existingRowRes = await tx.execute({ sql: 'SELECT * FROM leads WHERE row_number = ?', args: [rowNumber] })
          const existingLead = existingRowRes.rows[0] as Record<string, unknown> | undefined
          let actuallyChanged = false
          if (!existingLead) {
            actuallyChanged = true
          } else {
            // op.updates entries are like 'field = ?'; compare each against the DB value
            for (let fi = 0; fi < op.updates.length; fi++) {
              const fieldName = (op.updates[fi] as string).replace(' = ?', '')
              const incoming = String(op.args[fi] ?? '')
              const current = String(existingLead[fieldName] ?? '')
              if (incoming !== current) { actuallyChanged = true; break }
            }
          }
          if (!actuallyChanged) {
            result.skipped++
            continue
          }
          await tx.execute({
            sql: `UPDATE leads SET ${op.updates.join(', ')}, updated_at = datetime('now') WHERE row_number = ?`,
            args: [...op.args, rowNumber],
          })
          result.updated++
        }
      } catch (err) {
        const rowLabel = op.kind === 'update' ? `Row (row ${op.rowNumber})` : `Row ${op.idx + 1}`
        result.errors.push(`${rowLabel}: ${err instanceof Error ? err.message : 'insert failed'}`)
        result.skipped++
      }
    }

    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }

  return result
}

// ─── Lead comments ───────────────────────────────────────────────────
// Threaded discussion on a lead (keyed by row_number). Mentions spawn a
// notification per mentioned user id, matching the existing notifications shape.

export interface LeadComment {
  id: number
  lead_row: number
  author_id: string
  author_name: string
  body: string
  mentions: string[]
  created_at: string
}

function rowToLeadComment(r: Record<string, unknown>): LeadComment {
  let mentions: string[] = []
  if (r.mentions) {
    try {
      const parsed = JSON.parse(String(r.mentions))
      if (Array.isArray(parsed)) mentions = parsed.map(String)
    } catch { mentions = [] }
  }
  return {
    id: Number(r.id),
    lead_row: Number(r.lead_row),
    author_id: String(r.author_id || ''),
    author_name: String(r.author_name || ''),
    body: String(r.body || ''),
    mentions,
    created_at: String(r.created_at || ''),
  }
}

export async function listLeadComments(leadRow: number): Promise<LeadComment[]> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT * FROM lead_comments WHERE lead_row = ? ORDER BY created_at ASC',
    args: [leadRow],
  })
  return serializeRows(result.rows).map(rowToLeadComment)
}

export async function addLeadComment(
  leadRow: number,
  data: { authorId?: string; authorName?: string; body: string; mentions?: string[] },
): Promise<LeadComment> {
  const db = await ensureInit()
  const mentions = Array.isArray(data.mentions) ? data.mentions.map(String).filter(Boolean) : []

  const result = await db.execute({
    sql: `INSERT INTO lead_comments (lead_row, author_id, author_name, body, mentions)
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      leadRow,
      data.authorId || '',
      data.authorName || '',
      data.body,
      JSON.stringify(mentions),
    ],
  })
  const id = Number(result.lastInsertRowid)

  // Resolve the lead's phone (best-effort) so the notification can deep-link.
  let refPhone: string | null = null
  try {
    const leadRes = await db.execute({ sql: 'SELECT phone FROM leads WHERE row_number = ?', args: [leadRow] })
    if (leadRes.rows.length > 0 && leadRes.rows[0].phone) refPhone = String(leadRes.rows[0].phone)
  } catch { /* phone lookup is non-critical */ }

  // Bulk-validate mentions against real users so we never notify (or store a row for)
  // a non-existent id. De-dupe first, then keep only ids that exist in users.
  const uniqueMentions = Array.from(new Set(mentions))
  const validMentionIds = new Set<string>()
  if (uniqueMentions.length > 0) {
    const placeholders = uniqueMentions.map(() => '?').join(', ')
    const usersRes = await db.execute({
      sql: `SELECT id FROM users WHERE id IN (${placeholders})`,
      args: uniqueMentions,
    })
    for (const u of usersRes.rows) validMentionIds.add(String(u.id))
  }

  // Fire a notification per mentioned user (skip the author mentioning themselves).
  const authorName = data.authorName || 'Someone'
  const snippet = data.body.length > 140 ? `${data.body.slice(0, 140)}…` : data.body
  for (const userId of uniqueMentions) {
    if (userId === data.authorId) continue
    if (!validMentionIds.has(userId)) continue
    try {
      await db.execute({
        sql: `INSERT INTO notifications (user_id, type, title, body, ref_phone, ref_lead_row, read)
              VALUES (?, ?, ?, ?, ?, ?, 0)`,
        args: [userId, 'mention', `${authorName} mentioned you`, snippet, refPhone, leadRow],
      })
    } catch (err) {
      console.error('[addLeadComment] mention notify non-critical:', err)
    }
  }

  const row = await db.execute({ sql: 'SELECT * FROM lead_comments WHERE id = ?', args: [id] })
  return rowToLeadComment(serializeRow(row.rows[0]))
}

// ─── Favorites ───────────────────────────────────────────────────────
// Per-user starred leads ('lead') or saved views ('view').

export interface Favorite {
  id: number
  user_id: string
  kind: 'lead' | 'view'
  ref: string
  created_at: string
}

function rowToFavorite(r: Record<string, unknown>): Favorite {
  return {
    id: Number(r.id),
    user_id: String(r.user_id || ''),
    kind: (String(r.kind || 'lead') === 'view' ? 'view' : 'lead'),
    ref: String(r.ref || ''),
    created_at: String(r.created_at || ''),
  }
}

export async function listFavorites(userId: string): Promise<Favorite[]> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC',
    args: [userId],
  })
  return serializeRows(result.rows).map(rowToFavorite)
}

// Idempotent: a duplicate (user, kind, ref) is ignored via INSERT OR IGNORE.
export async function addFavorite(userId: string, kind: string, ref: string): Promise<void> {
  const db = await ensureInit()
  await db.execute({
    sql: 'INSERT OR IGNORE INTO favorites (user_id, kind, ref) VALUES (?, ?, ?)',
    args: [userId, kind, ref],
  })
}

export async function removeFavorite(userId: string, kind: string, ref: string): Promise<void> {
  const db = await ensureInit()
  await db.execute({
    sql: 'DELETE FROM favorites WHERE user_id = ? AND kind = ? AND ref = ?',
    args: [userId, kind, ref],
  })
}

// ─── User table prefs ────────────────────────────────────────────────
// Per-user column order + visibility for a given table key.

export interface TableColumnPref {
  key: string
  visible: boolean
}

export async function getTablePrefs(userId: string, tableKey: string): Promise<TableColumnPref[] | null> {
  const db = await ensureInit()
  const result = await db.execute({
    sql: 'SELECT columns FROM user_table_prefs WHERE user_id = ? AND table_key = ?',
    args: [userId, tableKey],
  })
  if (result.rows.length === 0) return null
  const raw = result.rows[0].columns
  if (!raw) return null
  try {
    const parsed = JSON.parse(String(raw))
    if (!Array.isArray(parsed)) return null
    return parsed.map((c: Record<string, unknown>) => ({
      key: String(c.key || ''),
      visible: Boolean(c.visible),
    }))
  } catch {
    return null
  }
}

export async function setTablePrefs(userId: string, tableKey: string, columns: TableColumnPref[]): Promise<void> {
  const db = await ensureInit()
  const json = JSON.stringify(Array.isArray(columns) ? columns : [])
  await db.execute({
    sql: `INSERT INTO user_table_prefs (user_id, table_key, columns, updated_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(user_id, table_key) DO UPDATE SET columns = ?, updated_at = datetime('now')`,
    args: [userId, tableKey, json, json],
  })
}

// ─── Duplicate detection + merge ─────────────────────────────────────
// Find groups of un-merged leads that share the same normalized phone, and
// merge sources into a target (admin, safe + reversible) by reassigning every
// lead_row-keyed child row, then archiving the sources.

export interface DuplicateLeadGroup {
  phone: string
  leads: Array<{
    row_number: number
    full_name: string
    phone: string
    city: string
    lead_status: string
    assigned_to: string
    created_time: string
    message_count: number
  }>
}

// Child tables keyed by lead_row that a merge must reassign from source → target
// via a generic `UPDATE ... SET lead_row = target WHERE lead_row = source`.
// Phone-keyed children (messages, contacts, call_logs, tasks, voice_agent_calls,
// agreements, lead_notes, sla_metrics) are already shared via the common phone
// and are deliberately NOT touched — agreements in particular is phone-keyed by design.
// Two children are handled outside this generic loop:
//   - lead_telecaller_assignments has lead_row as a PRIMARY KEY, so a blind UPDATE
//     would collide when the target already has a row; it is reassigned/discarded per-source.
//   - notifications is keyed on ref_lead_row (not lead_row), so it is reassigned via its
//     own statement.
const LEAD_ROW_CHILD_TABLES = [
  'lead_status_changes',
  'lead_delegations',
  'payment_followups',
  'lead_comments',
  'assignment_log',
  'lead_edits',
  'update_requests',
  'meta_capi_events',
] as const

export async function findDuplicateLeads(): Promise<DuplicateLeadGroup[]> {
  const db = await ensureInit()

  // Message counts per normalized phone (last 10 digits), one cheap read.
  const msgRes = await db.execute(
    "SELECT phone, COUNT(*) AS n FROM messages GROUP BY phone"
  )
  const msgCountByLast10 = new Map<string, number>()
  for (const r of msgRes.rows) {
    const key = String(r.phone || '').replace(/\D/g, '').slice(-10)
    if (!key) continue
    msgCountByLast10.set(key, (msgCountByLast10.get(key) || 0) + Number(r.n || 0))
  }

  // Only un-merged leads participate in dedupe.
  const leadsRes = await db.execute(
    `SELECT row_number, full_name, phone, city, lead_status, assigned_to, created_time
     FROM leads WHERE merged_into IS NULL`
  )

  const groups = new Map<string, DuplicateLeadGroup['leads']>()
  for (const r of leadsRes.rows) {
    const rawPhone = String(r.phone || '')
    const norm = normalizePhone(rawPhone)
    const last10 = norm.slice(-10)
    if (last10.length < 10) continue // un-normalizable phones can't be grouped
    if (!groups.has(norm)) groups.set(norm, [])
    groups.get(norm)!.push({
      row_number: Number(r.row_number),
      full_name: String(r.full_name || ''),
      phone: rawPhone,
      city: String(r.city || ''),
      lead_status: String(r.lead_status || ''),
      assigned_to: String(r.assigned_to || ''),
      created_time: String(r.created_time || ''),
      message_count: msgCountByLast10.get(last10) || 0,
    })
  }

  const out: DuplicateLeadGroup[] = []
  for (const [phone, leads] of groups.entries()) {
    if (leads.length > 1) out.push({ phone, leads })
  }
  // Largest groups first.
  out.sort((a, b) => b.leads.length - a.leads.length)
  return out
}

export interface MergeLeadsResult {
  merged: number
  targetRow: number
  moved: Record<string, number>
}

export async function mergeLeads(
  targetRow: number,
  sourceRows: number[],
  mergedBy: string,
): Promise<MergeLeadsResult> {
  const db = await ensureInit()

  const targetRes = await db.execute({ sql: 'SELECT phone, merged_into FROM leads WHERE row_number = ?', args: [targetRow] })
  if (targetRes.rows.length === 0) throw new Error('Target lead not found')
  if (targetRes.rows[0].merged_into != null) {
    throw new Error('Target lead is already merged into another lead — merge into the final target instead')
  }
  const targetPhone = normalizePhone(String(targetRes.rows[0].phone || ''))
  if (targetPhone.length < 10) throw new Error('Target lead has an un-normalizable phone')

  // Validate each source up-front: must exist, share the target's normalized phone,
  // not be the target, and not already be merged. Reject mismatched-phone sources.
  // This is a fast-fail pre-check; the in-transaction guarded archive below is the
  // authoritative, concurrency-safe gate. We capture each source's raw stored phone
  // here so the guarded archive can assert the row hasn't changed underneath us.
  const validSources: Array<{ src: number; rawPhone: string }> = []
  for (const src of sourceRows) {
    if (src === targetRow) continue
    const srcRes = await db.execute({
      sql: 'SELECT phone, merged_into FROM leads WHERE row_number = ?',
      args: [src],
    })
    if (srcRes.rows.length === 0) throw new Error(`Source lead ${src} not found`)
    if (srcRes.rows[0].merged_into != null) continue // already merged → skip (idempotent)
    const rawPhone = String(srcRes.rows[0].phone || '')
    const srcPhone = normalizePhone(rawPhone)
    if (srcPhone !== targetPhone) {
      throw new Error(`Source lead ${src} has a different phone than the target — refusing to merge`)
    }
    validSources.push({ src, rawPhone })
  }

  const moved: Record<string, number> = {}
  let merged = 0

  const tx = await db.transaction('write')
  try {
    for (const { src, rawPhone } of validSources) {
      // Guarded archive FIRST (concurrency-safe). Only proceed for this source if we
      // actually flip it from un-merged→archived; if a concurrent merge/change already
      // claimed it (or its phone changed underneath us), rowsAffected is 0 and we skip
      // it entirely — no children moved, no audit row, not counted.
      const archiveRes = await tx.execute({
        sql: `UPDATE leads SET merged_into = ?, lead_status = 'ARCHIVED'
              WHERE row_number = ? AND merged_into IS NULL AND phone = ?`,
        args: [targetRow, src, rawPhone],
      })
      if (Number(archiveRes.rowsAffected || 0) === 0) continue // lost the race — skip

      const movedForSource: Record<string, number> = {}

      // Generic lead_row children (excludes lead_telecaller_assignments + notifications).
      for (const table of LEAD_ROW_CHILD_TABLES) {
        const res = await tx.execute({
          sql: `UPDATE ${table} SET lead_row = ? WHERE lead_row = ?`,
          args: [targetRow, src],
        })
        const count = Number(res.rowsAffected || 0)
        if (count > 0) {
          movedForSource[table] = count
          moved[table] = (moved[table] || 0) + count
        }
      }

      // lead_telecaller_assignments: lead_row is a PRIMARY KEY, so a blind reassign
      // collides when the target already has an assignment. If the target has one,
      // discard the source's row; otherwise reassign it to the target.
      const targetHasAssignment = await tx.execute({
        sql: `SELECT 1 FROM lead_telecaller_assignments WHERE lead_row = ?`,
        args: [targetRow],
      })
      if (targetHasAssignment.rows.length > 0) {
        const delRes = await tx.execute({
          sql: `DELETE FROM lead_telecaller_assignments WHERE lead_row = ?`,
          args: [src],
        })
        const delCount = Number(delRes.rowsAffected || 0)
        if (delCount > 0) {
          movedForSource['lead_telecaller_assignments_discarded'] = delCount
          moved['lead_telecaller_assignments_discarded'] =
            (moved['lead_telecaller_assignments_discarded'] || 0) + delCount
        }
      } else {
        const reassignRes = await tx.execute({
          sql: `UPDATE lead_telecaller_assignments SET lead_row = ? WHERE lead_row = ?`,
          args: [targetRow, src],
        })
        const reassignCount = Number(reassignRes.rowsAffected || 0)
        if (reassignCount > 0) {
          movedForSource['lead_telecaller_assignments'] = reassignCount
          moved['lead_telecaller_assignments'] =
            (moved['lead_telecaller_assignments'] || 0) + reassignCount
        }
      }

      // notifications are keyed on ref_lead_row (not lead_row) — reassign explicitly.
      const notifRes = await tx.execute({
        sql: `UPDATE notifications SET ref_lead_row = ? WHERE ref_lead_row = ?`,
        args: [targetRow, src],
      })
      const notifCount = Number(notifRes.rowsAffected || 0)
      if (notifCount > 0) {
        movedForSource['notifications'] = notifCount
        moved['notifications'] = (moved['notifications'] || 0) + notifCount
      }

      // Audit row per source with the moved-counts JSON.
      await tx.execute({
        sql: `INSERT INTO lead_merges (target_row, source_row, merged_by, moved)
              VALUES (?, ?, ?, ?)`,
        args: [targetRow, src, mergedBy || '', JSON.stringify(movedForSource)],
      })
      merged++
    }
    await tx.commit()
  } catch (err) {
    await tx.rollback()
    throw err
  }

  return { merged, targetRow, moved }
}
