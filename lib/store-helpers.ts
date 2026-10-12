/**
 * lib/store-helpers.ts
 * In-memory client cache primitives shared by store.ts and db.ts.
 * Supabase is the single source of truth; database records are not stored in localStorage.
 */

import { v4 as uuidv4 } from 'uuid'

export const KEYS = {
  companies: 'gc_companies',
  contacts: 'gc_contacts',
  call_logs: 'gc_call_logs',
  tasks: 'gc_tasks',
  notes: 'gc_notes',
  events: 'gc_events',
  lists: 'gc_lists',
  workspaces: 'gc_workspaces',
  workspace_columns: 'gc_workspace_columns',
  active_workspace: 'gc_active_workspace',
  users: 'gc_users',
  seeded: 'gc_seeded',
  current_user: 'gc_current_user',
} as const

const _memoryCache = new Map<string, unknown[]>()

export function load<T>(key: string): T[] {
  return (_memoryCache.get(key) || []) as T[]
}

export function save<T>(key: string, data: T[]): void {
  _memoryCache.set(key, data)
}

export function genId(): string {
  return uuidv4()
}
