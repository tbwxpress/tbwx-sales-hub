export type UserRole = 'admin' | 'agent'
export type LeadStatus = 'NEW' | 'DECK_SENT' | 'CONTACTED' | 'REPLIED' | 'CALL_DONE' | 'INTERESTED' | 'SITE_VISIT' | 'NEGOTIATION' | 'HOT' | 'CONVERTED' | 'LOST'

export interface User {
  id: string
  name: string
  email: string
  password_hash: string
  role: UserRole
  can_assign: boolean
  active: boolean
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

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
