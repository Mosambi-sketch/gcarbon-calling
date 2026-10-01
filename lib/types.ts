// Types for Gcarbon Calling CRM
export type Role = 'admin' | 'caller'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  avatar_color?: string
}

export const TEAM_MEMBERS = [
  { name: 'Ajinkya', email: 'ajinkya@gcarbon.in', role: 'admin' as Role, color: '#D9F56B' },
  { name: 'Himanshi', email: 'himanshi@gcarbon.in', role: 'caller' as Role, color: '#F9E1D2' },
  { name: 'Tamanna', email: 'tamanna@gcarbon.in', role: 'caller' as Role, color: '#E8894F' },
  { name: 'Kunal', email: 'kunal@gcarbon.in', role: 'caller' as Role, color: '#C4B5FD' },
  { name: 'Ankesh', email: 'ankesh@gcarbon.in', role: 'caller' as Role, color: '#93C5FD' },
]

export const LISTS = [
  { id: 'connection-list', name: 'Connection List', type: 'company' as const },
  { id: 'cold-calling-1', name: 'Cold Calling 1', type: 'company' as const },
  { id: 'cold-calling-2', name: 'Cold Calling 2 (Assoc.)', type: 'company' as const },
  { id: 'new-list', name: 'New List', type: 'company' as const },
  { id: 'data-centres', name: 'Data Centres', type: 'company' as const },
  { id: 'kharadi', name: 'Kharadi', type: 'company' as const },
  { id: 'ranjangaon', name: 'Ranjangaon', type: 'company' as const },
  { id: 'bhosari', name: 'Bhosari', type: 'company' as const },
  { id: 'chakan', name: 'Chakan', type: 'company' as const },
  { id: 'freelancers', name: 'Freelancers', type: 'freelancer' as const },
]

export type OutcomeType =
  | 'Not Called'
  | 'Not Picked'
  | 'Not Reachable / Out of Service'
  | 'Invalid Number'
  | 'Wrong Person / Left Firm'
  | 'Call Back Later'
  | 'Connected - Interested'
  | 'Meeting Scheduled'
  | 'Profile / Mail Sent'
  | 'Not Interested'
  | 'Already Handled Internally'

export const OUTCOMES: OutcomeType[] = [
  'Not Called',
  'Not Picked',
  'Not Reachable / Out of Service',
  'Invalid Number',
  'Wrong Person / Left Firm',
  'Call Back Later',
  'Connected - Interested',
  'Meeting Scheduled',
  'Profile / Mail Sent',
  'Not Interested',
  'Already Handled Internally',
]

export type CompanyStatus = 'Not Called' | 'In Progress' | 'Follow-up Due' | 'Meeting Set' | 'Won/Interested' | 'Dead'
export type Priority = 'high' | 'medium' | 'low'
export type TaskStatus = 'todo' | 'doing' | 'done'

export interface Company {
  id: string
  name: string
  list_id: string
  sector?: string
  industry?: string
  location?: string
  website?: string
  notes?: string
  reference: boolean
  status: CompanyStatus
  created_at: string
}

export interface Contact {
  id: string
  company_id: string
  name: string
  designation?: string
  phones: string[]
  email?: string
  is_primary: boolean
}

export interface CallLog {
  id: string
  company_id: string
  contact_id?: string
  caller_id: string
  caller_name: string
  called_at: string
  outcome: OutcomeType
  remark?: string
  next_action?: string
  follow_up_date?: string
}

export interface Task {
  id: string
  title: string
  description?: string
  assignee_id: string
  assignee_name: string
  company_id?: string
  company_name?: string
  due_at?: string
  priority: Priority
  status: TaskStatus
  created_by: string
  created_at: string
}

export interface Note {
  id: string
  owner_id: string
  title: string
  body: string
  pinned: boolean
  company_id?: string
  company_name?: string
  updated_at: string
}

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  type: 'meeting' | 'follow-up' | 'other'
  company_id?: string
  owner_id: string
  all_day?: boolean
}

// Computed status from last call log outcome
export function outcomeToStatus(outcome: OutcomeType): CompanyStatus {
  switch (outcome) {
    case 'Not Called': return 'Not Called'
    case 'Meeting Scheduled': return 'Meeting Set'
    case 'Connected - Interested': return 'Won/Interested'
    case 'Not Interested':
    case 'Invalid Number':
    case 'Already Handled Internally':
    case 'Wrong Person / Left Firm':
    case 'Not Reachable / Out of Service':
      return 'Dead'
    default: return 'In Progress'
  }
}

export function getStatusColor(status: CompanyStatus): string {
  switch (status) {
    case 'Not Called': return 'status-not-called'
    case 'In Progress': return 'status-in-progress'
    case 'Follow-up Due': return 'status-follow-up'
    case 'Meeting Set': return 'status-meeting'
    case 'Won/Interested': return 'status-interested'
    case 'Dead': return 'status-dead'
    default: return 'status-not-called'
  }
}

export function getOutcomeCategory(outcome: OutcomeType): 'positive' | 'warning' | 'neutral' | 'negative' {
  switch (outcome) {
    case 'Connected - Interested':
    case 'Meeting Scheduled':
      return 'positive'
    case 'Call Back Later':
    case 'Profile / Mail Sent':
      return 'warning'
    case 'Not Interested':
    case 'Invalid Number':
    case 'Not Reachable / Out of Service':
    case 'Already Handled Internally':
    case 'Wrong Person / Left Firm':
      return 'negative'
    default: return 'neutral'
  }
}

// Avatar colors for team members
export const AVATAR_COLORS: Record<string, string> = {
  'Ajinkya': '#D9F56B',
  'Himanshi': '#F9E1D2',
  'Tamanna': '#E8894F',
  'Kunal': '#C4B5FD',
  'Ankesh': '#93C5FD',
}

export function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name] || '#E8E8E8'
}

export function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}
