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
            <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>SELECT TEAM MEMBER</span>
              <span style={{ color: '#AAA', fontWeight: 400 }}>Pass: gcarbon123</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
              {[
                { name: 'Ajinkya (Admin)', email: 'ajinkya@gcarbon.in', avatar: '/avatars/ajinkya-face.png' },
                { name: 'Himanshi', email: 'himanshi@gcarbon.in', avatar: '/avatars/himanshi-face.jpg' },
                { name: 'Tamanna', email: 'tamanna@gcarbon.in', avatar: '/avatars/tamanna-face.jpg' },
                { name: 'Ankesh', email: 'ankesh@gcarbon.in', avatar: '/avatars/ankesh-face.jpg' },
                { name: 'Aadarsh (Admin)', email: 'aadarsh@gcarbon.in', avatar: '/avatars/aadarsh-face.jpg' },
                { name: 'Naresh', email: 'naresh@gcarbon.in', avatar: '/avatars/naresh-face.jpg' },
                { name: 'Pranita', email: 'pranita@gcarbon.in', avatar: '/avatars/pranita-face.jpg' },
              ].map(u => (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => { setEmail(u.email); setPassword('gcarbon123') }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '6px 8px', borderRadius: 8, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    fontSize: 12, color: '#444', fontFamily: 'inherit',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#ECECEC')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <img
                    src={u.avatar}
                    alt={u.name}
                    style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
                  />
                  <span style={{ fontWeight: 600 }}>{u.name}</span>
                  <span style={{ color: '#999', marginLeft: 'auto', fontSize: 11 }}>{u.email.split('@')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
