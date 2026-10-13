/**
 * lib/api.ts — Centralized Frontend API Client for Gcarbon Calling CRM
 *
 * All REST calls to the Express / MongoDB Atlas backend flow through here.
 * If the backend is unreachable, methods gracefully fail or return null,
 * allowing the local storage cache layer to continue functioning.
 */

import type {
  Company,
  Contact,
  CallLog,
  Task,
  Note,
  CalendarEvent,
  Workspace,
  LeadLock,
} from './types'
import type { AppUser } from './store'
import { getCachedUser } from './db'
import { supabase } from './supabase'

export const API_BASE_URL = ((import.meta.env.VITE_API_URL as string) || '/api').replace(/\/+$/, '')

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const user = getCachedUser()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData?.session?.access_token) {
        headers['Authorization'] = `Bearer ${sessionData.session.access_token}`
      }
    } catch {
      // ignore session lookup failure
    }

    if (user?.email) {
      headers['x-user-email'] = user.email
    }

    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    })

    if (!res.ok) {
      let errMsg = `Request failed: ${res.status} ${res.statusText}`
      try {
        const errJson = await res.json()
        if (errJson?.error) errMsg = errJson.error
        else if (errJson?.message) errMsg = errJson.message
      } catch {
        // ignore json parse error
      }
      return { data: null, error: errMsg }
    }

    const data = (await res.json()) as T
    return { data, error: null }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { data: null, error: message }
  }
}

export const api = {
  // Health
  async checkHealth() {
    return request<{ status: string; mongodb: { connected: boolean; uriConfigured: boolean } }>('/health')
  },

  // Auth
  auth: {
    async login(email: string, password?: string) {
      return request<{ user: AppUser; token: string; message: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
    },
    async getUsers() {
      return request<AppUser[]>('/auth/users')
    },
  },

  // Workspaces
  workspaces: {
    async get() {
      return request<Workspace[]>('/workspaces')
    },
    async create(ws: Partial<Workspace>) {
      return request<Workspace>('/workspaces', {
        method: 'POST',
        body: JSON.stringify(ws),
      })
    },
    async update(id: string, updates: Partial<Workspace>) {
      return request<Workspace>(`/workspaces/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
    },
    async delete(id: string) {
      return request<{ success: boolean; id: string }>(`/workspaces/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
  },

  // Companies
  companies: {
    async get(listId?: string) {
      const qs = listId ? `?list_id=${encodeURIComponent(listId)}` : ''
      return request<Company[]>(`/companies${qs}`)
    },
    async save(company: Partial<Company>) {
      return request<Company>('/companies', {
        method: 'POST',
        body: JSON.stringify(company),
      })
    },
    async update(id: string, updates: Partial<Company>) {
      return request<Company>(`/companies/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
    },
    async bulkUpdate(ids: string[], updates: Partial<Company>) {
      return request<{ success: boolean; updatedCount: number }>('/companies/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids, updates }),
      })
    },
    async delete(id: string) {
      return request<{ success: boolean; id: string }>(`/companies/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
  },

  // Contacts
  contacts: {
    async get(companyId?: string) {
      const qs = companyId ? `?company_id=${encodeURIComponent(companyId)}` : ''
      return request<Contact[]>(`/contacts${qs}`)
    },
    async save(contact: Partial<Contact>) {
      return request<Contact>('/contacts', {
        method: 'POST',
        body: JSON.stringify(contact),
      })
    },
    async delete(id: string) {
      return request<{ success: boolean; id: string }>(`/contacts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
  },

  // Call Logs
  calls: {
    async get(companyId?: string) {
      const qs = companyId ? `?company_id=${encodeURIComponent(companyId)}` : ''
      return request<CallLog[]>(`/call-logs${qs}`)
    },
    async create(log: Partial<CallLog>) {
      return request<CallLog>('/call-logs', {
        method: 'POST',
        body: JSON.stringify(log),
      })
    },
  },

  // Tasks
  tasks: {
    async get(assigneeId?: string) {
      const qs = assigneeId ? `?assignee_id=${encodeURIComponent(assigneeId)}` : ''
      return request<Task[]>(`/tasks${qs}`)
    },
    async save(task: Partial<Task>) {
      return request<Task>('/tasks', {
        method: 'POST',
        body: JSON.stringify(task),
      })
    },
    async update(id: string, updates: Partial<Task>) {
      return request<Task>(`/tasks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
    },
    async delete(id: string) {
      return request<{ success: boolean; id: string }>(`/tasks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
  },

  // Notes
  notes: {
    async get(ownerId?: string) {
      const qs = ownerId ? `?owner_id=${encodeURIComponent(ownerId)}` : ''
      return request<Note[]>(`/notes${qs}`)
    },
    async save(note: Partial<Note>) {
      return request<Note>('/notes', {
        method: 'POST',
        body: JSON.stringify(note),
      })
    },
    async delete(id: string) {
      return request<{ success: boolean; id: string }>(`/notes/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
  },

  // Calendar Events
  events: {
    async get(ownerId?: string) {
      const qs = ownerId ? `?owner_id=${encodeURIComponent(ownerId)}` : ''
      return request<CalendarEvent[]>(`/events${qs}`)
    },
    async save(event: Partial<CalendarEvent>) {
      return request<CalendarEvent>('/events', {
        method: 'POST',
        body: JSON.stringify(event),
      })
    },
    async delete(id: string) {
      return request<{ success: boolean; id: string }>(`/events/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
  },

  // Lead Locks
  leadLocks: {
    async getActive() {
      return request<Record<string, LeadLock>>('/lead-locks/active')
    },
    async acquire(companyId: string, user: { id: string; name: string; color?: string }) {
      return request<{ success: boolean; locked_by?: string; locked_by_color?: string }>(
        '/lead-locks/acquire',
        {
          method: 'POST',
          body: JSON.stringify({
            company_id: companyId,
            user_id: user.id,
            user_name: user.name,
            user_color: user.color,
          }),
        }
      )
    },
    async release(companyId: string, userId: string) {
      return request<{ success: boolean }>('/lead-locks/release', {
        method: 'POST',
        body: JSON.stringify({ company_id: companyId, user_id: userId }),
      })
    },
  },

  // Audit Logs
  audit: {
    async get(entityId?: string) {
      const qs = entityId ? `?entity_id=${encodeURIComponent(entityId)}` : ''
      return request<unknown[]>(`/audit-logs${qs}`)
    },
    async record(entry: Record<string, unknown>) {
      return request<unknown>('/audit-logs', {
        method: 'POST',
        body: JSON.stringify(entry),
      })
    },
  },

  // Sync All
  async syncAll() {
    return request<{
      workspaces: Workspace[]
      companies: Company[]
      contacts: Contact[]
      call_logs: CallLog[]
      tasks: Task[]
      notes: Note[]
      calendar_events: CalendarEvent[]
    }>('/sync')
  },

  // Upload
  async uploadFile(fileName: string, mimeType: string, base64Data: string, uploadedBy?: string) {
    return request<{ success: boolean; document: Record<string, unknown> }>('/upload', {
      method: 'POST',
      body: JSON.stringify({ fileName, mimeType, base64Data, uploadedBy }),
    })
  },
}
