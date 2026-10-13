import { useState, useEffect, useRef } from 'react'
import type { NavPage } from './AppShell'
import type { AppUser } from '@/lib/store'
import { getInitials, getAvatar, getAvatarColor } from '@/lib/types'

const NAV_ITEMS: { id: NavPage; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'calling', label: 'Calling Sheet', icon: 'calling' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'notes', label: 'My Notes', icon: 'notes' },
]

interface SidebarProps {
  user: AppUser
  activePage: NavPage
  onNavigate: (page: NavPage) => void
  onLogout: () => void
  isAdmin: boolean
}

function SvgIcon({ name, active }: { name: string; active?: boolean }) {
  const strokeColor = active ? '#09090B' : 'rgba(255,255,255,0.7)'
  const strokeW = active ? 2.1 : 1.8

  const icons: Record<string, React.ReactNode> = {
    dashboard: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke={strokeColor} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="2"/>
        <rect x="14" y="3" width="7" height="7" rx="2"/>
        <rect x="3" y="14" width="7" height="7" rx="2"/>
        <rect x="14" y="14" width="7" height="7" rx="2"/>
      </svg>
    ),
    calling: (
      <svg width="21" height="21" fill="none" viewBox="0 0 24 24" stroke={strokeColor} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        <path d="M14 2a8 8 0 0 1 8 8" />
        <path d="M14 6a4 4 0 0 1 4 4" />
      </svg>
    ),
    tasks: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke={strokeColor} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ),
    calendar: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke={strokeColor} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="3"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    notes: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke={strokeColor} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    ),
    settings: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke={strokeColor} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
    logout: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
    ),
  }
  return <>{icons[name] || null}</>
}

export default function Sidebar({ user, activePage, onNavigate, onLogout, isAdmin }: SidebarProps) {
  const navItems = isAdmin
    ? [...NAV_ITEMS, { id: 'settings' as NavPage, label: 'Settings', icon: 'settings' }]
    : NAV_ITEMS

  const containerRef = useRef<HTMLElement>(null)
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [activeY, setActiveY] = useState<number>(140)
  const [sidebarHeight, setSidebarHeight] = useState<number>(750)
  const [showMobileAccount, setShowMobileAccount] = useState(false)

  // Measure active tab center Y and sidebar height
  useEffect(() => {
    const updateMeasurements = () => {
      if (!containerRef.current) return
      const cRect = containerRef.current.getBoundingClientRect()
      setSidebarHeight(cRect.height || 750)

      const activeEl = itemRefs.current[activePage]
      if (activeEl) {
        const aRect = activeEl.getBoundingClientRect()
        setActiveY(aRect.top - cRect.top + aRect.height / 2)
      }
    }

    updateMeasurements()
    window.addEventListener('resize', updateMeasurements)
    const timer = setTimeout(updateMeasurements, 50)
    return () => {
      window.removeEventListener('resize', updateMeasurements)
      clearTimeout(timer)
    }
  }, [activePage, navItems.length])

  // Fluid SVG S-curve path
  const w = 68
  const cy = activeY
  const H = Math.max(sidebarHeight, 600)

  // Fluid continuous contour from top rounded pill to bottom rounded pill with concave scoop
  const fluidPath = `
    M 0 28
    C 0 12, 12 0, 28 0
    L ${w - 28} 0
    C ${w - 12} 0, ${w} 12, ${w} 28
    L ${w} ${Math.max(30, cy - 46)}
    C ${w} ${cy - 26}, ${w - 14} ${cy - 20}, ${w - 26} ${cy - 12}
    C ${w - 40} ${cy - 5}, ${w - 46} ${cy}, ${w - 46} ${cy}
    C ${w - 46} ${cy}, ${w - 40} ${cy + 5}, ${w - 26} ${cy + 12}
    C ${w - 14} ${cy + 20}, ${w} ${cy + 26}, ${w} ${Math.min(H - 30, cy + 46)}
    L ${w} ${H - 28}
    C ${w} ${H - 12}, ${w - 12} ${H}, ${w - 28} ${H}
    L 28 ${H}
    C 12 ${H}, 0 ${H - 12}, 0 ${H - 28}
    Z
  `.replace(/\s+/g, ' ').trim()

  const userAvatar = user.avatar || getAvatar(user.name)

  return (
    <nav className="fluid-sidebar" ref={containerRef}>
      {/* Background SVG Fluid Silhouette */}
      <svg
        className="sidebar-fluid-svg"
        viewBox={`0 0 ${w} ${H}`}
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        <path
          d={fluidPath}
          fill="#0B0B0B"
          style={{ transition: 'd 0.28s cubic-bezier(0.34, 1.3, 0.64, 1)' }}
        />
      </svg>

      {/* Floating Active White Disc */}
      <div
        className="active-liquid-circle"
        style={{
          position: 'absolute',
          top: cy,
          left: 21,
          transform: 'translateY(-50%)',
          width: 46,
          height: 46,
          borderRadius: '50%',
          background: '#FFFFFF',
          boxShadow: '0 4px 18px rgba(0,0,0,0.14), 0 1px 3px rgba(0,0,0,0.08)',
          zIndex: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          transition: 'top 0.28s cubic-bezier(0.34, 1.3, 0.64, 1)',
        }}
      >
        <SvgIcon name={activePage} active={true} />
      </div>

      {/* Sidebar Content (on top of SVG) */}
      <div className="sidebar-content" style={{ position: 'relative', zIndex: 10 }}>
        {/* Top Logo / Brand mark */}
        <div className="sidebar-logo-wrap">
          <div className="sidebar-logo">GC</div>
        </div>

        {/* Navigation Items */}
        <div className="sidebar-nav-list">
          {navItems.map(item => {
            const isActive = activePage === item.id
            return (
              <div
                key={item.id}
                ref={el => { itemRefs.current[item.id] = el }}
                className={`fluid-nav-item ${isActive ? 'is-active' : ''}`}
                onClick={() => onNavigate(item.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && onNavigate(item.id)}
              >
                <div className="icon-slot">
                  <span className="desktop-only-inactive">
                    {!isActive && <SvgIcon name={item.id} active={false} />}
                  </span>
                  <span className="mobile-only-icon">
                    <SvgIcon name={item.id} active={isActive} />
                  </span>
                </div>
                <span className="sidebar-tooltip">{item.label}</span>
              </div>
            )
          })}

          {/* Mobile Profile Trigger Button */}
          <div
            className="fluid-nav-item mobile-only-icon"
            onClick={() => setShowMobileAccount(true)}
            role="button"
            tabIndex={0}
            title="My Profile & Options"
          >
            <div
              className="icon-slot"
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                overflow: 'hidden',
                background: user.color || '#D9F56B',
                border: '1.5px solid rgba(255,255,255,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={user.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#09090B' }}>
                  {getInitials(user.name)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Section: Profile Face Avatar, Theme Toggle & Logout (Desktop) */}
        <div className="sidebar-bottom-wrap">
          {/* User Face Avatar */}
          <div className="sidebar-avatar-wrap">
            <div
              className="user-face-disc"
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: user.color || '#D9F56B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                overflow: 'hidden',
                boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
                border: '2px solid rgba(255,255,255,0.2)',
              }}
            >
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={user.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: 'center 20%',
                  }}
                />
              ) : (
                <span style={{ fontWeight: 700, fontSize: 14, color: '#09090B' }}>
                  {getInitials(user.name)}
                </span>
              )}
            </div>
            <div className="sidebar-tooltip">
              {user.name} · {user.role}
            </div>
          </div>

          {/* Theme Toggle */}
          <button
            className="theme-toggle"
            onClick={() => {
              const html = document.documentElement
              const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
              html.setAttribute('data-theme', next)
              localStorage.setItem('gc_theme', next)
            }}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>

          {/* Sign Out Button */}
          <div
            className="fluid-logout-btn"
            onClick={onLogout}
            role="button"
            tabIndex={0}
            title="Sign out"
            aria-label="Sign out"
          >
            <SvgIcon name="logout" />
            <span className="sidebar-tooltip">Sign out</span>
          </div>
        </div>

        {/* Mobile Account Bottom Sheet */}
        {showMobileAccount && (
          <div
            className="modal-overlay"
            onClick={() => setShowMobileAccount(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <div
              className="modal"
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 440,
                borderRadius: '20px 20px 0 0',
                background: 'var(--card, #FFFFFF)',
                padding: '20px 20px calc(24px + env(safe-area-inset-bottom, 0px)) 20px',
                boxShadow: '0 -10px 30px rgba(0,0,0,0.3)',
                animation: 'slideUp 0.2s ease-out',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: user.color || '#D9F56B',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      color: '#09090B',
                    }}
                  >
                    {userAvatar ? (
                      <img src={userAvatar} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      getInitials(user.name)
                    )}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{user.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {user.email || 'CRM Member'} · <span style={{ textTransform: 'capitalize' }}>{user.role}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowMobileAccount(false)}
                  style={{ fontSize: 16 }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    const html = document.documentElement
                    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
                    html.setAttribute('data-theme', next)
                    localStorage.setItem('gc_theme', next)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'var(--surface-1, #F3F4F6)',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  <span>🌓 Appearance / Theme</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Toggle</span>
                </button>

                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setShowMobileAccount(false)
                    onLogout()
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: '#FEE2E2',
                    color: '#DC2626',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginTop: 6,
                  }}
                >
                  <SvgIcon name="logout" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
