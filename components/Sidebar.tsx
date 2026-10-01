'use client'
import type { NavPage } from './AppShell'
import type { AppUser } from '@/lib/store'
import { getInitials } from '@/lib/types'

const NAV_ITEMS: { id: NavPage; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
  { id: 'calling', label: 'Calling Sheet', icon: '📞' },
  { id: 'tasks', label: 'Tasks', icon: '✓' },
  { id: 'calendar', label: 'Calendar', icon: '📅' },
  { id: 'notes', label: 'My Notes', icon: '📝' },
]

interface SidebarProps {
  user: AppUser
  activePage: NavPage
  onNavigate: (page: NavPage) => void
  onLogout: () => void
  isAdmin: boolean
}

function SvgIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    dashboard: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="3" width="7" height="7" rx="2"/>
        <rect x="14" y="3" width="7" height="7" rx="2"/>
        <rect x="3" y="14" width="7" height="7" rx="2"/>
        <rect x="14" y="14" width="7" height="7" rx="2"/>
      </svg>
    ),
    calling: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h2l3 5-2 2a14 14 0 006 6l2-2 5 3v2a2 2 0 01-2 2C7 21 3 13.3 3 7a2 2 0 012-2z"/>
      </svg>
    ),
    tasks: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <polyline points="9 11 12 14 22 4"/>
        <path strokeLinecap="round" d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
      </svg>
    ),
    calendar: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="4" width="18" height="18" rx="3"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    notes: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    ),
    settings: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="3"/>
        <path strokeLinecap="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    ),
    logout: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
    ),
  }
  return <>{icons[name]}</>
}

export default function Sidebar({ user, activePage, onNavigate, onLogout, isAdmin }: SidebarProps) {
  const navItems = isAdmin
    ? [...NAV_ITEMS, { id: 'settings' as NavPage, label: 'Settings', icon: 'settings' }]
    : NAV_ITEMS

  return (
    <nav className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">GC</div>

      {/* Nav items */}
      <div className="sidebar-nav">
        {navItems.map(item => (
          <div
            key={item.id}
            className={`sidebar-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onNavigate(item.id)}
          >
            <div className="icon-wrap">
              <SvgIcon name={item.id} />
            </div>
            <span className="sidebar-tooltip">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Bottom: avatar + logout */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {/* Avatar */}
        <div style={{ position: 'relative' }} className="avatar-wrap">
          <div
            style={{
              width: 44, height: 44,
              borderRadius: '50%',
              background: user.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 14,
              color: '#0B0B0B',
              cursor: 'pointer',
              border: '2px solid rgba(255,255,255,0.2)',
            }}
          >
            {getInitials(user.name)}
          </div>
          <div className="sidebar-tooltip">
            {user.name} · {user.role}
          </div>
        </div>

        {/* Logout */}
        <div
          className="sidebar-item"
          onClick={onLogout}
          role="button"
          tabIndex={0}
          style={{ marginTop: 4 }}
        >
          <div className="icon-wrap" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <SvgIcon name="logout" />
          </div>
          <span className="sidebar-tooltip">Sign out</span>
        </div>
      </div>
    </nav>
  )
}
