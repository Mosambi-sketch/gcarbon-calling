'use client'
import { useEffect, useState } from 'react'
import { getCurrentUser } from '@/lib/store'
import LoginPage from '@/components/LoginPage'
import AppShell from '@/components/AppShell'

export default function Home() {
  const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const u = getCurrentUser()
    setUser(u)
    setLoading(false)
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#EFEFEF' }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  if (!user) return <LoginPage onLogin={setUser} />
  return <AppShell user={user} onLogout={() => { setUser(null) }} />
}
