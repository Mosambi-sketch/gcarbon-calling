'use client'
import { useState, useEffect, useCallback } from 'react'
import type { AppUser } from '@/lib/store'
import { setCurrentUser, isSeeded, markSeeded, DEFAULT_USERS, getLists } from '@/lib/store'
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
  const [page, setPage] = useState<NavPage>('dashboard')
  const [seedReady, setSeedReady] = useState(false)
  const [seeding, setSeeding] = useState(false)

  // Auto-seed on first load
  useEffect(() => {
    if (!isSeeded()) {
      setSeeding(true)
      // Load seed data from the API
      fetch('/api/seed').then(r => r.json()).then(data => {
        if (data.ok && data.data) {
          // Write seed data to localStorage
          const seed = data.data
          localStorage.setItem('gc_companies', JSON.stringify(seed.companies || []))
          localStorage.setItem('gc_contacts', JSON.stringify(seed.contacts || []))
          localStorage.setItem('gc_call_logs', JSON.stringify(seed.call_logs || []))
          localStorage.setItem('gc_tasks', JSON.stringify(seed.tasks || []))
          localStorage.setItem('gc_notes', JSON.stringify(seed.notes || []))
          localStorage.setItem('gc_events', JSON.stringify(seed.events || []))
        }
        markSeeded()
        setSeedReady(true)
        setSeeding(false)
      }).catch(() => {
        markSeeded()
        setSeedReady(true)
        setSeeding(false)
      })
    } else {
      setSeedReady(true)
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

  const handleLogout = useCallback(() => {
    setCurrentUser(null)
    onLogout()
  }, [onLogout])

  if (seeding) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#EFEFEF', gap: 16,
      }}>
        <div style={{
          width: 52, height: 52,
          background: '#0B0B0B',
          borderRadius: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#D9F56B',
          fontWeight: 800,
          fontSize: 20,
        }}>GC</div>
        <div className="spinner" style={{ width: 28, height: 28 }} />
        <div style={{ fontSize: 13, color: '#888' }}>Loading your data...</div>
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
