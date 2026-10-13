import { useState, useEffect, useCallback } from 'react'
import type { AppUser } from '@/lib/store'
import { subscribeRealtime, syncFromSupabase } from '@/lib/db'
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
    async function initData() {
      try {
        await syncFromSupabase()
      } catch (error) {
        console.error("Workspace sync completed with notice:", error)
      } finally {
        if (!cancelled) setWorkspaceReady(true)
      }
    }
    void initData()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => subscribeRealtime(), [])


  // Re-render when Supabase realtime fires
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    const handler = () => forceUpdate(n => n + 1)
    window.addEventListener('gc:data-changed', handler)
    return () => window.removeEventListener('gc:data-changed', handler)
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
      fetch('/api/health')
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#EFEFEF' }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
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
