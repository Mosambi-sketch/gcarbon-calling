import { useState } from 'react'
import { sendPasswordReset, signIn, signInWithGoogle, signUpWithCompanyEmail } from '@/lib/db'
import { isSupabaseReady } from '@/lib/supabase'
import type { AppUser } from '@/lib/store'

export default function LoginPage({ onLogin, authError = '' }: { onLogin: (u: AppUser) => void; authError?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(authError)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

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
      background: '#F8FAFC',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle modern background blur elements */}
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
        maxWidth: 420,
        animation: 'fadeIn 0.35s ease',
        position: 'relative',
        zIndex: 10,
      }}>
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28, justifyContent: 'center' }}>
          <div style={{
            width: 46, height: 46,
            background: '#0B0B0B',
            borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#D9F56B',
            fontWeight: 800,
            fontSize: 18,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            letterSpacing: '-0.02em',
          }}>
            GC
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Gcarbon Calling
            </div>
            <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600, letterSpacing: '0.01em' }}>
              www.gcarboncalling.com
            </div>
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: 20,
          padding: '32px 28px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
          border: '1px solid #E2E8F0',
        }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 4, letterSpacing: '-0.01em' }}>
            Welcome back 👋
          </h1>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 0, marginBottom: 20 }}>
            Sign in to access your sales workspace
          </p>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading || !isSupabaseReady}
            title={!isSupabaseReady ? 'Configure Supabase and Google OAuth to enable this sign-in method' : 'Continue with your company Google account'}
            style={{
              width: '100%',
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              border: '1px solid #CBD5E1',
              borderRadius: 10,
              background: '#FFFFFF',
              color: '#334155',
              fontSize: 14,
              fontWeight: 600,
              cursor: isSupabaseReady && !loading ? 'pointer' : 'not-allowed',
              opacity: isSupabaseReady ? 1 : 0.7,
              transition: 'all 0.15s ease',
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0', color: '#94A3B8', fontSize: 11, fontWeight: 700 }}>
            <div style={{ height: 1, background: '#E2E8F0', flex: 1 }} />
            OR CONTINUE WITH EMAIL
            <div style={{ height: 1, background: '#E2E8F0', flex: 1 }} />
          </div>

          {isSupabaseReady && (
            <div role="tablist" aria-label="Email authentication mode" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 3, marginBottom: 18, background: '#F1F5F9', borderRadius: 9 }}>
              {(['signin', 'signup'] as const).map(authMode => (
                <button
                  key={authMode}
                  type="button"
                  role="tab"
                  aria-selected={mode === authMode}
                  onClick={() => { setMode(authMode); setError(''); setNotice('') }}
                  style={{
                    height: 32,
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
                  {authMode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Work Email (Gmail or Gcarbon)
              </label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your.name@gmail.com"
                required
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                  Password
                </label>
                {isSupabaseReady && mode === 'signin' && (
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    disabled={loading}
                    style={{ padding: 0, border: 0, background: 'none', color: '#64748B', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter password'}
                  minLength={mode === 'signup' ? 8 : undefined}
                  style={{ paddingRight: 40 }}
                  required
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
              {mode === 'signin' && (
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>💡</span>
                  <span>Default team password: <strong style={{ color: '#0F172A', fontWeight: 700 }}>gcarbon123</strong></span>
                </div>
              )}
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
              style={{ width: '100%', justifyContent: 'center', height: 44, fontSize: 14, fontWeight: 600 }}
            >
              {loading ? <span className="spinner" style={{ borderTopColor: 'white' }} /> : mode === 'signup' ? 'Create Account' : 'Sign in →'}
            </button>
          </form>

          {/* Secure Footnote */}
          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 11, color: '#94A3B8' }}>
            🔒 Protected by 256-bit SSL encryption • www.gcarboncalling.com
          </div>
        </div>
      </div>
    </div>
  )
}
