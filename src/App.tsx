import { useEffect, useState, useCallback } from 'react'
import { getCachedUser, signOut } from '@/lib/db'
import { supabase, isSupabaseReady } from '@/lib/supabase'
import LoginPage from '@/components/LoginPage'
import AppShell from '@/components/AppShell'
import type { AppUser } from '@/lib/store'
import { getAvatar } from '@/lib/types'
import { Toaster, toast } from 'react-hot-toast'
import ErrorBoundary from '@/components/ErrorBoundary'

// Apply saved theme immediately to prevent flash
const savedTheme = typeof window !== 'undefined' ? localStorage.getItem('gc_theme') : null
if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string>('')

  // Initialise auth — Supabase session with timeout & robust fallback
  useEffect(() => {
    let unmounted = false

    // Safety timeout: never leave screen blank for > 3.5 seconds
    const safetyTimer = setTimeout(() => {
      if (!unmounted) setLoading(false)
    }, 3500)

    async function handleAuthSession(sessionUser: any) {
      if (!sessionUser) return null
      const email = (sessionUser.email ?? '').toLowerCase()

      // Check cached user first
      const cached = getCachedUser()
      if (cached && cached.email.toLowerCase() === email) {
        return cached
      }

      // Try fetching profile from Supabase
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', sessionUser.id)
          .maybeSingle()

        if (profile) {
          const appUser: AppUser = {
            id: sessionUser.id,
            email,
            name: profile.name,
            role: (profile.role as 'admin' | 'caller') ?? 'caller',
            color: profile.color ?? '#E8E8E8',
            password: '',
            avatar: profile.avatar ?? getAvatar(profile.name) ?? undefined,
          }
          localStorage.setItem('gc_current_user', JSON.stringify(appUser))
          return appUser
        }
      } catch (err) {
        console.warn('Could not load profile from Supabase, creating fallback:', err)
      }

      // Fallback: build app user from metadata
      const name = sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name || email.split('@')[0]
      const fallbackUser: AppUser = {
        id: sessionUser.id,
        email,
        name,
        role: email.includes('aadarsh') ? 'admin' : 'caller',
        color: '#A7F3D0',
        password: '',
        avatar: sessionUser.user_metadata?.avatar_url ?? getAvatar(name) ?? undefined,
      }
      localStorage.setItem('gc_current_user', JSON.stringify(fallbackUser))
      return fallbackUser
    }

    async function init() {
      // Check for OAuth hash errors (e.g. #error_description=...)
      if (typeof window !== 'undefined' && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.slice(1))
        const errorDesc = hashParams.get('error_description') || hashParams.get('error')
        if (errorDesc) {
          console.error('OAuth error returned from provider:', errorDesc)
          setAuthError(decodeURIComponent(errorDesc.replace(/\+/g, ' ')))
          window.history.replaceState(null, '', window.location.pathname)
        }
      }

      if (!isSupabaseReady) {
        // Local mode fallback
        const cached = getCachedUser()
        if (cached) setUser(cached)
        setLoading(false)
        clearTimeout(safetyTimer)
        return
      }

      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) {
          console.warn('Supabase getSession error:', error)
        } else if (data?.session?.user) {
          const appUser = await handleAuthSession(data.session.user)
          if (appUser && !unmounted) setUser(appUser)
        }
      } catch (e) {
        console.warn('Error checking Supabase session:', e)
        const cached = getCachedUser()
        if (cached && !unmounted) setUser(cached)
      } finally {
        if (!unmounted) setLoading(false)
        clearTimeout(safetyTimer)
      }

      // Listen for auth state changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (unmounted) return
        if (event === 'SIGNED_OUT' || !session) {
          localStorage.removeItem('gc_current_user')
          setUser(null)
        } else if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          const appUser = await handleAuthSession(session.user)
          if (appUser && !unmounted) setUser(appUser)
        }
      })

      return () => {
        subscription.unsubscribe()
      }
    }

    init()

    return () => {
      unmounted = true
      clearTimeout(safetyTimer)
    }
  }, [])

  const handleLogin = useCallback((u: AppUser) => setUser(u), [])

  const handleLogout = useCallback(async () => {
    await signOut()
    setUser(null)
  }, [])

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0B0B0B',
        color: '#FFFFFF',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        gap: 16
      }}>
        <div className="spinner" style={{ width: 36, height: 36, borderTopColor: '#22C55E', borderColor: 'rgba(255,255,255,0.2)' }} />
        <div style={{ fontSize: 14, fontWeight: 500, color: '#A3A3A3' }}>Loading Gcarbon Calling...</div>
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
        ? <LoginPage onLogin={handleLogin} authError={authError} />
        : <AppShell user={user} onLogout={handleLogout} />
      }
    </ErrorBoundary>
  )
}
