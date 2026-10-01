'use client'
import { useState } from 'react'
import { login, setCurrentUser, type AppUser } from '@/lib/store'

export default function LoginPage({ onLogin }: { onLogin: (u: AppUser) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    await new Promise(r => setTimeout(r, 400))
    const user = login(email, password)
    if (user) {
      setCurrentUser(user)
      onLogin(user)
    } else {
      setError('Invalid email or password. Try ajinkya@gcarbon.in / gcarbon123')
    }
    setLoading(false)
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
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Welcome back 👋</h1>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
            Sign in to access the calling sheet
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>
                Email
              </label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@gcarbon.in"
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
                placeholder="••••••••"
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

            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', height: 44, fontSize: 14 }}
            >
              {loading ? <span className="spinner" style={{ borderTopColor: 'white' }} /> : 'Sign in →'}
            </button>
          </form>

          <div style={{ marginTop: 20, padding: 14, background: '#F9F9F9', borderRadius: 12 }}>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 8 }}>DEMO ACCOUNTS</div>
            {[
              { name: 'Ajinkya (Admin)', email: 'ajinkya@gcarbon.in' },
              { name: 'Himanshi', email: 'himanshi@gcarbon.in' },
              { name: 'Kunal', email: 'kunal@gcarbon.in' },
            ].map(u => (
              <button
                key={u.email}
                onClick={() => { setEmail(u.email); setPassword('gcarbon123') }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '6px 10px', borderRadius: 8, border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  fontSize: 12, color: '#555', fontFamily: 'inherit',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#F0F0F0')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontWeight: 600 }}>{u.name}</span>
                <span style={{ color: '#AAA', marginLeft: 8 }}>{u.email}</span>
              </button>
            ))}
            <div style={{ fontSize: 11, color: '#AAA', marginTop: 8 }}>Password: gcarbon123</div>
          </div>
        </div>
      </div>
    </div>
  )
}
