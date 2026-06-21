#!/usr/bin/env node
/**
 * TBWX Sales Hub MCP server.
 *
 * Exposes the Sales Hub CRM (leads + WhatsApp inbox) to Claude / n8n over the
 * stdio transport. Read tools are safe and unrestricted; write tools are a small
 * audited, non-destructive set (no deletes, no bulk operations).
 *
 * Connects DIRECTLY to the same libsql/Turso SQLite DB the Next.js app uses,
 * reusing the app's env var names (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN) and
 * its phone normalization + write/audit SQL patterns.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { getDbTarget } from './db.js'
import {
  searchLeads,
  getLead,
  getConversation,
  listRecentMessages,
  leadStats,
  listPipelineStages,
  addLeadNote,
  updateLeadStatus,
  createTask,
} from './queries.js'

// Actor label stamped on every audited write (notes / status changes / tasks).
// Override per-deployment via MCP_ACTOR (e.g. "Claude (n8n)").
const ACTOR = process.env.MCP_ACTOR || 'MCP'

const server = new McpServer({
  name: 'tbwx-saleshub-mcp',
  version: '1.0.0',
})

// Wrap a structured result as MCP text content (pretty JSON).
function json(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function fail(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// READ tools (safe)
// ─────────────────────────────────────────────────────────────────────────

server.registerTool(
  'search_leads',
  {
    title: 'Search leads',
    description:
      'Search the leads pipeline. Filter by partial name, phone (any format — matched on the last 10 digits), partial city, exact lead_status, and exact lead_priority. Paginated via limit/offset. Returns key lead fields plus total count and hasMore.',
    inputSchema: {
      name: z.string().optional().describe('Partial, case-insensitive match on full_name'),
      phone: z.string().optional().describe('Phone in any format; matched on the last 10 digits'),
      city: z.string().optional().describe('Partial, case-insensitive match on city'),
      status: z.string().optional().describe('Exact lead_status key (see list_pipeline_stages)'),
      priority: z.string().optional().describe('Exact lead_priority, e.g. HOT / WARM / COLD'),
      limit: z.number().int().min(1).max(100).default(25).describe('Page size (max 100)'),
      offset: z.number().int().min(0).default(0).describe('Rows to skip for pagination'),
    },
  },
  async ({ name, phone, city, status, priority, limit, offset }) => {
    try {
      return json(await searchLeads({ name, phone, city, status, priority, limit, offset }))
    } catch (e) {
      return fail(String(e instanceof Error ? e.message : e))
    }
  },
)

server.registerTool(
  'get_lead',
  {
    title: 'Get lead profile',
    description:
      'Fetch one lead by row_number OR phone, with a full field dump plus recent notes, recent status changes, and total message count. Provide exactly one of row_number or phone.',
    inputSchema: {
      row_number: z.number().int().optional().describe('The lead row_number (primary key)'),
      phone: z.string().optional().describe('Phone in any format; matched on the last 10 digits'),
    },
  },
  async ({ row_number, phone }) => {
    try {
      if (row_number === undefined && !phone) {
        return fail('Provide either row_number or phone.')
      }
      const result = await getLead({ rowNumber: row_number, phone })
      if (!result) return fail('Lead not found.')
      return json(result)
    } catch (e) {
      return fail(String(e instanceof Error ? e.message : e))
    }
  },
)

server.registerTool(
  'get_conversation',
  {
    title: 'Get WhatsApp conversation',
    description:
      'Return the most recent WhatsApp messages for a phone number (both sent and received), ordered oldest→newest. Defaults to the last 30 messages.',
    inputSchema: {
      phone: z.string().describe('Phone in any format; matched against normalized + raw stored values'),
      limit: z.number().int().min(1).max(200).default(30).describe('How many recent messages to return'),
    },
  },
  async ({ phone, limit }) => {
    try {
      return json({ phone, messages: await getConversation(phone, limit) })
    } catch (e) {
      return fail(String(e instanceof Error ? e.message : e))
    }
  },
)

server.registerTool(
  'list_recent_messages',
  {
    title: 'List recent inbound messages',
    description:
      'List the latest inbound (received) WhatsApp messages across all leads, newest first, with the contact name when known. Useful for triaging the inbox.',
    inputSchema: {
      limit: z.number().int().min(1).max(100).default(20).describe('How many recent inbound messages to return'),
    },
  },
  async ({ limit }) => {
    try {
      return json({ messages: await listRecentMessages(limit) })
    } catch (e) {
      return fail(String(e instanceof Error ? e.message : e))
    }
  },
)

server.registerTool(
  'lead_stats',
  {
    title: 'Lead statistics',
    description:
      'Pipeline overview: total leads, counts by status, counts by priority, conversions, conversion rate, and new leads created today.',
    inputSchema: {},
  },
  async () => {
    try {
      return json(await leadStats())
    } catch (e) {
      return fail(String(e instanceof Error ? e.message : e))
    }
  },
)

server.registerTool(
  'list_pipeline_stages',
  {
    title: 'List pipeline stages',
    description:
      'List the configured pipeline stages (the funnel definition) from the pipeline_stages table. The `key` of each stage is the valid value for update_lead_status. By default only active stages are returned.',
    inputSchema: {
      include_inactive: z.boolean().default(false).describe('Include stages with is_active = 0'),
    },
  },
  async ({ include_inactive }) => {
    try {
      return json({ stages: await listPipelineStages(include_inactive) })
    } catch (e) {
      return fail(String(e instanceof Error ? e.message : e))
    }
  },
)

// ─────────────────────────────────────────────────────────────────────────
// WRITE tools (audited, non-destructive)
// ─────────────────────────────────────────────────────────────────────────

server.registerTool(
  'add_lead_note',
  {
    title: 'Add lead note',
    description:
      'Append a free-text note to a lead by phone. The note is attributed to the MCP actor and timestamped. Non-destructive — it only inserts a new note row.',
    inputSchema: {
      phone: z.string().describe('Phone in any format; normalized to 91XXXXXXXXXX before storing'),
      text: z.string().min(1).describe('The note body'),
    },
  },
  async ({ phone, text }) => {
    try {
      return json(await addLeadNote({ phone, text, createdBy: ACTOR }))
    } catch (e) {
      return fail(String(e instanceof Error ? e.message : e))
    }
  },
)

server.registerTool(
  'update_lead_status',
  {
    title: 'Update lead status',
    description:
      'Move a lead to a new pipeline stage by row_number OR phone. The new status is VALIDATED against the pipeline_stages keys; an invalid status is rejected with the list of valid keys. On success it updates the lead status, recomputes next_followup from the new status (same rules as the app — a per-status interval, or cleared on CONVERTED/LOST), and writes an audit row to lead_status_changes with source "mcp". It does NOT fire Meta CAPI offline-conversion events or in-app owner notifications — those require the Next.js app runtime and must be triggered separately. Provide exactly one of row_number or phone. No-op (reported as unchanged) if the lead is already in that status.',
    inputSchema: {
      row_number: z.number().int().optional().describe('The lead row_number (primary key)'),
      phone: z.string().optional().describe('Phone in any format; matched on the last 10 digits'),
      new_status: z.string().describe('Target pipeline stage key (see list_pipeline_stages)'),
    },
  },
  async ({ row_number, phone, new_status }) => {
    try {
      if (row_number === undefined && !phone) {
        return fail('Provide either row_number or phone.')
      }
      const result = await updateLeadStatus({ rowNumber: row_number, phone, newStatus: new_status, changedBy: ACTOR })
      if (!result.ok) return fail(JSON.stringify(result))
      return json(result)
    } catch (e) {
      return fail(String(e instanceof Error ? e.message : e))
    }
  },
)

server.registerTool(
  'create_task',
  {
    title: 'Create task',
    description:
      'Create a follow-up task/reminder, optionally linked to a lead by phone. due_at should be an ISO-8601 datetime string. Attributed to the MCP actor. Non-destructive — inserts one task row.',
    inputSchema: {
      phone: z.string().optional().describe('Optional phone to link the task to a lead/contact'),
      title: z.string().min(1).describe('What the task is'),
      due_at: z
        .string()
        .refine((s) => !Number.isNaN(Date.parse(s)), {
          message: 'due_at must be a valid ISO-8601 datetime, e.g. 2026-06-20T09:00:00Z',
        })
        .describe('Due datetime, ISO-8601 (e.g. 2026-06-20T09:00:00Z)'),
    },
  },
  async ({ phone, title, due_at }) => {
    try {
      return json(await createTask({ phone, title, dueAt: due_at, createdBy: ACTOR }))
    } catch (e) {
      return fail(String(e instanceof Error ? e.message : e))
    }
  },
)

// ─────────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stderr is safe — stdout is reserved for the MCP protocol.
  console.error(`[tbwx-saleshub-mcp] connected (db: ${getDbTarget()}, actor: ${ACTOR})`)
}

main().catch((err) => {
  console.error('[tbwx-saleshub-mcp] fatal:', err)
  process.exit(1)
})
