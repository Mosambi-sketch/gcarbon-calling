/**
 * lib/presence.ts — Supabase Realtime Presence
 *
 * Tracks which user is currently viewing a workspace, editing a row,
 * or actively on a call with a lead.
 *
 * Falls back gracefully when Supabase is not configured (local mode).
 */

import { useState, useEffect, useRef } from 'react'
import { supabase, isSupabaseReady } from './supabase'
import type { AppUser } from './store'
import { getAvatar } from './types'

export type PresenceActivity = 'viewing' | 'editing' | 'calling'

export interface PresenceState {
  user_id: string
  user_name: string
  user_color: string
  user_avatar?: string
  workspace_id?: string
  company_id?: string
  company_name?: string
  activity: PresenceActivity
  last_active: string
}

/** Map from company_id → who is calling it (excluding current user) */
export type PresenceMap = Map<string, { userName: string; userColor: string }>

let globalPresenceChannel: ReturnType<typeof supabase.channel> | null = null
let currentCallingPresence: PresenceState | null = null

/** Broadcast that the current user started calling a company */
export function startCalling(
  companyId: string,
  companyName: string,
  user: AppUser,
  workspaceId?: string
): void {
  if (!isSupabaseReady || !globalPresenceChannel) return
  currentCallingPresence = {
    user_id: user.id,
    user_name: user.name,
    user_color: user.color,
    user_avatar: user.avatar,
    workspace_id: workspaceId,
    company_id: companyId,
    company_name: companyName,
    activity: 'calling',
    last_active: new Date().toISOString(),
  }
  globalPresenceChannel.track(currentCallingPresence).catch(() => {})
}

/** Stop broadcasting calling presence */
export function stopCalling(): void {
  if (!isSupabaseReady || !globalPresenceChannel) return
  currentCallingPresence = null
  globalPresenceChannel.untrack().catch(() => {})
}

/** React hook — returns a PresenceMap of OTHER users currently calling */
export function usePresence(currentUserId: string): PresenceMap {
  const [presenceMap, setPresenceMap] = useState<PresenceMap>(new Map())

  useEffect(() => {
    if (!isSupabaseReady) return

    const ch = supabase.channel('calling-presence', {
      config: { presence: { key: currentUserId } },
    })

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<PresenceState>()
      const map = new Map<string, { userName: string; userColor: string }>()
      for (const [userId, presences] of Object.entries(state)) {
        if (userId === currentUserId) continue
        const p = presences[0]
        if (p && p.company_id && p.activity === 'calling') {
          map.set(p.company_id, {
            userName: p.user_name,
            userColor: p.user_color,
          })
        }
      }
      setPresenceMap(map)
    })

    ch.subscribe()
    globalPresenceChannel = ch

    return () => {
      ch.unsubscribe()
      globalPresenceChannel = null
    }
  }, [currentUserId])

  return presenceMap
}

export interface WorkspaceCollaborator {
  userId: string
  userName: string
  userColor: string
  userAvatar?: string
  activity: PresenceActivity
  companyId?: string
  companyName?: string
}

/** React hook — tracks who is viewing or editing in a specific workspace */
export function useWorkspacePresence(
  workspaceId: string | null | undefined,
  currentUser: AppUser
): {
  collaborators: WorkspaceCollaborator[]
  broadcastEditing: (companyId: string, companyName: string) => void
  clearEditing: () => void
} {
  const [collaborators, setCollaborators] = useState<WorkspaceCollaborator[]>([])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!isSupabaseReady || !workspaceId) {
      setCollaborators([])
      return
    }

    const ch = supabase.channel(`ws-presence-${workspaceId}`, {
      config: { presence: { key: currentUser.id } },
    })

    channelRef.current = ch

    const initialPresence: PresenceState = {
      user_id: currentUser.id,
      user_name: currentUser.name,
      user_color: currentUser.color,
      user_avatar: currentUser.avatar || getAvatar(currentUser.name),
      workspace_id: workspaceId,
      activity: 'viewing',
      last_active: new Date().toISOString(),
    }

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<PresenceState>()
      const list: WorkspaceCollaborator[] = []

      for (const [userId, presences] of Object.entries(state)) {
        if (userId === currentUser.id) continue
        const p = presences[0]
        if (p) {
          list.push({
            userId: p.user_id,
            userName: p.user_name,
            userColor: p.user_color,
            userAvatar: p.user_avatar,
            activity: p.activity || 'viewing',
            companyId: p.company_id,
            companyName: p.company_name,
          })
        }
      }
      setCollaborators(list)
    })

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track(initialPresence)
      }
    })

    return () => {
      ch.unsubscribe()
      channelRef.current = null
    }
  }, [workspaceId, currentUser.id, currentUser.name, currentUser.color, currentUser.avatar])

  const broadcastEditing = (companyId: string, companyName: string) => {
    if (!channelRef.current) return
    channelRef.current.track({
      user_id: currentUser.id,
      user_name: currentUser.name,
      user_color: currentUser.color,
      user_avatar: currentUser.avatar || getAvatar(currentUser.name),
      workspace_id: workspaceId || '',
      company_id: companyId,
      company_name: companyName,
      activity: 'editing',
      last_active: new Date().toISOString(),
    }).catch(() => {})
  }

  const clearEditing = () => {
    if (!channelRef.current) return
    channelRef.current.track({
      user_id: currentUser.id,
      user_name: currentUser.name,
      user_color: currentUser.color,
      user_avatar: currentUser.avatar || getAvatar(currentUser.name),
      workspace_id: workspaceId || '',
      activity: 'viewing',
      last_active: new Date().toISOString(),
    }).catch(() => {})
  }

  return { collaborators, broadcastEditing, clearEditing }
}
