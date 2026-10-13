import { useEffect, useState, useCallback } from 'react'
import { getCachedUser, signOut } from '@/lib/db'
import { supabase, isSupabaseReady } from '@/lib/supabase'
import LoginPage from '@/components/LoginPage'
import AppShell from '@/components/AppShell'
import type { AppUser } from '@/lib/store'
import { DEFAULT_USERS, DEMO_USERS, normalizeEmail, isAuthorizedEmployee } from '@/lib/store'
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
      const email = (sessionUser.email ?? '').toLowerCase().trim()
      const normEmail = normalizeEmail(email)

      if (!isAuthorizedEmployee(normEmail)) {
        console.warn('Unauthorized login attempt:', email)
        try {
          await supabase.auth.signOut()
        } catch {}
        localStorage.removeItem('gc_current_user')
        setAuthError(`Access denied: "${email}" is not an authorized company employee. Only team members approved by Admin (Aadarsh) can access the CRM.`)
        return null
      }

      // Match known team member roster
      const allKnown = [...DEFAULT_USERS, ...DEMO_USERS]
      const known = allKnown.find(u => {
        const ue = normalizeEmail(u.email)
        return ue === normEmail ||
          ue.replace('@gmail.com', '@gcarbon.in') === normEmail ||
          ue.replace('@gcarbon.in', '@gmail.com') === normEmail ||
          (normEmail.endsWith('@gcarbon.in') && ue.split('@')[0].replace('.gcarbon', '').replace('114', '') === normEmail.split('@')[0])
      })

      // Check cached user first
      const cached = getCachedUser()
      if (cached && normalizeEmail(cached.email) === normEmail) {
        if (known && (!cached.avatar || cached.role !== known.role)) {
          cached.role = known.role
          cached.avatar = known.avatar || cached.avatar
          localStorage.setItem('gc_current_user', JSON.stringify(cached))
        }
        return cached
      }

      // Try fetching profile from Supabase
      let profile: any = null
      try {
        const { data: profileById } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', sessionUser.id)
          .maybeSingle()
        if (profileById) profile = profileById
        else {
          const { data: profileByEmail } = await supabase
            .from('profiles')
            .select('*')
            .ilike('email', normEmail)
            .maybeSingle()
          if (profileByEmail) profile = profileByEmail
        }

        if (profile) {
          const appUser: AppUser = {
            id: sessionUser.id,
            email,
            name: profile.name || known?.name || email.split('@')[0],
            role: (profile.role as 'admin' | 'caller') || known?.role || 'caller',
            color: profile.color || known?.color || '#E8E8E8',
            password: '',
            avatar: profile.avatar || known?.avatar || getAvatar(profile.name) || undefined,
          }
          localStorage.setItem('gc_current_user', JSON.stringify(appUser))
          return appUser
        }
      } catch (err) {
        console.warn('Could not load profile from Supabase, creating fallback:', err)
      }

      // Build app user from profile or known roster
      const name = profile?.name || known?.name || sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name || email.split('@')[0]
      const role = (profile?.role as 'admin' | 'caller') || known?.role || (email.includes('aadarsh') ? 'admin' : 'caller')
      const fallbackUser: AppUser = {
        id: sessionUser.id,
        email,
        name,
        role,
        color: profile?.color || known?.color || '#A7F3D0',
        password: '',
        avatar: profile?.avatar || known?.avatar || sessionUser.user_metadata?.avatar_url || getAvatar(name) || undefined,
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

      // Check cached user FIRST for instantaneous 0ms rendering
      const cached = getCachedUser()
      if (cached && isAuthorizedEmployee(cached.email)) {
        setUser(cached)
        setLoading(false)
      } else if (cached) {
        localStorage.removeItem('gc_current_user')
        setUser(null)
      }

      if (!isSupabaseReady) {
        setLoading(false)
        clearTimeout(safetyTimer)
        return
      }

      // Handle OAuth PKCE code return if present
      if (typeof window !== 'undefined' && window.location.search) {
        const urlParams = new URLSearchParams(window.location.search)
        const code = urlParams.get('code')
        if (code) {
          try {
            const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
            if (exchangeData?.user) {
              const appUser = await handleAuthSession(exchangeData.user)
              if (appUser && !unmounted) {
                setUser(appUser)
                setLoading(false)
              }
            } else if (exchangeError) {
              console.warn('OAuth code exchange notice:', exchangeError.message)
            }
            window.history.replaceState(null, '', window.location.pathname)
          } catch (e) {
            console.warn('exchangeCodeForSession notice:', e)
          }
        }
      }

      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) {
          console.warn('Supabase getSession notice:', error)
        } else if (data?.session?.user) {
          const appUser = await handleAuthSession(data.session.user)
          if (appUser && !unmounted) {
            setUser(appUser)
            setLoading(false)
          }
          // Clean token hash if present
          if (typeof window !== 'undefined' && window.location.hash?.includes('access_token')) {
            window.history.replaceState(null, '', window.location.pathname)
          }
        }
      } catch (e) {
        console.warn('Error checking Supabase session:', e)
      } finally {
        if (!unmounted && !cached) setLoading(false)
        clearTimeout(safetyTimer)
      }

      // Listen for auth state changes (SIGNED_IN, TOKEN_REFRESHED, INITIAL_SESSION)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (unmounted) return
        if (event === 'SIGNED_OUT') {
          localStorage.removeItem('gc_current_user')
          setUser(null)
        } else if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
          const appUser = await handleAuthSession(session.user)
          if (appUser && !unmounted) {
            setUser(appUser)
            setLoading(false)
          }
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
