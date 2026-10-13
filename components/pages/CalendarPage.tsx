import { useState, useEffect, useCallback } from 'react'
import type { AppUser } from '@/lib/store'
import { getEvents, addEvent, updateEvent, deleteEvent, getTasks } from '@/lib/store'
import type { CalendarEvent, Task } from '@/lib/types'
import { 
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, 
  eachDayOfInterval, addMonths, subMonths, isSameMonth, isToday, 
  isSameDay 
} from 'date-fns'
import {
  isGoogleCalendarAvailable,
  isGoogleCalendarConnected,
  connectGoogleCalendar,
  createGoogleCalendarEvent,
  disconnectGoogleCalendar,
  syncGoogleCalendar,
  getGoogleClientId,
  setGoogleClientId,
} from '@/lib/google-calendar'
import toast from 'react-hot-toast'
import { 
  Calendar as CalendarIcon, RefreshCw, Video, ExternalLink, 
  Settings, Check, X, Plus, ChevronLeft, ChevronRight, Trash2
} from 'lucide-react'

const EVENT_COLORS: Record<string, { bg: string; text: string }> = {
  meeting: { bg: '#D9F56B', text: '#0B0B0B' },
  'follow-up': { bg: '#E8894F', text: 'white' },
  other: { bg: 'var(--text)', text: 'var(--bg)' },
  task: { bg: '#C4B5FD', text: '#1E1B4B' },
}

export default function CalendarPage({ user }: { user: AppUser }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [newEventTitle, setNewEventTitle] = useState('')
  const [newEventType, setNewEventType] = useState<'meeting' | 'follow-up' | 'other'>('meeting')
  const [newEventDate, setNewEventDate] = useState('')
  const [newEventTime, setNewEventTime] = useState('10:00')
  const [newEventEndTime, setNewEventEndTime] = useState('11:00')
  const [createMeetLink, setCreateMeetLink] = useState(true)

  // Google Calendar integration states
  const [gcalConnected, setGcalConnected] = useState(isGoogleCalendarConnected())
  const [syncingGcal, setSyncingGcal] = useState(false)
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [clientIdInput, setClientIdInput] = useState(getGoogleClientId())

  const loadCalendarData = useCallback(() => {
    setEvents(getEvents())
    setTasks(getTasks())
  }, [])

  useEffect(() => {
    loadCalendarData()
    window.addEventListener('gc:data-changed', loadCalendarData)
    return () => window.removeEventListener('gc:data-changed', loadCalendarData)
  }, [loadCalendarData])

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

  // Connect Google Calendar
  const handleConnectGcal = async () => {
    if (!isGoogleCalendarAvailable()) {
      setShowConfigModal(true)
      return
    }
    const { error } = await connectGoogleCalendar()
    if (error) {
      toast.error(error)
    } else {
      setGcalConnected(true)
      toast.success('Google Calendar connected!')
      // Automatically sync on initial connection
      handleSyncGcal()
    }
  }

  // Disconnect Google Calendar
  const handleDisconnectGcal = () => {
    disconnectGoogleCalendar()
    setGcalConnected(false)
    toast.success('Google Calendar disconnected')
  }

  // Sync Google Calendar events into local calendar
  const handleSyncGcal = async () => {
    if (!isGoogleCalendarConnected()) {
      const { error } = await connectGoogleCalendar()
      if (error) {
        toast.error(error)
        return
      }
      setGcalConnected(true)
    }

    setSyncingGcal(true)
    try {
      const { importedCount, error } = await syncGoogleCalendar(user.id)
      if (error) {
        toast.error(`Sync error: ${error}`)
      } else {
        toast.success(`Google Calendar synced (${importedCount} new events)`)
        loadCalendarData()
      }
    } finally {
      setSyncingGcal(false)
    }
  }

  // Save Google OAuth Client ID
  const handleSaveClientId = (e: React.FormEvent) => {
    e.preventDefault()
    setGoogleClientId(clientIdInput.trim())
    setShowConfigModal(false)
    toast.success('Google Client ID saved!')
    if (clientIdInput.trim()) {
      handleConnectGcal()
    }
  }

  // Create Event
  const handleAddEvent = async () => {
    if (!newEventTitle || !newEventDate) return
    setCreatingEvent(true)

    let meetLink: string | undefined
    let gcalId: string | undefined
    let gcalHtmlLink: string | undefined

    // Create Google Calendar event with Google Meet if requested
    if (createMeetLink && isGoogleCalendarAvailable()) {
      const startISO = `${newEventDate}T${newEventTime}:00`
      const endISO = `${newEventDate}T${newEventEndTime}:00`
      const { event: gcalEvent, error } = await createGoogleCalendarEvent({
        title: newEventTitle,
        startISO,
        endISO,
        createMeet: true,
      })

      if (error) {
        toast.error(`Google Calendar: ${error}`)
      } else if (gcalEvent) {
        meetLink = gcalEvent.hangoutLink
        gcalId = gcalEvent.id
        gcalHtmlLink = gcalEvent.htmlLink
        setGcalConnected(true)
        toast.success('Google Calendar event & Meet link created!')
      }
    }

    // Save locally
    addEvent({
      title: newEventTitle,
      start: `${newEventDate}T${newEventTime}:00`,
      end: `${newEventDate}T${newEventEndTime}:00`,
      type: newEventType,
      owner_id: user.id,
      meet_link: meetLink,
      gcal_id: gcalId,
      gcal_html_link: gcalHtmlLink,
    })

    loadCalendarData()
    setShowAddModal(false)
    setNewEventTitle('')
    setNewEventDate('')
    setNewEventTime('10:00')
    setNewEventEndTime('11:00')
    setCreatingEvent(false)
  }

  const handleDeleteEvent = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    deleteEvent(id)
    loadCalendarData()
    toast.success('Event removed')
  }

  // Selected day events
  const selectedDayData = selectedDate ? getEventsForDay(selectedDate) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="page-header-left">
          <div className="greeting" style={{ fontSize: 18 }}>Calendar</div>
          <div className="greeting-sub">{format(currentDate, 'MMMM yyyy')} • Google Calendar Integrated</div>
        </div>

        <div className="header-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
          {/* Google Calendar Controls */}
          {gcalConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '4px 10px', borderRadius: 20 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#22C55E', display: 'inline-block' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#15803D' }}>Google Calendar</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleSyncGcal}
                disabled={syncingGcal}
                style={{ fontSize: 11, padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 4, height: 24 }}
                title="Sync latest meetings from Google Calendar"
              >
                <RefreshCw size={11} className={syncingGcal ? 'animate-spin' : ''} />
                <span>{syncingGcal ? 'Syncing...' : 'Sync'}</span>
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleDisconnectGcal}
                style={{ fontSize: 10, padding: '2px 6px', color: '#888', height: 24 }}
                title="Disconnect Google Calendar"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                className="btn btn-lime btn-sm"
                onClick={handleConnectGcal}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                title="Connect with Google Calendar"
              >
                <CalendarIcon size={13} />
                <span>Connect Google Calendar</span>
              </button>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => {
                  setClientIdInput(getGoogleClientId())
                  setShowConfigModal(true)
                }}
                title="Google OAuth Settings"
                style={{ width: 32, height: 32 }}
              >
                <Settings size={14} />
              </button>
            </div>
          )}

          {/* Navigation & Add Event */}
          <button className="btn btn-ghost btn-sm" onClick={() => setCurrentDate(new Date())}>Today</button>
          <button className="btn btn-ghost btn-icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))} aria-label="Next month">
            <ChevronRight size={16} />
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setNewEventDate(format(selectedDate || new Date(), 'yyyy-MM-dd'))
              setShowAddModal(true)
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} />
            <span>Add Event</span>
          </button>
        </div>
      </div>

      {/* Legend & Sync Status */}
      <div style={{ padding: '8px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { type: 'meeting', label: 'Meeting' },
            { type: 'follow-up', label: 'Follow-up' },
            { type: 'other', label: 'Other' },
            { type: 'task', label: 'Task due' },
          ].map(({ type, label }) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: EVENT_COLORS[type]?.bg || '#AAA' }} />
              {label}
            </div>
          ))}
        </div>

        {gcalConnected && (
          <div style={{ fontSize: 11, color: '#15803D', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Check size={12} />
            <span>Google Calendar 2-Way Sync Active</span>
          </div>
        )}
      </div>

      {/* Calendar Grid + Day Sidebar */}
      <div className="calendar-body-layout">
        {/* Calendar grid */}
        <div style={{ flex: 1, padding: 14, minWidth: 0 }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0' }}>
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
                    border: isSelected ? '2px solid var(--lime)' : '1px solid transparent',
                    background: todayDay ? '#D9F56B' : isSelected ? 'var(--hover-bg)' : undefined,
                    cursor: 'pointer',
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
                      style={{
                        background: EVENT_COLORS[ev.type]?.bg,
                        color: EVENT_COLORS[ev.type]?.text,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={`${ev.title}${ev.meet_link ? ' (Google Meet)' : ''}`}
                    >
                      {ev.meet_link && <Video size={10} style={{ flexShrink: 0 }} />}
                      <span>{ev.title}</span>
                    </div>
                  ))}
                  {dayTasks.slice(0, 1).map(t => (
                    <div key={t.id} className="cal-event" style={{ background: EVENT_COLORS.task.bg, color: EVENT_COLORS.task.text }}>
                      ✓ {t.title}
                    </div>
                  ))}
                  {(dayEvents.length + dayTasks.length) > 3 && (
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                      +{dayEvents.length + dayTasks.length - 2} more
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Selected Day Sidebar */}
        {selectedDate && (
          <div className="calendar-day-sidebar">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {format(selectedDate, 'EEEE, dd MMMM')}
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setNewEventDate(format(selectedDate, 'yyyy-MM-dd'))
                  setShowAddModal(true)
                }}
                style={{ fontSize: 11, padding: '3px 8px' }}
              >
                + Add
              </button>
            </div>

            {selectedDayData && (selectedDayData.events.length > 0 || selectedDayData.tasks.length > 0) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selectedDayData.events.map(ev => (
                  <div
                    key={ev.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      background: EVENT_COLORS[ev.type]?.bg,
                      color: EVENT_COLORS[ev.type]?.text,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{ev.title}</div>
                      <button
                        onClick={(e) => handleDeleteEvent(ev.id, e)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, padding: 2 }}
                        title="Delete event"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>
                      {ev.start.includes('T') ? format(new Date(ev.start), 'hh:mm a') : 'All day'}
                      {ev.end && ev.end.includes('T') ? ` - ${format(new Date(ev.end), 'hh:mm a')}` : ''}
                    </div>

                    {/* Google Meet Link */}
                    {ev.meet_link && (
                      <div style={{ marginTop: 8 }}>
                        <a
                          href={ev.meet_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '4px 10px',
                            borderRadius: 6,
                            backgroundColor: '#0B0B0B',
                            color: '#FFFFFF',
                            textDecoration: 'none',
                          }}
                        >
                          <Video size={12} color="#D9F56B" />
                          <span>Join Google Meet</span>
                        </a>
                      </div>
                    )}

                    {/* Google Calendar Link */}
                    {ev.gcal_html_link && (
                      <div style={{ marginTop: 6 }}>
                        <a
                          href={ev.gcal_html_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 10,
                            opacity: 0.8,
                            color: 'inherit',
                            textDecoration: 'underline',
                          }}
                        >
                          <ExternalLink size={10} />
                          <span>Open in Google Calendar</span>
                        </a>
                      </div>
                    )}
                  </div>
                ))}

                {selectedDayData.tasks.map(t => (
                  <div
                    key={t.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      background: EVENT_COLORS.task.bg,
                      color: EVENT_COLORS.task.text,
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>✓ {t.title}</div>
                    <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>Task due</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                <CalendarIcon size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <div style={{ fontSize: 12 }}>No events or tasks scheduled for this day</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Event Modal */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            style={{
              background: 'var(--surface-1, #FFFFFF)',
              color: 'var(--text, #111111)',
              borderRadius: 16,
              width: '100%',
              maxWidth: 440,
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              border: '1px solid var(--border)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Schedule Event / Meeting</div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Title *
                </label>
                <input
                  className="input"
                  value={newEventTitle}
                  onChange={e => setNewEventTitle(e.target.value)}
                  placeholder="e.g. Sales Demo Call with Acme Corp"
                  autoFocus
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Type
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['meeting', 'follow-up', 'other'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setNewEventType(t)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: '2px solid',
                        borderColor: newEventType === t ? 'var(--lime)' : 'var(--border)',
                        background: newEventType === t ? 'var(--lime)' : 'transparent',
                        color: newEventType === t ? '#0B0B0B' : 'var(--text-muted)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                    Date
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={newEventDate}
                    onChange={e => setNewEventDate(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                    Start
                  </label>
                  <input
                    type="time"
                    className="input"
                    value={newEventTime}
                    onChange={e => setNewEventTime(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                    End
                  </label>
                  <input
                    type="time"
                    className="input"
                    value={newEventEndTime}
                    onChange={e => setNewEventEndTime(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Google Calendar & Meet Sync Checkbox */}
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--hover-bg, #F9FAFB)', border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={createMeetLink}
                    onChange={e => setCreateMeetLink(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#D9F56B' }}
                  />
                  <span>Sync to Google Calendar & generate Google Meet link</span>
                </label>
                {!isGoogleCalendarAvailable() && (
                  <div style={{ fontSize: 11, color: '#D97706', marginTop: 4, marginLeft: 24 }}>
                    Google Client ID not set yet. Will prompt for settings on save.
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={handleAddEvent}
                  disabled={creatingEvent || !newEventTitle.trim() || !newEventDate}
                >
                  {creatingEvent ? 'Scheduling...' : 'Save Event'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Google OAuth Client ID Configuration Modal */}
      {showConfigModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setShowConfigModal(false)}
        >
          <div
            style={{
              background: 'var(--surface-1, #FFFFFF)',
              color: 'var(--text, #111111)',
              borderRadius: 16,
              width: '100%',
              maxWidth: 480,
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              border: '1px solid var(--border)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Google Calendar Settings</div>
              <button
                onClick={() => setShowConfigModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
              Connect your Google Workspace or Gmail account to sync meetings, calendar appointments, and generate Google Meet video links automatically.
            </p>

            <form onSubmit={handleSaveClientId} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Google OAuth Client ID
                </label>
                <input
                  className="input"
                  placeholder="e.g. 123456789-abc.apps.googleusercontent.com"
                  value={clientIdInput}
                  onChange={e => setClientIdInput(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
                <strong>How to get this:</strong>
                <ol style={{ paddingLeft: 18, margin: '4px 0 0' }}>
                  <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', textDecoration: 'underline' }}>Google Cloud Console Credentials</a></li>
                  <li>Enable <strong>Google Calendar API</strong> in APIs & Services</li>
                  <li>Create OAuth 2.0 Client ID (Web Application)</li>
                  <li>Add Authorized JavaScript origins: <code>{window.location.origin}</code></li>
                </ol>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowConfigModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-lime">
                  Save & Connect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
