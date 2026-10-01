// In-memory + localStorage data store for Gcarbon Calling CRM
// This replaces Supabase for local-first operation.
// When you configure Supabase credentials, swap these with supabase-js calls.

import { v4 as uuidv4 } from 'uuid'
import type {
  Company, Contact, CallLog, Task, Note, CalendarEvent,
  CompanyStatus, OutcomeType
} from './types'
import { outcomeToStatus } from './types'

// ---------- Storage keys ----------
const KEYS = {
  companies: 'gc_companies',
  contacts: 'gc_contacts',
  call_logs: 'gc_call_logs',
  tasks: 'gc_tasks',
  notes: 'gc_notes',
  events: 'gc_events',
  lists: 'gc_lists',
  users: 'gc_users',
  seeded: 'gc_seeded',
  current_user: 'gc_current_user',
}

// ---------- Generic CRUD helpers ----------
function load<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function save<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(data))
}

function genId() { return uuidv4() }

// ---------- Auth ----------
export interface AppUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'caller'
  color: string
  password: string
}

export const DEFAULT_USERS: AppUser[] = [
  { id: 'user-ajinkya', email: 'ajinkya@gcarbon.in', name: 'Ajinkya', role: 'admin', color: '#D9F56B', password: 'gcarbon123' },
  { id: 'user-himanshi', email: 'himanshi@gcarbon.in', name: 'Himanshi', role: 'caller', color: '#F9E1D2', password: 'gcarbon123' },
  { id: 'user-tamanna', email: 'tamanna@gcarbon.in', name: 'Tamanna', role: 'caller', color: '#E8894F', password: 'gcarbon123' },
  { id: 'user-kunal', email: 'kunal@gcarbon.in', name: 'Kunal', role: 'caller', color: '#C4B5FD', password: 'gcarbon123' },
  { id: 'user-ankesh', email: 'ankesh@gcarbon.in', name: 'Ankesh', role: 'caller', color: '#93C5FD', password: 'gcarbon123' },
]

export function getUsers(): AppUser[] {
  const stored = load<AppUser>(KEYS.users)
  if (stored.length === 0) {
    save(KEYS.users, DEFAULT_USERS)
    return DEFAULT_USERS
  }
  return stored
}

export function login(email: string, password: string): AppUser | null {
  const users = getUsers()
  return users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password) || null
}

export function getCurrentUser(): AppUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(KEYS.current_user)
  return raw ? JSON.parse(raw) : null
}

export function setCurrentUser(user: AppUser | null): void {
  if (typeof window === 'undefined') return
  if (user) {
    localStorage.setItem(KEYS.current_user, JSON.stringify(user))
  } else {
    localStorage.removeItem(KEYS.current_user)
  }
}

export function getUserById(id: string): AppUser | undefined {
  return getUsers().find(u => u.id === id)
}

export function getUserByName(name: string): AppUser | undefined {
  return getUsers().find(u => u.name.toLowerCase() === name.toLowerCase())
}

// ---------- Lists ----------
export interface ListDef {
  id: string
  name: string
  type: 'company' | 'freelancer'
  created_at: string
}

const DEFAULT_LISTS: ListDef[] = [
  { id: 'connection-list', name: 'Connection List', type: 'company', created_at: new Date().toISOString() },
  { id: 'cold-calling-1', name: 'Cold Calling 1', type: 'company', created_at: new Date().toISOString() },
  { id: 'cold-calling-2', name: 'Cold Calling 2 (Assoc.)', type: 'company', created_at: new Date().toISOString() },
  { id: 'new-list', name: 'New List', type: 'company', created_at: new Date().toISOString() },
  { id: 'data-centres', name: 'Data Centres', type: 'company', created_at: new Date().toISOString() },
  { id: 'kharadi', name: 'Kharadi', type: 'company', created_at: new Date().toISOString() },
  { id: 'ranjangaon', name: 'Ranjangaon', type: 'company', created_at: new Date().toISOString() },
  { id: 'bhosari', name: 'Bhosari', type: 'company', created_at: new Date().toISOString() },
  { id: 'chakan', name: 'Chakan', type: 'company', created_at: new Date().toISOString() },
  { id: 'freelancers', name: 'Freelancers', type: 'freelancer', created_at: new Date().toISOString() },
]

export function getLists(): ListDef[] {
  const stored = load<ListDef>(KEYS.lists)
  if (stored.length === 0) {
    save(KEYS.lists, DEFAULT_LISTS)
    return DEFAULT_LISTS
  }
  return stored
}

export function addList(name: string, type: 'company' | 'freelancer' = 'company'): ListDef {
  const lists = getLists()
  const newList: ListDef = {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    type,
    created_at: new Date().toISOString(),
  }
  save(KEYS.lists, [...lists, newList])
  return newList
}

// ---------- Companies ----------
export function getCompanies(listId?: string): Company[] {
  const all = load<Company>(KEYS.companies)
  if (listId && listId !== 'all') return all.filter(c => c.list_id === listId)
  return all
}

export function getCompanyById(id: string): Company | undefined {
  return load<Company>(KEYS.companies).find(c => c.id === id)
}

export function addCompany(data: Omit<Company, 'id' | 'created_at'>): Company {
  const companies = load<Company>(KEYS.companies)
  const company: Company = {
    id: genId(),
    created_at: new Date().toISOString(),
    ...data,
  }
  save(KEYS.companies, [...companies, company])
  return company
}

export function updateCompany(id: string, data: Partial<Company>): Company | null {
  const companies = load<Company>(KEYS.companies)
  const idx = companies.findIndex(c => c.id === id)
  if (idx < 0) return null
  companies[idx] = { ...companies[idx], ...data }
  save(KEYS.companies, companies)
  return companies[idx]
}

export function deleteCompany(id: string): void {
  save(KEYS.companies, load<Company>(KEYS.companies).filter(c => c.id !== id))
}

export function checkDuplicateCompany(name: string, phones: string[]): Company | null {
  const all = load<Company>(KEYS.companies)
  const normName = name.toLowerCase().trim()
  
  // Check by name similarity
  const byName = all.find(c => {
    const n = c.name.toLowerCase().trim()
    return n === normName || n.includes(normName) || normName.includes(n)
  })
  if (byName) return byName

  // Check by phone
  if (phones.length > 0) {
    const allContacts = load<Contact>(KEYS.contacts)
    for (const phone of phones) {
      const match = allContacts.find(c => c.phones.includes(phone))
      if (match) {
        return all.find(c => c.id === match.company_id) || null
      }
    }
  }

  return null
}

// ---------- Contacts ----------
export function getContacts(companyId?: string): Contact[] {
  const all = load<Contact>(KEYS.contacts)
  if (companyId) return all.filter(c => c.company_id === companyId)
  return all
}

export function addContact(data: Omit<Contact, 'id'>): Contact {
  const contacts = load<Contact>(KEYS.contacts)
  const contact: Contact = { id: genId(), ...data }
  save(KEYS.contacts, [...contacts, contact])
  return contact
}

export function updateContact(id: string, data: Partial<Contact>): Contact | null {
  const contacts = load<Contact>(KEYS.contacts)
  const idx = contacts.findIndex(c => c.id === id)
  if (idx < 0) return null
  contacts[idx] = { ...contacts[idx], ...data }
  save(KEYS.contacts, contacts)
  return contacts[idx]
}

// ---------- Call Logs ----------
export function getCallLogs(companyId?: string): CallLog[] {
  const all = load<CallLog>(KEYS.call_logs)
  if (companyId) return all.filter(l => l.company_id === companyId).sort((a, b) => 
    new Date(b.called_at).getTime() - new Date(a.called_at).getTime()
  )
  return all.sort((a, b) => new Date(b.called_at).getTime() - new Date(a.called_at).getTime())
}

export function addCallLog(data: Omit<CallLog, 'id'>): CallLog {
  const logs = load<CallLog>(KEYS.call_logs)
  const log: CallLog = { id: genId(), ...data }
  logs.push(log)
  save(KEYS.call_logs, logs)
  
  // Update company status
  const companies = load<Company>(KEYS.companies)
  const compIdx = companies.findIndex(c => c.id === data.company_id)
  if (compIdx >= 0) {
    let status: CompanyStatus = outcomeToStatus(data.outcome)
    // If follow-up date is set and in the future, override to Follow-up Due
    if (data.follow_up_date) {
      const fDate = new Date(data.follow_up_date)
      const today = new Date()
      if (fDate >= today && status !== 'Meeting Set' && status !== 'Won/Interested') {
        status = 'Follow-up Due'
      }
    }
    companies[compIdx].status = status
    save(KEYS.companies, companies)
  }

  return log
}

export function getLastCallLog(companyId: string): CallLog | undefined {
  return getCallLogs(companyId)[0]
}

// ---------- Tasks ----------
export function getTasks(assigneeId?: string): Task[] {
  const all = load<Task>(KEYS.tasks)
  if (assigneeId) return all.filter(t => t.assignee_id === assigneeId)
  return all
}

export function addTask(data: Omit<Task, 'id' | 'created_at'>): Task {
  const tasks = load<Task>(KEYS.tasks)
  const task: Task = {
    id: genId(),
    created_at: new Date().toISOString(),
    ...data,
  }
  save(KEYS.tasks, [...tasks, task])
  return task
}

export function updateTask(id: string, data: Partial<Task>): Task | null {
  const tasks = load<Task>(KEYS.tasks)
  const idx = tasks.findIndex(t => t.id === id)
  if (idx < 0) return null
  tasks[idx] = { ...tasks[idx], ...data }
  save(KEYS.tasks, tasks)
  return tasks[idx]
}

export function deleteTask(id: string): void {
  save(KEYS.tasks, load<Task>(KEYS.tasks).filter(t => t.id !== id))
}

// ---------- Notes ----------
export function getNotes(ownerId: string): Note[] {
  return load<Note>(KEYS.notes)
    .filter(n => n.owner_id === ownerId)
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
}

export function addNote(data: Omit<Note, 'id' | 'updated_at'>): Note {
  const notes = load<Note>(KEYS.notes)
  const note: Note = {
    id: genId(),
    updated_at: new Date().toISOString(),
    ...data,
  }
  save(KEYS.notes, [...notes, note])
  return note
}

export function updateNote(id: string, data: Partial<Note>): Note | null {
  const notes = load<Note>(KEYS.notes)
  const idx = notes.findIndex(n => n.id === id)
  if (idx < 0) return null
  notes[idx] = { ...notes[idx], ...data, updated_at: new Date().toISOString() }
  save(KEYS.notes, notes)
  return notes[idx]
}

export function deleteNote(id: string): void {
  save(KEYS.notes, load<Note>(KEYS.notes).filter(n => n.id !== id))
}

// ---------- Calendar Events ----------
export function getEvents(ownerId?: string): CalendarEvent[] {
  const all = load<CalendarEvent>(KEYS.events)
  if (ownerId) return all.filter(e => e.owner_id === ownerId)
  return all
}

export function addEvent(data: Omit<CalendarEvent, 'id'>): CalendarEvent {
  const events = load<CalendarEvent>(KEYS.events)
  const event: CalendarEvent = { id: genId(), ...data }
  save(KEYS.events, [...events, event])
  return event
}

export function updateEvent(id: string, data: Partial<CalendarEvent>): CalendarEvent | null {
  const events = load<CalendarEvent>(KEYS.events)
  const idx = events.findIndex(e => e.id === id)
  if (idx < 0) return null
  events[idx] = { ...events[idx], ...data }
  save(KEYS.events, events)
  return events[idx]
}

export function deleteEvent(id: string): void {
  save(KEYS.events, load<CalendarEvent>(KEYS.events).filter(e => e.id !== id))
}

// ---------- Metrics ----------
export interface DashboardMetrics {
  callsToday: number
  callsThisWeek: number
  teamCallsToday: number
  followUpsDueToday: number
  followUpsOverdue: number
  meetingsThisWeek: number
  conversionRate: number
  outcomeBreakdown: Record<OutcomeType, number>
  dailyCalls: { day: string; calls: number; conversions: number }[]
  leaderboard: { name: string; calls: number; connected: number; meetings: number; color: string }[]
}

export function getDashboardMetrics(userId: string, periodDays: number = 7): DashboardMetrics {
  const logs = load<CallLog>(KEYS.call_logs)
  const companies = load<Company>(KEYS.companies)
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  
  const weekAgo = new Date(now)
  weekAgo.setDate(weekAgo.getDate() - periodDays)

  const callsToday = logs.filter(l => l.called_at.startsWith(todayStr) && l.caller_id === userId).length
  const teamCallsToday = logs.filter(l => l.called_at.startsWith(todayStr)).length
  const callsThisWeek = logs.filter(l => 
    l.caller_id === userId && new Date(l.called_at) >= weekAgo
  ).length

  const followUpsDueToday = companies.filter(c => {
    const log = logs.filter(l => l.company_id === c.id).sort((a,b) => 
      new Date(b.called_at).getTime() - new Date(a.called_at).getTime()
    )[0]
    return log?.follow_up_date === todayStr
  }).length

  const followUpsOverdue = companies.filter(c => {
    const log = logs.filter(l => l.company_id === c.id).sort((a,b) => 
      new Date(b.called_at).getTime() - new Date(a.called_at).getTime()
    )[0]
    return log?.follow_up_date && new Date(log.follow_up_date) < now && log.follow_up_date !== todayStr
  }).length

  const meetingsThisWeek = logs.filter(l => 
    l.outcome === 'Meeting Scheduled' && new Date(l.called_at) >= weekAgo
  ).length

  // Conversion rate
  const recentLogs = logs.filter(l => new Date(l.called_at) >= weekAgo)
  const connected = recentLogs.filter(l => 
    l.outcome !== 'Not Picked' && 
    l.outcome !== 'Not Reachable / Out of Service' && 
    l.outcome !== 'Invalid Number' && 
    l.outcome !== 'Not Called'
  ).length
  const converted = recentLogs.filter(l => 
    l.outcome === 'Connected - Interested' || l.outcome === 'Meeting Scheduled'
  ).length
  const conversionRate = connected > 0 ? Math.round((converted / connected) * 100) : 0

  // Outcome breakdown
  const outcomeBreakdown = {} as Record<OutcomeType, number>
  for (const log of recentLogs) {
    outcomeBreakdown[log.outcome] = (outcomeBreakdown[log.outcome] || 0) + 1
  }

  // Daily calls (last 7 days)
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const dailyCalls = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (6 - i))
    const dateStr = d.toISOString().split('T')[0]
    const dayLogs = logs.filter(l => l.called_at.startsWith(dateStr))
    const dayConv = dayLogs.filter(l => l.outcome === 'Connected - Interested' || l.outcome === 'Meeting Scheduled').length
    return {
      day: days[d.getDay() === 0 ? 6 : d.getDay() - 1],
      calls: dayLogs.length,
      conversions: dayConv,
    }
  })

  // Leaderboard
  const users = getUsers()
  const leaderboard = users.map(user => {
    const userLogs = logs.filter(l => l.caller_id === user.id)
    return {
      name: user.name,
      calls: userLogs.length,
      connected: userLogs.filter(l => l.outcome !== 'Not Picked' && l.outcome !== 'Not Reachable / Out of Service' && l.outcome !== 'Not Called' && l.outcome !== 'Invalid Number').length,
      meetings: userLogs.filter(l => l.outcome === 'Meeting Scheduled').length,
      color: user.color,
    }
  }).sort((a, b) => b.calls - a.calls)

  return {
    callsToday,
    callsThisWeek,
    teamCallsToday,
    followUpsDueToday,
    followUpsOverdue,
    meetingsThisWeek,
    conversionRate,
    outcomeBreakdown,
    dailyCalls,
    leaderboard,
  }
}

// ---------- Seeding ----------
export function isSeeded(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(KEYS.seeded) === 'true'
}

export function markSeeded(): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEYS.seeded, 'true')
}

export function clearAllData(): void {
  if (typeof window === 'undefined') return
  Object.values(KEYS).forEach(k => localStorage.removeItem(k))
}
