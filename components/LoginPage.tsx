import { useState } from 'react'
import { sendPasswordReset, signIn, signInWithGoogle, signUpWithCompanyEmail } from '@/lib/db'
import { isSupabaseReady } from '@/lib/supabase'
import type { AppUser } from '@/lib/store'
import { DEFAULT_USERS, DEMO_USERS } from '@/lib/store'

export default function LoginPage({ onLogin, authError = '' }: { onLogin: (u: AppUser) => void; authError?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(authError)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [accountTab, setAccountTab] = useState<'demo' | 'team'>('demo')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')
    try {
      if (mode === 'signup') {
        const result = await signUpWithCompanyEmail(email, password)
        if (result.user) onLogin(result.user)
        else if (result.message) setNotice(result.message)
        else setError(result.error ?? 'Could not create your account.')
      } else {
        const result = await signIn(email, password)
        if (result.user) onLogin(result.user)
        else setError(result.error ?? 'Invalid email or password.')
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
    const result = await signInWithGoogle()
    if (result.error) {
      setError(result.error)
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
      background: '#EFEFEF',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      {/* Background blobs */}
      <div style={{
        position: 'fixed', top: -100, right: -100,
        width: 400, height: 400,
        background: '#D9F56B',
        borderRadius: '50%',
        opacity: 0.4,
        filter: 'blur(80px)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', bottom: -80, left: -80,
        width: 320, height: 320,
        background: '#E8894F',
        borderRadius: '50%',
        opacity: 0.3,
        filter: 'blur(60px)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%',
        maxWidth: 420,
        animation: 'fadeIn 0.4s ease',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32, justifyContent: 'center' }}>
          <div style={{
            width: 52, height: 52,
            background: '#0B0B0B',
            borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#D9F56B',
            fontWeight: 800,
            fontSize: 20,
          }}>
            GC
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, color: '#0B0B0B' }}>Gcarbon Calling</div>
            <div style={{ fontSize: 12, color: '#888' }}>Internal CRM</div>
          </div>
        </div>

        <div style={{
          background: 'white',
          borderRadius: 24,
          padding: 32,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Welcome back 👋</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
              Sign in with your company account
            </p>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
              background: isSupabaseReady ? '#DCFCE7' : '#F3F4F6',
              color: isSupabaseReady ? '#16A34A' : '#6B7280',
              letterSpacing: '0.04em',
            }}>
              {isSupabaseReady ? '● LIVE' : '○ LOCAL'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading || !isSupabaseReady}
            title={!isSupabaseReady ? 'Configure Supabase and Google OAuth to enable this sign-in method' : 'Continue with your company Google account'}
            style={{ width: '100%', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, border: '1px solid #D1D5DB', borderRadius: 10, background: '#FFFFFF', color: '#202124', fontSize: 14, fontWeight: 600, cursor: isSupabaseReady && !loading ? 'pointer' : 'not-allowed', opacity: isSupabaseReady ? 1 : 0.62 }}
          >
            <span aria-hidden="true" style={{ fontWeight: 800, fontSize: 17, color: '#4285F4' }}>G</span>
            Continue with Google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0', color: '#9CA3AF', fontSize: 10, fontWeight: 700 }}>
            <div style={{ height: 1, background: '#E5E7EB', flex: 1 }} />
            COMPANY EMAIL
            <div style={{ height: 1, background: '#E5E7EB', flex: 1 }} />
          </div>

          {isSupabaseReady && (
            <div role="tablist" aria-label="Email authentication mode" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 3, marginBottom: 16, background: '#F3F4F6', borderRadius: 9 }}>
              {(['signin', 'signup'] as const).map(authMode => (
                <button
                  key={authMode}
                  type="button"
                  role="tab"
                  aria-selected={mode === authMode}
                  onClick={() => { setMode(authMode); setError(''); setNotice('') }}
                  style={{ height: 32, border: 0, borderRadius: 7, background: mode === authMode ? '#FFFFFF' : 'transparent', boxShadow: mode === authMode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  {authMode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>
                Company Email
              </label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name.gcarbon@gmail.com"
                required
                autoFocus
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>
                Password
              </label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                minLength={mode === 'signup' ? 8 : undefined}
                required
              />
            </div>

            {error && (
              <div style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 12,
                color: '#DC2626',
                marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            {notice && (
              <div role="status" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#047857', marginBottom: 16 }}>
                {notice}
              </div>
            )}

            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', height: 44, fontSize: 14 }}
            >
              {loading ? <span className="spinner" style={{ borderTopColor: 'white' }} /> : mode === 'signup' ? 'Create account' : 'Sign in →'}
            </button>
          </form>

          {isSupabaseReady && mode === 'signin' && (
            <button type="button" onClick={handlePasswordReset} disabled={loading} style={{ marginTop: 12, padding: 0, border: 0, background: 'none', color: '#555', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
              Forgot password?
            </button>
          )}

          <div style={{ marginTop: 22, padding: '14px 16px', background: '#F8FAFC', borderRadius: 14, border: '1px solid #E2E8F0' }}>
            {/* Tab switch */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12, padding: 3, background: '#E2E8F0', borderRadius: 10 }}>
              <button
                type="button"
                onClick={() => setAccountTab('demo')}
                style={{
                  padding: '6px 8px', border: 0, borderRadius: 7,
                  background: accountTab === 'demo' ? '#FFFFFF' : 'transparent',
                  boxShadow: accountTab === 'demo' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  fontSize: 12, fontWeight: 700,
                  color: accountTab === 'demo' ? '#0F172A' : '#64748B',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <span>🎭 Demo Accounts</span>
                <span style={{ fontSize: 9, background: '#FEF3C7', color: '#92400E', padding: '1px 5px', borderRadius: 10 }}>gcarbon123</span>
              </button>
              <button
                type="button"
                onClick={() => setAccountTab('team')}
                style={{
                  padding: '6px 8px', border: 0, borderRadius: 7,
                  background: accountTab === 'team' ? '#FFFFFF' : 'transparent',
                  boxShadow: accountTab === 'team' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  fontSize: 12, fontWeight: 700,
                  color: accountTab === 'team' ? '#0F172A' : '#64748B',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <span>⚡ Team Members</span>
              </button>
            </div>

            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 700, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                {accountTab === 'demo' ? 'SELECT DEMO ACCOUNT (Instant Access)' : 'AUTHORIZED TEAM ACCOUNTS'}
              </span>
              <span style={{ color: accountTab === 'demo' ? '#D97706' : '#16A34A', fontWeight: 600, fontSize: 10 }}>
                {accountTab === 'demo' ? '● Password: gcarbon123' : '● Live Sync'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 250, overflowY: 'auto' }}>
              {(accountTab === 'demo' ? DEMO_USERS : DEFAULT_USERS).map(u => (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => {
                    // Pre-fill fields
                    setEmail(u.email)
                    setPassword(accountTab === 'demo' ? 'gcarbon123' : '')
                    
                    // Instant 1-click login
                    const appUser: AppUser = {
                      id: u.id,
                      email: u.email,
                      name: u.name,
                      role: u.role,
                      color: u.color,
                      password: u.password || 'gcarbon123',
                      avatar: u.avatar,
                    }
                    localStorage.setItem('gc_current_user', JSON.stringify(appUser))
                    onLogin(appUser)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '8px 10px', borderRadius: 8, border: '1px solid #E2E8F0',
                    background: '#FFFFFF', cursor: 'pointer',
                    fontSize: 12, color: '#1E293B', fontFamily: 'inherit',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = accountTab === 'demo' ? '#FFFBEB' : '#F0FDF4'
                    e.currentTarget.style.borderColor = accountTab === 'demo' ? '#FCD34D' : '#86EFAC'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#FFFFFF'
                    e.currentTarget.style.borderColor = '#E2E8F0'
                  }}
                >
                  <img
                    src={u.avatar}
                    alt={u.name}
                    style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 700, fontSize: 12 }}>
                      {u.name} {u.role === 'admin' ? <span style={{ fontSize: 10, color: '#2563EB', fontWeight: 600 }}>• Admin</span> : ''}
                    </span>
                    <span style={{ color: '#64748B', fontSize: 11 }}>{u.email}</span>
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: accountTab === 'demo' ? '#B45309' : '#059669', fontWeight: 700 }}>
                    Enter Demo →
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
