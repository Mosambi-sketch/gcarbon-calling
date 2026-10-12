import { useEffect, useState, useCallback } from 'react'
import { getCachedUser, signOut } from '@/lib/db'
import { supabase, isSupabaseReady } from '@/lib/supabase'
import LoginPage from '@/components/LoginPage'
import AppShell from '@/components/AppShell'
import type { AppUser } from '@/lib/store'
import { getAvatar } from '@/lib/types'
import { Toaster } from 'react-hot-toast'
import ErrorBoundary from '@/components/ErrorBoundary'

// Apply saved theme immediately to prevent flash
const savedTheme = typeof window !== 'undefined' ? localStorage.getItem('gc_theme') : null
if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Initialise auth — Supabase session or localStorage fallback
  useEffect(() => {
    async function init() {
      if (isSupabaseReady) {
        // Check for existing Supabase session
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const cached = getCachedUser()
          if (cached) {
            setUser(cached)
          } else {
            // Rebuild profile from Supabase
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single()
            if (profile) {
              const appUser: AppUser = {
                id: session.user.id,
                email: session.user.email ?? '',
                name: profile.name,
                role: profile.role as 'admin' | 'caller',
                color: profile.color,
                password: '',
                avatar: profile.avatar ?? getAvatar(profile.name) ?? undefined,
              }
              localStorage.setItem('gc_current_user', JSON.stringify(appUser))
              setUser(appUser)
            }
          }
        }

        // Listen for auth state changes (sign-in / sign-out from other tabs)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_OUT' || !session) {
            setUser(null)
          } else if (event === 'SIGNED_IN' && session) {
            const cached = getCachedUser()
            if (cached) setUser(cached)
          }
        })
        setLoading(false)
        return () => subscription.unsubscribe()
      } else {
        // Local-only mode: read from localStorage
        const cached = getCachedUser()
        setUser(cached)
        setLoading(false)
      }
    }

    init()
  }, [])

  const handleLogin = useCallback((u: AppUser) => setUser(u), [])

  const handleLogout = useCallback(async () => {
    await signOut()
    setUser(null)
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#EFEFEF' }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#0B0B0B',
            color: '#FFFFFF',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 500,
            boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
          }
        }}
      />
      {!user
        ? <LoginPage onLogin={handleLogin} />
        : <AppShell user={user} onLogout={handleLogout} />
      }
    </ErrorBoundary>
  )
}
