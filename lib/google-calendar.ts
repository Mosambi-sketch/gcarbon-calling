/**
 * lib/google-calendar.ts — Full Google Calendar API integration
 *
 * Uses Google Identity Services (OAuth2) to:
 * 1. Authorize Google Calendar access
 * 2. Fetch/sync events from Google Calendar directly into Gcarbon
 * 3. Create Google Calendar events with Google Meet links when scheduling meetings/calls
 * 4. Persist OAuth token across page reloads
 * 5. Allow entering Google Client ID dynamically from the UI or .env.local
 */

import { addEvent, getEvents, updateEvent } from './store'
import type { CalendarEvent } from './types'

const SCOPES = 'https://www.googleapis.com/auth/calendar.events'

// Keys
const TOKEN_KEY = 'gc_gcal_token'
const EXPIRY_KEY = 'gc_gcal_expiry'
const CLIENT_ID_KEY = 'gc_google_client_id'

export function getGoogleClientId(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem(CLIENT_ID_KEY)
    if (custom && custom.trim() && custom !== 'placeholder-google-client-id') {
      return custom.trim()
    }
  }
  const envId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  if (envId && envId !== 'placeholder-google-client-id') {
    return envId.trim()
  }
  return ''
}

export function setGoogleClientId(clientId: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(CLIENT_ID_KEY, clientId.trim())
  }
}

export function isGoogleCalendarAvailable(): boolean {
  return Boolean(getGoogleClientId())
}

function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  const token = localStorage.getItem(TOKEN_KEY)
  const expiry = Number(localStorage.getItem(EXPIRY_KEY) || '0')
  if (token && Date.now() < expiry) {
    return token
  }
  return null
}

export function isGoogleCalendarConnected(): boolean {
  return Boolean(getStoredAccessToken())
}

/** Load the Google Identity Services script if not already loaded */
export function loadGIS(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Window not available'))
      return
    }
    if ((window as any).google?.accounts?.oauth2) {
      resolve()
      return
    }
    const existing = document.getElementById('gis-script')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', reject)
      return
    }
    const script = document.createElement('script')
    script.id = 'gis-script'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = reject
    document.head.appendChild(script)
  })
}

/** Prompt the user to sign in with Google and authorize calendar access */
export async function connectGoogleCalendar(): Promise<{ error: string | null }> {
  const clientId = getGoogleClientId()
  if (!clientId) {
    return { error: 'Please enter a valid Google OAuth Client ID in Calendar settings or .env.local.' }
  }

  try {
    await loadGIS()
    return new Promise((resolve) => {
      const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.error) {
            resolve({ error: response.error_description || response.error })
            return
          }
          const token = response.access_token
          const expiry = Date.now() + (Number(response.expires_in) - 60) * 1000
          localStorage.setItem(TOKEN_KEY, token)
          localStorage.setItem(EXPIRY_KEY, String(expiry))
          resolve({ error: null })
        },
      })
      tokenClient.requestAccessToken({ prompt: '' })
    })
  } catch {
    return { error: 'Failed to load Google Sign-In. Check your internet connection.' }
  }
}

export interface GoogleCalendarItem {
  id: string
  summary?: string
  description?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  hangoutLink?: string
  htmlLink?: string
  status?: string
}

/** Fetch events from primary Google Calendar within a date range */
export async function fetchGoogleCalendarEvents(
  timeMinISO?: string,
  timeMaxISO?: string
): Promise<{ events: GoogleCalendarItem[]; error: string | null }> {
  const token = getStoredAccessToken()
  if (!token) {
    return { events: [], error: 'Not connected to Google Calendar' }
  }

  const now = new Date()
  const min = timeMinISO || new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const max = timeMaxISO || new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString()

  try {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('timeMin', min)
    url.searchParams.set('timeMax', max)

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      if (res.status === 401) {
        disconnectGoogleCalendar()
        return { events: [], error: 'Google Calendar session expired. Please reconnect.' }
      }
      const errData = await res.json().catch(() => ({}))
      return { events: [], error: errData?.error?.message || `API error (${res.status})` }
    }

    const data = await res.json()
    const items: GoogleCalendarItem[] = data.items || []
    return { events: items, error: null }
  } catch (err: unknown) {
    return { events: [], error: err instanceof Error ? err.message : 'Network error' }
  }
}

/** Synchronize Google Calendar events into local Gcarbon Calendar */
export async function syncGoogleCalendar(
  ownerId: string,
  timeMinISO?: string,
  timeMaxISO?: string
): Promise<{ importedCount: number; error: string | null }> {
  const { events: gcalItems, error } = await fetchGoogleCalendarEvents(timeMinISO, timeMaxISO)
  if (error) {
    return { importedCount: 0, error }
  }

  const currentEvents = getEvents()
  let importedCount = 0

  for (const item of gcalItems) {
    if (!item.id || item.status === 'cancelled') continue

    const start = item.start?.dateTime || (item.start?.date ? `${item.start.date}T00:00:00` : '')
    const end = item.end?.dateTime || (item.end?.date ? `${item.end.date}T23:59:59` : start)
    if (!start) continue

    const isAllDay = Boolean(item.start?.date && !item.start?.dateTime)
    const existing = currentEvents.find(e => e.gcal_id === item.id)

    if (existing) {
      updateEvent(existing.id, {
        title: item.summary || 'Google Calendar Event',
        start,
        end,
        meet_link: item.hangoutLink || existing.meet_link,
        gcal_html_link: item.htmlLink,
        all_day: isAllDay,
      })
    } else {
      addEvent({
        title: item.summary || 'Google Calendar Event',
        start,
        end,
        type: 'meeting',
        owner_id: ownerId,
        meet_link: item.hangoutLink,
        all_day: isAllDay,
        gcal_id: item.id,
        gcal_html_link: item.htmlLink,
      })
      importedCount++
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gc:data-changed'))
  }

  return { importedCount, error: null }
}

export interface CreateEventOptions {
  title: string
  description?: string
  startISO: string // e.g. "2024-12-15T10:00:00"
  endISO: string // e.g. "2024-12-15T11:00:00"
  attendeeEmails?: string[]
  timeZone?: string
  createMeet?: boolean
}

export interface CreatedEvent {
  id: string
  htmlLink: string
  hangoutLink?: string
}

/** Create a Google Calendar event with optional Google Meet video link */
export async function createGoogleCalendarEvent(
  opts: CreateEventOptions
): Promise<{ event: CreatedEvent | null; error: string | null }> {
  let token = getStoredAccessToken()
  if (!token) {
    const { error } = await connectGoogleCalendar()
    if (error) return { event: null, error }
    token = getStoredAccessToken()
    if (!token) return { event: null, error: 'Google Calendar authentication failed' }
  }

  const timeZone = opts.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone

  const body: any = {
    summary: opts.title,
    description: opts.description || '',
    start: { dateTime: opts.startISO, timeZone },
    end: { dateTime: opts.endISO, timeZone },
    attendees: (opts.attendeeEmails || []).map(email => ({ email })),
  }

  if (opts.createMeet !== false) {
    body.conferenceData = {
      createRequest: {
        requestId: `gcarbon-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    }
  }

  try {
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    )

    if (!res.ok) {
      if (res.status === 401) {
        disconnectGoogleCalendar()
        return { event: null, error: 'Session expired. Please reconnect Google Calendar.' }
      }
      const err = await res.json().catch(() => ({}))
      return { event: null, error: err?.error?.message || `API error (${res.status})` }
    }

    const data = await res.json()
    return {
      event: {
        id: data.id,
        htmlLink: data.htmlLink,
        hangoutLink: data.hangoutLink,
      },
      error: null,
    }
  } catch {
    return { event: null, error: 'Network error. Check your connection.' }
  }
}

/** Disconnect Google Calendar */
export function disconnectGoogleCalendar(): void {
  const token = getStoredAccessToken()
  if (token && typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2) {
    try {
      (window as any).google.accounts.oauth2.revoke(token, () => {})
    } catch {
      // ignore
    }
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRY_KEY)
  }
}
