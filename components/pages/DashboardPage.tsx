import { useState, useEffect, useMemo } from 'react'
import type { AppUser } from '@/lib/store'
import { getTasks, getCompanies } from '@/lib/store'
import { fetchDashboardMetrics, type DashboardMetricsV2 } from '@/lib/db'
import type { NavPage } from '../AppShell'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { getInitials, getAvatar } from '@/lib/types'
import { format } from 'date-fns'
import {
  PhoneCall, Users, Clock, CalendarCheck,
  Building2, Award, Minus
} from 'lucide-react'
import type { Task, Note } from '@/lib/types'

const PIE_COLORS = ['#D9F56B', '#E8894F', '#A1A1AA', '#93C5FD', '#C4B5FD', '#F9E1D2', '#DCFCE7', '#FEE2E2']

// ── Page Header ────────────────────────────────────────────────────────────────
function PageHeader({ user }: { user: AppUser }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="page-header">
      <div className="page-header-left">
        <div className="greeting">{greeting}, {user.name} 👋</div>
        <div className="greeting-sub">Glad to see you again! Here's your daily overview.</div>
      </div>
      <div className="header-actions">
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{format(now, 'hh:mm a')}</div>
          <div style={{ fontSize: 11, color: '#888' }}>{format(now, 'dd MMM, EEEE')}</div>
        </div>
      </div>
    </div>
  )
}

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({
  title, value, sub, bg, color, onClick, icon
}: {
  title: string; value: string | number; sub?: string; bg?: string; color?: string;
  onClick?: () => void; icon?: React.ReactNode
}) {
  return (
    <div
      className={`card ${bg || ''}`}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        flex: 1, minWidth: 0,
        transition: 'transform 0.15s, box-shadow 0.15s',
        color,
      }}
      onClick={onClick}
      onMouseEnter={e => onClick && ((e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)')}
      onMouseLeave={e => onClick && ((e.currentTarget as HTMLElement).style.transform = '')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="metric-number">{value}</div>
          <div className="metric-label" style={{ color: color ? `${color}99` : undefined }}>{title}</div>
          {sub && <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>{sub}</div>}
        </div>
        {icon && (
          <div style={{ opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Leaderboard ────────────────────────────────────────────────────────────────
function LeaderboardCard({ data }: { data: DashboardMetricsV2['leaderboard'] }) {
  const [sortBy, setSortBy] = useState<'calls' | 'meetings' | 'connectRate'>('calls')

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      if (sortBy === 'meetings') return b.meetings - a.meetings || b.calls - a.calls
      if (sortBy === 'connectRate') return (b.connectRate || 0) - (a.connectRate || 0) || b.calls - a.calls
      return b.calls - a.calls
    })
  }, [data, sortBy])

  return (
    <div className="card" style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Award size={16} color="currentColor" /> Team Leaderboard
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--off-white)', padding: 2, borderRadius: 6 }}>
          {(['calls', 'meetings', 'connectRate'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSortBy(s)}
              style={{
                border: 'none', background: sortBy === s ? 'var(--text)' : 'transparent',
                color: sortBy === s ? 'var(--bg)' : 'var(--text-muted)',
                fontSize: 10, fontWeight: 600, padding: '3px 6px', borderRadius: 4, cursor: 'pointer'
              }}
            >
              {s === 'connectRate' ? 'Connect %' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {sortedData.length > 0 && sortedData.every(m => m.calls === 0) && (
        <div style={{ padding: '8px 12px', marginBottom: 12, background: 'var(--off-white)', borderRadius: 8, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
          No calls logged in this period. Calls made across the team appear here live.
        </div>
      )}
      {sortedData.map((m, i) => (
        <div key={m.name} className="leaderboard-item">
          <div style={{
            width: 20, height: 20,
            background: i === 0 && m.calls > 0 ? '#D9F56B' : i === 1 && m.calls > 0 ? 'var(--border-strong)' : 'var(--off-white)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, flexShrink: 0,
          }}>
            {i + 1}
          </div>
          <div className="avatar" style={{ background: m.color, color: 'var(--bg)', fontSize: 11, overflow: 'hidden' }}>
            {getAvatar(m.name) ? (
              <img src={getAvatar(m.name)} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }} />
            ) : getInitials(m.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {m.calls} calls · {m.connected} connected · {m.meetings} mtg {m.connectRate !== undefined ? `(${m.connectRate}%)` : ''}
            </div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: i === 0 && m.calls > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
            {sortBy === 'meetings' ? m.meetings : sortBy === 'connectRate' ? `${m.connectRate || 0}%` : m.calls}
          </div>
        </div>
      ))}
      {sortedData.length === 0 && (
        <div className="empty-state" style={{ padding: '20px 0' }}>No calls logged yet</div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function DashboardPage({ user, onNavigate }: { user: AppUser; onNavigate: (p: NavPage) => void }) {
  const [period, setPeriod] = useState<7 | 14 | 30>(7)
  const [metrics, setMetrics] = useState<DashboardMetricsV2 | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [totalCompanies, setTotalCompanies] = useState(0)

  const refreshAll = () => {
    fetchDashboardMetrics(user.id, period).then(setMetrics)
    setTasks(getTasks(user.id).filter(t => t.status !== 'done').slice(0, 5))
    setNotes(getLocalNotes(user.id).slice(0, 4))
    setTotalCompanies(getCompanies().filter(c => !c.archived).length)
  }

  useEffect(() => {
    refreshAll()
  }, [user.id, period])

  // Multi-tab, real-time, and storage event listeners
  useEffect(() => {
    const handleUpdate = () => {
      refreshAll()
    }

    window.addEventListener('gc:data-changed', handleUpdate)
    window.addEventListener('storage', handleUpdate)

    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('gc_sync_channel') : null
    const handleChannelMessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'DATA_CHANGED') {
        refreshAll()
      }
    }
    channel?.addEventListener('message', handleChannelMessage)

    return () => {
      window.removeEventListener('gc:data-changed', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
      channel?.removeEventListener('message', handleChannelMessage)
      channel?.close()
    }
  }, [user.id, period])

  const outcomeChartData = useMemo(() => {
    if (!metrics) return []
    return Object.entries(metrics.outcomeBreakdown)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({
        name: k.replace('Not Reachable / Out of Service', 'Unreachable')
               .replace('Already Handled Internally', 'Internal'),
        value: v,
      }))
  }, [metrics])

  if (!metrics) return <div className="empty-state"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <PageHeader user={user} />

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Period selector */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div className="tab-list" style={{ width: 'auto' }}>
            {([7, 14, 30] as const).map(p => (
              <button key={p} className={`tab-item ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
                {p}d
              </button>
            ))}
          </div>
        </div>

        {/* Row 1: Key metrics */}
        <div className="dashboard-metrics-grid">
          <StatCard
            title="My calls today"
            value={metrics.callsToday}
            icon={<PhoneCall size={22} color="var(--text-secondary)" />}
          />
          <StatCard
            title="Team calls today"
            value={metrics.teamCallsToday}
            icon={<Users size={22} color="var(--text-secondary)" />}
          />
          <StatCard
            title="Follow-ups due"
            value={metrics.followUpsDueToday}
            sub={metrics.followUpsOverdue > 0 ? `⚠ ${metrics.followUpsOverdue} overdue` : undefined}
            bg={metrics.followUpsDueToday > 0 ? 'card-peach' : ''}
            icon={<Clock size={22} color={metrics.followUpsDueToday > 0 ? '#F59E0B' : 'var(--text-secondary)'} />}
            onClick={() => onNavigate('calling')}
          />
          <StatCard
            title="Meetings this week"
            value={metrics.meetingsThisWeek}
            bg={metrics.meetingsThisWeek > 0 ? 'card-lime' : ''}
            icon={<CalendarCheck size={22} color="var(--text-secondary)" />}
            onClick={() => onNavigate('calendar')}
          />
          <StatCard
            title="Companies total"
            value={totalCompanies.toLocaleString()}
            icon={<Building2 size={22} color="var(--text-secondary)" />}
            onClick={() => onNavigate('calling')}
          />
        </div>

        {/* Row 2: Charts */}
        <div className="dashboard-charts-row">
          <div className="card" style={{ flex: 2, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Daily Calls (last {period} days)</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--text)', display: 'inline-block' }} />
                  Calls
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 2, background: '#D9F56B', display: 'inline-block' }} />
                  Conversions
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={metrics.dailyCalls} barSize={28}>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', background: 'var(--card)' }}
                  cursor={{ fill: 'var(--hover-bg)' }}
                />
                <Bar dataKey="calls" fill="var(--text-secondary)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="conversions" fill="#D9F56B" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Outcome Breakdown</div>
            {outcomeChartData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={outcomeChartData} cx="50%" cy="50%" innerRadius={36} outerRadius={58} paddingAngle={2} dataKey="value">
                      {outcomeChartData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 10, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                  {outcomeChartData.slice(0, 4).map((item, i) => (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                      <span style={{ fontWeight: 700 }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state" style={{ padding: '20px 0', fontSize: 12 }}>No calls logged yet</div>
            )}
          </div>
        </div>

        {/* Row 3: Leaderboard + Tasks + Notes */}
        <div className="dashboard-cards-row">
          <LeaderboardCard data={metrics.leaderboard} />

          <div className="card" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>My Tasks</div>
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('tasks')}>View all →</button>
            </div>
            {tasks.length > 0 ? tasks.map(task => (
              <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{
                  width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                  background: task.priority === 'high' ? '#DC2626' : task.priority === 'medium' ? '#D97706' : '#16A34A',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                  {task.due_at && (
                    <div style={{ fontSize: 11, color: new Date(task.due_at) < new Date() ? '#F87171' : 'var(--text-muted)' }}>
                      Due {format(new Date(task.due_at), 'dd MMM')}
                    </div>
                  )}
                </div>
                <span className={`badge ${task.status === 'todo' ? 'badge-gray' : 'badge-blue'}`}>{task.status}</span>
              </div>
            )) : (
              <div className="empty-state" style={{ padding: '20px 0', fontSize: 12 }}>🎉 No pending tasks</div>
            )}
          </div>

          <div className="card" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Last Notes</div>
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('notes')}>View all →</button>
            </div>
            {notes.length > 0 ? notes.map(note => (
              <div key={note.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {note.pinned && <span style={{ fontSize: 12 }}>📌</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {note.title || 'Untitled note'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {format(new Date(note.updated_at), 'dd MMM')}
                    {note.company_name && ` · ${note.company_name}`}
                  </div>
                </div>
              </div>
            )) : (
              <div className="empty-state" style={{ padding: '20px 0', fontSize: 12 }}>
                No notes yet. <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('notes')}>Create one →</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Local notes helper (avoids circular import with store)
function getLocalNotes(ownerId: string): Note[] {
  try {
    const raw = localStorage.getItem('gc_notes')
    const all: Note[] = raw ? JSON.parse(raw) : []
    return all
      .filter(n => n.owner_id === ownerId)
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      })
  } catch { return [] }
}
