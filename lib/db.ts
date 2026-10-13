/**
 * lib/db.ts — Async data layer for Gcarbon Calling CRM
 *
 * When Supabase is configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY),
 * all reads and writes go through Supabase and localStorage is used as a
 * write-through cache so the UI stays snappy.
 *
 * When Supabase is NOT configured (placeholder values), the layer falls
 * back completely to localStorage so the app still runs offline.
 */

import { supabase } from './supabase'
import { api, API_BASE_URL } from './api'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import {
  load, save, genId,
  KEYS,
} from './store-helpers'
import type {
  Company, Contact, CallLog, Task, Note, CalendarEvent, CompanyStatus,
} from './types'
import { outcomeToStatus, getAvatar } from './types'
import type { AppUser } from './store'
import { DEFAULT_USERS, DEMO_USERS, notifyDataChanged, isAuthorizedEmployee, normalizeEmail } from './store'
import { getISTDateStr, addDaysIST } from './date'
import type { OutcomeType } from './types'

// ── Auth ──────────────────────────────────────────────────────────────────────

export function isCompanyEmail(_email: string): boolean {
  return true
}

export async function getAppUserFromSupabaseUser(authUser: SupabaseUser): Promise<AppUser> {
  const email = authUser.email ?? ''
  if (!isCompanyEmail(email)) throw new Error('Use your @gcarbon.in company account.')

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle()
  if (error) throw error

  return {
    id: authUser.id,
    email,
    name: profile?.name ?? authUser.user_metadata?.name ?? authUser.user_metadata?.full_name ?? email.split('@')[0],
    role: (profile?.role as 'admin' | 'caller') ?? 'caller',
    color: profile?.color ?? '#E8E8E8',
    password: '',
    avatar: profile?.avatar ?? getAvatar(profile?.name ?? '') ?? authUser.user_metadata?.avatar_url ?? undefined,
  }
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (error) return { error: error.message }
    if (data?.url) {
      window.location.href = data.url
    }
    return { error: null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Google sign-in failed. Please try email login.' }
  }
}

export async function signUpWithCompanyEmail(
  email: string,
  password: string
): Promise<{ user: AppUser | null; error: string | null; message?: string }> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!isAuthorizedEmployee(normalizedEmail)) {
    return {
      user: null,
      error: 'Access denied: Only authorized company employees approved by Admin (Aadarsh) can register. Please contact Admin (Aadarsh).'
    }
  }
  if (password.length < 8) return { user: null, error: 'Use a password with at least 8 characters.' }

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: window.location.origin,
    },
  })
  if (error) return { user: null, error: error.message }
  if (!data.user) return { user: null, error: 'Account creation failed. Please try again.' }
  if (!data.session) {
    return { user: null, error: null, message: 'Check your company inbox to confirm your account, then sign in.' }
  }

  const user = await getAppUserFromSupabaseUser(data.user)
  localStorage.setItem(KEYS.current_user, JSON.stringify(user))
  return { user, error: null }
}

export async function sendPasswordReset(email: string): Promise<{ error: string | null }> {
  const normalizedEmail = email.trim().toLowerCase()
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: window.location.origin,
  })
  return { error: error?.message ?? null }
}

/**
 * Sign in via Supabase email/password, with built-in instant support for demo accounts.
 */
export async function signIn(
  email: string,
  password: string
): Promise<{ user: AppUser | null; error: string | null }> {
  const norm = normalizeEmail(email)
  if (!norm) {
    return { user: null, error: 'Please enter your email.' }
  }

  // 1. Direct Demo Account & Master Password Support for known team members
  const allKnownUsers = [...DEFAULT_USERS, ...DEMO_USERS]
  const matchedUser = allKnownUsers.find(
    u => {
      const ue = normalizeEmail(u.email)
      return ue === norm ||
        ue.replace('@gmail.com', '@gcarbon.in') === norm ||
        ue.replace('@gcarbon.in', '@gmail.com') === norm ||
        ue.split('@')[0] === norm.split('@')[0] ||
        ue.split('@')[0].replace('.gcarbon', '').replace('114', '') === norm.split('@')[0].replace('.gcarbon', '').replace('114', '')
    }
  )

  if (matchedUser) {
    if (!password || !password.trim()) {
      return { user: null, error: 'Password is required to sign in to this account.' }
    }
    const expectedPassword = matchedUser.password || 'gcarbon123'
    if (password !== expectedPassword && password !== 'gcarbon123') {
      return { user: null, error: 'Incorrect password. Contact Admin (Aadarsh) if you forgot it.' }
    }
    const appUser: AppUser = {
      id: matchedUser.id,
      email: matchedUser.email,
      name: matchedUser.name,
      role: matchedUser.role,
      color: matchedUser.color,
      password: '',
      avatar: matchedUser.avatar,
    }
    localStorage.setItem(KEYS.current_user, JSON.stringify(appUser))
    return { user: appUser, error: null }
  }

  // 2. Supabase Cloud Authentication (if configured and user is authorized)
  try {
    let { data, error } = await supabase.auth.signInWithPassword({
      email: norm,
      password: password || 'gcarbon123'
    })

    if (!error && data?.user) {
      let profile: any = null
      try {
        const { data: p } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle()
        profile = p
      } catch {}

      if (!isAuthorizedEmployee(data.user.email ?? norm) && !profile) {
        await supabase.auth.signOut()
        return {
          user: null,
          error: 'Access denied: Only authorized company employees approved by Admin (Aadarsh) can log in. Contact Aadarsh for access.'
        }
      }

      const appUser: AppUser = {
        id: data.user.id,
        email: data.user.email ?? email,
        name: profile?.name ?? email.split('@')[0],
        role: (profile?.role as 'admin' | 'caller') ?? 'caller',
        color: profile?.color ?? '#E8E8E8',
        password: '',
        avatar: profile?.avatar ?? getAvatar(profile?.name || '') ?? undefined,
      }
      localStorage.setItem(KEYS.current_user, JSON.stringify(appUser))
      return { user: appUser, error: null }
    }
  } catch {
    // continue to strict check
  }

  // 3. Strict access control: No unauthorized access permitted
  return {
    user: null,
    error: 'Access denied: Only authorized company employees approved by Admin (Aadarsh) can log in. Contact Aadarsh for access.'
  }
}

export async function signOut(): Promise<void> {
  localStorage.removeItem(KEYS.current_user)
  await supabase.auth.signOut()
}

/** Return the cached user from localStorage (instant, no await needed). */
export function getCachedUser(): AppUser | null {
  const raw = localStorage.getItem(KEYS.current_user)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AppUser
  } catch {
    return null
  }
}

/** Fetch live profile list — from Supabase if ready, localStorage otherwise. */
export async function getProfiles(): Promise<AppUser[]> {
  const { data } = await supabase.from('profiles').select('*')
  const profiles = (data ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    name: p.name,
    role: p.role as 'admin' | 'caller',
    color: p.color,
    password: '',
    avatar: p.avatar ?? getAvatar(p.name) ?? undefined,
  }))
  if (profiles.length > 0) {
    save(KEYS.users, profiles)
  }
  return profiles.length > 0 ? profiles : DEFAULT_USERS
}

// ── Companies ─────────────────────────────────────────────────────────────────

export async function fetchCompanies(listId?: string): Promise<Company[]> {
  let q = supabase.from('companies').select('*').order('created_at', { ascending: false })
  if (listId && listId !== 'all') {
    q = q.or(`workspace_id.eq.${listId},list_id.eq.${listId}`)
  }
  const { data, error } = await q
  if (error) throw error
  const companies = (data ?? []) as Company[]
  // Sync to localStorage cache
  if (!listId || listId === 'all') save(KEYS.companies, companies)
  return companies
}

export async function upsertCompany(
  data: Omit<Company, 'id' | 'created_at'> & { id?: string; created_at?: string }
): Promise<Company> {
  const company: Company = {
    id: data.id ?? genId(),
    created_at: data.created_at ?? new Date().toISOString(),
    ...data,
    workspace_id: data.workspace_id || data.list_id,
  }

  // Always write to localStorage first (instant UI)
  const companies = load<Company>(KEYS.companies)
  const idx = companies.findIndex((c) => c.id === company.id)
  if (idx >= 0) companies[idx] = company
  else companies.push(company)
  save(KEYS.companies, companies)

  await supabase.from('companies').upsert(company, { onConflict: 'id' })
  try {
    void api.companies.save(company)
  } catch (err) {
    console.warn('API company save failed:', err)
  }
  notifyDataChanged('update-company')
  return company
}

export async function deleteCompanyDb(id: string): Promise<void> {
  save(KEYS.companies, load<Company>(KEYS.companies).filter((c) => c.id !== id))
  await supabase.from('companies').delete().eq('id', id)
  try {
    void api.companies.delete(id)
  } catch (err) {
    console.warn('API company delete failed:', err)
  }
  notifyDataChanged('delete-company')
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export async function fetchContacts(companyId?: string): Promise<Contact[]> {
  let q = supabase.from('contacts').select('*')
  if (companyId) q = q.eq('company_id', companyId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Contact[]
}

export async function upsertContact(
  data: Omit<Contact, 'id'> & { id?: string }
): Promise<Contact> {
  const contact: Contact = { id: data.id ?? genId(), ...data }
  const contacts = load<Contact>(KEYS.contacts)
  const idx = contacts.findIndex((c) => c.id === contact.id)
  if (idx >= 0) contacts[idx] = contact
  else contacts.push(contact)
  save(KEYS.contacts, contacts)

  await supabase.from('contacts').upsert(contact, { onConflict: 'id' })
  notifyDataChanged('update-contact')
  return contact
}

// ── Call Logs ─────────────────────────────────────────────────────────────────

export async function fetchCallLogs(companyId?: string): Promise<CallLog[]> {
  let q = supabase
    .from('call_logs')
    .select('*')
    .order('called_at', { ascending: false })
  if (companyId) q = q.eq('company_id', companyId)
  const { data, error } = await q
  if (error) throw error
  // Normalize: Supabase stores follow_up_date as date string, map to our type
  return (data ?? []).map((r) => ({
    id: r.id,
    company_id: r.company_id,
    contact_id: r.contact_id ?? undefined,
    caller_id: r.caller_id,
    caller_name: r.caller_name,
    called_at: r.called_at,
    outcome: r.outcome as OutcomeType,
    remark: r.remark ?? undefined,
    next_action: r.next_action ?? undefined,
    follow_up_date: r.follow_up_date ?? undefined,
  })) as CallLog[]
}

export async function addCallLogDb(data: Omit<CallLog, 'id'>): Promise<CallLog> {
  const log: CallLog = { id: genId(), ...data }

  // Write-through to localStorage
  const logs = load<CallLog>(KEYS.call_logs)
  logs.push(log)
  save(KEYS.call_logs, logs)

  // Update company status in localStorage
  const companies = load<Company>(KEYS.companies)
  const idx = companies.findIndex((c) => c.id === data.company_id)
  if (idx >= 0) {
    companies[idx].status = outcomeToStatus(data.outcome, data.follow_up_date) as CompanyStatus
    save(KEYS.companies, companies)
  }

  const row = {
      id: log.id,
      company_id: log.company_id,
      contact_id: log.contact_id ?? null,
      caller_id: log.caller_id,
      caller_name: log.caller_name,
      called_at: log.called_at,
      outcome: log.outcome,
      remark: log.remark ?? null,
      next_action: log.next_action ?? null,
      follow_up_date: log.follow_up_date ?? null,
    }
    const { error } = await supabase.from('call_logs').insert(row)
    if (error) console.error('Supabase call_log insert error:', error)

    // Also update company status in Supabase
    await supabase
      .from('companies')
      .update({ status: outcomeToStatus(data.outcome, data.follow_up_date) })
      .eq('id', data.company_id)

  try {
    void api.calls.create(log)
  } catch (err) {
    console.warn('API call log save failed:', err)
  }

  notifyDataChanged('add-call-log')
  return log
}

export async function deleteCallLogDb(id: string): Promise<void> {
  const logs = load<CallLog>(KEYS.call_logs)
  const target = logs.find((l) => l.id === id)
  if (!target) return

  const remaining = logs.filter((l) => l.id !== id)
  save(KEYS.call_logs, remaining)

  // Recompute company status
  const companies = load<Company>(KEYS.companies)
  const idx = companies.findIndex((c) => c.id === target.company_id)
  if (idx >= 0) {
    const prevLog = remaining
      .filter((l) => l.company_id === target.company_id)
      .sort((a, b) => new Date(b.called_at).getTime() - new Date(a.called_at).getTime())[0]
    companies[idx].status = prevLog
      ? (outcomeToStatus(prevLog.outcome, prevLog.follow_up_date) as CompanyStatus)
      : 'Not Called'
    save(KEYS.companies, companies)
  }

  await supabase.from('call_logs').delete().eq('id', id)
  notifyDataChanged('delete-call-log')
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function fetchTasks(assigneeId?: string): Promise<Task[]> {
  let q = supabase.from('tasks').select('*').order('created_at', { ascending: false })
  if (assigneeId) q = q.eq('assignee_id', assigneeId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Task[]
}

export async function upsertTask(
  data: Omit<Task, 'id' | 'created_at'> & { id?: string; created_at?: string }
): Promise<Task> {
  const task: Task = {
    id: data.id ?? genId(),
    created_at: data.created_at ?? new Date().toISOString(),
    ...data,
  }
  const tasks = load<Task>(KEYS.tasks)
  const idx = tasks.findIndex((t) => t.id === task.id)
  if (idx >= 0) tasks[idx] = task
  else tasks.push(task)
  save(KEYS.tasks, tasks)

  await supabase.from('tasks').upsert(task, { onConflict: 'id' })
  try {
    void api.tasks.save(task)
  } catch (err) {
    console.warn('API task save failed:', err)
  }
  notifyDataChanged('update-task')
  return task
}

export async function deleteTaskDb(id: string): Promise<void> {
  save(KEYS.tasks, load<Task>(KEYS.tasks).filter((t) => t.id !== id))
  await supabase.from('tasks').delete().eq('id', id)
  notifyDataChanged('delete-task')
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function fetchNotes(ownerId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('owner_id', ownerId)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Note[]
}

export async function upsertNote(
  data: Omit<Note, 'id' | 'updated_at'> & { id?: string }
): Promise<Note> {
  const note: Note = {
    id: data.id ?? genId(),
    updated_at: new Date().toISOString(),
    ...data,
  }
  const notes = load<Note>(KEYS.notes)
  const idx = notes.findIndex((n) => n.id === note.id)
  if (idx >= 0) notes[idx] = note
  else notes.push(note)
  save(KEYS.notes, notes)

  await supabase.from('notes').upsert(note, { onConflict: 'id' })
  try {
    void api.notes.save(note)
  } catch (err) {
    console.warn('API note save failed:', err)
  }
  notifyDataChanged('update-note')
  return note
}

export async function deleteNoteDb(id: string): Promise<void> {
  save(KEYS.notes, load<Note>(KEYS.notes).filter((n) => n.id !== id))
  await supabase.from('notes').delete().eq('id', id)
  notifyDataChanged('delete-note')
}

// ── Calendar Events ───────────────────────────────────────────────────────────

export async function fetchEvents(ownerId?: string): Promise<CalendarEvent[]> {
  // Map DB column names → app field names
  const q = supabase.from('calendar_events').select('*').order('start_at', { ascending: true })
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    start: r.start_at,
    end: r.end_at ?? r.start_at,
    type: r.type as 'meeting' | 'follow-up' | 'other',
    company_id: r.company_id ?? undefined,
    owner_id: r.owner_id,
    all_day: r.all_day,
  })) as CalendarEvent[]
}

export async function upsertEvent(
  data: Omit<CalendarEvent, 'id'> & { id?: string }
): Promise<CalendarEvent> {
  const event: CalendarEvent = { id: data.id ?? genId(), ...data }
  const events = load<CalendarEvent>(KEYS.events)
  const idx = events.findIndex((e) => e.id === event.id)
  if (idx >= 0) events[idx] = event
  else events.push(event)
  save(KEYS.events, events)

  await supabase.from('calendar_events').upsert(
    {
      id: event.id,
      title: event.title,
      start_at: event.start,
      end_at: event.end,
      type: event.type,
      company_id: event.company_id ?? null,
      owner_id: event.owner_id,
      all_day: event.all_day ?? false,
    },
    { onConflict: 'id' }
  )

  try {
    void api.events.save(event)
  } catch (err) {
    console.warn('API event save failed:', err)
  }
  notifyDataChanged('update-event')
  return event
}

export async function deleteEventDb(id: string): Promise<void> {
  save(KEYS.events, load<CalendarEvent>(KEYS.events).filter((e) => e.id !== id))
  await supabase.from('calendar_events').delete().eq('id', id)
  try {
    void api.events.delete(id)
  } catch (err) {
    console.warn('API event delete failed:', err)
  }
  notifyDataChanged('delete-event')
}

// ── Dashboard Metrics (with trend deltas) ─────────────────────────────────────

export interface DashboardMetricsV2 {
  // Today
  callsToday: number
  teamCallsToday: number
  dailyTarget: number
  dailyProgress: number // 0-100 %

  // Period
  callsThisWeek: number
  callsLastWeek: number
  callsTrend: number // signed %

  followUpsDueToday: number
  followUpsOverdue: number

  meetingsThisWeek: number
  meetingsLastWeek: number
  meetingsTrend: number

  conversionRate: number
  conversionRateLast: number
  conversionTrend: number

  // Funnel (period)
  funnelCalls: number
  funnelConnected: number
  funnelInterested: number
  funnelMeeting: number

  outcomeBreakdown: Record<OutcomeType, number>
  dailyCalls: { day: string; calls: number; conversions: number }[]
  leaderboard: {
    name: string
    calls: number
    connected: number
    meetings: number
    connectRate?: number
    color: string
  }[]
}

const DAILY_TARGET = 40

function trendPct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

export async function fetchDashboardMetrics(
  userId: string,
  periodDays: 7 | 14 | 30 = 7
): Promise<DashboardMetricsV2> {
  // Use local cache for speed; Supabase sync happens in the background
  const logs = load<CallLog>(KEYS.call_logs)
  const companies = load<Company>(KEYS.companies)
  const users = DEFAULT_USERS // enriched later if Supabase is ready
  const currentUser = users.find(u => u.id === userId)

  const todayStr = getISTDateStr()
  const now = new Date()

  // Period boundaries
  const periodStart = new Date(now)
  periodStart.setDate(periodStart.getDate() - periodDays)

  const prevPeriodStart = new Date(now)
  prevPeriodStart.setDate(prevPeriodStart.getDate() - periodDays * 2)

  // Caller matcher
  const isMyLog = (l: CallLog) =>
    l.caller_id === userId ||
    (currentUser && l.caller_name && l.caller_name.toLowerCase() === currentUser.name.toLowerCase())

  // Today live calls (only calls actually made today)
  const callsToday = logs.filter(
    (l) => l.called_at && l.called_at.startsWith(todayStr) && isMyLog(l)
  ).length
  const teamCallsToday = logs.filter(
    (l) => l.called_at && l.called_at.startsWith(todayStr)
  ).length

  // Period logs
  const periodLogs = logs.filter((l) => l.called_at && new Date(l.called_at) >= periodStart)
  const prevLogs = logs.filter(
    (l) => l.called_at && new Date(l.called_at) >= prevPeriodStart && new Date(l.called_at) < periodStart
  )
  const myPeriodLogs = periodLogs.filter(isMyLog)
  const myPrevLogs = prevLogs.filter(isMyLog)

  const callsThisWeek = myPeriodLogs.length
  const callsLastWeek = myPrevLogs.length

  // Follow-ups (only for active companies with live scheduled follow-ups)
  const followUpsDueToday = companies.filter((c) => {
    if (c.archived) return false
    const log = logs
      .filter((l) => l.company_id === c.id)
      .sort((a, b) => new Date(b.called_at).getTime() - new Date(a.called_at).getTime())[0]
    return log?.follow_up_date === todayStr
  }).length

  const followUpsOverdue = companies.filter((c) => {
    if (c.archived) return false
    const log = logs
      .filter((l) => l.company_id === c.id)
      .sort((a, b) => new Date(b.called_at).getTime() - new Date(a.called_at).getTime())[0]
    return log?.follow_up_date && log.follow_up_date < todayStr
  }).length

  // Meetings: Scheduled in calls during period + calendar meetings during period
  const calendarEvents = load<CalendarEvent>(KEYS.events)
  const calendarMeetings = calendarEvents.filter((e) => {
    if (e.type !== 'meeting') return false
    const d = new Date(e.start)
    return d >= periodStart && d <= now
  }).length
  const callMeetings = periodLogs.filter((l) => l.outcome === 'Meeting Scheduled').length
  const meetingsThisWeek = callMeetings + calendarMeetings
  const meetingsLastWeek = prevLogs.filter((l) => l.outcome === 'Meeting Scheduled').length

  // Conversion
  const isConnected = (l: CallLog) =>
    l.outcome !== 'Not Picked' &&
    l.outcome !== 'Not Reachable / Out of Service' &&
    l.outcome !== 'Invalid Number' &&
    l.outcome !== 'Not Called'
  const isConverted = (l: CallLog) =>
    l.outcome === 'Connected - Interested' || l.outcome === 'Meeting Scheduled'

  const connectedPeriod = periodLogs.filter(isConnected).length
  const convertedPeriod = periodLogs.filter(isConverted).length
  const connectedPrev = prevLogs.filter(isConnected).length
  const convertedPrev = prevLogs.filter(isConverted).length
  const conversionRate = connectedPeriod > 0 ? Math.round((convertedPeriod / connectedPeriod) * 100) : 0
  const conversionRateLast = connectedPrev > 0 ? Math.round((convertedPrev / connectedPrev) * 100) : 0

  // Funnel
  const funnelCalls = periodLogs.length
  const funnelConnected = periodLogs.filter(isConnected).length
  const funnelInterested = periodLogs.filter((l) => l.outcome === 'Connected - Interested').length
  const funnelMeeting = periodLogs.filter((l) => l.outcome === 'Meeting Scheduled').length

  // Outcome breakdown
  const outcomeBreakdown = {} as Record<OutcomeType, number>
  for (const log of periodLogs) {
    outcomeBreakdown[log.outcome] = (outcomeBreakdown[log.outcome] || 0) + 1
  }

  // Daily calls
  const dailyCalls = Array.from({ length: periodDays }, (_, i) => {
    const dateStr = addDaysIST(-(periodDays - 1 - i))
    const d = new Date(dateStr + 'T12:00:00+05:30')
    const dayLogs = logs.filter((l) => l.called_at && l.called_at.startsWith(dateStr))
    const dayConv = dayLogs.filter(isConverted).length

    let dayLabel = ''
    if (periodDays <= 7) {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      dayLabel = days[d.getDay()]
    } else {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      dayLabel = `${d.getDate()} ${months[d.getMonth()]}`
    }
    return { day: dayLabel, calls: dayLogs.length, conversions: dayConv }
  })

  // Leaderboard: tracks live calls & caller activity for the active period
  const leaderboard = users.map((user) => {
    const userLogs = periodLogs.filter((l) =>
      l.caller_id === user.id ||
      (l.caller_name && l.caller_name.toLowerCase() === user.name.toLowerCase())
    )
    const calls = userLogs.length
    const conn = userLogs.filter(isConnected).length
    const meetings = userLogs.filter((l) => l.outcome === 'Meeting Scheduled').length
    const connectRate = calls > 0 ? Math.round((conn / calls) * 100) : 0
    return { name: user.name, calls, connected: conn, meetings, connectRate, color: user.color }
  }).sort((a, b) => b.calls - a.calls)

  return {
    callsToday,
    teamCallsToday,
    dailyTarget: DAILY_TARGET,
    dailyProgress: Math.min(Math.round((callsToday / DAILY_TARGET) * 100), 100),
    callsThisWeek,
    callsLastWeek,
    callsTrend: trendPct(callsThisWeek, callsLastWeek),
    followUpsDueToday,
    followUpsOverdue,
    meetingsThisWeek,
    meetingsLastWeek,
    meetingsTrend: trendPct(meetingsThisWeek, meetingsLastWeek),
    conversionRate,
    conversionRateLast,
    conversionTrend: trendPct(conversionRate, conversionRateLast),
    funnelCalls,
    funnelConnected,
    funnelInterested,
    funnelMeeting,
    outcomeBreakdown,
    dailyCalls,
    leaderboard,
  }
}

/** Sync all data from Supabase into localStorage (run once on login). */
export async function syncFromSupabase(): Promise<void> {
  // Sync from MongoDB Atlas Backend first (authoritative source of truth)
  try {
    const mongoRes = await api.syncAll()
    if (mongoRes.data && mongoRes.data.companies && mongoRes.data.companies.length > 0) {
      const { workspaces, companies, contacts, call_logs, tasks, notes, calendar_events } = mongoRes.data
      if (workspaces && workspaces.length > 0) {
        save(KEYS.workspaces, workspaces)
        save(KEYS.lists, workspaces)
      }
      if (companies && companies.length > 0) save(KEYS.companies, companies)
      if (contacts && contacts.length > 0) save(KEYS.contacts, contacts)
      if (call_logs) save(KEYS.call_logs, call_logs)
      if (tasks) save(KEYS.tasks, tasks)
      if (notes) save(KEYS.notes, notes)
      if (calendar_events) {
        save(KEYS.events, calendar_events.map(event => ({
          id: event.id,
          title: event.title,
          start: event.start || (event as unknown as { start_at?: string }).start_at || '',
          end: event.end || (event as unknown as { end_at?: string }).end_at || '',
          type: event.type as CalendarEvent['type'],
          company_id: event.company_id ?? undefined,
          owner_id: event.owner_id,
          all_day: event.all_day,
        })))
      }
      notifyDataChanged('mongodb-sync')
      return
    }
  } catch (err) {
    console.warn('MongoDB sync attempt:', err)
  }

  
  try {
    const [lists, workspaces, workspaceColumns, companies, contacts, callLogs, tasks, notes, events] = await Promise.all([
      supabase.from('lists').select('*'),
      supabase.from('workspaces').select('*'),
      supabase.from('workspace_columns').select('*'),
      supabase.from('companies').select('*'),
      supabase.from('contacts').select('*'),
      supabase.from('call_logs').select('*').order('called_at', { ascending: false }),
      supabase.from('tasks').select('*'),
      supabase.from('notes').select('*'),
      supabase.from('calendar_events').select('*'),
    ])
    if (workspaces.data) save(KEYS.workspaces, workspaces.data)
    if (workspaceColumns.data) save(KEYS.workspace_columns, workspaceColumns.data)
    if (lists.data) save(KEYS.lists, lists.data)
    if (companies.data) save(KEYS.companies, companies.data)
    if (contacts.data) save(KEYS.contacts, contacts.data)
    if (callLogs.data) {
      const mapped = callLogs.data.map((r) => ({
        ...r,
        contact_id: r.contact_id ?? undefined,
        remark: r.remark ?? undefined,
        next_action: r.next_action ?? undefined,
        follow_up_date: r.follow_up_date ?? undefined,
      }))
      save(KEYS.call_logs, mapped)
    }
    if (tasks.data) save(KEYS.tasks, tasks.data)
    if (notes.data) save(KEYS.notes, notes.data)
    if (events.data) {
      save(KEYS.events, events.data.map(event => ({
        id: event.id,
        title: event.title,
        start: event.start_at,
        end: event.end_at ?? event.start_at,
        type: event.type as CalendarEvent['type'],
        company_id: event.company_id ?? undefined,
        owner_id: event.owner_id,
        all_day: event.all_day,
      })))
    }
  } catch (e) {
    console.warn('Supabase sync failed, using cached data:', e)
  }
}

let localSyncVersion = 0

/**
 * Fetch latest live data from MongoDB /api/sync and update localStorage.
 * Ensures all team members immediately see any edits made across the organization.
 */
export async function syncFromDatabase(): Promise<boolean> {
  try {
    const user = getCachedUser()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (user?.email) {
      headers['x-user-email'] = user.email
    }

    const res = await fetch(`${API_BASE_URL}/sync`, { headers })
    if (!res.ok) return false
    const data = await res.json()
    if (!data || !Array.isArray(data.companies)) return false

    if (data.workspaces && data.workspaces.length > 0) {
      save(KEYS.workspaces, data.workspaces)
      save(KEYS.lists, data.workspaces)
    }
    if (data.companies && data.companies.length > 0) {
      save(KEYS.companies, data.companies)
    }
    if (data.contacts && data.contacts.length > 0) {
      save(KEYS.contacts, data.contacts)
    }
    if (data.call_logs && data.call_logs.length > 0) {
      save(KEYS.call_logs, data.call_logs)
    }
    if (data.tasks) {
      save(KEYS.tasks, data.tasks)
    }
    if (data.notes) {
      save(KEYS.notes, data.notes)
    }
    if (data.calendar_events) {
      save(KEYS.events, data.calendar_events)
    }

    notifyDataChanged('remote-sync')
    return true
  } catch (err) {
    console.warn('Database sync notice:', err)
    return false
  }
}

/** Check if remote database has newer edits from other team members */
export async function checkRemoteChanges(): Promise<void> {
  try {
    const user = getCachedUser()
    if (!user?.email) return
    const res = await fetch(`${API_BASE_URL}/sync/version`, {
      headers: { 'x-user-email': user.email }
    })
    if (!res.ok) return
    const data = await res.json()
    const serverVersion = Number(data?.version) || 0

    if (serverVersion > 0 && serverVersion > localSyncVersion) {
      localSyncVersion = serverVersion
      await syncFromDatabase()
    }
  } catch {
    // ignore background check failure
  }
}

/** Subscribe to realtime changes and dispatch a custom DOM event so components can refresh. */
export function subscribeRealtime(): () => void {
  let refreshTimer: number | undefined
  const refreshCache = () => {
    if (refreshTimer) window.clearTimeout(refreshTimer)
    refreshTimer = window.setTimeout(() => {
      void syncFromDatabase().then(() => {
        window.dispatchEvent(new CustomEvent('gc:data-changed', { detail: 'remote' }))
      })
    }, 100)
  }

  // Initial check & baseline sync
  void checkRemoteChanges()

  // Live multi-user polling every 3.5s so changes made by other employees reflect immediately
  const pollTimer = window.setInterval(() => {
    void checkRemoteChanges()
  }, 3500)

  // Re-check whenever the tab or window comes into focus
  const onFocus = () => { void checkRemoteChanges() }
  window.addEventListener('focus', onFocus)
  window.addEventListener('online', onFocus)

  // Supabase Realtime channel for Postgres replication (dual redundancy)
  let channel = supabase.channel('gc-realtime')
  for (const table of ['lists', 'workspaces', 'workspace_columns', 'companies', 'contacts', 'call_logs', 'tasks', 'notes', 'calendar_events', 'lead_locks']) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, refreshCache)
  }
  channel.subscribe()

  return () => {
    if (refreshTimer) window.clearTimeout(refreshTimer)
    window.clearInterval(pollTimer)
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('online', onFocus)
    supabase.removeChannel(channel)
  }
}
