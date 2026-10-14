import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import type { AppUser } from '@/lib/store'
import { subscribeRealtime, syncFromSupabase, syncFromDatabase } from '@/lib/db'
import { API_BASE_URL } from '@/lib/api'
import { isSupabaseReady } from '@/lib/supabase'
import Sidebar from './Sidebar'
import DashboardPage from './pages/DashboardPage'
import CallingSheetPage from './pages/CallingSheetPage'
import TasksPage from './pages/TasksPage'
import CalendarPage from './pages/CalendarPage'
import NotesPage from './pages/NotesPage'
import SettingsPage from './pages/SettingsPage'

export type NavPage = 'dashboard' | 'calling' | 'tasks' | 'calendar' | 'notes' | 'settings'

interface AppShellProps {
  user: AppUser
  onLogout: () => void
}

export default function AppShell({ user, onLogout }: AppShellProps) {
  const [page, setPage] = useState<NavPage>('calling')
  // Instant load: if we already have cached companies, render immediately with 0 delay
  const [workspaceReady, setWorkspaceReady] = useState(() => {
    try {
      const companies = JSON.parse(localStorage.getItem('gc_companies') || '[]')
      return Array.isArray(companies) && companies.length > 0
    } catch {
      return false
    }
  })

  useEffect(() => {
    let cancelled = false
    const safety = setTimeout(() => {
      if (!cancelled) setWorkspaceReady(true)
    }, 1200)

    async function initData() {
      try {
        await Promise.allSettled([syncFromDatabase(), syncFromSupabase()])
      } catch (error) {
        console.error("Workspace sync completed with notice:", error)
      } finally {
        if (!cancelled) setWorkspaceReady(true)
        clearTimeout(safety)
      }
    }
    void initData()
    return () => {
      cancelled = true
      clearTimeout(safety)
    }
  }, [])

  useEffect(() => subscribeRealtime(), [])


  // Re-render when data changed or mutation error occurs
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    const handler = () => forceUpdate(n => n + 1)
    const errHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.error) {
        const isConflict = String(detail.error).toLowerCase().includes('conflict')
        if (isConflict) {
          toast('Record updated concurrently by another teammate.', {
            icon: '⚠️',
            id: `mut-${detail.action}`,
            duration: 3500,
          })
        } else {
          console.warn(`[CRM Sync Warning] ${detail.action}:`, detail.error)
        }
      }
    }
    window.addEventListener('gc:data-changed', handler)
    window.addEventListener('gc:mutation-error', errHandler)
    return () => {
      window.removeEventListener('gc:data-changed', handler)
      window.removeEventListener('gc:mutation-error', errHandler)
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true'
      
      if (e.key === '/' && !isInput) {
        e.preventDefault()
        setPage('calling')
        setTimeout(() => {
          const searchInput = document.querySelector<HTMLInputElement>('#calling-search')
          searchInput?.focus()
        }, 100)
      }
      if (e.key === 'N' && !isInput && !e.metaKey && !e.ctrlKey) {
        setPage('calling')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const [mongoStatus, setMongoStatus] = useState<{ connected: boolean; uriConfigured: boolean } | null>(null)

  useEffect(() => {
    const checkHealth = () => {
      fetch(`${API_BASE_URL}/health`)
        .then(res => res.json())
        .then(data => {
          if (data?.mongodb) {
            setMongoStatus({
              connected: Boolean(data.mongodb.connected),
              uriConfigured: Boolean(data.mongodb.uriConfigured),
            })
          }
        })
        .catch(() => {
          setMongoStatus({ connected: false, uriConfigured: false })
        })
    }
    checkHealth()
    const timer = setInterval(checkHealth, 15000)
    return () => clearInterval(timer)
  }, [])

  const handleLogout = useCallback(() => {
    // signOut is handled in App.tsx / db.ts
    onLogout()
  }, [onLogout])

  if (!workspaceReady) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#09090B',
        color: '#FFFFFF',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        gap: 16,
      }}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: '#18181B',
          border: '1px solid #27272A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#D9F56B',
          fontWeight: 800,
          fontSize: 20,
          boxShadow: '0 8px 24px rgba(217, 245, 107, 0.15)',
        }}>
          GC
        </div>
        <div className="spinner" style={{ width: 28, height: 28, borderTopColor: '#D9F56B' }} />
        <div style={{ fontSize: 13, color: '#A1A1AA', fontWeight: 500 }}>
          Synchronizing Calling Workspace...
        </div>
      </div>
    )
  }

  return (
    <div className="app-layout">
      <Sidebar
        user={user}
        activePage={page}
        onNavigate={setPage}
        onLogout={handleLogout}
        isAdmin={user.role === 'admin'}
      />
      <main className="main-content">
        <div className="content-canvas">
          {page === 'dashboard' && <DashboardPage user={user} onNavigate={setPage} />}
          {page === 'calling' && <CallingSheetPage user={user} />}
          {page === 'tasks' && <TasksPage user={user} />}
          {page === 'calendar' && <CalendarPage user={user} />}
          {page === 'notes' && <NotesPage user={user} />}
          {page === 'settings' && <SettingsPage user={user} />}
        </div>
      </main>
    </div>
  )
}
