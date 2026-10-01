'use client'
import { useState, useEffect, useMemo } from 'react'
import type { AppUser } from '@/lib/store'
import { getDashboardMetrics, getCompanies, getCallLogs, getTasks, getNotes, getUsers } from '@/lib/store'
import type { NavPage } from '../AppShell'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { getInitials, getAvatar } from '@/lib/types'
import { format } from 'date-fns'

const PIE_COLORS = ['#D9F56B', '#E8894F', '#0B0B0B', '#93C5FD', '#C4B5FD', '#F9E1D2', '#DCFCE7', '#FEE2E2']

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

function StatCard({ 
  title, value, sub, bg, color, onClick, icon 
}: { 
  title: string; value: string | number; sub?: string; bg?: string; color?: string; 
  onClick?: () => void; icon?: string
}) {
  return (
    <div
      className={`card ${bg || ''}`}
      style={{ 
        cursor: onClick ? 'pointer' : 'default',
        flex: 1,
        minWidth: 0,
        transition: 'transform 0.15s, box-shadow 0.15s',
        color: color,
      }}
      onClick={onClick}
      onMouseEnter={e => onClick && ((e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)')}
      onMouseLeave={e => onClick && ((e.currentTarget as HTMLElement).style.transform = '')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="metric-number">{value}</div>
          <div className="metric-label" style={{ color: color ? `${color}99` : undefined }}>{title}</div>
          {sub && <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>{sub}</div>}
        </div>
        {icon && <div style={{ fontSize: 28, opacity: 0.7 }}>{icon}</div>}
      </div>
    </div>
  )
}

function LeaderboardCard({ data }: { data: ReturnType<typeof getDashboardMetrics>['leaderboard'] }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Team Leaderboard</div>
      {data.map((m, i) => (
        <div key={m.name} className="leaderboard-item">
          <div style={{ 
            width: 24, height: 24, 
            background: i === 0 ? '#D9F56B' : i === 1 ? '#E8E8E8' : '#F5F5F5',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}>
            {i + 1}
          </div>
          <div className="avatar" style={{ background: m.color, color: '#0B0B0B', fontSize: 11, overflow: 'hidden' }}>
            {getAvatar(m.name) ? (
              <img src={getAvatar(m.name)} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              getInitials(m.name)
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
            <div style={{ fontSize: 11, color: '#888' }}>
              {m.calls} calls · {m.connected} connected · {m.meetings} mtg
            </div>
          </div>
          <div style={{ 
            fontSize: 16, fontWeight: 800, 
            color: i === 0 ? '#0B0B0B' : '#888',
          }}>
            {m.calls}
          </div>
        </div>
      ))}
      {data.length === 0 && (
        <div className="empty-state" style={{ padding: '20px 0' }}>
          <div>No calls logged yet</div>
        </div>
      )}
    </div>
  )
}

export default function DashboardPage({ user, onNavigate }: { user: AppUser; onNavigate: (p: NavPage) => void }) {
  const [period, setPeriod] = useState<7 | 14 | 30>(7)
  const [metrics, setMetrics] = useState<ReturnType<typeof getDashboardMetrics> | null>(null)
  const [tasks, setTasks] = useState<ReturnType<typeof getTasks>>([])
  const [notes, setNotes] = useState<ReturnType<typeof getNotes>>([])

  useEffect(() => {
    const m = getDashboardMetrics(user.id, period)
    setMetrics(m)
    setTasks(getTasks(user.id).filter(t => t.status !== 'done').slice(0, 5))
    setNotes(getNotes(user.id).slice(0, 4))
  }, [user.id, period])

  const outcomeChartData = useMemo(() => {
    if (!metrics) return []
    return Object.entries(metrics.outcomeBreakdown)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: k.replace('Not Reachable / Out of Service', 'Unreachable').replace('Already Handled Internally', 'Internal'), value: v }))
  }, [metrics])

  if (!metrics) return <div className="empty-state"><div className="spinner" /></div>

  const todayStr = new Date().toISOString().split('T')[0]

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
        <div style={{ display: 'flex', gap: 12 }}>
          <StatCard title="Calls today (me)" value={metrics.callsToday} icon="📞" />
          <StatCard title="Team calls today" value={metrics.teamCallsToday} icon="👥" />
          <StatCard 
            title="Follow-ups due" 
            value={metrics.followUpsDueToday} 
            sub={`${metrics.followUpsOverdue} overdue`}
            bg={metrics.followUpsDueToday > 0 ? 'card-peach' : ''}
            icon="⏰"
            onClick={() => onNavigate('calling')}
          />
          <StatCard 
            title="Meetings this week" 
            value={metrics.meetingsThisWeek}
            bg={metrics.meetingsThisWeek > 0 ? 'card-lime' : ''}
            icon="🤝"
            onClick={() => onNavigate('calendar')}
          />
          <StatCard
            title={`Conversion rate (${period}d)`}
            value={`${metrics.conversionRate}%`}
            bg={metrics.conversionRate > 20 ? 'card-lime' : ''}
            icon="📈"
          />
        </div>

        {/* Row 2: Charts */}
        <div style={{ display: 'flex', gap: 16 }}>
          {/* Daily calls chart */}
          <div className="card" style={{ flex: 2, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Daily Calls (last 7 days)</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#888' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#0B0B0B', display: 'inline-block' }} />
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
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ borderRadius: 12, border: '1px solid #F0F0F0', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
                  cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                />
                <Bar dataKey="calls" fill="#0B0B0B" radius={[6, 6, 0, 0]} />
                <Bar dataKey="conversions" fill="#D9F56B" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Outcome donut */}
          <div className="card" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Outcome Breakdown</div>
            {outcomeChartData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie
                      data={outcomeChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={58}
                      paddingAngle={2}
                      dataKey="value"
                    >
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
                      <span style={{ color: '#555', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                      <span style={{ fontWeight: 700 }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state" style={{ padding: '20px 0', fontSize: 12 }}>
                No calls logged yet
              </div>
            )}
          </div>
        </div>

        {/* Row 3: Leaderboard + Tasks + Notes */}
        <div style={{ display: 'flex', gap: 16 }}>
          {/* Leaderboard */}
          <LeaderboardCard data={metrics.leaderboard} />

          {/* Today's tasks */}
          <div className="card" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>My Tasks</div>
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('tasks')}>View all →</button>
            </div>
            {tasks.length > 0 ? tasks.map(task => (
              <div key={task.id} style={{ 
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 0', borderBottom: '1px solid #F7F7F7',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                  background: task.priority === 'high' ? '#DC2626' : task.priority === 'medium' ? '#D97706' : '#16A34A',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                  {task.due_at && (
                    <div style={{ fontSize: 11, color: new Date(task.due_at) < new Date() ? '#DC2626' : '#888' }}>
                      Due {format(new Date(task.due_at), 'dd MMM')}
                    </div>
                  )}
                </div>
                <span className={`badge ${task.status === 'todo' ? 'badge-gray' : 'badge-blue'}`}>{task.status}</span>
              </div>
            )) : (
              <div className="empty-state" style={{ padding: '20px 0', fontSize: 12 }}>
                🎉 No pending tasks
              </div>
            )}
          </div>

          {/* Recent notes */}
          <div className="card" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Last Notes</div>
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('notes')}>View all →</button>
            </div>
            {notes.length > 0 ? notes.map(note => (
              <div key={note.id} style={{ 
                padding: '8px 0', borderBottom: '1px solid #F7F7F7',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {note.pinned && <span style={{ fontSize: 12 }}>📌</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {note.title || 'Untitled note'}
                  </div>
                  <div style={{ fontSize: 11, color: '#888' }}>
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
