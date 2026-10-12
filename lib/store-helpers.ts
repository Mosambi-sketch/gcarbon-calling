/**
 * lib/store-helpers.ts
 * Pure localStorage primitives shared by store.ts and db.ts
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

export function load<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

export function save<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(data))
}

export function genId(): string {
  return uuidv4()
}
