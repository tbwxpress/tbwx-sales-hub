export type UserRole = 'admin' | 'agent'
export type LeadStatus = 'NEW' | 'DECK_SENT' | 'REPLIED' | 'NO_RESPONSE' | 'CALL_DONE_INTERESTED' | 'HOT' | 'FINAL_NEGOTIATION' | 'CONVERTED' | 'DELAYED' | 'LOST' | 'ARCHIVED'

export interface User {
  id: string
  name: string
  email: string
  password_hash: string
  role: UserRole
  can_assign: boolean
  can_edit_leads: boolean
  active: boolean
  in_lead_pool: boolean
  is_closer: boolean
  is_telecaller: boolean
  lead_pool_paused: boolean
}

export interface SessionUser {
  id: string
  name: string
  email: string
  role: UserRole
  can_assign: boolean
  can_edit_leads?: boolean
  is_telecaller?: boolean
}

export interface Lead {
  row_number: number
  id: string
  created_time: string
  campaign_name: string
  full_name: string
  phone: string
  email: string
  city: string
  state: string
  model_interest: string
  experience: string
  timeline: string
  platform: string
  lead_status: LeadStatus
  attempted_contact: string
  first_call_date: string
  wa_message_id: string
  lead_priority: string
  assigned_to: string
  next_followup: string
  notes: string
  lead_score?: number
}

export interface Message {
  timestamp: string
  phone: string
  name: string
  direction: 'sent' | 'received'
  text: string
  sent_by: string
  wa_message_id: string
  status: string
  template_used: string
}

export interface QuickReply {
  id: string
  category: string
  title: string
  message: string
  created_by: string
  created_at: string
}

export interface KnowledgeBaseEntry {
  id: string
  category: string
  title: string
  content: string
  link: string
  created_by: string
  created_at: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface Delegation {
  id: number
  lead_row: number
  phone: string
  from_agent_id: string
  from_agent_name: string
  to_agent_id: string
  to_agent_name: string
  status: 'pending' | 'active' | 'declined' | 'ended'
  message: string
  expires_at: string | null
  created_at: string
  responded_at: string | null
  ended_at: string | null
  ended_by: string
}

export type PaymentFollowupStatus = 'pending' | 'in_progress' | 'partially_cleared' | 'cleared' | 'blocked'

export interface PaymentFollowup {
  id: number
  lead_row: number | null
  phone: string
  franchise_name: string
  amount: number
  currency: string
  due_date: string | null
  assigned_to_id: string
  assigned_to_name: string
  created_by_id: string
  created_by_name: string
  status: PaymentFollowupStatus
  reason: string
  cleared_at: string | null
  cleared_by_id: string
  cleared_amount: number
  notes: string
  created_at: string
  updated_at: string
}

export interface PaymentFollowupUpdate {
  id: number
  followup_id: number
  old_status: string
  new_status: string
  reason: string
  amount_change: number
  note: string
  updated_by_id: string
  updated_by_name: string
  created_at: string
}

export interface GoogleAdsLead {
  campaign_name?: string
  campaign_id?: string
  form_name?: string
  first_name?: string
  last_name?: string
  full_name?: string
  phone_number: string
  email?: string
  city?: string
  state?: string
  model_interest?: string
  experience?: string
  timeline?: string
  investment_budget?: string
  gclid?: string
  created_time?: string
}
