export type UserRole = 'admin' | 'agent'
export type LeadStatus = 'NEW' | 'DECK_SENT' | 'REPLIED' | 'NO_RESPONSE' | 'CALL_DONE_INTERESTED' | 'HOT' | 'FINAL_NEGOTIATION' | 'CONVERTED' | 'DELAYED' | 'LOST'

export interface User {
  id: string
  name: string
  email: string
  password_hash: string
  role: UserRole
  can_assign: boolean
  active: boolean
  in_lead_pool: boolean
  is_closer: boolean
}

export interface SessionUser {
  id: string
  name: string
  email: string
  role: UserRole
  can_assign: boolean
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
