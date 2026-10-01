'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { AppUser } from '@/lib/store'
import {
  getCompanies, getContacts, getCallLogs, getLists, addCallLog, addCompany, addContact,
  addTask, addEvent, getUserByName, getUserById, getUsers, isSeeded
} from '@/lib/store'
import type { Company, Contact, CallLog, OutcomeType } from '@/lib/types'
import { OUTCOMES, getStatusColor, getInitials, getAvatarColor, getAvatar } from '@/lib/types'
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

  // Add Company modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newCompany, setNewCompany] = useState({
    name: '', contactName: '', phone: '', designation: '',
    sector: '', location: '', listId: 'connection-list',
  })
  const [addingSaving, setAddingSaving] = useState(false)

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
                    className={`${isOverdue ? 'overdue-row' : isDueToday ? 'followup-today-row' : row.company.status === 'Meeting Set' ? 'meeting-set-row' : ''}`}
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
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              fontSize: 12, color: '#0B0B0B', textDecoration: 'none', fontWeight: 600,
                              background: '#F5F5F5', padding: '3px 8px', borderRadius: 6,
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#E8F5D8'; e.currentTarget.style.color = '#15803D' }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#F5F5F5'; e.currentTarget.style.color = '#0B0B0B' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                            {row.primaryContact.phones[0]}
                          </a>
                          <button
                            onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(row.primaryContact!.phones[0]) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#AAA', fontSize: 12 }}
                            title="Copy number"
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
                          {getAvatar(row.lastLog.caller_name) ? (
                            <img
                              src={getAvatar(row.lastLog.caller_name)}
                              alt={row.lastLog.caller_name}
                              style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', border: '1px solid #E5E5E5' }}
                            />
                          ) : (
                            <div style={{
                              width: 22, height: 22, borderRadius: '50%',
                              background: getAvatarColor(row.lastLog.caller_name),
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 9, fontWeight: 700, color: '#0B0B0B',
                            }}>
                              {getInitials(row.lastLog.caller_name)}
                            </div>
                          )}
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
                        className="btn btn-sm"
                        style={{
                          background: '#0B0B0B',
                          color: '#FFFFFF',
                          borderRadius: 8,
                          padding: '5px 10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
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
                        onClick={e => { e.stopPropagation(); setSelectedRow(row); setDrawerOpen(true) }}
                        title="Log call (L)"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                          <path d="M14 2a8 8 0 0 1 8 8" />
                        </svg>
                        <span>Log</span>
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
    </div>
  )
}
