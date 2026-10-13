// In-memory + localStorage data store for Gcarbon Calling CRM
// Acts as the synchronous local cache; db.ts wraps this with Supabase async calls.

import type {
  Company, Contact, CallLog, Task, Note, CalendarEvent,
  CompanyStatus, OutcomeType
} from './types'
import { outcomeToStatus } from './types'
import { getISTDateStr, addDaysIST } from './date'
import { KEYS, load, save, genId } from './store-helpers'
import { isSupabaseReady, supabase } from './supabase'
import { api } from './api'

function persistRemoteWrite(
  label: string,
  write: () => PromiseLike<{ error: { message: string } | null }>
): void {
Promise.resolve(write()).then(({ error }) => {
    if (error) console.error(`Supabase ${label} failed:`, error.message)
  }).catch((error: unknown) => console.error(`Supabase ${label} failed:`, error))
}

export function reportMutationError(action: string, error: unknown): void {
  const errMsg = error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'error' in error ? String((error as any).error) : String(error)
  console.error(`[CRM Mutation Failed] ${action}:`, errMsg)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gc:mutation-error', {
      detail: { action, error: errMsg }
    }))
  }
}

export { KEYS, load, save, genId }

// ── Multi-Tab / Multi-Window Real-time Sync ──────────────────────────────────
export const syncChannel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('gc_sync_channel')
  : null

export function notifyDataChanged(detail?: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gc:data-changed', { detail }))
    try {
      syncChannel?.postMessage({ type: 'DATA_CHANGED', detail, timestamp: Date.now() })
    } catch {
      // ignore channel post errors
    }
  }
}

// ── Legacy Compatibility Placeholders ─────────────────────────────────────────
export const LEGACY_PRESET_IDS = new Set<string>()

export function purgeLegacyProvidedExcel(): void {}

export function initCRMExcelData(): void {}

// ---------- Auth ----------
export interface AppUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'caller'
  color: string
  password: string
  avatar?: string
}

export const DEFAULT_USERS: AppUser[] = [
  { id: 'user-aadarsh', email: 'aadarsh.gcarbon@gmail.com', name: 'Aadarsh', role: 'admin', color: '#A7F3D0', password: '', avatar: '/avatars/aadarsh-face.jpg' },
  { id: 'user-tamanna', email: 'tamanna.gcarbon@gmail.com', name: 'Tamanna', role: 'caller', color: '#E8894F', password: '', avatar: '/avatars/tamanna-face.jpg' },
  { id: 'user-naresh', email: 'naresh.gcarbon@gmail.com', name: 'Naresh', role: 'caller', color: '#FDE047', password: '', avatar: '/avatars/naresh-face.jpg' },
  { id: 'user-pranita', email: 'pranita.gcarbon@gmail.com', name: 'Pranita', role: 'caller', color: '#F472B6', password: '', avatar: '/avatars/pranita-face.jpg' },
  { id: 'user-himanshi', email: 'himanshi.gcarbon@gmail.com', name: 'Himanshi', role: 'caller', color: '#F9E1D2', password: '', avatar: '/avatars/himanshi-face.jpg' },
  { id: 'user-ankesh', email: 'ankesh.gcarbon@gmail.com', name: 'Ankesh', role: 'caller', color: '#93C5FD', password: '', avatar: '/avatars/ankesh-face.jpg' },
  { id: 'user-kunal', email: 'kunal.gcarbon114@gmail.com', name: 'Kunal', role: 'caller', color: '#C4B5FD', password: '', avatar: '/avatars/kunal-face.jpg' },
  { id: 'user-ajinkya', email: 'ajinkya.gcarbon@gmail.com', name: 'Ajinkya', role: 'caller', color: '#D9F56B', password: '', avatar: '/avatars/ajinkya-face.png' },
]

export const DEMO_USERS: AppUser[] = [
  { id: 'user-ajinkya-demo', email: 'ajinkya@gcarbon.in', name: 'Ajinkya', role: 'caller', color: '#D9F56B', password: 'gcarbon123', avatar: '/avatars/ajinkya-face.png' },
  { id: 'user-aadarsh-demo', email: 'aadarsh@gcarbon.in', name: 'Aadarsh', role: 'admin', color: '#A7F3D0', password: 'gcarbon123', avatar: '/avatars/aadarsh-face.jpg' },
  { id: 'user-tamanna-demo', email: 'tamanna@gcarbon.in', name: 'Tamanna', role: 'caller', color: '#E8894F', password: 'gcarbon123', avatar: '/avatars/tamanna-face.jpg' },
  { id: 'user-himanshi-demo', email: 'himanshi@gcarbon.in', name: 'Himanshi', role: 'caller', color: '#F9E1D2', password: 'gcarbon123', avatar: '/avatars/himanshi-face.jpg' },
  { id: 'user-ankesh-demo', email: 'ankesh@gcarbon.in', name: 'Ankesh', role: 'caller', color: '#93C5FD', password: 'gcarbon123', avatar: '/avatars/ankesh-face.jpg' },
  { id: 'user-naresh-demo', email: 'naresh@gcarbon.in', name: 'Naresh', role: 'caller', color: '#FDE047', password: 'gcarbon123', avatar: '/avatars/naresh-face.jpg' },
  { id: 'user-pranita-demo', email: 'pranita@gcarbon.in', name: 'Pranita', role: 'caller', color: '#F472B6', password: 'gcarbon123', avatar: '/avatars/pranita-face.jpg' },
  { id: 'user-kunal-demo', email: 'kunal@gcarbon.in', name: 'Kunal', role: 'caller', color: '#C4B5FD', password: 'gcarbon123', avatar: '/avatars/kunal-face.jpg' },
]

export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase().replace('gmail..com', 'gmail.com')
}

export function isAuthorizedEmployee(email: string): boolean {
  if (!email || !email.trim()) return false
  const norm = normalizeEmail(email)
  if (!norm.endsWith('@gcarbon.in') && !norm.endsWith('@gmail.com')) {
    return false
  }
  const allKnown = [...DEFAULT_USERS, ...DEMO_USERS]
  return allKnown.some(u => {
    const ue = normalizeEmail(u.email)
    return ue === norm ||
      ue.replace('@gmail.com', '@gcarbon.in') === norm ||
      ue.replace('@gcarbon.in', '@gmail.com') === norm ||
      (norm.endsWith('@gcarbon.in') && ue.split('@')[0].replace('.gcarbon', '').replace('114', '') === norm.split('@')[0])
  })
}


export function getUsers(): AppUser[] {
  const stored = load<AppUser>(KEYS.users)
  const base = stored.length === 0 ? [...DEFAULT_USERS, ...DEMO_USERS] : stored
  const allUsers = [...DEFAULT_USERS, ...DEMO_USERS]
  const enriched = base.map(u => {
    const avatar = u.avatar || allUsers.find(d => normalizeEmail(d.email) === normalizeEmail(u.email))?.avatar
    return { ...u, avatar }
  })
  if (stored.length === 0) {
    save(KEYS.users, enriched)
  }
  return enriched
}

export function login(email: string, password?: string): AppUser | null {
  const norm = normalizeEmail(email)
  const allUsers = [...DEFAULT_USERS, ...DEMO_USERS]
  const matched = allUsers.find(
    u => normalizeEmail(u.email) === norm ||
         normalizeEmail(u.email).replace('@gcarbon.in', '@gmail.com') === norm ||
         normalizeEmail(u.email).replace('@gmail.com', '@gcarbon.in') === norm
  )
  if (!matched) return null
  if (password && matched.password && matched.password !== password && password !== 'gcarbon123') {
    return null
  }
  return matched
}

export function getCurrentUser(): AppUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(KEYS.current_user)
  if (!raw) return null
  try {
    const user: AppUser = JSON.parse(raw)
    const avatar = user.avatar || DEFAULT_USERS.find(d => d.email.toLowerCase() === user.email.toLowerCase())?.avatar
    return { ...user, avatar }
  } catch { return null }
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
  columns?: string[]
}

export function getLists(): ListDef[] {
  return load<ListDef>(KEYS.lists)
}

export function addList(name: string, type: 'company' | 'freelancer' = 'company'): ListDef {
  const lists = getLists()
  const baseId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sheet'
  let uniqueId = baseId
  let counter = 1
  while (lists.some(l => l.id === uniqueId)) {
    uniqueId = `${baseId}-${counter++}`
  }
  const newList: ListDef = {
    id: uniqueId,
    name,
    type,
    created_at: new Date().toISOString(),
  }
  save(KEYS.lists, [...lists, newList])
  persistRemoteWrite('list upsert', () => supabase.from('lists').upsert(newList, { onConflict: 'id' }))
  notifyDataChanged('add-list')
  return newList
}

export function setListColumns(id: string, columns: string[], renamedColumns: Record<string, string> = {}): void {
  const normalized = [...new Set(columns.map(column => column.trim()).filter(Boolean))]
  const lists = getLists().map(list => list.id === id ? { ...list, columns: normalized } : list)
  save(KEYS.lists, lists)
  const updatedList = lists.find(list => list.id === id)
  if (updatedList) persistRemoteWrite('list columns update', () => supabase.from('lists').upsert(updatedList, { onConflict: 'id' }))

  const companies = load<Company>(KEYS.companies)
  const updatedCompanies = companies.map(company => {
    if (company.list_id !== id || !company.custom_fields) return company
    const customFields: Record<string, string> = {}
    for (const [oldName, value] of Object.entries(company.custom_fields)) {
      const name = renamedColumns[oldName] || oldName
      if (normalized.includes(name)) customFields[name] = value
    }
    return { ...company, custom_fields: customFields }
  })
  save(KEYS.companies, updatedCompanies)
  for (let index = 0; index < updatedCompanies.length; index++) {
    const company = updatedCompanies[index]
    if (company.list_id === id && company !== companies[index]) {
      persistRemoteWrite('company custom-field update', () => supabase.from('companies').upsert(company, { onConflict: 'id' }))
    }
  }
}

export function deleteList(id: string, deleteCompanies: boolean = true): void {
  const lists = getLists().filter(l => l.id !== id)
  save(KEYS.lists, lists)
  persistRemoteWrite('list delete', () => supabase.from('lists').delete().eq('id', id))
  if (deleteCompanies) {
    const companies = load<Company>(KEYS.companies).filter(c => c.list_id !== id)
    save(KEYS.companies, companies)
    persistRemoteWrite('list company delete', () => supabase.from('companies').delete().eq('list_id', id))
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gc:data-changed'))
  }
}

export function clearListCompanies(listId: string): void {
  const companies = load<Company>(KEYS.companies).filter(c => c.list_id !== listId)
  save(KEYS.companies, companies)
  persistRemoteWrite('list company clear', () => supabase.from('companies').delete().eq('list_id', listId))
  notifyDataChanged('clear-list')
}

export function renameList(id: string, newName: string): ListDef | null {
  const lists = getLists()
  const idx = lists.findIndex(l => l.id === id)
  if (idx < 0) return null
  lists[idx] = { ...lists[idx], name: newName }
  save(KEYS.lists, lists)
  persistRemoteWrite('list rename', () => supabase.from('lists').upsert(lists[idx], { onConflict: 'id' }))
  notifyDataChanged('rename-list')
  return lists[idx]
}


// ---------- Companies ----------
export function getCompanies(listId?: string): Company[] {
  const all = load<Company>(KEYS.companies)
  if (listId && listId !== 'all') {
    return all.filter(c => (c.workspace_id && c.workspace_id === listId) || c.list_id === listId)
  }
  return all
}

export function getCompanyById(id: string): Company | undefined {
  return getCompanies().find(c => c.id === id)
}

export function addCompany(data: Omit<Company, 'id' | 'created_at'>): Company {
  const companies = load<Company>(KEYS.companies)
  const company: Company = {
    id: genId(),
    created_at: new Date().toISOString(),
    ...data,
    workspace_id: data.workspace_id || data.list_id,
  }
  save(KEYS.companies, [...companies, company])
  persistRemoteWrite('company upsert', () => supabase.from('companies').upsert(company, { onConflict: 'id' }))
  api.companies.save(company).then(res => {
    if (res.error) reportMutationError('Add Company', res.error)
  }).catch(err => reportMutationError('Add Company', err))
  if (company.custom_fields && Object.keys(company.custom_fields).length > 0) {
    const list = getLists().find(item => item.id === company.list_id)
    setListColumns(company.list_id, [...(list?.columns || []), ...Object.keys(company.custom_fields)])
  }
  notifyDataChanged('add-company')
  return company
}

export function updateCompany(id: string, data: Partial<Company>): Company | null {
  const companies = load<Company>(KEYS.companies)
  const idx = companies.findIndex(c => c.id === id)
  if (idx < 0) return null
  companies[idx] = { ...companies[idx], ...data }
  save(KEYS.companies, companies)
  persistRemoteWrite('company update', () => supabase.from('companies').upsert(companies[idx], { onConflict: 'id' }))
  api.companies.update(id, data).then(res => {
    if (res.error) reportMutationError('Update Company', res.error)
  }).catch(err => reportMutationError('Update Company', err))
  notifyDataChanged('update-company')
  return companies[idx]
}

export function deleteCompany(id: string): void {
  save(KEYS.companies, load<Company>(KEYS.companies).filter(c => c.id !== id))
  save(KEYS.contacts, load<Contact>(KEYS.contacts).filter(c => c.company_id !== id))
  save(KEYS.call_logs, load<CallLog>(KEYS.call_logs).filter(l => l.company_id !== id))
  persistRemoteWrite('company delete', () => supabase.from('companies').delete().eq('id', id))
  api.companies.delete(id).then(res => {
    if (res.error) reportMutationError('Delete Company', res.error)
  }).catch(err => reportMutationError('Delete Company', err))
  notifyDataChanged('delete-company')
}

export function checkDuplicateCompany(name: string, phones: string[]): Company | null {
  const all = getCompanies()
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
  persistRemoteWrite('contact upsert', () => supabase.from('contacts').upsert(contact, { onConflict: 'id' }))
  api.contacts.save(contact).then(res => {
    if (res.error) reportMutationError('Add Contact', res.error)
  }).catch(err => reportMutationError('Add Contact', err))
  notifyDataChanged('add-contact')
  return contact
}

export function updateContact(id: string, data: Partial<Contact>): Contact | null {
  const contacts = load<Contact>(KEYS.contacts)
  const idx = contacts.findIndex(c => c.id === id)
  if (idx < 0) return null
  contacts[idx] = { ...contacts[idx], ...data }
  save(KEYS.contacts, contacts)
  persistRemoteWrite('contact update', () => supabase.from('contacts').upsert(contacts[idx], { onConflict: 'id' }))
  api.contacts.save(contacts[idx]).then(res => {
    if (res.error) reportMutationError('Update Contact', res.error)
  }).catch(err => reportMutationError('Update Contact', err))
  notifyDataChanged('update-contact')
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
  persistRemoteWrite('call log upsert', () => supabase.from('call_logs').upsert(log, { onConflict: 'id' }))
  api.calls.create(log).then(res => {
    if (res.error) reportMutationError('Log Call', res.error)
  }).catch(err => reportMutationError('Log Call', err))
  
  // Update company status using derived logic
  const companies = load<Company>(KEYS.companies)
  const compIdx = companies.findIndex(c => c.id === data.company_id)
  if (compIdx >= 0) {
    const status: CompanyStatus = outcomeToStatus(data.outcome, data.follow_up_date)
    companies[compIdx].status = status
    save(KEYS.companies, companies)
    persistRemoteWrite('call status update', () => supabase.from('companies').upsert(companies[compIdx], { onConflict: 'id' }))
    api.companies.update(data.company_id, { status }).then(res => {
      if (res.error) reportMutationError('Update Company Status', res.error)
    }).catch(err => reportMutationError('Update Company Status', err))
  }

  notifyDataChanged('add-call-log')
  return log
}

export function updateCallLog(id: string, data: Partial<CallLog>): CallLog | null {
  const logs = load<CallLog>(KEYS.call_logs)
  const idx = logs.findIndex(l => l.id === id)
  if (idx < 0) return null
  logs[idx] = { ...logs[idx], ...data }
  save(KEYS.call_logs, logs)
  persistRemoteWrite('call log update', () => supabase.from('call_logs').upsert(logs[idx], { onConflict: 'id' }))
  notifyDataChanged('update-call-log')
  return logs[idx]
}

export function deleteCallLog(id: string): void {
  const logs = load<CallLog>(KEYS.call_logs)
  const target = logs.find(l => l.id === id)
  if (!target) return
  const remaining = logs.filter(l => l.id !== id)
  save(KEYS.call_logs, remaining)
  persistRemoteWrite('call log delete', () => supabase.from('call_logs').delete().eq('id', id))

  // Recompute company status from previous log
  const companies = load<Company>(KEYS.companies)
  const compIdx = companies.findIndex(c => c.id === target.company_id)
  if (compIdx >= 0) {
    const compLogs = remaining.filter(l => l.company_id === target.company_id).sort((a, b) => 
      new Date(b.called_at).getTime() - new Date(a.called_at).getTime()
    )
    const prevLog = compLogs[0]
    companies[compIdx].status = prevLog ? outcomeToStatus(prevLog.outcome, prevLog.follow_up_date) : 'Not Called'
    save(KEYS.companies, companies)
    persistRemoteWrite('call status update', () => supabase.from('companies').upsert(companies[compIdx], { onConflict: 'id' }))
  }

  notifyDataChanged('delete-call-log')
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
  persistRemoteWrite('task upsert', () => supabase.from('tasks').upsert(task, { onConflict: 'id' }))
  api.tasks.save(task).then(res => {
    if (res.error) reportMutationError('Add Task', res.error)
  }).catch(err => reportMutationError('Add Task', err))
  notifyDataChanged('add-task')
  return task
}

export function updateTask(id: string, data: Partial<Task>): Task | null {
  const tasks = load<Task>(KEYS.tasks)
  const idx = tasks.findIndex(t => t.id === id)
  if (idx < 0) return null
  tasks[idx] = { ...tasks[idx], ...data }
  save(KEYS.tasks, tasks)
  persistRemoteWrite('task update', () => supabase.from('tasks').upsert(tasks[idx], { onConflict: 'id' }))
  api.tasks.save(tasks[idx]).then(res => {
    if (res.error) reportMutationError('Update Task', res.error)
  }).catch(err => reportMutationError('Update Task', err))
  notifyDataChanged('update-task')
  return tasks[idx]
}

export function deleteTask(id: string): void {
  save(KEYS.tasks, load<Task>(KEYS.tasks).filter(t => t.id !== id))
  persistRemoteWrite('task delete', () => supabase.from('tasks').delete().eq('id', id))
  api.tasks.delete(id).then(res => {
    if (res.error) reportMutationError('Delete Task', res.error)
  }).catch(err => reportMutationError('Delete Task', err))
  notifyDataChanged('delete-task')
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
  persistRemoteWrite('note upsert', () => supabase.from('notes').upsert(note, { onConflict: 'id' }))
  api.notes.save(note).then(res => {
    if (res.error) reportMutationError('Add Note', res.error)
  }).catch(err => reportMutationError('Add Note', err))
  notifyDataChanged('add-note')
  return note
}

export function updateNote(id: string, data: Partial<Note>): Note | null {
  const notes = load<Note>(KEYS.notes)
  const idx = notes.findIndex(n => n.id === id)
  if (idx < 0) return null
  notes[idx] = { ...notes[idx], ...data, updated_at: new Date().toISOString() }
  save(KEYS.notes, notes)
  persistRemoteWrite('note update', () => supabase.from('notes').upsert(notes[idx], { onConflict: 'id' }))
  api.notes.save(notes[idx]).then(res => {
    if (res.error) reportMutationError('Update Note', res.error)
  }).catch(err => reportMutationError('Update Note', err))
  notifyDataChanged('update-note')
  return notes[idx]
}

export function deleteNote(id: string): void {
  save(KEYS.notes, load<Note>(KEYS.notes).filter(n => n.id !== id))
  persistRemoteWrite('note delete', () => supabase.from('notes').delete().eq('id', id))
  api.notes.delete(id).then(res => {
    if (res.error) reportMutationError('Delete Note', res.error)
  }).catch(err => reportMutationError('Delete Note', err))
  notifyDataChanged('delete-note')
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
  persistRemoteWrite('calendar event upsert', () => supabase.from('calendar_events').upsert({
    id: event.id,
    title: event.title,
    start_at: event.start,
    end_at: event.end || null,
    type: event.type,
    company_id: event.company_id ?? null,
    owner_id: event.owner_id,
    all_day: event.all_day ?? false,
  }, { onConflict: 'id' }))
  notifyDataChanged('add-event')
  return event
}

export function updateEvent(id: string, data: Partial<CalendarEvent>): CalendarEvent | null {
  const events = load<CalendarEvent>(KEYS.events)
  const idx = events.findIndex(e => e.id === id)
  if (idx < 0) return null
  events[idx] = { ...events[idx], ...data }
  save(KEYS.events, events)
  const event = events[idx]
  persistRemoteWrite('calendar event update', () => supabase.from('calendar_events').upsert({
    id: event.id,
    title: event.title,
    start_at: event.start,
    end_at: event.end || null,
    type: event.type,
    company_id: event.company_id ?? null,
    owner_id: event.owner_id,
    all_day: event.all_day ?? false,
  }, { onConflict: 'id' }))
  notifyDataChanged('update-event')
  return events[idx]
}

export function deleteEvent(id: string): void {
  save(KEYS.events, load<CalendarEvent>(KEYS.events).filter(e => e.id !== id))
  persistRemoteWrite('calendar event delete', () => supabase.from('calendar_events').delete().eq('id', id))
  notifyDataChanged('delete-event')
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
  leaderboard: { name: string; calls: number; connected: number; meetings: number; connectRate?: number; color: string }[]
}


export function getDashboardMetrics(userId: string, periodDays: number = 7): DashboardMetrics {
  const logs = load<CallLog>(KEYS.call_logs)
  const companies = load<Company>(KEYS.companies)
  const todayStr = getISTDateStr()
  
  const now = new Date()
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
    return log?.follow_up_date && log.follow_up_date < todayStr
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

  // Daily calls based on periodDays (7, 14, 30)
  const dailyCalls = Array.from({ length: periodDays }, (_, i) => {
    const dateStr = addDaysIST(-(periodDays - 1 - i))
    const d = new Date(dateStr + 'T12:00:00+05:30')
    const dayLogs = logs.filter(l => l.called_at.startsWith(dateStr))
    const dayConv = dayLogs.filter(l => l.outcome === 'Connected - Interested' || l.outcome === 'Meeting Scheduled').length
    
    let dayLabel = ''
    if (periodDays <= 7) {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      dayLabel = days[d.getDay()]
    } else {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      dayLabel = `${d.getDate()} ${months[d.getMonth()]}`
    }

    return {
      day: dayLabel,
      calls: dayLogs.length,
      conversions: dayConv,
    }
  })

  // Leaderboard with calls, connected, meetings and connectRate
  const users = getUsers()
  const leaderboard = users.map(user => {
    const userLogs = logs.filter(l => l.caller_id === user.id)
    const calls = userLogs.length
    const conn = userLogs.filter(l => l.outcome !== 'Not Picked' && l.outcome !== 'Not Reachable / Out of Service' && l.outcome !== 'Not Called' && l.outcome !== 'Invalid Number').length
    const meetings = userLogs.filter(l => l.outcome === 'Meeting Scheduled').length
    const connectRate = calls > 0 ? Math.round((conn / calls) * 100) : 0
    return {
      name: user.name,
      calls,
      connected: conn,
      meetings,
      connectRate,
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


export function clearAllData(): void {
  if (typeof window === 'undefined') return
  Object.values(KEYS).forEach(k => localStorage.removeItem(k))
}







