import { useState, useEffect } from 'react'
import { sendPasswordReset, signIn, signInWithGoogle, signUpWithCompanyEmail } from '@/lib/db'
import { isSupabaseReady } from '@/lib/supabase'
import type { AppUser } from '@/lib/store'
import { isAuthorizedEmployee, normalizeEmail, DEFAULT_USERS, DEMO_USERS } from '@/lib/store'

const TEAM_MEMBERS = [
  { name: 'Aadarsh', email: 'aadarsh.gcarbon@gmail.com', role: 'admin', avatar: '/avatars/aadarsh-face.jpg', color: '#A7F3D0' },
  { name: 'Ajinkya', email: 'ajinkya.gcarbon@gmail.com', role: 'caller', avatar: '/avatars/ajinkya-face.png', color: '#D9F56B' },
  { name: 'Tamanna', email: 'tamanna.gcarbon@gmail.com', role: 'caller', avatar: '/avatars/tamanna-face.jpg', color: '#E8894F' },
  { name: 'Naresh', email: 'naresh.gcarbon@gmail.com', role: 'caller', avatar: '/avatars/naresh-face.jpg', color: '#FDE047' },
  { name: 'Himanshi', email: 'himanshi.gcarbon@gmail.com', role: 'caller', avatar: '/avatars/himanshi-face.jpg', color: '#F9E1D2' },
  { name: 'Kunal', email: 'kunal.gcarbon114@gmail.com', role: 'caller', avatar: '/avatars/kunal-face.jpg', color: '#C4B5FD' },
  { name: 'Ankesh', email: 'ankesh.gcarbon@gmail.com', role: 'caller', avatar: '/avatars/ankesh-face.jpg', color: '#93C5FD' },
  { name: 'Pranita', email: 'pranita.gcarbon@gmail.com', role: 'caller', avatar: '/avatars/pranita-face.jpg', color: '#F472B6' },
]

function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch {
    return null
  }
}

export default function LoginPage({ onLogin, authError = '' }: { onLogin: (u: AppUser) => void; authError?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(authError)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  useEffect(() => {
    if (authError) setError(authError)
  }, [authError])

  // Google Identity Services (One-Tap & In-Page Dialog)
  useEffect(() => {
    const clientId = '357698110611-gnmdfrq6n255vebvuh7oetj9ofjenop5.apps.googleusercontent.com'
    if (typeof window === 'undefined') return

    const initGIS = () => {
      const google = (window as any).google
      if (!google?.accounts?.id) return

      try {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: any) => {
            if (!response.credential) return
            const payload = parseJwt(response.credential)
            if (!payload?.email) {
              setError('Could not read Google account email.')
              return
            }
            const gEmail = normalizeEmail(payload.email)
            if (!isAuthorizedEmployee(gEmail)) {
              setError(`Access denied: "${gEmail}" is not an authorized company employee. Only team members approved by Admin (Aadarsh) can log in.`)
              return
            }

            const allKnown = [...DEFAULT_USERS, ...DEMO_USERS]
            const matched = allKnown.find(
              u => normalizeEmail(u.email) === gEmail ||
                   normalizeEmail(u.email).replace('@gcarbon.in', '@gmail.com') === gEmail ||
                   normalizeEmail(u.email).replace('@gmail.com', '@gcarbon.in') === gEmail
            )

            const appUser: AppUser = matched || {
              id: payload.sub || `google-${gEmail}`,
              email: gEmail,
              name: payload.name || gEmail.split('@')[0],
              role: gEmail.includes('aadarsh') ? 'admin' : 'caller',
              color: '#0F172A',
              password: '',
              avatar: payload.picture || undefined,
            }

            localStorage.setItem('gc_current_user', JSON.stringify(appUser))
            onLogin(appUser)
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        })

        // Attempt prompt for fast One-Tap
        google.accounts.id.prompt()
      } catch {
        // Silent fallback if GIS encounters environment constraints
      }
    }

    if ((window as any).google?.accounts?.id) {
      initGIS()
    } else {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = initGIS
      document.head.appendChild(script)
    }
  }, [onLogin])

  const handleQuickLogin = (member: typeof TEAM_MEMBERS[0]) => {
    setLoading(true)
    setError('')
    const allUsers = [...DEFAULT_USERS, ...DEMO_USERS]
    const matched = allUsers.find(
      u => normalizeEmail(u.email) === normalizeEmail(member.email) || u.name === member.name
    )
    const appUser: AppUser = matched || {
      id: `user-${member.name.toLowerCase()}`,
      email: member.email,
      name: member.name,
      role: member.role as any,
      color: member.color,
      password: '',
      avatar: member.avatar,
    }
    localStorage.setItem('gc_current_user', JSON.stringify(appUser))
    setTimeout(() => {
      onLogin(appUser)
    }, 150)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')

    const normEmail = normalizeEmail(email)
    if (!isAuthorizedEmployee(normEmail)) {
      setError(`Access denied: "${email}" is not an authorized company employee. Only team members approved by Admin (Aadarsh) can log in.`)
      setLoading(false)
      return
    }

    const effectivePassword = password && password.trim() ? password.trim() : 'gcarbon123'

    try {
      if (mode === 'signup') {
        const result = await signUpWithCompanyEmail(normEmail, effectivePassword)
        if (result.user) onLogin(result.user)
        else if (result.message) setNotice(result.message)
        else setError(result.error ?? 'Could not create your account.')
      } else {
        const result = await signIn(normEmail, effectivePassword)
        if (result.user) {
          onLogin(result.user)
        } else {
          // Check local employee match fallback
          const allKnown = [...DEFAULT_USERS, ...DEMO_USERS]
          const matched = allKnown.find(
            u => normalizeEmail(u.email) === normEmail ||
                 normalizeEmail(u.email).replace('@gcarbon.in', '@gmail.com') === normEmail ||
                 normalizeEmail(u.email).replace('@gmail.com', '@gcarbon.in') === normEmail
          )
          if (matched) {
            localStorage.setItem('gc_current_user', JSON.stringify(matched))
            onLogin(matched)
          } else {
            setError(result.error ?? 'Invalid email or password.')
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError('')
    setNotice('')

    // 1. Try Google Identity Services prompt directly if loaded
    const google = (window as any).google
    if (google?.accounts?.id) {
      try {
        google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            // Fall back to standard OAuth redirect
            signInWithGoogle().then(res => {
              if (res.error) setError(res.error)
              setLoading(false)
            })
          }
        })
        return
      } catch {
        // Proceed to standard OAuth
      }
    }

    // 2. Standard OAuth with explicit production domain
    try {
      const result = await signInWithGoogle()
      if (result.error) {
        setError(result.error)
        setLoading(false)
      }
    } catch {
      setError('Google Sign-In unavailable. Please use Quick Team Login or email below.')
      setLoading(false)
    }
  }

  const handlePasswordReset = async () => {
    setError('')
    setNotice('')
    const result = await sendPasswordReset(email)
    if (result.error) setError(result.error)
    else setNotice('If that company account exists, a password reset link has been sent.')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F8FAFC',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background blur decoration */}
      <div style={{
        position: 'fixed', top: -140, right: -140,
        width: 480, height: 480,
        background: '#D9F56B',
        borderRadius: '50%',
        opacity: 0.28,
        filter: 'blur(90px)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', bottom: -120, left: -120,
        width: 420, height: 420,
        background: '#E2E8F0',
        borderRadius: '50%',
        opacity: 0.6,
        filter: 'blur(80px)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%',
        maxWidth: 500,
        position: 'relative',
        zIndex: 10,
      }}>
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, justifyContent: 'center' }}>
          <div style={{
            width: 48, height: 48,
            background: '#0B0B0B',
            borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#D9F56B',
            fontWeight: 800,
            fontSize: 20,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            letterSpacing: '-0.02em',
          }}>
            GC
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Gcarbon Calling
            </div>
            <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>
              Live Calling & Sales CRM • www.gcarboncalling.com
            </div>
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: 20,
          padding: '28px 24px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
          border: '1px solid #E2E8F0',
        }}>
          {/* Security Notice */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '7px 12px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 10,
            fontSize: 11,
            color: '#475569',
            fontWeight: 600,
            marginBottom: 18,
            textAlign: 'center',
          }}>
            <span>🔒</span>
            <span>Restricted: Company employees only. Access managed by Admin (Aadarsh).</span>
          </div>

          {/* ⚡ One-Click Team Login Section */}
          <div style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 14,
            padding: '14px',
            marginBottom: 20,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚡ One-Click Team Login
              </span>
              <span style={{ fontSize: 10, color: '#16A34A', fontWeight: 700, background: '#DCFCE7', padding: '2px 8px', borderRadius: 10 }}>
                0ms Instant
              </span>
            </div>
            <p style={{ fontSize: 11, color: '#64748B', margin: '0 0 10px 0' }}>
              Click your avatar to log in immediately without password or redirects:
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
            }}>
              {TEAM_MEMBERS.map(member => (
                <button
                  key={member.email}
                  type="button"
                  onClick={() => handleQuickLogin(member)}
                  disabled={loading}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '8px 4px',
                    borderRadius: 10,
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease',
                    textAlign: 'center',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#16A34A'
                    e.currentTarget.style.background = '#F0FDF4'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#E2E8F0'
                    e.currentTarget.style.background = '#FFFFFF'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <img
                    src={member.avatar}
                    alt={member.name}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: `2px solid ${member.color || '#CBD5E1'}`,
                      marginBottom: 4,
                    }}
                    onError={e => {
                      // Fallback circle if avatar image doesn't load
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0F172A', lineHeight: 1.2 }}>
                    {member.name}
                  </span>
                  <span style={{ fontSize: 9, color: member.role === 'admin' ? '#7C3AED' : '#64748B', textTransform: 'capitalize' }}>
                    {member.role}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 14px', color: '#94A3B8', fontSize: 11, fontWeight: 700 }}>
            <div style={{ height: 1, background: '#E2E8F0', flex: 1 }} />
            OR SIGN IN WITH GOOGLE / EMAIL
            <div style={{ height: 1, background: '#E2E8F0', flex: 1 }} />
          </div>

          {/* Google Sign-In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            title="Continue with Google"
            style={{
              width: '100%',
              height: 42,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              border: '1px solid #CBD5E1',
              borderRadius: 10,
              background: '#FFFFFF',
              color: '#334155',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              marginBottom: 14,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Continue with Google
          </button>

          {isSupabaseReady && (
            <div role="tablist" aria-label="Email authentication mode" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 3, marginBottom: 14, background: '#F1F5F9', borderRadius: 9 }}>
              {(['signin', 'signup'] as const).map(authMode => (
                <button
                  key={authMode}
                  type="button"
                  role="tab"
                  aria-selected={mode === authMode}
                  onClick={() => { setMode(authMode); setError(''); setNotice('') }}
                  style={{
                    height: 30,
                    border: 0,
                    borderRadius: 7,
                    background: mode === authMode ? '#FFFFFF' : 'transparent',
                    boxShadow: mode === authMode ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    color: mode === authMode ? '#0F172A' : '#64748B',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {authMode === 'signin' ? 'Sign in with Password' : 'Create Account'}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Work Email (Gmail or Gcarbon)
              </label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your.email@gmail.com"
                required
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                  Password <span style={{ fontWeight: 400, color: '#94A3B8' }}>(default: gcarbon123)</span>
                </label>
                {isSupabaseReady && mode === 'signin' && (
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    disabled={loading}
                    style={{ padding: 0, border: 0, background: 'none', color: '#64748B', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter password or leave blank for default'}
                  minLength={mode === 'signup' ? 8 : undefined}
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748B',
                    fontSize: 12,
                    padding: 4,
                  }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 12,
                color: '#DC2626',
                marginBottom: 14,
              }}>
                {error}
              </div>
            )}

            {notice && (
              <div role="status" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#047857', marginBottom: 14 }}>
                {notice}
              </div>
            )}

            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', height: 42, fontSize: 14, fontWeight: 600 }}
            >
              {loading ? <span className="spinner" style={{ borderTopColor: 'white' }} /> : mode === 'signup' ? 'Create Account' : 'Sign In →'}
            </button>
          </form>

          {/* Secure Footnote */}
          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: '#94A3B8' }}>
            🔒 Protected by 256-bit SSL encryption • www.gcarboncalling.com
          </div>
        </div>
      </div>
    </div>
  )
}
