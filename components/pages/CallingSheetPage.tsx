'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { AppUser } from '@/lib/store'
import {
  getCompanies, getContacts, getCallLogs, getLists, addCallLog, updateCompany,
  addTask, addEvent, getUserByName, getUserById, getUsers, isSeeded
} from '@/lib/store'
import type { Company, Contact, CallLog, OutcomeType } from '@/lib/types'
import { OUTCOMES, getStatusColor, getInitials, getAvatarColor } from '@/lib/types'
import { format, addDays, isToday, isPast } from 'date-fns'
import LogCallDrawer from '../LogCallDrawer'

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

export default function CallingSheetPage({ user }: { user: AppUser }) {
  const [listId, setListId] = useState('all')
  const [rows, setRows] = useState<Row[]>([])
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCaller, setFilterCaller] = useState('')
  const [filterFollowUp, setFilterFollowUp] = useState('')
  const [selectedRow, setSelectedRow] = useState<Row | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lists, setLists] = useState(getLists())
  const [users, setUsers] = useState(getUsers())
  const [loading, setLoading] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)

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
      result = result.filter(r => r.lastLog?.caller_name === filterCaller)
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
  }, [rows, search, filterStatus, filterCaller, filterFollowUp])

  const handleNextCompany = () => {
    const today = new Date().toISOString().split('T')[0]
    const next = filtered.find(r => 
      r.company.status === 'Not Called' ||
      (r.company.status === 'Follow-up Due' && r.lastLog?.follow_up_date === today)
    )
    if (next) {
      setSelectedRow(next)
      setDrawerOpen(true)
    }
  }

  const handleLogSaved = () => {
    loadData()
    setDrawerOpen(false)
  }

  const allStatuses = ['Not Called', 'In Progress', 'Follow-up Due', 'Meeting Set', 'Won/Interested', 'Dead']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="page-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="page-header-left">
            <div className="greeting" style={{ fontSize: 18 }}>Calling Sheet</div>
            <div className="greeting-sub">{filtered.length} companies{search || filterStatus ? ' (filtered)' : ''}</div>
          </div>
          <button
            className="btn btn-lime"
            onClick={handleNextCompany}
            title="Keyboard: N"
          >
            ▶ Next to Call
          </button>
          <button className="btn btn-primary" onClick={() => {/* TODO: add company modal */}}>
            + Add Company
          </button>
        </div>

        {/* List tabs */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          <button
            className={`tab-item ${listId === 'all' ? 'active' : ''}`}
            onClick={() => setListId('all')}
            style={{ background: listId === 'all' ? '#0B0B0B' : undefined, color: listId === 'all' ? 'white' : undefined, borderRadius: 20 }}
          >
            All
          </button>
          {lists.map(l => (
            <button
              key={l.id}
              className={`tab-item ${listId === l.id ? 'active' : ''}`}
              onClick={() => setListId(l.id)}
              style={{ borderRadius: 20, whiteSpace: 'nowrap' }}
            >
              {l.name}
            </button>
          ))}
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

        {(filterStatus || filterCaller || filterFollowUp || search) && (
          <button className="btn btn-ghost btn-sm" onClick={() => {
            setFilterStatus(''); setFilterCaller(''); setFilterFollowUp(''); setSearch('')
          }}>
            Clear filters
          </button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#AAA', whiteSpace: 'nowrap' }}>
          Press <kbd style={{ background: '#F0F0F0', padding: '1px 5px', borderRadius: 4, fontSize: 10 }}>/</kbd> to search
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
        ) : (
          <table className="data-table" style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Company</th>
                <th style={{ minWidth: 150 }}>Contact person</th>
                <th style={{ minWidth: 120 }}>Designation</th>
                <th style={{ minWidth: 120 }}>Phone</th>
                <th style={{ minWidth: 100 }}>Sector</th>
                <th style={{ minWidth: 120 }}>Location</th>
                <th style={{ minWidth: 80 }}>Ref</th>
                <th style={{ minWidth: 120 }}>Status</th>
                <th style={{ minWidth: 90 }}>Called by</th>
                <th style={{ minWidth: 200 }}>Last remark</th>
                <th style={{ minWidth: 110 }}>Follow-up</th>
                <th style={{ minWidth: 60 }}>Log</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const isOverdue = row.lastLog?.follow_up_date && 
                  new Date(row.lastLog.follow_up_date) < new Date() &&
                  row.lastLog.follow_up_date !== new Date().toISOString().split('T')[0]
                const isDueToday = row.lastLog?.follow_up_date === new Date().toISOString().split('T')[0]
                
                return (
                  <tr
                    key={row.company.id}
                    className={isOverdue ? 'overdue-row' : ''}
                    onClick={() => { setSelectedRow(row); setDrawerOpen(true) }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{row.company.name}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{row.company.list_id.replace(/-/g, ' ')}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{row.primaryContact?.name || '—'}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 12, color: '#555', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.primaryContact?.designation || '—'}
                      </div>
                    </td>
                    <td>
                      {row.primaryContact?.phones?.[0] ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <a
                            href={`tel:${row.primaryContact.phones[0]}`}
                            onClick={e => e.stopPropagation()}
                            style={{ fontSize: 12, color: '#0B0B0B', textDecoration: 'none', fontWeight: 500 }}
                          >
                            {row.primaryContact.phones[0]}
                          </a>
                          <button
                            onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(row.primaryContact!.phones[0]) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#AAA', fontSize: 12 }}
                            title="Copy"
                          >
                            📋
                          </button>
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      <div style={{ fontSize: 12, color: '#555' }}>{row.company.sector || row.company.industry || '—'}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 12, color: '#555', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.company.location || '—'}
                      </div>
                    </td>
                    <td>
                      {row.company.reference 
                        ? <span className="badge badge-lime">Ref</span>
                        : <span style={{ color: '#CCC', fontSize: 12 }}>—</span>
                      }
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: getStatusBg(row.company.status),
                        color: getStatusTextColor(row.company.status),
                      }}>
                        {row.company.status}
                      </span>
                    </td>
                    <td>
                      {row.lastLog?.caller_name ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%',
                            background: getAvatarColor(row.lastLog.caller_name),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 700, color: '#0B0B0B',
                          }}>
                            {getInitials(row.lastLog.caller_name)}
                          </div>
                          <span style={{ fontSize: 12 }}>{row.lastLog.caller_name}</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      <div style={{ fontSize: 12, color: '#555', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.lastLog?.remark || '—'}
                      </div>
                    </td>
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
                    <td>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={e => { e.stopPropagation(); setSelectedRow(row); setDrawerOpen(true) }}
                        title="Log call (L)"
                      >
                        📞
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Log Call Drawer */}
      {drawerOpen && selectedRow && (
        <LogCallDrawer
          row={selectedRow}
          user={user}
          onClose={() => setDrawerOpen(false)}
          onSaved={handleLogSaved}
        />
      )}
    </div>
  )
}
