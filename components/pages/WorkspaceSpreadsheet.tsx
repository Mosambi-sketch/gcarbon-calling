import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { AppUser } from '@/lib/store'
import type {
  Workspace,
  WorkspaceColumn,
  Company,
  Contact,
  CallLog,
  CompanyStatus,
  ColumnType
} from '@/lib/types'
import {
  getStatusColor,
  getInitials,
  getAvatar,
  getAvatarColor,
  OUTCOMES
} from '@/lib/types'
import {
  fetchWorkspaceCompanies,
  fetchWorkspaceColumns,
  upsertCompanyInWorkspace,
  saveWorkspaceColumns,
  bulkUpdateCompanies,
  bulkArchiveCompanies,
  archiveCompany,
  fetchActiveLocks,
  DEFAULT_WORKSPACE_COLUMNS,
  type WorkspaceCompanyRow
} from '@/lib/workspace-db'
import { load, KEYS } from '@/lib/store-helpers'
import { getUsers, getLists, getCompanies, getContacts, getCallLogs } from '@/lib/store'
import { useWorkspacePresence, usePresence, startCalling, stopCalling } from '@/lib/presence'
import { formatFriendlyDate, getISTDateStr } from '@/lib/date'
import { exportSingleSheetToExcel, exportAllSheetsToWorkbook } from '@/lib/excel-exporter'

import WorkspacePresenceBar from '../WorkspacePresenceBar'
import BulkActionsBar from '../BulkActionsBar'
import ImportRollback from '../ImportRollback'
import LogCallDrawer from '../LogCallDrawer'

import {
  Phone, Copy, Check, Play, SkipForward, ArrowUpDown,
  Search, Plus, Filter, RotateCcw, Clock, Sparkles, ChevronRight, Zap,
  Download, Trash2, Columns, Table, ArrowLeft, CheckCircle2,
  AlertCircle, Lock, Edit2, ExternalLink, Mail, UserCheck, ShieldAlert,
  RefreshCw
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  workspace: Workspace
  user: AppUser
  onBack: () => void
  onOpenImportModal: () => void
}

type SaveState = 'saved' | 'saving' | 'error'

const STATUS_OPTIONS: CompanyStatus[] = [
  'Not Called',
  'Attempted',
  'In Progress',
  'Connected',
  'Qualified',
  'Interested',
  'Follow-up Due',
  'Meeting Scheduled',
  'Proposal Sent',
  'Negotiation',
  'Won',
  'Lost',
  'Dead',
]

export default function WorkspaceSpreadsheet({
  workspace,
  user,
  onBack,
  onOpenImportModal,
}: Props) {
  const [rows, setRows] = useState<WorkspaceCompanyRow[]>([])
  const [columns, setColumns] = useState<WorkspaceColumn[]>([])
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('saved')

  // Search & Filter
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [ownerFilter, setOwnerFilter] = useState('all')

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Sorting
  const [sortCol, setSortCol] = useState<string>('name')
  const [sortAsc, setSortAsc] = useState(true)

  // Modals & Drawers
  const [activeCallRow, setActiveCallRow] = useState<WorkspaceCompanyRow | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showColumnsModal, setShowColumnsModal] = useState(false)
  const [showRollbackModal, setShowRollbackModal] = useState(false)

  // Call Queue Mode
  const [queueMode, setQueueMode] = useState(false)
  const [queueIndex, setQueueIndex] = useState(0)

  // In-cell editing
  const [editingCell, setEditingCell] = useState<{ rowId: string; colName: string } | null>(null)
  const [cellDraftValue, setCellDraftValue] = useState<string>('')

  // Users for assignment
  const [users, setUsers] = useState<AppUser[]>(getUsers())

  // Supabase Realtime Presence
  const { collaborators, broadcastEditing, clearEditing } = useWorkspacePresence(workspace.id, user)
  const callingPresence = usePresence(user.id)

  // Copied indicator
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Live SharePoint sync indicator
  const [isSyncingLive, setIsSyncingLive] = useState(false)

  const handleSyncLiveSharePoint = async () => {
    setIsSyncingLive(true)
    const t = toast.loading('Syncing latest updates from live SharePoint Excel...')
    try {
      const res = await fetch('/api/sync/sharepoint', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        toast.success(`Synced live Excel! ${data.totalCompanies} companies updated on-time.`, { id: t })
        await loadWorkspaceData()
      } else {
        toast.error('Sync failed: ' + (data.error || 'Server error'), { id: t })
      }
    } catch {
      toast.error('Could not reach backend server to sync', { id: t })
    } finally {
      setIsSyncingLive(false)
    }
  }

  // Load Workspace Data
  const loadWorkspaceData = useCallback(async () => {
    try {
      const [colRes, compRes] = await Promise.all([
        fetchWorkspaceColumns(workspace.id),
        fetchWorkspaceCompanies(workspace.id),
      ])

      if (colRes.data) setColumns(colRes.data)
      if (compRes.data) setRows(compRes.data)
    } catch (err) {
      console.error('Failed to load workspace data:', err)
      toast.error('Failed to load leads from workspace')
    } finally {
      setLoading(false)
    }
  }, [workspace.id])

  useEffect(() => {
    loadWorkspaceData()

    const handleRemoteChange = () => {
      loadWorkspaceData()
    }
    window.addEventListener('gc:data-changed', handleRemoteChange)
    return () => window.removeEventListener('gc:data-changed', handleRemoteChange)
  }, [loadWorkspaceData])

  // Save changes to cell
  const handleSaveCell = async (rowId: string, colName: string, value: string) => {
    setEditingCell(null)
    clearEditing()

    const row = rows.find((r) => r.id === rowId)
    if (!row) return

    // Check if value changed
    let currentValue = ''
    if (colName === 'Company Name') currentValue = row.name
    else if (colName === 'Phone') currentValue = row.primaryContact?.phones[0] || ''
    else if (colName === 'Email') currentValue = row.primaryContact?.email || ''
    else if (colName === 'Primary Contact') currentValue = row.primaryContact?.name || ''
    else if (colName === 'Status') currentValue = row.status
    else if (colName === 'Lead Owner') currentValue = row.owner_name || ''
    else if (colName === 'Location') currentValue = row.location || ''
    else if (colName === 'Industry') currentValue = row.industry || ''
    else if (colName === 'Website') currentValue = row.website || ''
    else if (colName === 'Notes') currentValue = row.notes || ''
    else currentValue = row.custom_fields?.[colName] || ''

    if (currentValue === value) return

    setSaveState('saving')

    // Optimistic local update
    const updatedRows = rows.map((r) => {
      if (r.id !== rowId) return r

      const next = { ...r }
      if (colName === 'Company Name') next.name = value
      else if (colName === 'Phone') {
        const pc = next.primaryContact ? { ...next.primaryContact } : { id: '', company_id: rowId, name: 'Contact', phones: [], is_primary: true }
        pc.phones = [value]
        next.primaryContact = pc
      } else if (colName === 'Email') {
        const pc = next.primaryContact ? { ...next.primaryContact } : { id: '', company_id: rowId, name: 'Contact', phones: [], is_primary: true }
        pc.email = value
        next.primaryContact = pc
      } else if (colName === 'Primary Contact') {
        const pc = next.primaryContact ? { ...next.primaryContact } : { id: '', company_id: rowId, name: 'Contact', phones: [], is_primary: true }
        pc.name = value
        next.primaryContact = pc
      } else if (colName === 'Status') {
        next.status = value as CompanyStatus
      } else if (colName === 'Lead Owner') {
        const matchedUser = users.find((u) => u.name === value || u.id === value)
        next.owner_id = matchedUser?.id
        next.owner_name = matchedUser?.name || value
      } else if (colName === 'Location') next.location = value
      else if (colName === 'Industry') next.industry = value
      else if (colName === 'Website') next.website = value
      else if (colName === 'Notes') next.notes = value
      else {
        next.custom_fields = { ...(next.custom_fields || {}), [colName]: value }
      }
      return next
    })
    setRows(updatedRows)

    try {
      const targetRow = updatedRows.find((r) => r.id === rowId)!
      const companyPayload: Partial<Company> & { name: string; workspace_id: string } = {
        id: targetRow.id,
        name: targetRow.name,
        workspace_id: workspace.id,
        status: targetRow.status,
        owner_id: targetRow.owner_id,
        owner_name: targetRow.owner_name,
        location: targetRow.location,
        industry: targetRow.industry,
        website: targetRow.website,
        notes: targetRow.notes,
        custom_fields: targetRow.custom_fields,
      }

      const primaryContactPayload: Partial<Contact> | undefined = targetRow.primaryContact
        ? {
            id: targetRow.primaryContact.id,
            company_id: rowId,
            name: targetRow.primaryContact.name,
            phones: targetRow.primaryContact.phones,
            email: targetRow.primaryContact.email,
            is_primary: true,
          }
        : undefined

      const res = await upsertCompanyInWorkspace(
        companyPayload,
        primaryContactPayload,
        { id: user.id, name: user.name }
      )

      if (res.error) {
        setSaveState('error')
        toast.error('Failed to sync change to server')
      } else {
        setSaveState('saved')
      }
    } catch (err) {
      setSaveState('error')
    }
  }

  // Add empty client row at top
  const handleAddClient = async () => {
    const tempName = 'New Client'
    setSaveState('saving')
    try {
      const res = await upsertCompanyInWorkspace(
        {
          name: tempName,
          workspace_id: workspace.id,
          status: 'Not Called',
          owner_id: user.id,
          owner_name: user.name,
        },
        {
          name: '',
          phones: [],
          email: '',
          is_primary: true,
        },
        { id: user.id, name: user.name }
      )

      if (res.data) {
        const newRow: WorkspaceCompanyRow = {
          ...res.data,
          primaryContact: {
            id: '',
            company_id: res.data.id,
            name: '',
            phones: [],
            is_primary: true,
          },
        }
        setRows([newRow, ...rows])
        setSaveState('saved')
        // Automatically focus on name cell for editing
        setEditingCell({ rowId: res.data.id, colName: 'Company Name' })
        setCellDraftValue(tempName)
        toast.success('Added new client row')
      }
    } catch {
      setSaveState('error')
      toast.error('Failed to create new client')
    }
  }

  // Open Call Drawer
  const handleOpenCall = (row: WorkspaceCompanyRow) => {
    setActiveCallRow(row)
    setDrawerOpen(true)
    startCalling(row.id, row.name, user, workspace.id)
  }

  const handleCloseDrawer = () => {
    setDrawerOpen(false)
    setActiveCallRow(null)
    stopCalling()
    loadWorkspaceData()
  }

  // Bulk Actions Handlers
  const handleBulkStatusChange = async (st: CompanyStatus) => {
    const ids = Array.from(selectedIds)
    const res = await bulkUpdateCompanies(ids, { status: st }, { id: user.id, name: user.name })
    if (res.error) {
      toast.error('Bulk update failed')
    } else {
      toast.success(`Updated status for ${ids.length} leads`)
      setSelectedIds(new Set())
      loadWorkspaceData()
    }
  }

  const handleBulkOwnerChange = async (ownerId: string, ownerName: string) => {
    const ids = Array.from(selectedIds)
    const res = await bulkUpdateCompanies(
      ids,
      { owner_id: ownerId, owner_name: ownerName },
      { id: user.id, name: user.name }
    )
    if (res.error) {
      toast.error('Bulk assignment failed')
    } else {
      toast.success(`Assigned ${ids.length} leads to ${ownerName}`)
      setSelectedIds(new Set())
      loadWorkspaceData()
    }
  }

  const handleBulkArchive = async () => {
    const ids = Array.from(selectedIds)
    const res = await bulkArchiveCompanies(ids, { id: user.id, name: user.name })
    if (res.error) {
      toast.error('Bulk archive failed')
    } else {
      toast.success(`Archived ${ids.length} leads`)
      setSelectedIds(new Set())
      loadWorkspaceData()
    }
  }

  const handleExportSelected = () => {
    const selectedRows = rows.filter((r) => selectedIds.has(r.id))
    if (selectedRows.length === 0) return
    const allContacts = load<Contact>(KEYS.contacts)
    const allLogs = load<CallLog>(KEYS.call_logs)
    exportSingleSheetToExcel(
      selectedRows,
      allContacts,
      allLogs,
      `${workspace.name} (Selected ${selectedRows.length})`
    )
    toast.success(`Exported ${selectedRows.length} selected leads to Excel`)
  }

  const handleExportAll = () => {
    const allCompanies = getCompanies()
    const allContacts = getContacts()
    const allLogs = getCallLogs()
    const allLists = getLists()
    exportAllSheetsToWorkbook(allLists, allCompanies, allContacts, allLogs)
    toast.success(`Exported all ${allLists.length} sheets with executive summary (${allCompanies.length} leads) to Excel`)
  }

  // Filter & Sort
  const filteredRows = useMemo(() => {
    let result = rows

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.primaryContact?.name?.toLowerCase().includes(q) ||
          r.primaryContact?.phones?.some((p) => p.includes(q)) ||
          r.location?.toLowerCase().includes(q) ||
          r.industry?.toLowerCase().includes(q)
      )
    }

    if (statusFilter !== 'all') {
      result = result.filter((r) => r.status === statusFilter)
    }

    if (ownerFilter !== 'all') {
      if (ownerFilter === 'unassigned') {
        result = result.filter((r) => !r.owner_id)
      } else {
        result = result.filter((r) => r.owner_id === ownerFilter)
      }
    }

    // Sort
    result = [...result].sort((a, b) => {
      let valA = ''
      let valB = ''
      if (sortCol === 'name') {
        valA = a.name.toLowerCase()
        valB = b.name.toLowerCase()
      } else if (sortCol === 'status') {
        valA = a.status.toLowerCase()
        valB = b.status.toLowerCase()
      } else if (sortCol === 'owner') {
        valA = (a.owner_name || '').toLowerCase()
        valB = (b.owner_name || '').toLowerCase()
      }
      if (valA < valB) return sortAsc ? -1 : 1
      if (valA > valB) return sortAsc ? 1 : -1
      return 0
    })

    return result
  }, [rows, search, statusFilter, ownerFilter, sortCol, sortAsc])

  // Call Queue navigation
  const currentQueueRow = queueMode ? filteredRows[queueIndex] : null

  const handleQueueNext = () => {
    if (queueIndex < filteredRows.length - 1) {
      setQueueIndex(queueIndex + 1)
      const next = filteredRows[queueIndex + 1]
      if (next) handleOpenCall(next)
    } else {
      toast.success('You reached the end of the call queue!')
      setQueueMode(false)
    }
  }

  // Select all checkbox
  const isAllSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.id))

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredRows.map((r) => r.id)))
    }
  }

  const handleToggleRowSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-50 dark:bg-[#121212] text-neutral-900 dark:text-neutral-100 overflow-hidden">
      {/* ── Top Header Bar ────────────────────────────────────────────── */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 bg-white dark:bg-[#1A1A1A] border-b border-black/5 dark:border-white/10 shadow-sm z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors text-xs font-semibold"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Workspaces</span>
          </button>

          <div className="h-4 w-px bg-neutral-300 dark:bg-neutral-700" />

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
                <span>{workspace.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-[#D9F56B]/20 text-[#6B7E1B] dark:text-[#D9F56B]">
                  {workspace.type}
                </span>
              </h1>
            </div>
            <p className="text-[11px] text-neutral-400">
              {rows.length} total leads • Live Realtime Spreadsheet
            </p>
          </div>
        </div>

        {/* Presence & Save Status Indicator */}
        <div className="flex items-center gap-3">
          <WorkspacePresenceBar collaborators={collaborators} />

          {/* Auto-save Status Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800 border border-black/5 dark:border-white/5">
            {saveState === 'saving' && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span className="text-neutral-500 text-[11px]">Saving...</span>
              </>
            )}
            {saveState === 'saved' && (
              <>
                <CheckCircle2 size={13} className="text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400 text-[11px]">Saved</span>
              </>
            )}
            {saveState === 'error' && (
              <>
                <AlertCircle size={13} className="text-rose-500" />
                <span className="text-rose-600 dark:text-rose-400 text-[11px]">Sync error</span>
              </>
            )}
          </div>

          {/* Quick Actions */}
          <button
            onClick={handleAddClient}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D9F56B] text-black hover:bg-[#cbf14e] text-xs font-bold shadow-sm transition-all hover:scale-[1.02]"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Add Client</span>
          </button>

          <button
            onClick={() => {
              if (filteredRows.length > 0) {
                setQueueMode(!queueMode)
                if (!queueMode) {
                  setQueueIndex(0)
                  handleOpenCall(filteredRows[0])
                }
              } else {
                toast.error('No leads to start queue with')
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              queueMode
                ? 'bg-amber-500 text-white border-amber-600'
                : 'border-black/10 dark:border-white/10 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            <Zap size={14} className={queueMode ? 'text-white' : 'text-amber-500'} />
            <span className="hidden md:inline">{queueMode ? 'Exit Queue' : 'Queue Mode'}</span>
          </button>

          <button
            onClick={handleExportAll}
            title="Export Excel"
            className="p-2 rounded-xl border border-black/10 dark:border-white/10 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors"
          >
            <Download size={15} />
          </button>

          <button
            onClick={handleSyncLiveSharePoint}
            disabled={isSyncingLive}
            title="Sync Live SharePoint Excel (On-Time Update)"
            className="p-2 rounded-xl border border-black/10 dark:border-white/10 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors"
          >
            <RefreshCw size={15} className={isSyncingLive ? "animate-spin text-emerald-500" : ""} />
          </button>

          <button
            onClick={() => setShowRollbackModal(true)}
            title="Import History & Rollback"
            className="p-2 rounded-xl border border-black/10 dark:border-white/10 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors"
          >
            <Clock size={15} />
          </button>
        </div>
      </header>

      {/* ── Call Queue Banner (Sticky if active) ────────────────────────── */}
      {queueMode && currentQueueRow && (
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-2 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-amber-500/20 text-xs z-20">
          <div className="flex items-center gap-3">
            <span className="font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <Zap size={14} /> Call Queue ({queueIndex + 1}/{filteredRows.length}):
            </span>
            <span className="font-semibold text-neutral-900 dark:text-white">
              {currentQueueRow.name}
            </span>
            {currentQueueRow.primaryContact?.phones[0] && (
              <span className="text-neutral-500 font-mono">
                {currentQueueRow.primaryContact.phones[0]}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleQueueNext}
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold transition-colors"
            >
              <span>Next Lead</span>
              <SkipForward size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── Filters & Search Bar ───────────────────────────────────────── */}
      <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2.5 bg-white/70 dark:bg-[#1A1A1A]/70 backdrop-blur-md border-b border-black/5 dark:border-white/10 text-xs">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by company, contact, phone, location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-black/5 dark:border-white/5 focus:outline-none focus:ring-2 focus:ring-[#D9F56B]/50 text-xs"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-black/5 dark:border-white/5 text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          {/* Owner filter */}
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-black/5 dark:border-white/5 text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none"
          >
            <option value="all">All Owners</option>
            <option value="unassigned">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          <span className="text-neutral-400 text-[11px] font-medium pl-1">
            {filteredRows.length} leads
          </span>
        </div>
      </div>

      {/* ── Collaborative Spreadsheet Body ────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-white dark:bg-[#161616]">
        <table className="w-full border-collapse text-left text-xs">
          {/* Table Header */}
          <thead className="sticky top-0 bg-neutral-100 dark:bg-[#1E1E1E] text-neutral-600 dark:text-neutral-300 border-b border-black/10 dark:border-white/10 z-10 select-none shadow-sm">
            <tr>
              {/* Checkbox column */}
              <th className="w-10 px-3 py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleToggleSelectAll}
                  className="rounded border-neutral-300 text-[#D9F56B] focus:ring-[#D9F56B]"
                />
              </th>

              {/* Action column (Call) */}
              <th className="w-16 px-2 py-2.5 text-center font-semibold">Call</th>

              {/* Company Name (Frozen) */}
              <th
                onClick={() => {
                  if (sortCol === 'name') setSortAsc(!sortAsc)
                  else { setSortCol('name'); setSortAsc(true) }
                }}
                className="min-w-[200px] px-4 py-2.5 font-bold cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Company Name</span>
                  <ArrowUpDown size={12} className="opacity-50" />
                </div>
              </th>

              {/* Primary Contact */}
              <th className="min-w-[150px] px-3 py-2.5 font-semibold">Primary Contact</th>

              {/* Phone */}
              <th className="min-w-[150px] px-3 py-2.5 font-semibold">Phone Number</th>

              {/* Status */}
              <th
                onClick={() => {
                  if (sortCol === 'status') setSortAsc(!sortAsc)
                  else { setSortCol('status'); setSortAsc(true) }
                }}
                className="min-w-[140px] px-3 py-2.5 font-semibold cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Status</span>
                  <ArrowUpDown size={12} className="opacity-50" />
                </div>
              </th>

              {/* Lead Owner */}
              <th
                onClick={() => {
                  if (sortCol === 'owner') setSortAsc(!sortAsc)
                  else { setSortCol('owner'); setSortAsc(true) }
                }}
                className="min-w-[140px] px-3 py-2.5 font-semibold cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Lead Owner</span>
                  <ArrowUpDown size={12} className="opacity-50" />
                </div>
              </th>

              {/* Location */}
              <th className="min-w-[130px] px-3 py-2.5 font-semibold">Location</th>

              {/* Industry */}
              <th className="min-w-[130px] px-3 py-2.5 font-semibold">Industry</th>

              {/* Website */}
              <th className="min-w-[140px] px-3 py-2.5 font-semibold">Website</th>

              {/* Follow-up Date */}
              <th className="min-w-[130px] px-3 py-2.5 font-semibold">Follow-up</th>

              {/* Notes */}
              <th className="min-w-[200px] px-3 py-2.5 font-semibold">Notes</th>
            </tr>
          </thead>

          {/* Table Rows */}
          <tbody className="divide-y divide-black/5 dark:divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={12} className="text-center py-16 text-neutral-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <span className="w-6 h-6 border-2 border-[#D9F56B] border-t-transparent rounded-full animate-spin" />
                    <span>Loading workspace spreadsheet...</span>
                  </div>
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-16 text-neutral-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Table size={32} className="opacity-30" />
                    <p className="font-semibold text-sm">No clients in this workspace</p>
                    <p className="text-xs text-neutral-500">
                      Click "+ Add Client" to create a row or import from an Excel sheet.
                    </p>
                    <button
                      onClick={handleAddClient}
                      className="mt-2 px-3 py-1.5 bg-[#D9F56B] text-black font-bold text-xs rounded-xl hover:bg-[#cbf14e]"
                    >
                      + Add First Client
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filteredRows.map((row, idx) => {
                const isSelected = selectedIds.has(row.id)
                const phone = row.primaryContact?.phones[0] || ''
                const callerPresence = callingPresence.get(row.id)

                // Check if someone else is editing this row
                const editingCollab = collaborators.find(
                  (c) => c.activity === 'editing' && c.companyId === row.id
                )

                return (
                  <tr
                    key={row.id}
                    className={`group transition-colors ${
                      isSelected
                        ? 'bg-[#D9F56B]/10 hover:bg-[#D9F56B]/15'
                        : 'hover:bg-neutral-50 dark:hover:bg-[#1E1E1E]/60'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="w-10 px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleToggleRowSelect(row.id, e as unknown as React.MouseEvent)}
                        className="rounded border-neutral-300 text-[#D9F56B] focus:ring-[#D9F56B]"
                      />
                    </td>

                    {/* Quick Call Button */}
                    <td className="w-16 px-2 py-2 text-center">
                      <button
                        onClick={() => handleOpenCall(row)}
                        title={phone ? `Call ${phone}` : 'Log Call'}
                        className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition-colors inline-flex items-center justify-center"
                      >
                        <Phone size={13} />
                      </button>
                    </td>

                    {/* Company Name (Editable) */}
                    <td className="px-4 py-2 font-semibold text-neutral-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        {editingCell?.rowId === row.id && editingCell.colName === 'Company Name' ? (
                          <input
                            autoFocus
                            type="text"
                            value={cellDraftValue}
                            onChange={(e) => setCellDraftValue(e.target.value)}
                            onBlur={() => handleSaveCell(row.id, 'Company Name', cellDraftValue)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveCell(row.id, 'Company Name', cellDraftValue)
                              if (e.key === 'Escape') setEditingCell(null)
                            }}
                            className="w-full px-2 py-0.5 rounded bg-white dark:bg-black border border-[#D9F56B] text-xs font-semibold focus:outline-none"
                          />
                        ) : (
                          <div
                            onClick={() => {
                              setEditingCell({ rowId: row.id, colName: 'Company Name' })
                              setCellDraftValue(row.name)
                              broadcastEditing(row.id, row.name)
                            }}
                            className="flex-1 cursor-pointer hover:underline flex items-center justify-between"
                          >
                            <span>{row.name}</span>
                            <Edit2 size={11} className="opacity-0 group-hover:opacity-40 text-neutral-400" />
                          </div>
                        )}

                        {/* Caller presence badge */}
                        {callerPresence && (
                          <span
                            title={`${callerPresence.userName} is calling this now`}
                            className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white animate-pulse"
                          >
                            <Lock size={10} />
                            <span>{callerPresence.userName} calling</span>
                          </span>
                        )}

                        {/* Remote editing indicator */}
                        {editingCollab && (
                          <span
                            title={`${editingCollab.userName} is editing this row`}
                            className="w-2 h-2 rounded-full bg-blue-500 animate-ping"
                          />
                        )}
                      </div>
                    </td>

                    {/* Primary Contact (Editable) */}
                    <td className="px-3 py-2 text-neutral-700 dark:text-neutral-300">
                      {editingCell?.rowId === row.id && editingCell.colName === 'Primary Contact' ? (
                        <input
                          autoFocus
                          type="text"
                          value={cellDraftValue}
                          onChange={(e) => setCellDraftValue(e.target.value)}
                          onBlur={() => handleSaveCell(row.id, 'Primary Contact', cellDraftValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveCell(row.id, 'Primary Contact', cellDraftValue)
                            if (e.key === 'Escape') setEditingCell(null)
                          }}
                          className="w-full px-2 py-0.5 rounded bg-white dark:bg-black border border-[#D9F56B] text-xs focus:outline-none"
                        />
                      ) : (
                        <div
                          onClick={() => {
                            setEditingCell({ rowId: row.id, colName: 'Primary Contact' })
                            setCellDraftValue(row.primaryContact?.name || '')
                            broadcastEditing(row.id, row.name)
                          }}
                          className="cursor-pointer hover:text-neutral-900 dark:hover:text-white"
                        >
                          {row.primaryContact?.name || (
                            <span className="text-neutral-400 italic font-light">+ Add contact</span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Phone (Editable + Copy/Call) */}
                    <td className="px-3 py-2 font-mono">
                      {editingCell?.rowId === row.id && editingCell.colName === 'Phone' ? (
                        <input
                          autoFocus
                          type="text"
                          value={cellDraftValue}
                          onChange={(e) => setCellDraftValue(e.target.value)}
                          onBlur={() => handleSaveCell(row.id, 'Phone', cellDraftValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveCell(row.id, 'Phone', cellDraftValue)
                            if (e.key === 'Escape') setEditingCell(null)
                          }}
                          className="w-full px-2 py-0.5 rounded bg-white dark:bg-black border border-[#D9F56B] text-xs font-mono focus:outline-none"
                        />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span
                            onClick={() => {
                              setEditingCell({ rowId: row.id, colName: 'Phone' })
                              setCellDraftValue(phone)
                              broadcastEditing(row.id, row.name)
                            }}
                            className="cursor-pointer hover:text-neutral-900 dark:hover:text-white flex-1"
                          >
                            {phone || <span className="text-neutral-400 font-sans italic">+ Add phone</span>}
                          </span>
                          {phone && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                navigator.clipboard.writeText(phone)
                                setCopiedId(row.id)
                                setTimeout(() => setCopiedId(null), 1500)
                                toast.success('Phone copied')
                              }}
                              className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                            >
                              {copiedId === row.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Status (Inline Select) */}
                    <td className="px-3 py-2">
                      <select
                        value={row.status}
                        onChange={(e) => handleSaveCell(row.id, 'Status', e.target.value)}
                        className={`text-xs font-semibold px-2 py-1 rounded-lg border-0 cursor-pointer focus:ring-1 focus:ring-[#D9F56B] ${getStatusColor(
                          row.status
                        )}`}
                      >
                        {STATUS_OPTIONS.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Lead Owner (Inline Select) */}
                    <td className="px-3 py-2">
                      <select
                        value={row.owner_id || ''}
                        onChange={(e) => {
                          const chosenUser = users.find((u) => u.id === e.target.value)
                          handleSaveCell(row.id, 'Lead Owner', chosenUser?.name || '')
                        }}
                        className="text-xs bg-transparent border-0 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded px-1 py-0.5 cursor-pointer focus:outline-none"
                      >
                        <option value="">Unassigned</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Location (Editable) */}
                    <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">
                      {editingCell?.rowId === row.id && editingCell.colName === 'Location' ? (
                        <input
                          autoFocus
                          type="text"
                          value={cellDraftValue}
                          onChange={(e) => setCellDraftValue(e.target.value)}
                          onBlur={() => handleSaveCell(row.id, 'Location', cellDraftValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveCell(row.id, 'Location', cellDraftValue)
                            if (e.key === 'Escape') setEditingCell(null)
                          }}
                          className="w-full px-2 py-0.5 rounded bg-white dark:bg-black border border-[#D9F56B] text-xs focus:outline-none"
                        />
                      ) : (
                        <div
                          onClick={() => {
                            setEditingCell({ rowId: row.id, colName: 'Location' })
                            setCellDraftValue(row.location || '')
                          }}
                          className="cursor-pointer hover:text-neutral-900 dark:hover:text-white"
                        >
                          {row.location || <span className="text-neutral-400 font-light">—</span>}
                        </div>
                      )}
                    </td>

                    {/* Industry (Editable) */}
                    <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">
                      {editingCell?.rowId === row.id && editingCell.colName === 'Industry' ? (
                        <input
                          autoFocus
                          type="text"
                          value={cellDraftValue}
                          onChange={(e) => setCellDraftValue(e.target.value)}
                          onBlur={() => handleSaveCell(row.id, 'Industry', cellDraftValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveCell(row.id, 'Industry', cellDraftValue)
                            if (e.key === 'Escape') setEditingCell(null)
                          }}
                          className="w-full px-2 py-0.5 rounded bg-white dark:bg-black border border-[#D9F56B] text-xs focus:outline-none"
                        />
                      ) : (
                        <div
                          onClick={() => {
                            setEditingCell({ rowId: row.id, colName: 'Industry' })
                            setCellDraftValue(row.industry || '')
                          }}
                          className="cursor-pointer hover:text-neutral-900 dark:hover:text-white"
                        >
                          {row.industry || <span className="text-neutral-400 font-light">—</span>}
                        </div>
                      )}
                    </td>

                    {/* Website */}
                    <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">
                      {row.website ? (
                        <a
                          href={row.website.startsWith('http') ? row.website : `https://${row.website}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-500 hover:underline flex items-center gap-1"
                        >
                          <span className="truncate max-w-[120px]">{row.website}</span>
                          <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span className="text-neutral-400 font-light">—</span>
                      )}
                    </td>

                    {/* Follow-up Date */}
                    <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400 font-medium">
                      {row.lastCallLog?.follow_up_date ? (
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold text-[11px]">
                          {formatFriendlyDate(row.lastCallLog.follow_up_date)}
                        </span>
                      ) : (
                        <span className="text-neutral-400 font-light">—</span>
                      )}
                    </td>

                    {/* Notes (Editable) */}
                    <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">
                      {editingCell?.rowId === row.id && editingCell.colName === 'Notes' ? (
                        <input
                          autoFocus
                          type="text"
                          value={cellDraftValue}
                          onChange={(e) => setCellDraftValue(e.target.value)}
                          onBlur={() => handleSaveCell(row.id, 'Notes', cellDraftValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveCell(row.id, 'Notes', cellDraftValue)
                            if (e.key === 'Escape') setEditingCell(null)
                          }}
                          className="w-full px-2 py-0.5 rounded bg-white dark:bg-black border border-[#D9F56B] text-xs focus:outline-none"
                        />
                      ) : (
                        <div
                          onClick={() => {
                            setEditingCell({ rowId: row.id, colName: 'Notes' })
                            setCellDraftValue(row.notes || '')
                          }}
                          className="cursor-pointer hover:text-neutral-900 dark:hover:text-white truncate max-w-[200px]"
                        >
                          {row.notes || <span className="text-neutral-400 font-light">—</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Bulk Actions Floating Bar ──────────────────────────────────── */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        users={users}
        onClearSelection={() => setSelectedIds(new Set())}
        onBulkStatusChange={handleBulkStatusChange}
        onBulkOwnerChange={handleBulkOwnerChange}
        onBulkArchive={handleBulkArchive}
        onExportSelected={handleExportSelected}
      />

      {/* ── Log Call Drawer ────────────────────────────────────────────── */}
      {drawerOpen && activeCallRow && (
        <LogCallDrawer
          row={{
            company: activeCallRow,
            primaryContact: activeCallRow.primaryContact,
            lastLog: activeCallRow.lastCallLog,
          }}
          user={user}
          onClose={handleCloseDrawer}
          onSaved={(log, companyName) => {
            toast.success(`Logged ${log.outcome} for ${companyName}`)
            handleCloseDrawer()
          }}
          queueMode={queueMode}
          queueIndex={queueIndex + 1}
          queueTotal={filteredRows.length}
          onSkip={handleQueueNext}
        />
      )}

      {/* ── Import Rollback Modal ──────────────────────────────────────── */}
      <ImportRollback
        workspaceId={workspace.id}
        isOpen={showRollbackModal}
        onClose={() => setShowRollbackModal(false)}
        onRollbackComplete={loadWorkspaceData}
      />
    </div>
  )
}
