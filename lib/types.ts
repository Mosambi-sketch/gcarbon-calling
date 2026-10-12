// Types for Gcarbon Calling CRM
export type Role = 'admin' | 'caller'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  avatar_color?: string
  avatar?: string
}

export const TEAM_MEMBERS = [
  { name: 'Aadarsh', email: 'aadarsh.gcarbon@gmail.com', role: 'admin' as Role, color: '#A7F3D0', avatar: '/avatars/aadarsh-face.jpg' },
  { name: 'Tamanna', email: 'tamanna.gcarbon@gmail.com', role: 'caller' as Role, color: '#E8894F', avatar: '/avatars/tamanna-face.jpg' },
  { name: 'Naresh', email: 'naresh.gcarbon@gmail.com', role: 'caller' as Role, color: '#FDE047', avatar: '/avatars/naresh-face.jpg' },
  { name: 'Pranita', email: 'pranita.gcarbon@gmail.com', role: 'caller' as Role, color: '#F472B6', avatar: '/avatars/pranita-face.jpg' },
  { name: 'Himanshi', email: 'himanshi.gcarbon@gmail.com', role: 'caller' as Role, color: '#F9E1D2', avatar: '/avatars/himanshi-face.jpg' },
  { name: 'Ankesh', email: 'ankesh.gcarbon@gmail.com', role: 'caller' as Role, color: '#93C5FD', avatar: '/avatars/ankesh-face.jpg' },
  { name: 'Kunal', email: 'kunal.gcarbon114@gmail.com', role: 'caller' as Role, color: '#C4B5FD', avatar: '/avatars/kunal-face.jpg' },
  { name: 'Ajinkya', email: 'ajnikya.gcarbon@gmail.com', role: 'caller' as Role, color: '#D9F56B', avatar: '/avatars/ajinkya-face.png' },
]

// Lists are fully dynamic — no hardcoded lists. Users create them by
// uploading an Excel file or clicking "New List" in the Calling workspace.

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

export interface Workspace {
  id: string
  name: string
  type: 'company' | 'freelancer'
  description?: string
  created_by?: string
  created_at: string
  updated_at?: string
  archived?: boolean
  columns?: string[]
}

export type ColumnType = 'text' | 'number' | 'date' | 'select' | 'phone' | 'email' | 'url'

export interface WorkspaceColumn {
  id: string
  workspace_id: string
  name: string
  type: ColumnType
  position: number
  required: boolean
  options?: string[]
  hidden?: boolean
}

export interface AuditLog {
  id: string
  entity_type: string
  entity_id: string
  user_id: string
  user_name: string
  action: 'create' | 'update' | 'delete' | 'archive' | 'restore' | 'assign' | 'import'
  field_name?: string
  old_value?: string
  new_value?: string
  created_at: string
}

export interface ImportRecord {
  id: string
  workspace_id: string
  user_id: string
  user_name: string
  filename: string
  row_count: number
  status: 'completed' | 'rolled_back'
  column_mapping: Record<string, string>
  created_at: string
}

export interface LeadLock {
  id: string
  company_id: string
  user_id: string
  user_name: string
  user_color: string
  locked_at: string
  expires_at: string
}

export type CompanyStatus =
  | 'Not Called'
  | 'Attempted'
  | 'In Progress'
  | 'Connected'
  | 'Qualified'
  | 'Interested'
  | 'Follow-up Due'
  | 'Meeting Scheduled'
  | 'Meeting Set'
  | 'Meeting Completed'
  | 'Proposal Sent'
  | 'Negotiation'
  | 'Won'
  | 'Won/Interested'
  | 'Lost'
  | 'Dead'
  | 'Archived'

export type Priority = 'high' | 'medium' | 'low'
export type TaskStatus = 'todo' | 'doing' | 'done'

export interface Company {
  id: string
  name: string
  list_id: string
  workspace_id?: string
  owner_id?: string
  owner_name?: string
  archived?: boolean
  archived_at?: string
  import_id?: string
  source_data?: Record<string, unknown>
  custom_fields?: Record<string, string>
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
  caller_id?: string
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
  meet_link?: string
  gcal_id?: string
  gcal_html_link?: string
}

import { isDueOrOverdueIST } from './date'

// Computed status from last call log outcome and optional follow-up date
export function outcomeToStatus(outcome: OutcomeType, followUpDate?: string): CompanyStatus {
  if (outcome === 'Meeting Scheduled') return 'Meeting Scheduled'
  if (outcome === 'Connected - Interested') return 'Interested'
  if (
    outcome === 'Not Interested' ||
    outcome === 'Invalid Number' ||
    outcome === 'Already Handled Internally' ||
    outcome === 'Wrong Person / Left Firm' ||
    outcome === 'Not Reachable / Out of Service'
  ) {
    return 'Dead'
  }
  if (followUpDate && isDueOrOverdueIST(followUpDate)) {
    return 'Follow-up Due'
  }
  if (outcome === 'Not Called') return 'Not Called'
  if (outcome === 'Not Picked' || outcome === 'Call Back Later') return 'Attempted'
  return 'In Progress'
}

// Real-time derived status from company record and its last call log
export function deriveCompanyStatus(company: Company, lastLog?: CallLog): CompanyStatus {
  if (!lastLog) {
    return company.status || 'Not Called'
  }
  return outcomeToStatus(lastLog.outcome, lastLog.follow_up_date)
}

export function getStatusColor(status: CompanyStatus): string {
  switch (status) {
    case 'Not Called': return 'status-not-called'
    case 'Attempted':
    case 'In Progress':
    case 'Connected':
      return 'status-in-progress'
    case 'Follow-up Due': return 'status-follow-up'
    case 'Qualified':
    case 'Interested':
    case 'Won/Interested':
    case 'Won':
      return 'status-interested'
    case 'Meeting Scheduled':
    case 'Meeting Set':
    case 'Meeting Completed':
      return 'status-meeting'
    case 'Proposal Sent':
    case 'Negotiation':
      return 'status-follow-up'
    case 'Dead':
    case 'Lost':
      return 'status-dead'
    case 'Archived':
      return 'status-not-called'
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
  'Aadarsh': '#A7F3D0',
  'Naresh': '#FDE047',
  'Pranita': '#F472B6',
}

export function getAvatar(name: string): string | undefined {
  if (!name) return undefined
  const norm = name.toLowerCase()
  if (norm.includes('ajinkya')) return '/avatars/ajinkya-face.png'
  if (norm.includes('himanshi')) return '/avatars/himanshi-face.jpg'
  if (norm.includes('tamanna')) return '/avatars/tamanna-face.jpg'
  if (norm.includes('ankesh')) return '/avatars/ankesh-face.jpg'
  if (norm.includes('aadarsh')) return '/avatars/aadarsh-face.jpg'
  if (norm.includes('naresh')) return '/avatars/naresh-face.jpg'
  if (norm.includes('pranita')) return '/avatars/pranita-face.jpg'
  if (norm.includes('kunal')) return '/avatars/kunal-face.jpg'
  return undefined
}

export function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name] || '#E8E8E8'
}

export function getInitials(name?: string | null): string {
  if (!name || typeof name !== 'string') return 'GC'
  return name.trim().split(/\s+/).map(p => p[0]).join('').toUpperCase().slice(0, 2) || 'GC'
}
