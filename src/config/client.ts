/**
 * Client Configuration — Central config for all client-specific values.
 *
 * When deploying for a new client:
 * 1. Copy .env.example to .env.local
 * 2. Fill in all values for the new client
 * 3. Adjust LEAD_COLUMN_MAP and LEAD_WRITE_COLUMNS below if their
 *    Google Sheet has a different column layout
 * 4. Update LEAD_STATUSES if their sales process uses different stages
 * 5. Run `npm run seed-admin` to create the first admin user
 */

// ─── Brand ──────────────────────────────────────────────────────────
export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'TBWX Sales Hub',
  short: process.env.NEXT_PUBLIC_BRAND_SHORT || 'TBWX',
  logo: process.env.NEXT_PUBLIC_BRAND_LOGO || '/logo-tbwx.png',
  description: process.env.NEXT_PUBLIC_BRAND_DESCRIPTION || 'Sales dashboard for The Belgian Waffle Xpress',
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || 'Just Waffle It.',
  supportEmail: process.env.NEXT_PUBLIC_BRAND_SUPPORT_EMAIL || '',
} as const

// ─── Auth ───────────────────────────────────────────────────────────
export const AUTH = {
  cookieName: process.env.SESSION_COOKIE_NAME || 'saleshub_session',
  sessionDays: 7,
} as const

// ─── WhatsApp ───────────────────────────────────────────────────────
// Meta Graph API base — override via META_GRAPH_API_BASE env var if needed
const DEFAULT_GRAPH_PROTO = 'https'
const DEFAULT_GRAPH_HOST = 'graph.facebook.com'
const DEFAULT_GRAPH_VERSION = 'v21.0'
const META_GRAPH_API_BASE = process.env.META_GRAPH_API_BASE
  || `${DEFAULT_GRAPH_PROTO}://${DEFAULT_GRAPH_HOST}/${DEFAULT_GRAPH_VERSION}`

export const WHATSAPP = {
  apiBase: META_GRAPH_API_BASE,
  wabaId: process.env.WHATSAPP_WABA_ID || '',
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  token: process.env.WHATSAPP_TOKEN || '',
  webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'saleshub-webhook-verify',
  /** Days to auto-set next follow-up after sending a message */
  autoFollowupDays: 3,
  /** Status to auto-set when a message is sent to a lead */
  autoSentStatus: 'DECK_SENT' as const,
  /** Status to auto-set when a lead replies */
  autoReplyStatus: 'REPLIED' as const,
} as const

// ─── Google Ads ──────────────────────────────────────────────────────
export const GOOGLE_ADS = {
  webhookSecret: process.env.GOOGLE_ADS_WEBHOOK_SECRET || '',
  platform: 'Google Ads',
  defaultPriority: 'WARM' as const,
} as const

// ─── Meta Ads ────────────────────────────────────────────────────────
export const META_ADS = {
  apiBase: WHATSAPP.apiBase, // Reuse WhatsApp's Graph API base
  accessToken: process.env.META_ACCESS_TOKEN || '',
  adAccountId: process.env.META_AD_ACCOUNT_ID || '',
  /** Minimum minutes between manual refreshes (admin button cooldown) */
  refreshCooldownMinutes: 15,
  /** How often the background cron should sync (hours) */
  syncIntervalHours: 6,
} as const

// ─── Google Sheets — Tab Names ──────────────────────────────────────
export const SHEETS = {
  tabs: {
    leads: process.env.LEADS_TAB_NAME || 'Leads',
    replies: process.env.REPLIES_TAB_NAME || 'Replies',
    sentMessages: process.env.SENT_MESSAGES_TAB_NAME || 'SentMessages',
    users: process.env.USERS_TAB_NAME || 'Users',
    quickReplies: process.env.QUICK_REPLIES_TAB_NAME || 'QuickReplies',
    knowledgeBase: process.env.KNOWLEDGE_BASE_TAB_NAME || 'KnowledgeBase',
  },
  ranges: {
    /** How far right the leads data extends (e.g. A2:AC for 29 columns) */
    leadsEnd: 'AC',
    /** Range for replies tab */
    repliesRange: 'A2:G',
    /** Range for sent messages tab */
    sentRange: 'A2:H',
    /** Range for users tab */
    usersRange: 'A2:G',
    /** Range for quick replies tab */
    quickRepliesRange: 'A2:F',
    /** Range for knowledge base tab */
    knowledgeBaseRange: 'A2:G',
  },
} as const

// ─── Google Sheets — Lead Column Mapping (READ) ─────────────────────
// Maps Lead field names to their column INDEX (0-based) in the sheet.
// Adjust these if the client's sheet has columns in a different order.
export const LEAD_COLUMN_MAP: Record<string, number> = {
  id: 0,
  created_time: 1,
  campaign_name: 7,
  platform: 11,
  model_interest: 12,
  experience: 13,
  timeline: 14,
  full_name: 15,
  phone: 16,         // Note: 'p:' prefix is auto-stripped
  email: 17,
  city: 18,
  state: 19,
  lead_status: 21,   // Defaults to 'NEW' if empty
  attempted_contact: 22,
  first_call_date: 23,
  wa_message_id: 24,
  lead_priority: 25,
  assigned_to: 26,
  next_followup: 27,
  notes: 28,
}

// ─── Google Sheets — Lead Column Mapping (WRITE) ────────────────────
// Maps Lead field names to their column LETTER for update operations.
// Must match the indices above.
export const LEAD_WRITE_COLUMNS: Record<string, string> = {
  lead_status: 'V',
  attempted_contact: 'W',
  first_call_date: 'X',
  wa_message_id: 'Y',
  lead_priority: 'Z',
  assigned_to: 'AA',
  next_followup: 'AB',
  notes: 'AC',
}

// ─── Lead Statuses ──────────────────────────────────────────────────
// The sales funnel stages. Adjust per client's sales process.
export const LEAD_STATUSES = [
  'NEW',
  'DECK_SENT',
  'REPLIED',
  'CALLING',
  'CALL_DONE',
  'INTERESTED',
  'NEGOTIATION',
  'CONVERTED',
  'DELAYED',
  'LOST',
] as const

export const LEAD_PRIORITIES = ['HOT', 'WARM', 'COLD'] as const

// ─── Status Colors (used in dashboard/pipeline) ─────────────────────
export const STATUS_COLORS: Record<string, string> = {
  NEW: 'text-blue-400',
  DECK_SENT: 'text-purple-400',
  REPLIED: 'text-emerald-400',
  CALLING: 'text-yellow-400',
  CALL_DONE: 'text-teal-400',
  INTERESTED: 'text-cyan-400',
  NEGOTIATION: 'text-pink-400',
  CONVERTED: 'text-green-400',
  DELAYED: 'text-amber-400',
  LOST: 'text-red-400',
}

export const FOLLOWUP_DAYS: Record<string, number> = {
  NEW: 1,
  DECK_SENT: 1,
  REPLIED: 0,
  CALLING: 1,
  CALL_DONE: 2,
  INTERESTED: 2,
  NEGOTIATION: 2,
  DELAYED: 7,
}

export const PRIORITY_COLORS: Record<string, string> = {
  HOT: 'text-orange-400 bg-orange-400/10',
  WARM: 'text-amber-400 bg-amber-400/10',
  COLD: 'text-blue-400 bg-blue-400/10',
}

// ─── Drip Sequences ──────────────────────────────────────────────────
// Automated follow-up message sequences per pipeline stage.
// Each step defines days since sequence started and the template to send.
// Templates must be approved WhatsApp Utility templates.
export const DRIP_SEQUENCES: Record<string, { steps: { day: number; template: string; description: string }[] }> = {
  DECK_SENT: {
    steps: [
      { day: 1, template: 'drip_deck_followup_1', description: 'Did you review the franchise deck?' },
      { day: 3, template: 'drip_deck_followup_2', description: 'Partner earnings and ROI info' },
      { day: 5, template: 'drip_deck_followup_3', description: 'Shall we schedule a call?' },
    ],
  },
  CALL_DONE: {
    steps: [
      { day: 2, template: 'drip_postcall_followup_1', description: 'Post-call follow-up' },
      { day: 4, template: 'drip_postcall_followup_2', description: 'Limited slots in your city' },
    ],
  },
}

// Statuses that should pause/stop drip sequences
export const DRIP_PAUSE_STATUSES: string[] = ['INTERESTED', 'NEGOTIATION', 'CONVERTED', 'LOST']
// Statuses that should delay drip (temporary pause)
export const DRIP_DELAY_STATUSES: string[] = ['DELAYED']
