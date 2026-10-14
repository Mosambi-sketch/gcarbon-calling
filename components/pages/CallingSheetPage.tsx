import { syncLeadToExcel, downloadLiveExcelFile, deleteLeadFromExcel } from '@/lib/excel-live-sync'
'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { AppUser } from '@/lib/store'
import {
  getCompanies, getContacts, getCallLogs, getLists, addCallLog, addCompany, addContact,
  addTask, addEvent, getUserByName, getUserById, getUsers,
  updateCompany, updateContact, updateCallLog, deleteCompany
} from '@/lib/store'
import type { Company, Contact, CallLog, OutcomeType, LeadLock } from '@/lib/types'
import { OUTCOMES, getStatusColor, getInitials, getAvatarColor, getAvatar } from '@/lib/types'
import { format, addDays, isToday, isPast } from 'date-fns'
import LogCallDrawer from '../LogCallDrawer'
import toast from 'react-hot-toast'
import { syncFromSupabase } from '@/lib/db'
import { acquireLeadLock, releaseLeadLock, fetchActiveLocks } from '@/lib/workspace-db'
import { Phone, MessageSquare, LayoutGrid, Table as TableIcon } from 'lucide-react'

interface Row {
  company: Company
  primaryContact?: Contact
  lastLog?: CallLog
}

function getStatusBg(status: string) {
  switch (status) {
    case 'Not Called': return '#F3F4F6'
    case 'In Progress': return '#EFF6FF'
    case 'Follow-up Due': return '#FEF3C7'
    case 'Meeting Set': return '#D9F56B'
    case 'Won/Interested': return '#DCFCE7'
    case 'Dead': return '#FEE2E2'
    default: return '#F3F4F6'
  }
}

function getStatusTextColor(status: string) {
  switch (status) {
    case 'Meeting Set': return '#0B0B0B'
    case 'Won/Interested': return '#15803D'
    case 'Dead': return '#DC2626'
    case 'Follow-up Due': return '#B45309'
    case 'In Progress': return '#1D4ED8'
    default: return '#6B7280'
  }
}

// ── Inline Editable Cell ────────────────────────────────────────────────
function EditableCell({
  value,
  onSave,
  style,
  placeholder = '—',
  type = 'text',
}: {
  value: string
  onSave: (val: string) => void
  style?: React.CSSProperties
  placeholder?: string
  type?: 'text' | 'tel'
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (editing) {
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
    }
  }, [editing])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed !== value) {
      onSave(trimmed)
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <div onClick={e => e.stopPropagation()} style={{ width: '100%' }}>
        <input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
          style={{
            width: '100%',
            fontSize: 12,
            fontWeight: 500,
            padding: '4px 8px',
            border: '1.5px solid #0B0B0B',
            borderRadius: 6,
            outline: 'none',
            background: '#FAFFF0',
            boxShadow: '0 0 0 3px rgba(217,245,107,0.3)',
            fontFamily: 'inherit',
            ...style,
          }}
        />
      </div>
    )
  }

  return (
    <div
      onClick={e => {
        e.stopPropagation()
        setEditing(true)
      }}
      onTouchEnd={e => {
        e.stopPropagation()
        setEditing(true)
      }}
      title="Touch or click to edit"
      style={{
        fontSize: 12,
        color: value ? '#111827' : '#9CA3AF',
        cursor: 'pointer',
        padding: '3px 6px',
        borderRadius: 6,
        minHeight: 24,
        display: 'inline-flex',
        alignItems: 'center',
        transition: 'all 0.15s ease',
        border: '1px solid transparent',
        ...style,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = '#F3F4F6'
        e.currentTarget.style.borderColor = '#D9F56B'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.borderColor = 'transparent'
      }}
    >
      {value || <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>{placeholder}</span>}
    </div>
  )
}

// ── Status Dropdown ─────────────────────────────────────────────────────
const ALL_STATUSES = ['Not Called', 'In Progress', 'Follow-up Due', 'Meeting Set', 'Won/Interested', 'Dead']

function StatusCell({
  status,
  onSave,
}: {
  status: string
  onSave: (val: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <span
        onClick={e => { e.stopPropagation(); setOpen(!open) }}
        title="Click to change status"
        style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
          background: getStatusBg(status),
          color: getStatusTextColor(status),
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          border: '1px solid transparent',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#D9F56B' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent' }}
      >
        {status}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ marginLeft: 4 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: '#fff', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
          border: '1px solid #E5E5E5', zIndex: 100, minWidth: 160, padding: 4,
          animation: 'fadeIn 0.12s ease',
        }}>
          {ALL_STATUSES.map(s => (
            <div
              key={s}
              onClick={e => { e.stopPropagation(); onSave(s); setOpen(false) }}
              style={{
                padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8,
                background: s === status ? '#F5F5F5' : 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F0F0F0' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = s === status ? '#F5F5F5' : 'transparent' }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: getStatusTextColor(s),
                flexShrink: 0,
              }} />
              <span style={{ color: getStatusTextColor(s) }}>{s}</span>
              {s === status && <span style={{ marginLeft: 'auto', color: '#16A34A', fontSize: 14 }}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


const TEAM_CALLERS = [
  'Ankesh', 'Kunal', 'Aadarsh', 'Himanshi', 'Pranita', 'Tamanna', 'Naresh', 'Ajinkya', 'Anupam Sir', 'Aprmay Sir'
]

function CallerCell({
  caller,
  onSave,
}: {
  caller?: string
  onSave: (val: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setSearch('')
      return
    }
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    setTimeout(() => inputRef.current?.focus(), 50)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const isValidCaller = Boolean(
    caller &&
    !caller.toLowerCase().includes('reference') &&
    caller.toLowerCase() !== 'caller' &&
    caller.trim().length > 0
  )

  const filteredTeam = TEAM_CALLERS.filter(c => 
    c.toLowerCase().includes(search.toLowerCase())
  )

  const isCustomMatch = search.trim() && !TEAM_CALLERS.some(c => c.toLowerCase() === search.trim().toLowerCase())

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <span
        onClick={() => setOpen(!open)}
        title="Touch or click to assign caller"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500,
          cursor: 'pointer', transition: 'all 0.15s ease',
          background: isValidCaller ? '#F8FAFC' : 'transparent',
          border: isValidCaller ? '1px solid #E2E8F0' : '1px dashed #CBD5E1',
          maxWidth: 130,
        }}
        onMouseEnter={e => { 
          (e.currentTarget as HTMLElement).style.background = '#F1F5F9'; 
          (e.currentTarget as HTMLElement).style.borderColor = '#D9F56B' 
        }}
        onMouseLeave={e => { 
          (e.currentTarget as HTMLElement).style.background = isValidCaller ? '#F8FAFC' : 'transparent'; 
          (e.currentTarget as HTMLElement).style.borderColor = isValidCaller ? '#E2E8F0' : '1px dashed #CBD5E1' 
        }}
      >
        {isValidCaller ? (
          <>
            {getAvatar(caller!) ? (
              <img
                src={getAvatar(caller!)}
                alt={caller}
                style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', border: '1px solid #E2E8F0', flexShrink: 0 }}
              />
            ) : (
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: getAvatarColor(caller!),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontWeight: 700, color: '#0B0B0B', flexShrink: 0
              }}>
                {getInitials(caller!)}
              </div>
            )}
            <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {caller}
            </span>
          </>
        ) : (
          <span style={{ color: '#94A3B8', fontSize: 11, fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <span>+</span> Assign
          </span>
        )}
      </span>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: '#FFFFFF', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
          border: '1px solid #E2E8F0', zIndex: 120, minWidth: 190, padding: 6,
          animation: 'fadeIn 0.12s ease',
        }}>
          {/* Search or custom caller input */}
          <div style={{ marginBottom: 6, padding: '2px 4px' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Filter or type caller..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && search.trim()) {
                  onSave(search.trim())
                  setOpen(false)
                } else if (e.key === 'Escape') {
                  setOpen(false)
                }
              }}
              style={{
                width: '100%', fontSize: 11, padding: '4px 8px',
                border: '1px solid #CBD5E1', borderRadius: 6, outline: 'none',
                background: '#F8FAFC', fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {/* Clear option */}
            <div
              onClick={() => { onSave(''); setOpen(false) }}
              style={{
                padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                fontSize: 11, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 6,
                marginBottom: 4, background: '#FEF2F2'
              }}
            >
              <span>✕</span>
              <span>Unassign caller</span>
            </div>

            {/* Custom entered name option */}
            {isCustomMatch && (
              <div
                onClick={() => { onSave(search.trim()); setOpen(false) }}
                style={{
                  padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, color: '#0B0B0B',
                  background: '#D9F56B', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <span>✓</span>
                <span>Assign as "{search.trim()}"</span>
              </div>
            )}

            {/* Team callers */}
            {filteredTeam.map(c => {
              const isSelected = isValidCaller && c.toLowerCase() === (caller || '').toLowerCase()
              return (
                <div
                  key={c}
                  onClick={() => {
                    onSave(c)
                    setOpen(false)
                  }}
                  style={{
                    padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                    fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8,
                    background: isSelected ? '#F1F5F9' : 'transparent',
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F8FAFC' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? '#F1F5F9' : 'transparent' }}
                >
                  {getAvatar(c) ? (
                    <img src={getAvatar(c)} alt={c} style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: getAvatarColor(c), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700 }}>
                      {getInitials(c)}
                    </div>
                  )}
                  <span>{c}</span>
                  {isSelected && <span style={{ marginLeft: 'auto', color: '#16A34A', fontSize: 13, fontWeight: 700 }}>✓</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function CallingSheetPage({ user }: { user: AppUser }) {
  const [listId, setListId] = useState('all')
  const [rows, setRows] = useState<Row[]>([])
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCaller, setFilterCaller] = useState('')
  const [filterFollowUp, setFilterFollowUp] = useState('')
  const [queueTab, setQueueTab] = useState<'all' | 'mine' | 'fresh'>('all')
  const [activeLocks, setActiveLocks] = useState<Record<string, LeadLock>>({})
  const [selectedRow, setSelectedRow] = useState<Row | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lists, setLists] = useState(getLists())
  const [users, setUsers] = useState(getUsers())
  const [loading, setLoading] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)

  // Periodically poll active locks so all 7-10 callers see live presence
  useEffect(() => {
    let mounted = true
    const checkLocks = async () => {
      try {
        const locks = await fetchActiveLocks()
        if (mounted) setActiveLocks(locks || {})
      } catch {}
    }
    checkLocks()
    const timer = setInterval(checkLocks, 10000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  const openRowDrawer = useCallback((row: Row) => {
    const lock = activeLocks[row.company.id]
    if (lock && lock.user_id !== user.id) {
      toast(`${lock.user_name} is currently viewing/calling this company.`, {
        icon: '🔒',
        duration: 3000,
      })
    }
    setSelectedRow(row)
    setDrawerOpen(true)
    acquireLeadLock(row.company.id, { id: user.id, name: user.name, color: user.color }).catch(() => {})
  }, [activeLocks, user])

  const closeRowDrawer = useCallback(() => {
    if (selectedRow?.company?.id) {
      releaseLeadLock(selectedRow.company.id, user.id).catch(() => {})
    }
    setDrawerOpen(false)
  }, [selectedRow, user.id])

  // Mobile-first View mode toggle (Cards for mobile, Table for desktop)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => {
    try {
      const saved = localStorage.getItem('gc_calling_view_mode')
      if (saved === 'cards' || saved === 'table') return saved
      return typeof window !== 'undefined' && window.innerWidth < 768 ? 'cards' : 'table'
    } catch {
      return 'table'
    }
  })

  const handleToggleViewMode = (mode: 'cards' | 'table') => {
    setViewMode(mode)
    try {
      localStorage.setItem('gc_calling_view_mode', mode)
    } catch {}
  }

  const handleOpenWhatsApp = (phone: string, companyName: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone
    const text = encodeURIComponent(`Hello, connecting regarding ${companyName} from Gcarbon.`)
    window.open(`https://wa.me/${fullPhone}?text=${text}`, '_blank', 'noopener,noreferrer')
  }

  // Add Company modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newCompany, setNewCompany] = useState({
    name: '', contactName: '', phone: '', designation: '',
    sector: '', location: '', listId: 'connection-list',
  })
  const [addingSaving, setAddingSaving] = useState(false)
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // SharePoint Live Continuous Sync State
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncedText, setLastSyncedText] = useState('Continuous active')
  const [sharePointUrl, setSharePointUrl] = useState(
    'https://sbupune-my.sharepoint.com/:x:/g/personal/pranita_bba2403084_sbup_edu_in/IQBFjWY_vTVNQq-lYSE-oyz1AV8QWYOnL7f13UUt8koDqtk?e=wCEXaW'
  )
  const [showSharePointModal, setShowSharePointModal] = useState(false)
  const [customUrlInput, setCustomUrlInput] = useState(
    'https://sbupune-my.sharepoint.com/:x:/g/personal/pranita_bba2403084_sbup_edu_in/IQBFjWY_vTVNQq-lYSE-oyz1AV8QWYOnL7f13UUt8koDqtk?e=wCEXaW'
  )

  const loadData = useCallback(() => {
    setLoading(true)
    const companies = getCompanies(listId === 'all' ? undefined : listId)
    const contacts = getContacts()
    const callLogs = getCallLogs()
    
    const contactsByCompany: Record<string, Contact[]> = {}
    for (const c of contacts) {
      if (!contactsByCompany[c.company_id]) contactsByCompany[c.company_id] = []
      contactsByCompany[c.company_id].push(c)
    }

    const logsByCompany: Record<string, CallLog[]> = {}
    for (const l of callLogs) {
      if (!logsByCompany[l.company_id]) logsByCompany[l.company_id] = []
      logsByCompany[l.company_id].push(l)
    }

    const built: Row[] = companies.map(company => {
      const compContacts = contactsByCompany[company.id] || []
      const compLogs = (logsByCompany[company.id] || []).sort(
        (a, b) => new Date(b.called_at).getTime() - new Date(a.called_at).getTime()
      )
      return {
        company,
        primaryContact: compContacts.find(c => c.is_primary) || compContacts[0],
        lastLog: compLogs[0],
      }
    })

    setRows(built)
    setLoading(false)
  }, [listId])

  useEffect(() => { loadData() }, [loadData])

  const handleSyncSharePoint = useCallback(async (notify = true) => {
    setIsSyncing(true)
    let toastId = undefined
    if (notify) {
      toastId = toast.loading('Syncing latest updates from SharePoint Excel...')
    }
    try {
      const res = await fetch('/api/sync/sharepoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sharePointUrl }),
      })
      const data = await res.json()
      if (data.success) {
        await syncFromSupabase()
        setLists(getLists())
        loadData()
        const now = new Date()
        setLastSyncedText('Synced ' + format(now, 'h:mm a'))
        if (notify && toastId) {
          toast.success(`Synced live Excel! ${data.totalCompanies || 0} companies updated.`, { id: toastId })
        }
      } else {
        if (notify && toastId) {
          toast.error(data.error || 'SharePoint sync failed', { id: toastId })
        }
      }
    } catch (err) {
      console.warn('SharePoint sync error:', err)
      if (notify && toastId) {
        toast.error('Could not reach backend sync server', { id: toastId })
      }
    } finally {
      setIsSyncing(false)
    }
  }, [sharePointUrl, loadData])

  // Initial check of SharePoint sync metadata
  useEffect(() => {
    fetch('/api/sync/sharepoint')
      .then(r => r.json())
      .then(d => {
        if (d.last_synced) {
          const dt = new Date(d.last_synced)
          setLastSyncedText('Synced ' + format(dt, 'h:mm a'))
        }
        if (d.source_url) {
          setSharePointUrl(d.source_url)
          setCustomUrlInput(d.source_url)
        }
      })
      .catch(() => {})
  }, [])

  // Continuous background auto-sync every 60s, on tab focus, and on gc:data-changed
  useEffect(() => {
    const timer = setInterval(() => {
      handleSyncSharePoint(false)
    }, 60 * 1000)

    const onFocus = () => {
      handleSyncSharePoint(false)
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('gc:data-changed', loadData)

    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('gc:data-changed', loadData)
    }
  }, [handleSyncSharePoint, loadData])

  // Keyboard shortcut: / focuses search, N = next company
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
      if (e.key === '/' && !isInput) {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const filtered = useMemo(() => {
    let result = rows

    if (queueTab === 'mine') {
      const myName = (user?.name || '').toLowerCase()
      result = result.filter(r => 
        (r.company.owner_name && r.company.owner_name.toLowerCase() === myName) ||
        (r.lastLog?.caller_name && r.lastLog.caller_name.toLowerCase() === myName)
      )
    } else if (queueTab === 'fresh') {
      result = result.filter(r => (!r.company.status || r.company.status === 'Not Called') && !r.company.owner_name)
    }

    if (search) {
      const s = search.toLowerCase()
      result = result.filter(r => 
        r.company.name.toLowerCase().includes(s) ||
        r.primaryContact?.name.toLowerCase().includes(s) ||
        r.primaryContact?.phones.some(p => p.includes(s)) ||
        r.lastLog?.remark?.toLowerCase().includes(s)
      )
    }

    if (filterStatus) {
      result = result.filter(r => r.company.status === filterStatus)
    }

    if (filterCaller) {
      const fc = filterCaller.toLowerCase()
      result = result.filter(r => 
        (r.lastLog?.caller_name && r.lastLog.caller_name.toLowerCase() === fc) ||
        (r.company.owner_name && r.company.owner_name.toLowerCase() === fc)
      )
    }

    if (filterFollowUp === 'today') {
      const today = new Date().toISOString().split('T')[0]
      result = result.filter(r => r.lastLog?.follow_up_date === today)
    } else if (filterFollowUp === 'overdue') {
      const today = new Date().toISOString().split('T')[0]
      result = result.filter(r => r.lastLog?.follow_up_date && r.lastLog.follow_up_date < today)
    } else if (filterFollowUp === 'this-week') {
      const now = new Date()
      const weekEnd = addDays(now, 7).toISOString().split('T')[0]
      const today = now.toISOString().split('T')[0]
      result = result.filter(r => 
        r.lastLog?.follow_up_date && 
        r.lastLog.follow_up_date >= today && 
        r.lastLog.follow_up_date <= weekEnd
      )
    }

    return result
  }, [rows, search, filterStatus, filterCaller, filterFollowUp, queueTab, user?.name])

  const myLeadsCount = useMemo(() => {
    const myName = (user?.name || '').toLowerCase()
    return rows.filter(r => 
      (r.company.owner_name && r.company.owner_name.toLowerCase() === myName) ||
      (r.lastLog?.caller_name && r.lastLog.caller_name.toLowerCase() === myName)
    ).length
  }, [rows, user?.name])

  const freshLeadsCount = useMemo(() => {
    return rows.filter(r => (!r.company.status || r.company.status === 'Not Called') && !r.company.owner_name).length
  }, [rows])

  // ── High Performance Pagination (eliminates DOM freeze with 4,000+ companies) ──
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(50)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, filterStatus, filterCaller, filterFollowUp, queueTab])

  const totalPages = pageSize <= 0 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginatedRows = useMemo(() => {
    if (pageSize <= 0) return filtered
    const start = (currentPage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, currentPage, pageSize])

  const handleNextCompany = () => {
    const today = new Date().toISOString().split('T')[0]
    const next = filtered.find(r => 
      r.company.status === 'Not Called' ||
      (r.company.status === 'Follow-up Due' && r.lastLog?.follow_up_date === today)
    )
    if (next) {
      openRowDrawer(next)
    }
  }

  const handleDeleteCompany = useCallback(async () => {
    if (!companyToDelete) return
    setIsDeleting(true)
    const comp = companyToDelete
    try {
      // 1. Delete locally from store
      deleteCompany(comp.id)

      // 2. Delete from Excel file on time
      await deleteLeadFromExcel(comp.list_id, comp.name)

      // 3. Delete from backend DB if available
      fetch(`/api/companies/${comp.id}`, { method: 'DELETE' }).catch(() => {})

      // 4. Close drawer if this company was active
      if (selectedRow?.company.id === comp.id) {
        setSelectedRow(null)
        setDrawerOpen(false)
      }

      setCompanyToDelete(null)
      loadData()
      toast.success(`Deleted "${comp.name}" from CRM & Excel`, { duration: 2500 })
    } catch (err) {
      console.error('Delete company error:', err)
      toast.error('Failed to delete company')
    } finally {
      setIsDeleting(false)
    }
  }, [companyToDelete, selectedRow, loadData])

  const handleLogSaved = () => {
    loadData()
    closeRowDrawer()
  }

  // ── Inline edit handlers ────────────────────────────────────────────
  const handleUpdateCompany = useCallback((companyId: string, field: string, value: string) => {
    updateCompany(companyId, { [field]: value })
    const targetRow = rows.find(r => r.company.id === companyId)
    if (targetRow) {
      syncLeadToExcel(targetRow.company.list_id, targetRow.company.name, {
        [field === 'name' ? 'companyName' : field]: value
      })
    }
    loadData()
    toast.success(`Updated ${field} in CRM & Excel`, { duration: 1500, style: { fontSize: 12 } })
  }, [rows, loadData])

  const handleUpdateContact = useCallback((contactId: string, field: string, value: string) => {
    if (field === 'phones') {
      updateContact(contactId, { phones: value ? [value] : [] })
    } else {
      updateContact(contactId, { [field]: value })
    }
    const targetRow = rows.find(r => r.primaryContact?.id === contactId)
    if (targetRow) {
      syncLeadToExcel(targetRow.company.list_id, targetRow.company.name, {
        [field === 'name' ? 'contactName' : field === 'phones' ? 'phone' : field]: value
      })
    }
    loadData()
    toast.success(`Updated ${field} in CRM & Excel`, { duration: 1500, style: { fontSize: 12 } })
  }, [rows, loadData])

  const handleUpdateCaller = useCallback((companyId: string, callerName: string) => {
    updateCompany(companyId, { owner_name: callerName || undefined })
    const existingLogs = getCallLogs(companyId)
    if (existingLogs.length > 0) {
      updateCallLog(existingLogs[0].id, { caller_name: callerName || '' })
    } else if (callerName) {
      addCallLog({
        company_id: companyId,
        caller_name: callerName,
        outcome: 'Connected - Interested',
        called_at: new Date().toISOString(),
      })
    }
    const targetRow = rows.find(r => r.company.id === companyId)
    if (targetRow) {
      syncLeadToExcel(targetRow.company.list_id, targetRow.company.name, {
        callerName
      })
    }
    loadData()
    toast.success(callerName ? `Assigned to ${callerName} & synced to Excel` : 'Unassigned caller', { duration: 1500, style: { fontSize: 12 } })
  }, [rows, loadData])

  const handleUpdateRemark = useCallback((companyId: string, remark: string) => {
    addCallLog({
      company_id: companyId,
      caller_name: user.name,
      outcome: 'Connected - Interested',
      remark,
      called_at: new Date().toISOString(),
    })
    const targetRow = rows.find(r => r.company.id === companyId)
    if (targetRow) {
      syncLeadToExcel(targetRow.company.list_id, targetRow.company.name, {
        remark,
        callerName: user.name
      })
    }
    loadData()
    toast.success('Updated remark in CRM & Excel', { duration: 1500, style: { fontSize: 12 } })
  }, [user.name, rows, loadData])

  const handleAddContactInline = useCallback((companyId: string, field: string, value: string) => {
    if (!value.trim()) return
    const newContact: any = {
      company_id: companyId,
      name: field === 'name' ? value : 'Contact',
      is_primary: true,
      phones: [],
    }
    if (field === 'phones') newContact.phones = [value]
    if (field === 'designation') newContact.designation = value
    addContact(newContact)
    const targetRow = rows.find(r => r.company.id === companyId)
    if (targetRow) {
      syncLeadToExcel(targetRow.company.list_id, targetRow.company.name, {
        [field === 'name' ? 'contactName' : field === 'phones' ? 'phone' : field]: value
      })
    }
    loadData()
    toast.success('Contact added & synced to Excel', { duration: 1500, style: { fontSize: 12 } })
  }, [rows, loadData])

  const allStatuses = ['Not Called', 'In Progress', 'Follow-up Due', 'Meeting Set', 'Won/Interested', 'Dead']

  const listCounts = useMemo(() => {
    const all = getCompanies()
    const counts: Record<string, number> = { all: all.length }
    for (const c of all) {
      counts[c.list_id] = (counts[c.list_id] || 0) + 1
    }
    return counts
  }, [rows])

  const activeFiltersCount = (search ? 1 : 0) + (filterStatus ? 1 : 0) + (filterCaller ? 1 : 0) + (filterFollowUp ? 1 : 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="page-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="page-header-left">
            <div className="greeting" style={{ fontSize: 18 }}>Calling Sheet</div>
            <div className="greeting-sub">
              {filtered.length} {filtered.length === 1 ? 'company' : 'companies'}
              {activeFiltersCount > 0 ? ` (filtered from ${rows.length})` : ''}
            </div>
          </div>
          <button
            className="btn btn-lime"
            onClick={handleNextCompany}
            title="Keyboard: N"
          >
            ▶ Next to Call
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            + Add Company
          </button>

          {/* Download Live Excel Button */}
          <button
            className="btn btn-outline btn-sm"
            onClick={downloadLiveExcelFile}
            title="Download the live updated Excel workbook with all recent edits"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#FFFFFF',
              border: '1px solid #D1D5DB',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: '#1F2937',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#16A34A'
              e.currentTarget.style.color = '#16A34A'
              e.currentTarget.style.background = '#F0FDF4'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#D1D5DB'
              e.currentTarget.style.color = '#1F2937'
              e.currentTarget.style.background = '#FFFFFF'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Download Live Excel</span>
          </button>

          {/* Live Excel Status Pill */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
            background: '#F0FDF4',
            color: '#16A34A',
            border: '1px solid #BBF7D0',
          }} title="All CRM edits are automatically saved to Excel on time">
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: '#16A34A',
              boxShadow: '0 0 0 2px rgba(22, 163, 74, 0.25)',
            }} />
            <span>Excel live on-time</span>
          </div>

          {/* Live SharePoint Sync Badge & Controls */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 12px',
            borderRadius: 20,
            background: 'var(--surface, #FFFFFF)',
            border: '1px solid var(--border, #E5E7EB)',
            fontSize: 12,
            marginLeft: 'auto',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: isSyncing ? '#F59E0B' : '#10B981',
              boxShadow: isSyncing ? '0 0 8px #F59E0B' : '0 0 8px #10B981',
              transition: 'background 0.2s',
            }} />
            <span style={{ fontWeight: 600, color: 'var(--text, #111827)', fontSize: 12 }}>
              {isSyncing ? 'Syncing SharePoint…' : 'SharePoint Live'}
            </span>
            <span style={{ color: 'var(--text-muted, #6B7280)', fontSize: 11 }}>
              • {lastSyncedText}
            </span>
            <button
              onClick={() => handleSyncSharePoint(true)}
              disabled={isSyncing}
              className="btn btn-ghost btn-sm"
              style={{
                padding: '2px 8px',
                fontSize: 11,
                height: 24,
                borderRadius: 6,
                fontWeight: 600,
                color: '#0B0B0B',
                background: '#F3F4F6'
              }}
              title="Pull latest edits from Pranita's SharePoint Excel"
            >
              {isSyncing ? '⟳ Syncing' : '⚡ Sync Now'}
            </button>
            <button
              onClick={() => setShowSharePointModal(true)}
              className="btn btn-ghost btn-sm"
              style={{
                padding: '2px 6px',
                fontSize: 11,
                height: 24,
                borderRadius: 6,
                color: '#6B7280'
              }}
              title="SharePoint link details"
            >
              ⚙ Source
            </button>
          </div>
        </div>

        {/* Quick Queue Segment: All / My Leads / Fresh Uncalled */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          <button
            type="button"
            onClick={() => setQueueTab('all')}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid',
              borderColor: queueTab === 'all' ? '#0F172A' : '#E2E8F0',
              background: queueTab === 'all' ? '#0F172A' : '#FFFFFF',
              color: queueTab === 'all' ? '#FFFFFF' : '#475569',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              transition: 'all 0.15s ease'
            }}
          >
            <span>📋 All Leads</span>
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: queueTab === 'all' ? 'rgba(255,255,255,0.2)' : '#F1F5F9', color: queueTab === 'all' ? '#FFF' : '#64748B' }}>
              {rows.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setQueueTab('mine')}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid',
              borderColor: queueTab === 'mine' ? '#16A34A' : '#E2E8F0',
              background: queueTab === 'mine' ? '#16A34A' : '#FFFFFF',
              color: queueTab === 'mine' ? '#FFFFFF' : '#166534',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              transition: 'all 0.15s ease'
            }}
          >
            <span>👤 My Leads ({user.name})</span>
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: queueTab === 'mine' ? 'rgba(255,255,255,0.25)' : '#DCFCE7', color: queueTab === 'mine' ? '#FFF' : '#166534', fontWeight: 700 }}>
              {myLeadsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setQueueTab('fresh')}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid',
              borderColor: queueTab === 'fresh' ? '#2563EB' : '#E2E8F0',
              background: queueTab === 'fresh' ? '#2563EB' : '#FFFFFF',
              color: queueTab === 'fresh' ? '#FFFFFF' : '#1E40AF',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              transition: 'all 0.15s ease'
            }}
          >
            <span>⚡ Fresh / Uncalled</span>
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: queueTab === 'fresh' ? 'rgba(255,255,255,0.25)' : '#DBEAFE', color: queueTab === 'fresh' ? '#FFF' : '#1E40AF', fontWeight: 700 }}>
              {freshLeadsCount}
            </span>
          </button>
        </div>

        {/* List tabs */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          <button
            className={`tab-item ${listId === 'all' ? 'active' : ''}`}
            onClick={() => setListId('all')}
            style={{
              background: listId === 'all' ? '#0B0B0B' : undefined,
              color: listId === 'all' ? 'white' : undefined,
              borderRadius: 20,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span>All</span>
            <span style={{
              fontSize: 11,
              padding: '1px 6px',
              borderRadius: 10,
              background: listId === 'all' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
              color: listId === 'all' ? '#fff' : '#666',
              fontWeight: 500
            }}>
              {listCounts['all'] || 0}
            </span>
          </button>
          {lists.map(l => {
            const count = listCounts[l.id] || 0
            const isActive = listId === l.id
            return (
              <button
                key={l.id}
                className={`tab-item ${isActive ? 'active' : ''}`}
                onClick={() => setListId(l.id)}
                style={{
                  borderRadius: 20,
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: isActive ? '#0B0B0B' : undefined,
                  color: isActive ? 'white' : undefined
                }}
              >
                <span>{l.name}</span>
                <span style={{
                  fontSize: 11,
                  padding: '1px 6px',
                  borderRadius: 10,
                  background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                  color: isActive ? '#fff' : '#666',
                  fontWeight: 500
                }}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div className="search-input" style={{ minWidth: 220, maxWidth: 280 }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#AAA" strokeWidth={2}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={searchRef}
            id="calling-search"
            placeholder="Search company, person, phone… (/)"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ color: '#AAA', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
          )}
        </div>

        <div className="select-wrap">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ paddingRight: 28 }}>
            <option value="">All statuses</option>
            {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="select-wrap">
          <select value={filterCaller} onChange={e => setFilterCaller(e.target.value)}>
            <option value="">All callers</option>
            {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select>
        </div>

        <div className="select-wrap">
          <select value={filterFollowUp} onChange={e => setFilterFollowUp(e.target.value)}>
            <option value="">All dates</option>
            <option value="today">Follow-up today</option>
            <option value="overdue">Overdue</option>
            <option value="this-week">This week</option>
          </select>
        </div>

        {activeFiltersCount > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setFilterStatus(''); setFilterCaller(''); setFilterFollowUp(''); setSearch('')
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#DC2626', background: '#FEE2E2', border: '1px solid #FECACA', fontWeight: 500 }}
          >
            <span>✕ Clear filters</span>
            <span style={{ background: '#DC2626', color: '#fff', fontSize: 10, borderRadius: 10, padding: '1px 6px', fontWeight: 600 }}>{activeFiltersCount}</span>
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* View Mode Toggle */}
          <div style={{
            display: 'inline-flex',
            background: 'var(--surface-2, #F3F4F6)',
            padding: 2,
            borderRadius: 8,
            border: '1px solid var(--border, #E5E7EB)'
          }}>
            <button
              type="button"
              onClick={() => handleToggleViewMode('cards')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                background: viewMode === 'cards' ? '#0B0B0B' : 'transparent',
                color: viewMode === 'cards' ? '#FFFFFF' : '#6B7280',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Mobile Cards View (Optimized for Phone Calling)"
            >
              <LayoutGrid size={13} />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleViewMode('table')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                background: viewMode === 'table' ? '#0B0B0B' : 'transparent',
                color: viewMode === 'table' ? '#FFFFFF' : '#6B7280',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Spreadsheet Table View"
            >
              <TableIcon size={13} />
              <span>Table</span>
            </button>
          </div>

          <span title="Touch or click any cell to edit directly" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#F0FFF0', color: '#16A34A', padding: '2px 8px', borderRadius: 6, fontWeight: 600, fontSize: 11 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Editable
          </span>
          <span style={{ fontSize: 11, color: '#AAA', whiteSpace: 'nowrap' }}>
            Press <kbd style={{ background: '#F0F0F0', padding: '1px 5px', borderRadius: 4, fontSize: 10 }}>/</kbd> to search
          </span>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div className="empty-state"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
            <div style={{ fontWeight: 600 }}>No companies found</div>
            <div style={{ fontSize: 13, color: '#888' }}>Try adjusting your filters</div>
          </div>
        ) : viewMode === 'cards' ? (
          <div className="mobile-calling-cards-container">
            {paginatedRows.map(row => {
              const isOverdue = row.lastLog?.follow_up_date && 
                new Date(row.lastLog.follow_up_date) < new Date() &&
                row.lastLog.follow_up_date !== new Date().toISOString().split('T')[0]
              const isDueToday = row.lastLog?.follow_up_date === new Date().toISOString().split('T')[0]
              const phone = row.primaryContact?.phones?.[0] || ''

              return (
                <div
                  key={row.company.id}
                  className={`mobile-calling-card ${isOverdue ? 'overdue-card' : isDueToday ? 'followup-today-card' : row.company.status === 'Meeting Set' ? 'meeting-set-card' : ''}`}
                >
                  {/* Top: Company Name + List & Sector Badges + Status */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        onClick={() => openRowDrawer(row)}
                        style={{
                          fontWeight: 700,
                          fontSize: 16,
                          color: 'var(--text, #111827)',
                          cursor: 'pointer',
                          lineHeight: 1.3,
                          marginBottom: 4,
                          letterSpacing: '-0.01em',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flexWrap: 'wrap'
                        }}
                      >
                        <span>{row.company.name}</span>
                        {activeLocks[row.company.id] && activeLocks[row.company.id].user_id !== user.id && (
                          <span style={{
                            fontSize: 10,
                            padding: '2px 7px',
                            borderRadius: 10,
                            background: '#FEE2E2',
                            color: '#DC2626',
                            border: '1px solid #FECACA',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#DC2626' }} />
                            {activeLocks[row.company.id].user_name} Calling
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#6B7280', background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: 6, fontWeight: 500 }}>
                          {row.company.list_id.replace(/-/g, ' ')}
                        </span>
                        {row.company.sector && (
                          <span style={{ fontSize: 11, color: '#4B5563', background: 'var(--surface-2, #F3F4F6)', padding: '2px 8px', borderRadius: 6 }}>
                            {row.company.sector}
                          </span>
                        )}
                        {row.company.location && (
                          <span style={{ fontSize: 11, color: '#4B5563', background: 'var(--surface-2, #F3F4F6)', padding: '2px 8px', borderRadius: 6 }}>
                            📍 {row.company.location}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Status with quick change dropdown */}
                    <div onClick={e => e.stopPropagation()}>
                      <StatusCell
                        status={row.company.status}
                        onSave={val => handleUpdateCompany(row.company.id, 'status', val)}
                      />
                    </div>
                  </div>

                  {/* Contact person + designation */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--surface-2, #F9FAFB)',
                    borderRadius: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: getAvatarColor(row.primaryContact?.name || 'Contact'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, flexShrink: 0
                      }}>
                        {getInitials(row.primaryContact?.name || 'C')}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text, #111827)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.primaryContact?.name && row.primaryContact.name !== 'Primary Contact' ? row.primaryContact.name : 'No Contact Person'}
                        </div>
                        {row.primaryContact?.designation && (
                          <div style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row.primaryContact.designation}
                          </div>
                        )}
                      </div>
                    </div>
                    {row.company.website && (
                      <a
                        href={row.company.website.startsWith('http') ? row.company.website : `https://${row.company.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 11, color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}
                      >
                        Web ↗
                      </a>
                    )}
                  </div>

                  {/* Primary Calling Bar: High Touch Targets */}
                  {phone ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                      <a
                        href={`tel:${phone}`}
                        onClick={() => openRowDrawer(row)}
                        className="mobile-call-btn"
                        style={{ flex: 2 }}
                        title="1-Tap Call: Initiates phone dialer and opens Log Call notes"
                      >
                        <Phone size={16} />
                        <span>Call {phone}</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => handleOpenWhatsApp(phone, row.company.name)}
                        className="mobile-whatsapp-btn"
                        style={{ flex: 1 }}
                        title="Open WhatsApp chat"
                      >
                        <MessageSquare size={15} />
                        <span>WhatsApp</span>
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      padding: '10px 14px',
                      background: 'rgba(245, 158, 11, 0.1)',
                      color: '#B45309',
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <span>⚠️ No phone number saved for this lead</span>
                    </div>
                  )}

                  {/* Activity: Caller & Follow-up date */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    borderTop: '1px solid var(--border, #F3F4F6)',
                    paddingTop: 10
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#6B7280', fontSize: 11 }}>Caller:</span>
                      <CallerCell
                        caller={row.lastLog?.caller_name || row.company.owner_name}
                        onSave={val => handleUpdateCaller(row.company.id, val)}
                      />
                    </div>

                    {row.lastLog?.follow_up_date ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: isOverdue ? '#DC2626' : isDueToday ? '#D97706' : '#4B5563',
                        background: isOverdue ? 'rgba(220, 38, 38, 0.1)' : isDueToday ? 'rgba(217, 119, 6, 0.1)' : 'var(--surface-2, #F3F4F6)',
                        padding: '3px 8px', borderRadius: 6,
                      }}>
                        {isOverdue ? '⚠ Overdue: ' : isDueToday ? '📅 Today: ' : '📅 '}
                        {format(new Date(row.lastLog.follow_up_date + 'T00:00:00'), 'dd MMM')}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>No follow-up set</span>
                    )}
                  </div>

                  {/* Last remark */}
                  {row.lastLog?.remark && (
                    <div style={{
                      fontSize: 12,
                      color: 'var(--text, #4B5563)',
                      background: 'var(--surface-2, #F8FAFC)',
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontStyle: 'italic',
                      lineHeight: 1.4
                    }}>
                      "{row.lastLog.remark}"
                    </div>
                  )}

                  {/* Card bottom actions */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', paddingTop: 4 }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => openRowDrawer(row)}
                      style={{
                        background: '#0B0B0B',
                        color: '#FFFFFF',
                        borderRadius: 8,
                        padding: '8px 14px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        minHeight: 38,
                        cursor: 'pointer'
                      }}
                    >
                      <span>Open & Log Notes</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompanyToDelete(row.company)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#9CA3AF',
                        padding: '8px 10px',
                        cursor: 'pointer',
                        borderRadius: 6,
                        fontSize: 14
                      }}
                      title="Delete lead"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <table className="data-table" style={{ minWidth: 1200, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ minWidth: 210, maxWidth: 260 }}>Company</th>
                <th style={{ minWidth: 160, maxWidth: 180 }}>Contact person</th>
                <th style={{ minWidth: 120, maxWidth: 140 }}>Designation</th>
                <th style={{ minWidth: 125 }}>Phone</th>
                <th style={{ minWidth: 90 }}>Sector</th>
                <th style={{ minWidth: 90 }}>Location</th>
                <th style={{ width: 45, textAlign: 'center' }}>Ref</th>
                <th style={{ minWidth: 110 }}>Status</th>
                <th style={{ minWidth: 130 }}>Called by</th>
                <th style={{ minWidth: 180, maxWidth: 260 }}>Last remark</th>
                <th style={{ minWidth: 85 }}>Follow-up</th>
                <th style={{ minWidth: 90, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map(row => {
                const isOverdue = row.lastLog?.follow_up_date && 
                  new Date(row.lastLog.follow_up_date) < new Date() &&
                  row.lastLog.follow_up_date !== new Date().toISOString().split('T')[0]
                const isDueToday = row.lastLog?.follow_up_date === new Date().toISOString().split('T')[0]
                
                return (
                  <tr
                    key={row.company.id}
                    className={`${isOverdue ? 'overdue-row' : isDueToday ? 'followup-today-row' : row.company.status === 'Meeting Set' ? 'meeting-set-row' : ''}`}
                    onClick={() => openRowDrawer(row)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Company name — editable */}
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <EditableCell
                          value={row.company.name}
                          onSave={val => handleUpdateCompany(row.company.id, 'name', val)}
                          style={{ fontWeight: 600, fontSize: 13 }}
                        />
                        {activeLocks[row.company.id] && activeLocks[row.company.id].user_id !== user.id && (
                          <span style={{
                            fontSize: 9,
                            padding: '1px 6px',
                            borderRadius: 10,
                            background: '#FEE2E2',
                            color: '#DC2626',
                            border: '1px solid #FECACA',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3
                          }}>
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#DC2626' }} />
                            {activeLocks[row.company.id].user_name}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#888', paddingLeft: 6 }}>{row.company.list_id.replace(/-/g, ' ')}</div>
                    </td>

                    {/* Contact person — editable */}
                    <td onClick={e => e.stopPropagation()}>
                      {(() => {
                        const contactName = (row.primaryContact?.name && row.primaryContact.name !== 'Primary Contact')
                          ? row.primaryContact.name
                          : ''
                        const wasCalled = Boolean(row.lastLog?.caller_name || row.company.owner_name)
                        return (
                          <EditableCell
                            value={contactName}
                            onSave={val => {
                              if (row.primaryContact) {
                                handleUpdateContact(row.primaryContact.id, 'name', val)
                              } else {
                                handleAddContactInline(row.company.id, 'name', val)
                              }
                            }}
                            style={{ fontWeight: 500, maxWidth: 170 }}
                            placeholder="+ Add person"
                          />
                        )
                      })()}
                    </td>

                    {/* Designation — editable */}
                    <td onClick={e => e.stopPropagation()}>
                      <EditableCell
                        value={row.primaryContact?.designation || ''}
                        onSave={val => {
                          if (row.primaryContact) {
                            handleUpdateContact(row.primaryContact.id, 'designation', val)
                          } else {
                            handleAddContactInline(row.company.id, 'designation', val)
                          }
                        }}
                        style={{ maxWidth: 120 }}
                        placeholder="—"
                      />
                    </td>

                    {/* Phone — editable */}
                    <td onClick={e => e.stopPropagation()}>
                      {row.primaryContact?.phones?.[0] ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <a
                            href={`tel:${row.primaryContact.phones[0]}`}
                            onClick={e => {
                              e.stopPropagation()
                              openRowDrawer(row)
                            }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              fontSize: 12, color: 'var(--text, #111827)', textDecoration: 'none', fontWeight: 600,
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#15803D' }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text, #111827)' }}
                            title="Call number & open log notes"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                          </a>
                          <EditableCell
                            value={row.primaryContact.phones[0]}
                            onSave={val => handleUpdateContact(row.primaryContact!.id, 'phones', val)}
                            type="tel"
                            style={{ fontWeight: 600, fontSize: 12 }}
                          />
                          <button
                            onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(row.primaryContact!.phones[0]); toast.success('Copied!', { duration: 1000 }) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#AAA', fontSize: 12, flexShrink: 0 }}
                            title="Copy number"
                          >
                            📋
                          </button>
                        </div>
                      ) : (
                        <EditableCell
                          value=""
                          onSave={val => {
                            if (row.primaryContact) {
                              handleUpdateContact(row.primaryContact.id, 'phones', val)
                            } else {
                              handleAddContactInline(row.company.id, 'phones', val)
                            }
                          }}
                          type="tel"
                          placeholder="+ Add phone"
                        />
                      )}
                    </td>

                    {/* Sector — editable */}
                    <td onClick={e => e.stopPropagation()}>
                      <EditableCell
                        value={row.company.sector || row.company.industry || ''}
                        onSave={val => handleUpdateCompany(row.company.id, 'sector', val)}
                        placeholder="—"
                      />
                    </td>

                    {/* Location — editable */}
                    <td onClick={e => e.stopPropagation()}>
                      <EditableCell
                        value={row.company.location || ''}
                        onSave={val => handleUpdateCompany(row.company.id, 'location', val)}
                        style={{ maxWidth: 110 }}
                        placeholder="—"
                      />
                    </td>

                    {/* Ref */}
                    <td onClick={e => e.stopPropagation()}>
                      <span
                        onClick={() => handleUpdateCompany(row.company.id, 'reference', (!row.company.reference) as any)}
                        style={{ cursor: 'pointer' }}
                        title="Toggle reference"
                      >
                        {row.company.reference 
                          ? <span className="badge badge-lime">Ref</span>
                          : <span style={{ color: '#CCC', fontSize: 12 }}>—</span>
                        }
                      </span>
                    </td>

                    {/* Status — dropdown */}
                    <td onClick={e => e.stopPropagation()}>
                      <StatusCell
                        status={row.company.status}
                        onSave={val => handleUpdateCompany(row.company.id, 'status', val)}
                      />
                    </td>

                    {/* Called by */}
                    <td onClick={e => e.stopPropagation()}>
                      <CallerCell
                        caller={row.lastLog?.caller_name || row.company.owner_name}
                        onSave={val => handleUpdateCaller(row.company.id, val)}
                      />
                    </td>

                    {/* Last remark — touch editable */}
                    <td onClick={e => e.stopPropagation()}>
                      <EditableCell
                        value={row.lastLog?.remark || ''}
                        onSave={val => handleUpdateRemark(row.company.id, val)}
                        placeholder="+ Add remark"
                        style={{ maxWidth: 220 }}
                      />
                    </td>

                    {/* Follow-up date */}
                    <td>
                      {row.lastLog?.follow_up_date ? (
                        <span style={{
                          fontSize: 12, fontWeight: 600,
                          color: isOverdue ? '#DC2626' : isDueToday ? '#D97706' : '#555',
                        }}>
                          {isOverdue ? '⚠ ' : isDueToday ? '📅 ' : ''}
                          {format(new Date(row.lastLog.follow_up_date + 'T00:00:00'), 'dd MMM')}
                        </span>
                      ) : '—'}
                    </td>

                    {/* Actions: Log & Delete */}
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-sm"
                          style={{
                            background: '#0B0B0B',
                            color: '#FFFFFF',
                            borderRadius: 8,
                            padding: '5px 9px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: 'none',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = '#D9F56B'
                            e.currentTarget.style.color = '#0B0B0B'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = '#0B0B0B'
                            e.currentTarget.style.color = '#FFFFFF'
                          }}
                          onClick={e => { e.stopPropagation(); openRowDrawer(row) }}
                          title="Log call (L)"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                            <path d="M14 2a8 8 0 0 1 8 8" />
                          </svg>
                          <span>Log</span>
                        </button>

                        <button
                          className="btn btn-sm"
                          style={{
                            background: 'transparent',
                            color: '#9CA3AF',
                            borderRadius: 8,
                            padding: '5px 6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            cursor: 'pointer',
                            border: '1px solid transparent',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.color = '#DC2626'
                            e.currentTarget.style.background = '#FEE2E2'
                            e.currentTarget.style.borderColor = '#FECACA'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.color = '#9CA3AF'
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.borderColor = 'transparent'
                          }}
                          onClick={e => {
                            e.stopPropagation()
                            setCompanyToDelete(row.company)
                          }}
                          title={`Delete ${row.company.name}`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* ── Modern Fast Pagination Toolbar ── */}
        {!loading && filtered.length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            background: '#FFFFFF',
            borderTop: '1px solid #E5E7EB',
            fontSize: 12,
            color: '#4B5563',
            flexWrap: 'wrap',
            gap: 12,
            position: 'sticky',
            bottom: 0,
            zIndex: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span>
                Showing <strong>{pageSize <= 0 ? 1 : Math.min((currentPage - 1) * pageSize + 1, filtered.length)}</strong> to{' '}
                <strong>{pageSize <= 0 ? filtered.length : Math.min(currentPage * pageSize, filtered.length)}</strong> of{' '}
                <strong>{filtered.length.toLocaleString()}</strong> companies
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid #D1D5DB',
                    fontSize: 12,
                    background: '#FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={-1}>All ({filtered.length})</option>
                </select>
              </div>
            </div>

            {pageSize > 0 && totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid #D1D5DB',
                    background: currentPage === 1 ? '#F3F4F6' : '#FFFFFF',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    color: currentPage === 1 ? '#9CA3AF' : '#111827',
                    fontWeight: 600,
                  }}
                  title="First page"
                >
                  «
                </button>
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid #D1D5DB',
                    background: currentPage === 1 ? '#F3F4F6' : '#FFFFFF',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    color: currentPage === 1 ? '#9CA3AF' : '#111827',
                    fontWeight: 600,
                  }}
                >
                  ‹ Prev
                </button>

                <span style={{ padding: '0 8px', fontWeight: 600, color: '#111827' }}>
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid #D1D5DB',
                    background: currentPage === totalPages ? '#F3F4F6' : '#FFFFFF',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    color: currentPage === totalPages ? '#9CA3AF' : '#111827',
                    fontWeight: 600,
                  }}
                >
                  Next ›
                </button>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid #D1D5DB',
                    background: currentPage === totalPages ? '#F3F4F6' : '#FFFFFF',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    color: currentPage === totalPages ? '#9CA3AF' : '#111827',
                    fontWeight: 600,
                  }}
                  title="Last page"
                >
                  »
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile Sticky Quick-Action Bar */}
      {viewMode === 'cards' && filtered.length > 0 && (
        <div className="mobile-calling-bottom-bar">
          <button
            type="button"
            onClick={handleNextCompany}
            className="mobile-call-btn"
            style={{
              padding: '10px 16px',
              fontSize: 13,
              borderRadius: 10,
              minHeight: 44,
              boxShadow: '0 2px 10px rgba(22, 163, 74, 0.3)',
            }}
          >
            <Phone size={15} />
            <span>Next to Call (N)</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--border, #D1D5DB)',
                background: currentPage === 1 ? 'rgba(0,0,0,0.05)' : 'var(--surface, #FFFFFF)',
                color: currentPage === 1 ? '#9CA3AF' : 'var(--text, #111827)',
                fontWeight: 600,
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                minHeight: 40,
              }}
            >
              ‹
            </button>
            <span style={{ color: 'var(--text, #111827)', padding: '0 4px', whiteSpace: 'nowrap' }}>
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--border, #D1D5DB)',
                background: currentPage === totalPages ? 'rgba(0,0,0,0.05)' : 'var(--surface, #FFFFFF)',
                color: currentPage === totalPages ? '#9CA3AF' : 'var(--text, #111827)',
                fontWeight: 600,
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                minHeight: 40,
              }}
            >
              ›
            </button>
          </div>
        </div>
      )}

      {/* Log Call Drawer */}
      {drawerOpen && selectedRow && (
        <LogCallDrawer
          row={selectedRow}
          user={user}
          onClose={closeRowDrawer}
          onSaved={handleLogSaved}
        />
      )}

      {/* Delete Confirmation Modal */}
      {companyToDelete && (
        <div
          className="modal-overlay"
          onClick={() => !isDeleting && setCompanyToDelete(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 16
          }}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{
              background: '#FFFFFF', borderRadius: 14,
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              maxWidth: 440, width: '100%', padding: '24px 28px',
              border: '1px solid #E5E7EB', animation: 'scaleUp 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: '#FEE2E2', color: '#DC2626',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0
              }}>
                🗑
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Delete Company</div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>Permanent deletion from CRM & Excel</div>
              </div>
            </div>

            <div style={{
              fontSize: 13, color: '#374151', lineHeight: 1.5,
              marginBottom: 20, background: '#F9FAFB', padding: '12px 14px',
              borderRadius: 8, border: '1px solid #E5E7EB'
            }}>
              Are you sure you want to delete <strong style={{ color: '#111827' }}>{companyToDelete.name}</strong>?
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 8, lineHeight: 1.6 }}>
                ✓ Removed from CRM table & workspace<br />
                ✓ Removed from master Excel workbook (<code>data/CRM.xlsx</code>)<br />
                ✓ Associated call logs and contacts deleted
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCompanyToDelete(null)}
                disabled={isDeleting}
                style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleDeleteCompany}
                disabled={isDeleting}
                style={{
                  background: '#DC2626', color: '#FFFFFF',
                  border: 'none', borderRadius: 8, padding: '8px 18px',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)'
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete Company'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Company Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal animate-fade-in" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Add New Company</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Company Name *</label>
                <input
                  className="input"
                  placeholder="e.g. Tata Motors Ltd."
                  value={newCompany.name}
                  onChange={e => setNewCompany(p => ({ ...p, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Contact Person</label>
                <input
                  className="input"
                  placeholder="Full name"
                  value={newCompany.contactName}
                  onChange={e => setNewCompany(p => ({ ...p, contactName: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Phone</label>
                <input
                  className="input"
                  placeholder="+91 98765 43210"
                  value={newCompany.phone}
                  onChange={e => setNewCompany(p => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Designation</label>
                <input
                  className="input"
                  placeholder="e.g. Director"
                  value={newCompany.designation}
                  onChange={e => setNewCompany(p => ({ ...p, designation: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Sector / Industry</label>
                <input
                  className="input"
                  placeholder="e.g. Manufacturing"
                  value={newCompany.sector}
                  onChange={e => setNewCompany(p => ({ ...p, sector: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Location</label>
                <input
                  className="input"
                  placeholder="e.g. Pune, MH"
                  value={newCompany.location}
                  onChange={e => setNewCompany(p => ({ ...p, location: e.target.value }))}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Add to List</label>
                <div className="select-wrap" style={{ width: '100%' }}>
                  <select
                    value={newCompany.listId}
                    onChange={e => setNewCompany(p => ({ ...p, listId: e.target.value }))}
                    style={{ width: '100%' }}
                  >
                    {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowAddModal(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                disabled={!newCompany.name.trim() || addingSaving}
                onClick={async () => {
                  if (!newCompany.name.trim()) return
                  setAddingSaving(true)
                  const company = addCompany({
                    name: newCompany.name.trim(),
                    list_id: newCompany.listId,
                    sector: newCompany.sector || undefined,
                    industry: newCompany.sector || undefined,
                    location: newCompany.location || undefined,
                    reference: false,
                    status: 'Not Called',
                  })
                  if (newCompany.contactName.trim()) {
                    addContact({
                      company_id: company.id,
                      name: newCompany.contactName.trim(),
                      designation: newCompany.designation || undefined,
                      phones: newCompany.phone ? [newCompany.phone.trim()] : [],
                      is_primary: true,
                    })
                  }
                  // Sync to live Excel immediately
                  syncLeadToExcel(newCompany.listId, newCompany.name.trim(), {
                    companyName: newCompany.name.trim(),
                    contactName: newCompany.contactName.trim() || undefined,
                    designation: newCompany.designation || undefined,
                    phone: newCompany.phone ? newCompany.phone.trim() : undefined,
                    location: newCompany.location || undefined,
                    status: 'Not Called',
                  }).catch(e => console.warn('Excel add sync warning:', e))
                  await new Promise(r => setTimeout(r, 200))
                  setNewCompany({ name: '', contactName: '', phone: '', designation: '', sector: '', location: '', listId: newCompany.listId })
                  setAddingSaving(false)
                  setShowAddModal(false)
                  loadData()
                  setListId(newCompany.listId)
                }}
              >
                {addingSaving ? <span className="spinner" style={{ borderTopColor: 'white' }} /> : '+ Add Company'}
              </button>
            </div>
          </div>
        </div>
      )}
          {showSharePointModal && (
        <div className="modal-backdrop" onClick={() => setShowSharePointModal(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: 560, width: '100%', padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>📊</span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>SharePoint Excel Live Sync</span>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowSharePointModal(false)}
                style={{ fontSize: 18, color: '#888' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, color: '#666', lineHeight: 1.5, marginBottom: 16 }}>
              The CRM continuously synchronizes with this live SharePoint Excel workbook. Any changes made to company remarks, caller assignments, and contact details in SharePoint are pulled on-time.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 6 }}>
                Active SharePoint URL:
              </label>
              <input
                className="input"
                style={{ width: '100%', fontSize: 12, fontFamily: 'monospace' }}
                value={customUrlInput}
                onChange={e => setCustomUrlInput(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
              <a
                href={sharePointUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 12, textDecoration: 'none', color: '#2563EB', background: 'rgba(37, 99, 235, 0.08)' }}
              >
                ↗ Open Excel in SharePoint
              </a>
              <span style={{ fontSize: 12, color: '#888' }}>
                Status: Continuous live auto-sync active (60s)
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowSharePointModal(false)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  setSharePointUrl(customUrlInput)
                  setShowSharePointModal(false)
                  await handleSyncSharePoint(true)
                }}
              >
                Save & Sync Now
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
