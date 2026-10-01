'use client'
import { useState, useEffect } from 'react'
import type { AppUser } from '@/lib/store'
import { getEvents, addEvent, updateEvent, deleteEvent, getTasks } from '@/lib/store'
import type { CalendarEvent, Task } from '@/lib/types'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameMonth, isToday, isSameDay, parseISO } from 'date-fns'

const EVENT_COLORS: Record<string, { bg: string; text: string }> = {
  meeting: { bg: '#D9F56B', text: '#0B0B0B' },
  'follow-up': { bg: '#E8894F', text: 'white' },
  other: { bg: '#0B0B0B', text: 'white' },
  task: { bg: '#C4B5FD', text: '#1E1B4B' },
}

export default function CalendarPage({ user }: { user: AppUser }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<'month' | 'week'>('month')
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newEventTitle, setNewEventTitle] = useState('')
  const [newEventType, setNewEventType] = useState<'meeting' | 'follow-up' | 'other'>('meeting')
  const [newEventDate, setNewEventDate] = useState('')

  useEffect(() => {
    setEvents(getEvents())
    setTasks(getTasks())
  }, [])

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd })

  const getEventsForDay = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd')
    const dayEvents = events.filter(e => e.start.startsWith(dateStr))
    const dayTasks = tasks.filter(t => t.due_at?.startsWith(dateStr) && t.status !== 'done')
    return { events: dayEvents, tasks: dayTasks }
  }

  const handleAddEvent = () => {
    if (!newEventTitle || !newEventDate) return
    addEvent({
      title: newEventTitle,
      start: newEventDate + 'T10:00:00',
      end: newEventDate + 'T11:00:00',
      type: newEventType,
      owner_id: user.id,
    })
    setEvents(getEvents())
    setShowAddModal(false)
    setNewEventTitle('')
    setNewEventDate('')
  }

  // Selected day events
  const selectedDayData = selectedDate ? getEventsForDay(selectedDate) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="greeting" style={{ fontSize: 18 }}>Calendar</div>
          <div className="greeting-sub">{format(currentDate, 'MMMM yyyy')}</div>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setCurrentDate(new Date())}>Today</button>
          <button className="btn btn-ghost btn-icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>‹</button>
          <button className="btn btn-ghost btn-icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>›</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setNewEventDate(format(new Date(), 'yyyy-MM-dd')); setShowAddModal(true) }}>
            + Add Event
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ padding: '6px 24px', borderBottom: '1px solid #F0F0F0', display: 'flex', gap: 16, flexShrink: 0 }}>
        {[
          { type: 'meeting', label: 'Meeting' },
          { type: 'follow-up', label: 'Follow-up' },
          { type: 'other', label: 'Other' },
          { type: 'task', label: 'Task due' },
        ].map(({ type, label }) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#666' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: EVENT_COLORS[type]?.bg || '#AAA' }} />
            {label}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', gap: 0 }}>
        {/* Calendar grid */}
        <div style={{ flex: 1, padding: 16, minWidth: 0 }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#888', padding: '4px 0' }}>
                {d}
              </div>
            ))}
          </div>

          <div className="cal-grid">
            {calDays.map(day => {
              const { events: dayEvents, tasks: dayTasks } = getEventsForDay(day)
              const inMonth = isSameMonth(day, currentDate)
              const todayDay = isToday(day)
              const isSelected = selectedDate && isSameDay(day, selectedDate)

              return (
                <div
                  key={day.toISOString()}
                  className={`cal-cell ${todayDay ? 'today' : ''} ${!inMonth ? 'other-month' : ''}`}
                  style={{ 
                    border: isSelected ? '2px solid #0B0B0B' : '1px solid transparent',
                    background: todayDay ? '#D9F56B' : isSelected ? '#F9F9F9' : undefined,
                  }}
                  onClick={() => setSelectedDate(day)}
                >
                  <div style={{ fontWeight: todayDay ? 800 : 600, fontSize: 13, marginBottom: 4 }}>
                    {format(day, 'd')}
                  </div>
                  {dayEvents.slice(0, 2).map(ev => (
                    <div 
                      key={ev.id}
                      className="cal-event"
                      style={{ background: EVENT_COLORS[ev.type]?.bg, color: EVENT_COLORS[ev.type]?.text }}
                    >
                      {ev.title}
                    </div>
                  ))}
                  {dayTasks.slice(0, 1).map(t => (
                    <div key={t.id} className="cal-event" style={{ background: EVENT_COLORS.task.bg, color: EVENT_COLORS.task.text }}>
                      ✓ {t.title}
                    </div>
                  ))}
                  {(dayEvents.length + dayTasks.length) > 3 && (
                    <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>
                      +{dayEvents.length + dayTasks.length - 2} more
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Day sidebar */}
        {selectedDate && (
          <div style={{ width: 240, borderLeft: '1px solid #F0F0F0', padding: 16, overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
              {format(selectedDate, 'EEEE, dd MMMM')}
            </div>
            
            {selectedDayData && (selectedDayData.events.length > 0 || selectedDayData.tasks.length > 0) ? (
              <>
                {selectedDayData.events.map(ev => (
                  <div key={ev.id} style={{ 
                    padding: '8px 10px', borderRadius: 10, marginBottom: 6,
                    background: EVENT_COLORS[ev.type]?.bg, color: EVENT_COLORS[ev.type]?.text,
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{ev.title}</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>
                      {format(parseISO(ev.start), 'hh:mm a')}
                    </div>
                  </div>
                ))}
                {selectedDayData.tasks.map(t => (
                  <div key={t.id} style={{ 
                    padding: '8px 10px', borderRadius: 10, marginBottom: 6,
                    background: '#F3F4F6', color: '#374151',
                    border: '1px solid #E5E7EB',
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>✓ {t.title}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>Task · {t.assignee_name}</div>
                  </div>
                ))}
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#AAA', textAlign: 'center', padding: '20px 0' }}>
                Nothing scheduled
                <div style={{ marginTop: 8 }}>
                  <button 
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setNewEventDate(format(selectedDate, 'yyyy-MM-dd')); setShowAddModal(true) }}
                  >
                    + Add event
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Event Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal animate-fade-in" onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Add Event</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Title</label>
              <input className="input" value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} placeholder="Event title" autoFocus />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Type</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['meeting', 'follow-up', 'other'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setNewEventType(t)}
                    style={{
                      padding: '6px 14px', borderRadius: 8, border: '2px solid',
                      borderColor: newEventType === t ? '#0B0B0B' : '#E8E8E8',
                      background: newEventType === t ? '#0B0B0B' : 'transparent',
                      color: newEventType === t ? 'white' : '#555',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Date</label>
              <input type="date" className="input" value={newEventDate} onChange={e => setNewEventDate(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleAddEvent}>Add Event</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
