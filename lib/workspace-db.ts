/**
 * lib/workspace-db.ts
 * Supabase-first data access layer for Gcarbon Calling Workspaces
 *
 * All mutations go to Supabase first with complete error propagation,
 * syncing back to local storage cache so the UI stays instant and resilient.
 */

import { supabase, isSupabaseReady } from './supabase'
import { api } from './api'
import { load, save, genId, KEYS } from './store-helpers'
import type {
  Workspace,
  WorkspaceColumn,
  Company,
  Contact,
  CallLog,
  AuditLog,
  ImportRecord,
  LeadLock,
  CompanyStatus,
  ColumnType,
} from './types'

export interface Result<T> {
  data: T | null
  error: string | null
}

// ── Default Workspace Columns ──────────────────────────────────────────────────

export const DEFAULT_WORKSPACE_COLUMNS: Array<Omit<WorkspaceColumn, 'id' | 'workspace_id'>> = [
  { name: 'Company Name', type: 'text', position: 0, required: true },
  { name: 'Primary Contact', type: 'text', position: 1, required: false },
  { name: 'Phone', type: 'phone', position: 2, required: false },
  { name: 'Email', type: 'email', position: 3, required: false },
  { name: 'Status', type: 'select', position: 4, required: true, options: [
    'Not Called', 'Attempted', 'In Progress', 'Connected', 'Qualified', 'Interested',
    'Follow-up Due', 'Meeting Scheduled', 'Proposal Sent', 'Won', 'Lost', 'Dead'
  ] },
  { name: 'Lead Owner', type: 'select', position: 5, required: false },
  { name: 'Location', type: 'text', position: 6, required: false },
  { name: 'Industry', type: 'text', position: 7, required: false },
  { name: 'Website', type: 'url', position: 8, required: false },
  { name: 'Follow-up Date', type: 'date', position: 9, required: false },
  { name: 'Notes', type: 'text', position: 10, required: false },
]

// ── Audit Logging ─────────────────────────────────────────────────────────────

export async function logAudit(
  entityType: string,
  entityId: string,
  action: AuditLog['action'],
  userId: string,
  userName: string,
  fieldName?: string,
  oldValue?: string,
  newValue?: string
): Promise<void> {
  const entry: AuditLog = {
    id: genId(),
    entity_type: entityType,
    entity_id: entityId,
    user_id: userId,
    user_name: userName,
    action,
    field_name: fieldName,
    old_value: oldValue,
    new_value: newValue,
    created_at: new Date().toISOString(),
  }

  if (isSupabaseReady) {
    try {
      await supabase.from('audit_logs').insert(entry)
    } catch (err) {
      console.warn('Failed to insert audit log in Supabase:', err)
    }
  }
}

// ── Workspaces ────────────────────────────────────────────────────────────────

export async function fetchWorkspaces(): Promise<Result<Workspace[]>> {
  if (!isSupabaseReady) {
    const local = load<Workspace>(KEYS.workspaces)
    if (local.length === 0) {
      // Seed from existing lists if any
      const legacyLists = load<{ id: string; name: string; type: 'company' | 'freelancer'; created_at: string; columns?: string[] }>(KEYS.lists)
      if (legacyLists.length > 0) {
        const migrated: Workspace[] = legacyLists.map(l => ({
          id: l.id,
          name: l.name,
          type: l.type,
          created_at: l.created_at,
          archived: false,
          columns: l.columns || [],
        }))
        save(KEYS.workspaces, migrated)
        return { data: migrated, error: null }
      }
    }
    return {
      data: local.filter(
        w => !w.archived && !['connection-list', 'cold-calling-1', 'cold-calling-2', 'new-list', 'data-centres', 'kharadi', 'ranjangaon', 'bhosari', 'chakan', 'freelancers'].includes(w.id) && w.name.toLowerCase() !== 'connection list'
      ),
      error: null,
    }
  }

  try {
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      // Fallback to legacy lists table if workspaces table is not yet migrated
      const legacyRes = await supabase.from('lists').select('*').order('created_at', { ascending: false })
      if (!legacyRes.error && legacyRes.data) {
        const mapped: Workspace[] = legacyRes.data.map(l => ({
          id: l.id,
          name: l.name,
          type: l.type,
          created_at: l.created_at,
          archived: false,
          columns: l.columns || [],
        }))
        save(KEYS.workspaces, mapped)
        return { data: mapped, error: null }
      }
      return { data: load<Workspace>(KEYS.workspaces), error: error.message }
    }

    const workspaces = (data || []) as Workspace[]
    save(KEYS.workspaces, workspaces)
    return { data: workspaces.filter(w => !w.archived), error: null }
  } catch (err: unknown) {
    return { data: load<Workspace>(KEYS.workspaces), error: err instanceof Error ? err.message : String(err) }
  }
}

export async function createWorkspace(
  params: {
    name: string
    type?: 'company' | 'freelancer'
    description?: string
    created_by?: string
  },
  customColumns?: Array<{ name: string; type: ColumnType; required?: boolean; options?: string[] }>
): Promise<Result<Workspace>> {
  const newWorkspace: Workspace = {
    id: genId(),
    name: params.name.trim(),
    type: params.type || 'company',
    description: params.description?.trim(),
    created_by: params.created_by,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived: false,
    columns: customColumns ? customColumns.map(c => c.name) : [],
  }

  // Generate initial column definitions
  const columnsToInsert: WorkspaceColumn[] = (customColumns && customColumns.length > 0)
    ? customColumns.map((col, index) => ({
        id: genId(),
        workspace_id: newWorkspace.id,
        name: col.name,
        type: col.type,
        position: index,
        required: col.required ?? false,
        options: col.options || [],
        hidden: false,
      }))
    : DEFAULT_WORKSPACE_COLUMNS.map((col, index) => ({
        id: genId(),
        workspace_id: newWorkspace.id,
        name: col.name,
        type: col.type,
        position: index,
        required: col.required ?? false,
        options: col.options || [],
        hidden: false,
      }))

  if (isSupabaseReady) {
    try {
      const { data, error } = await supabase
        .from('workspaces')
        .insert(newWorkspace)
        .select()
        .single()

      if (error) {
        // Fallback to lists table if workspaces table is pending migration
        await supabase.from('lists').insert({
          id: newWorkspace.id,
          name: newWorkspace.name,
          type: newWorkspace.type,
          created_at: newWorkspace.created_at,
          columns: newWorkspace.columns,
        })
      } else if (data) {
        // Insert columns
        if (columnsToInsert.length > 0) {
          await supabase.from('workspace_columns').insert(columnsToInsert)
        }
      }
    } catch (err) {
      console.warn('Failed to insert workspace in Supabase:', err)
    }
  }

  // Update local cache
  const allWorkspaces = load<Workspace>(KEYS.workspaces)
  save(KEYS.workspaces, [newWorkspace, ...allWorkspaces])

  const allCols = load<WorkspaceColumn>(KEYS.workspace_columns)
  save(KEYS.workspace_columns, [...allCols, ...columnsToInsert])

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gc:data-changed', { detail: 'workspace_created' }))
  }

  return { data: newWorkspace, error: null }
}

export async function updateWorkspace(
  id: string,
  updates: Partial<Workspace>
): Promise<Result<Workspace>> {
  const workspaces = load<Workspace>(KEYS.workspaces)
  const idx = workspaces.findIndex(w => w.id === id)
  if (idx < 0) return { data: null, error: 'Workspace not found' }

  const updated: Workspace = {
    ...workspaces[idx],
    ...updates,
    updated_at: new Date().toISOString(),
  }
  workspaces[idx] = updated
  save(KEYS.workspaces, workspaces)

  if (isSupabaseReady) {
    try {
      const { error } = await supabase
        .from('workspaces')
        .update(updated)
        .eq('id', id)
      if (error) {
        // Try fallback to lists
        await supabase.from('lists').update({ name: updated.name }).eq('id', id)
      }
    } catch (err) {
      console.warn('Supabase workspace update error:', err)
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gc:data-changed', { detail: 'workspace_updated' }))
  }

  return { data: updated, error: null }
}

export async function archiveWorkspace(
  id: string,
  userId?: string,
  userName?: string
): Promise<Result<boolean>> {
  const res = await updateWorkspace(id, { archived: true })
  if (res.error) return { data: false, error: res.error }

  if (userId && userName) {
    await logAudit('workspace', id, 'archive', userId, userName, 'archived', 'false', 'true')
  }

  return { data: true, error: null }
}

// ── Workspace Columns ─────────────────────────────────────────────────────────

export async function fetchWorkspaceColumns(workspaceId: string): Promise<Result<WorkspaceColumn[]>> {
  if (!isSupabaseReady) {
    const all = load<WorkspaceColumn>(KEYS.workspace_columns)
    const filtered = all
      .filter(c => c.workspace_id === workspaceId)
      .sort((a, b) => a.position - b.position)

    if (filtered.length === 0) {
      // Generate default columns for this workspace
      const defaults = DEFAULT_WORKSPACE_COLUMNS.map((col, index) => ({
        id: genId(),
        workspace_id: workspaceId,
        name: col.name,
        type: col.type,
        position: index,
        required: col.required ?? false,
        options: col.options || [],
        hidden: false,
      }))
      save(KEYS.workspace_columns, [...all, ...defaults])
      return { data: defaults, error: null }
    }
    return { data: filtered, error: null }
  }

  try {
    const { data, error } = await supabase
      .from('workspace_columns')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('position', { ascending: true })

    if (error || !data || data.length === 0) {
      // Fallback to local or default
      const all = load<WorkspaceColumn>(KEYS.workspace_columns)
      const existing = all.filter(c => c.workspace_id === workspaceId)
      if (existing.length > 0) return { data: existing, error: null }

      // Create defaults
      const defaults = DEFAULT_WORKSPACE_COLUMNS.map((col, index) => ({
        id: genId(),
        workspace_id: workspaceId,
        name: col.name,
        type: col.type,
        position: index,
        required: col.required ?? false,
        options: col.options || [],
        hidden: false,
      }))
      try {
        await supabase.from('workspace_columns').insert(defaults)
      } catch { /* ignore fallback */ }
      save(KEYS.workspace_columns, [...all, ...defaults])
      return { data: defaults, error: null }
    }

    return { data: data as WorkspaceColumn[], error: null }
  } catch (err: unknown) {
    return { data: [], error: err instanceof Error ? err.message : String(err) }
  }
}

export async function saveWorkspaceColumns(
  workspaceId: string,
  columns: Array<Omit<WorkspaceColumn, 'id' | 'workspace_id'> & { id?: string }>
): Promise<Result<WorkspaceColumn[]>> {
  const formatted: WorkspaceColumn[] = columns.map((c, i) => ({
    id: c.id || genId(),
    workspace_id: workspaceId,
    name: c.name,
    type: c.type,
    position: i,
    required: c.required ?? false,
    options: c.options || [],
    hidden: c.hidden ?? false,
  }))

  if (isSupabaseReady) {
    try {
      await supabase.from('workspace_columns').delete().eq('workspace_id', workspaceId)
      const { error } = await supabase.from('workspace_columns').insert(formatted)
      if (error) console.warn('Supabase workspace_columns insert error:', error)
    } catch (err) {
      console.warn('Supabase workspace_columns save error:', err)
    }
  }

  // Update local
  const all = load<WorkspaceColumn>(KEYS.workspace_columns).filter(c => c.workspace_id !== workspaceId)
  save(KEYS.workspace_columns, [...all, ...formatted])

  return { data: formatted, error: null }
}

// ── Companies in Workspace ────────────────────────────────────────────────────

export interface WorkspaceCompanyRow extends Company {
  contacts?: Contact[]
  primaryContact?: Contact
  lastCallLog?: CallLog
}

export async function fetchWorkspaceCompanies(
  workspaceId: string,
  options?: {
    search?: string
    status?: string
    ownerId?: string
    includeArchived?: boolean
  }
): Promise<Result<WorkspaceCompanyRow[]>> {
  let companies: Company[] = []
  let contacts: Contact[] = []
  let callLogs: CallLog[] = []

  if (!isSupabaseReady) {
    const allCompanies = load<Company>(KEYS.companies)
    contacts = load<Contact>(KEYS.contacts)
    callLogs = load<CallLog>(KEYS.call_logs)

    companies = allCompanies.filter(c => {
      const matchWs = (c.workspace_id && c.workspace_id === workspaceId) || c.list_id === workspaceId
      const matchArchived = options?.includeArchived ? true : !c.archived
      return matchWs && matchArchived
    })
  } else {
    try {
      // Query companies matching workspace_id OR list_id
      let q = supabase
        .from('companies')
        .select('*')
        .or(`workspace_id.eq.${workspaceId},list_id.eq.${workspaceId}`)
        .order('created_at', { ascending: false })

      if (!options?.includeArchived) {
        q = q.eq('archived', false)
      }

      if (options?.status && options.status !== 'all') {
        q = q.eq('status', options.status)
      }

      if (options?.ownerId && options.ownerId !== 'all') {
        q = q.eq('owner_id', options.ownerId)
      }

      const { data, error } = await q
      if (error) throw error
      companies = (data || []) as Company[]

      // Fetch contacts for these companies
      if (companies.length > 0) {
        const companyIds = companies.map(c => c.id)
        const contactRes = await supabase
          .from('contacts')
          .select('*')
          .in('company_id', companyIds)
        if (!contactRes.error && contactRes.data) {
          contacts = contactRes.data as Contact[]
        }

        const logRes = await supabase
          .from('call_logs')
          .select('*')
          .in('company_id', companyIds)
          .order('called_at', { ascending: false })
        if (!logRes.error && logRes.data) {
          callLogs = logRes.data as CallLog[]
        }
      }
    } catch (err: unknown) {
      console.warn('Failed to fetch from Supabase, falling back to local cache:', err)
      const allCompanies = load<Company>(KEYS.companies)
      contacts = load<Contact>(KEYS.contacts)
      callLogs = load<CallLog>(KEYS.call_logs)
      companies = allCompanies.filter(c => {
        const matchWs = (c.workspace_id && c.workspace_id === workspaceId) || c.list_id === workspaceId
        const matchArchived = options?.includeArchived ? true : !c.archived
        return matchWs && matchArchived
      })
    }
  }

  // Attach primaryContact and lastCallLog
  const rows: WorkspaceCompanyRow[] = companies.map(c => {
    const compContacts = contacts.filter(ct => ct.company_id === c.id)
    const primaryContact = compContacts.find(ct => ct.is_primary) || compContacts[0]
    const compLogs = callLogs.filter(cl => cl.company_id === c.id)
    const lastCallLog = compLogs.sort((a, b) => new Date(b.called_at).getTime() - new Date(a.called_at).getTime())[0]

    return {
      ...c,
      contacts: compContacts,
      primaryContact,
      lastCallLog,
    }
  })

  // Apply search query filter if provided
  let filtered = rows
  if (options?.search && options.search.trim()) {
    const s = options.search.toLowerCase()
    filtered = rows.filter(r =>
      r.name.toLowerCase().includes(s) ||
      (r.primaryContact?.name && r.primaryContact.name.toLowerCase().includes(s)) ||
      (r.primaryContact?.phones && r.primaryContact.phones.some(p => p.toLowerCase().includes(s))) ||
      (r.location && r.location.toLowerCase().includes(s)) ||
      (r.industry && r.industry.toLowerCase().includes(s))
    )
  }

  return { data: filtered, error: null }
}

export async function upsertCompanyInWorkspace(
  companyData: Partial<Company> & { name: string; workspace_id: string },
  primaryContactData?: Partial<Contact>,
  user?: { id: string; name: string }
): Promise<Result<Company>> {
  const companyId = companyData.id || genId()

  const fullCompany: Company = {
    id: companyId,
    name: companyData.name.trim(),
    workspace_id: companyData.workspace_id,
    list_id: companyData.workspace_id, // keep backwards compatible
    owner_id: companyData.owner_id ?? null as unknown as undefined,
    owner_name: companyData.owner_name ?? null as unknown as undefined,
    archived: companyData.archived ?? false,
    archived_at: companyData.archived_at ?? null as unknown as undefined,
    import_id: companyData.import_id ?? null as unknown as undefined,
    source_data: companyData.source_data ?? {},
    custom_fields: companyData.custom_fields ?? {},
    sector: companyData.sector,
    industry: companyData.industry,
    location: companyData.location,
    website: companyData.website,
    notes: companyData.notes,
    reference: companyData.reference ?? false,
    status: companyData.status || 'Not Called',
    created_at: companyData.created_at || new Date().toISOString(),
  }

  // Supabase FIRST
  if (isSupabaseReady) {
    try {
      const { error } = await supabase
        .from('companies')
        .upsert(fullCompany, { onConflict: 'id' })

      if (error) {
        console.error('Supabase upsertCompany error:', error)
        return { data: null, error: error.message }
      }

      // Upsert contact if provided
      if (primaryContactData && (primaryContactData.name || primaryContactData.phones?.length || primaryContactData.email)) {
        const contact: Contact = {
          id: primaryContactData.id || genId(),
          company_id: companyId,
          name: primaryContactData.name || 'Primary Contact',
          designation: primaryContactData.designation,
          phones: primaryContactData.phones || [],
          email: primaryContactData.email,
          is_primary: true,
        }
        await supabase.from('contacts').upsert(contact, { onConflict: 'id' })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { data: null, error: msg }
    }
  }

  // Update local cache
  const companies = load<Company>(KEYS.companies)
  const idx = companies.findIndex(c => c.id === companyId)
  if (idx >= 0) {
    companies[idx] = fullCompany
  } else {
    companies.unshift(fullCompany)
  }
  save(KEYS.companies, companies)

  if (primaryContactData) {
    const contacts = load<Contact>(KEYS.contacts)
    const cIdx = contacts.findIndex(c => c.company_id === companyId && c.is_primary)
    const updatedContact: Contact = {
      id: (cIdx >= 0 ? contacts[cIdx].id : primaryContactData.id) || genId(),
      company_id: companyId,
      name: primaryContactData.name || 'Primary Contact',
      designation: primaryContactData.designation,
      phones: primaryContactData.phones || [],
      email: primaryContactData.email,
      is_primary: true,
    }
    if (cIdx >= 0) contacts[cIdx] = updatedContact
    else contacts.push(updatedContact)
    save(KEYS.contacts, contacts)
  }

  // Log audit if user provided
  if (user) {
    await logAudit('company', companyId, idx >= 0 ? 'update' : 'create', user.id, user.name)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gc:data-changed', { detail: 'company_upserted' }))
  }

  return { data: fullCompany, error: null }
}

export async function archiveCompany(
  companyId: string,
  user?: { id: string; name: string }
): Promise<Result<boolean>> {
  const companies = load<Company>(KEYS.companies)
  const idx = companies.findIndex(c => c.id === companyId)
  if (idx >= 0) {
    companies[idx].archived = true
    companies[idx].archived_at = new Date().toISOString()
    save(KEYS.companies, companies)
  }

  if (isSupabaseReady) {
    try {
      const { error } = await supabase
        .from('companies')
        .update({ archived: true, archived_at: new Date().toISOString() })
        .eq('id', companyId)
      if (error) return { data: false, error: error.message }
    } catch (err: unknown) {
      return { data: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  if (user) {
    await logAudit('company', companyId, 'archive', user.id, user.name, 'archived', 'false', 'true')
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gc:data-changed', { detail: 'company_archived' }))
  }

  return { data: true, error: null }
}

export async function restoreCompany(
  companyId: string,
  user?: { id: string; name: string }
): Promise<Result<boolean>> {
  const companies = load<Company>(KEYS.companies)
  const idx = companies.findIndex(c => c.id === companyId)
  if (idx >= 0) {
    companies[idx].archived = false
    companies[idx].archived_at = undefined
    save(KEYS.companies, companies)
  }

  if (isSupabaseReady) {
    try {
      const { error } = await supabase
        .from('companies')
        .update({ archived: false, archived_at: null })
        .eq('id', companyId)
      if (error) return { data: false, error: error.message }
    } catch (err: unknown) {
      return { data: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  if (user) {
    await logAudit('company', companyId, 'restore', user.id, user.name, 'archived', 'true', 'false')
  }

  return { data: true, error: null }
}

export async function bulkUpdateCompanies(
  companyIds: string[],
  updates: Partial<Company>,
  user?: { id: string; name: string }
): Promise<Result<number>> {
  if (companyIds.length === 0) return { data: 0, error: null }

  if (isSupabaseReady) {
    try {
      const { error } = await supabase
        .from('companies')
        .update(updates)
        .in('id', companyIds)

      if (error) return { data: 0, error: error.message }
    } catch (err: unknown) {
      return { data: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // Update local cache
  const companies = load<Company>(KEYS.companies)
  const updated = companies.map(c => {
    if (companyIds.includes(c.id)) {
      return { ...c, ...updates }
    }
    return c
  })
  save(KEYS.companies, updated)

  if (user) {
    for (const cid of companyIds) {
      await logAudit('company', cid, 'update', user.id, user.name, Object.keys(updates).join(', '))
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gc:data-changed', { detail: 'bulk_updated' }))
  }

  return { data: companyIds.length, error: null }
}

export async function bulkArchiveCompanies(
  companyIds: string[],
  user?: { id: string; name: string }
): Promise<Result<number>> {
  return bulkUpdateCompanies(companyIds, { archived: true, archived_at: new Date().toISOString() }, user)
}

// ── Lead Locks ────────────────────────────────────────────────────────────────

export async function acquireLeadLock(
  companyId: string,
  user: { id: string; name: string; color?: string }
): Promise<{ success: boolean; locked_by?: string; locked_by_color?: string }> {
  try {
    const res = await api.leadLocks.acquire(companyId, user)
    if (res.data) return res.data
  } catch {
    // fallback if api unreachable
  }

  if (!isSupabaseReady) {
    // In local mode, lock succeeds
    return { success: true }
  }

  try {
    // Try calling the RPC function
    const { data, error } = await supabase.rpc('acquire_lead_lock', {
      p_company_id: companyId,
      p_user_id: user.id,
      p_user_name: user.name,
      p_user_color: user.color || '#E8E8E8',
    })

    if (!error && data) {
      return data as { success: boolean; locked_by?: string; locked_by_color?: string }
    }

    // Direct upsert fallback
    const { error: upsertErr } = await supabase.from('lead_locks').upsert({
      company_id: companyId,
      user_id: user.id,
      user_name: user.name,
      user_color: user.color || '#E8E8E8',
      locked_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }, { onConflict: 'company_id' })

    if (upsertErr) {
      return { success: false, locked_by: 'Another user' }
    }
    return { success: true }
  } catch {
    return { success: true }
  }
}

export async function releaseLeadLock(companyId: string, userId: string): Promise<void> {
  try {
    await api.leadLocks.release(companyId, userId)
  } catch {
    // ignore
  }

  if (!isSupabaseReady) return

  try {
    await supabase
      .from('lead_locks')
      .delete()
      .eq('company_id', companyId)
      .eq('user_id', userId)
  } catch (err) {
    console.warn('Failed to release lead lock:', err)
  }
}

export async function fetchActiveLocks(): Promise<Record<string, LeadLock>> {
  try {
    const res = await api.leadLocks.getActive()
    if (res.data && Object.keys(res.data).length > 0) return res.data
  } catch {
    // fallback
  }

  if (!isSupabaseReady) return {}

  try {
    const { data, error } = await supabase
      .from('lead_locks')
      .select('*')
      .gt('expires_at', new Date().toISOString())

    if (error || !data) return {}

    const map: Record<string, LeadLock> = {}
    for (const lock of data as LeadLock[]) {
      map[lock.company_id] = lock
    }
    return map
  } catch {
    return {}
  }
}

// ── Imports and Rollback ───────────────────────────────────────────────────────

export async function recordImport(
  importRecord: Omit<ImportRecord, 'id' | 'created_at'>
): Promise<Result<ImportRecord>> {
  const full: ImportRecord = {
    id: genId(),
    created_at: new Date().toISOString(),
    ...importRecord,
  }

  if (isSupabaseReady) {
    try {
      await supabase.from('imports').insert(full)
    } catch (err) {
      console.warn('Failed to record import in Supabase:', err)
    }
  }

  return { data: full, error: null }
}

export async function fetchImports(workspaceId: string): Promise<Result<ImportRecord[]>> {
  if (!isSupabaseReady) return { data: [], error: null }

  try {
    const { data, error } = await supabase
      .from('imports')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return { data: (data || []) as ImportRecord[], error: null }
  } catch (err: unknown) {
    return { data: [], error: err instanceof Error ? err.message : String(err) }
  }
}

export async function rollbackImport(
  importId: string,
  workspaceId: string,
  user?: { id: string; name: string }
): Promise<Result<number>> {
  // Archive all companies associated with this import_id
  if (isSupabaseReady) {
    try {
      const { data, error } = await supabase
        .from('companies')
        .update({ archived: true, archived_at: new Date().toISOString() })
        .eq('import_id', importId)
        .select('id')

      if (error) throw error

      await supabase
        .from('imports')
        .update({ status: 'rolled_back' })
        .eq('id', importId)

      const count = data?.length || 0
      return { data: count, error: null }
    } catch (err: unknown) {
      return { data: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // Local fallback
  const companies = load<Company>(KEYS.companies)
  let count = 0
  const updated = companies.map(c => {
    if (c.import_id === importId) {
      count++
      return { ...c, archived: true, archived_at: new Date().toISOString() }
    }
    return c
  })
  save(KEYS.companies, updated)

  if (user) {
    await logAudit('import', importId, 'archive', user.id, user.name, 'status', 'completed', 'rolled_back')
  }

  return { data: count, error: null }
}
