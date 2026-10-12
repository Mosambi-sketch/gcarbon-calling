import React, { useState, useEffect } from 'react'
import type { AppUser } from '@/lib/store'
import type { Workspace } from '@/lib/types'
import { fetchWorkspaces, createWorkspace, archiveWorkspace } from '@/lib/workspace-db'
import { load, KEYS } from '@/lib/store-helpers'
import type { Company } from '@/lib/types'
import {
  FileSpreadsheet, Plus, Upload, Search, Building2, Users,
  ArrowRight, Archive, Clock, Sparkles, Filter, MoreVertical,
  CheckCircle2, FolderPlus, Layers
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  user: AppUser
  onSelectWorkspace: (workspaceId: string) => void
  onOpenImportModal: () => void
}

export default function WorkspaceHomePage({
  user,
  onSelectWorkspace,
  onOpenImportModal,
}: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'company' | 'freelancer'>('all')

  // Create workspace modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [newWsType, setNewWsType] = useState<'company' | 'freelancer'>('company')
  const [newWsDesc, setNewWsDesc] = useState('')
  const [creating, setCreating] = useState(false)

  // Company count map
  const [companyCounts, setCompanyCounts] = useState<Record<string, number>>({})

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await fetchWorkspaces()
      const wsList = res.data || []
      setWorkspaces(wsList)

      // Calculate lead counts per workspace
      const allCompanies = load<Company>(KEYS.companies)
      const counts: Record<string, number> = {}
      for (const c of allCompanies) {
        if (!c.archived) {
          const wsId = c.workspace_id || c.list_id
          if (wsId) {
            counts[wsId] = (counts[wsId] || 0) + 1
          }
        }
      }
      setCompanyCounts(counts)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    const handleDataChanged = () => {
      loadData()
    }
    window.addEventListener('gc:data-changed', handleDataChanged)
    return () => window.removeEventListener('gc:data-changed', handleDataChanged)
  }, [])

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWsName.trim()) return

    setCreating(true)
    try {
      const res = await createWorkspace({
        name: newWsName.trim(),
        type: newWsType,
        description: newWsDesc.trim(),
        created_by: user.id,
      })

      if (res.error) {
        toast.error(`Failed to create workspace: ${res.error}`)
      } else if (res.data) {
        toast.success(`Workspace "${res.data.name}" created!`)
        setShowCreateModal(false)
        setNewWsName('')
        setNewWsDesc('')
        await loadData()
        onSelectWorkspace(res.data.id)
      }
    } finally {
      setCreating(false)
    }
  }

  const handleArchive = async (wsId: string, wsName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(`Are you sure you want to archive workspace "${wsName}"?`)) return

    const res = await archiveWorkspace(wsId, user.id, user.name)
    if (res.error) {
      toast.error('Failed to archive workspace')
    } else {
      toast.success(`Archived workspace "${wsName}"`)
      loadData()
    }
  }

  // Filtered workspaces
  const filteredWorkspaces = workspaces.filter((w) => {
    const matchType = typeFilter === 'all' || w.type === typeFilter
    const matchSearch =
      !search.trim() ||
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      (w.description && w.description.toLowerCase().includes(search.toLowerCase()))
    return matchType && matchSearch
  })

  // Summary counts
  const totalLeads = Object.values(companyCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#121212] text-neutral-900 dark:text-neutral-100 p-4 sm:p-6 lg:p-8">
      {/* Top Banner & Header */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#D9F56B]/20 text-[#6B7E1B] dark:text-[#D9F56B] uppercase tracking-wider">
                Real-Time CRM
              </span>
              <span className="text-xs text-neutral-400">• Multi-User Collaborative</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Calling Workspaces
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Live collaborative spreadsheets. Create custom lead pools or upload Excel files to start calling.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onOpenImportModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#1E1E1E] hover:bg-neutral-100 dark:hover:bg-[#252525] text-xs sm:text-sm font-semibold shadow-sm transition-all hover:scale-[1.02]"
            >
              <Upload size={16} className="text-neutral-500" />
              <span>Import Excel</span>
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D9F56B] text-black hover:bg-[#cbf14e] text-xs sm:text-sm font-bold shadow-sm transition-all hover:scale-[1.02]"
            >
              <Plus size={18} />
              <span>New Workspace</span>
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-black/5 dark:border-white/10 shadow-sm">
            <div className="flex items-center justify-between text-neutral-500 text-xs font-medium mb-1">
              <span>Workspaces</span>
              <Layers size={16} className="text-neutral-400" />
            </div>
            <div className="text-2xl font-black text-neutral-900 dark:text-white">
              {workspaces.length}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">Active calling sheets</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-black/5 dark:border-white/10 shadow-sm">
            <div className="flex items-center justify-between text-neutral-500 text-xs font-medium mb-1">
              <span>Total Leads</span>
              <Building2 size={16} className="text-[#D9F56B]" />
            </div>
            <div className="text-2xl font-black text-neutral-900 dark:text-white">
              {totalLeads}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">Across all workspaces</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-black/5 dark:border-white/10 shadow-sm col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-neutral-500 text-xs font-medium mb-1">
              <span>Collaborative Sync</span>
              <Sparkles size={16} className="text-emerald-500" />
            </div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              Live
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">Supabase Realtime enabled</p>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              type="text"
              placeholder="Search workspaces..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl text-xs sm:text-sm bg-white dark:bg-[#1E1E1E] border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-[#D9F56B]/50 transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-[#1E1E1E] border border-black/10 dark:border-white/10 rounded-xl text-xs font-medium self-stretch sm:self-auto">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                typeFilter === 'all'
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-black font-semibold'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              All Types
            </button>
            <button
              onClick={() => setTypeFilter('company')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                typeFilter === 'company'
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-black font-semibold'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Companies
            </button>
            <button
              onClick={() => setTypeFilter('freelancer')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                typeFilter === 'freelancer'
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-black font-semibold'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Freelancers
            </button>
          </div>
        </div>

        {/* Workspace Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-44 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-black/5 dark:border-white/10 p-5 animate-pulse"
              />
            ))}
          </div>
        ) : filteredWorkspaces.length === 0 ? (
          <div className="text-center py-16 px-4 bg-white dark:bg-[#1E1E1E] rounded-3xl border border-black/5 dark:border-white/10 shadow-sm">
            <FileSpreadsheet size={48} className="mx-auto mb-3 text-neutral-300 dark:text-neutral-600" />
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">
              No workspaces found
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm mx-auto">
              {search
                ? 'No workspaces match your search criteria. Try a different keyword.'
                : 'Get started by creating a new workspace or uploading an Excel file.'}
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 rounded-xl bg-[#D9F56B] text-black text-xs font-bold hover:bg-[#cbf14e] transition-colors"
              >
                + Create Workspace
              </button>
              <button
                onClick={onOpenImportModal}
                className="px-4 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
              >
                Upload Excel
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            {filteredWorkspaces.map((ws) => {
              const leadCount = companyCounts[ws.id] || 0
              const isFreelancer = ws.type === 'freelancer'

              return (
                <div
                  key={ws.id}
                  onClick={() => onSelectWorkspace(ws.id)}
                  className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-black/5 dark:border-white/10 hover:border-[#D9F56B]/60 dark:hover:border-[#D9F56B]/60 shadow-sm hover:shadow-xl transition-all duration-200 cursor-pointer overflow-hidden"
                >
                  {/* Subtle hover accent bar */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-transparent group-hover:bg-[#D9F56B] transition-colors" />

                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2.5 rounded-xl bg-neutral-100 dark:bg-[#282828] text-neutral-800 dark:text-neutral-200 group-hover:bg-[#D9F56B]/20 group-hover:text-[#6B7E1B] dark:group-hover:text-[#D9F56B] transition-colors">
                          <FileSpreadsheet size={20} />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-neutral-900 dark:text-white group-hover:text-[#6B7E1B] dark:group-hover:text-[#D9F56B] transition-colors line-clamp-1">
                            {ws.name}
                          </h3>
                          <span className="text-[11px] text-neutral-400 capitalize">
                            {ws.type} workspace
                          </span>
                        </div>
                      </div>

                      {user.role === 'admin' && (
                        <button
                          onClick={(e) => handleArchive(ws.id, ws.name, e)}
                          title="Archive Workspace"
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-500/10 text-neutral-400 hover:text-rose-500 transition-all"
                        >
                          <Archive size={14} />
                        </button>
                      )}
                    </div>

                    {ws.description && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">
                        {ws.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-4 mt-4 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      <span className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-bold">
                        {leadCount}
                      </span>
                      <span>leads</span>
                    </div>

                    <div className="flex items-center gap-1 text-xs font-bold text-neutral-500 group-hover:text-[#D9F56B] transition-colors">
                      <span>Open Workspace</span>
                      <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal: New Workspace */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1E1E] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
            <form onSubmit={handleCreateWorkspace}>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-[#D9F56B]/20 text-[#6B7E1B] dark:text-[#D9F56B]">
                    <FolderPlus size={22} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                      Create New Workspace
                    </h2>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      A blank real-time calling sheet for your leads
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Workspace Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Q4 Solar Leads / Cold Outreach Mumbai"
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-neutral-50 dark:bg-neutral-900 border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-[#D9F56B]/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Target Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewWsType('company')}
                      className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        newWsType === 'company'
                          ? 'border-[#D9F56B] bg-[#D9F56B]/10 text-neutral-900 dark:text-white'
                          : 'border-black/10 dark:border-white/10 text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <Building2 size={16} />
                      <span>Companies</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewWsType('freelancer')}
                      className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        newWsType === 'freelancer'
                          ? 'border-[#D9F56B] bg-[#D9F56B]/10 text-neutral-900 dark:text-white'
                          : 'border-black/10 dark:border-white/10 text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <Users size={16} />
                      <span>Freelancers</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Briefly describe the campaign objective..."
                    value={newWsDesc}
                    onChange={(e) => setNewWsDesc(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-neutral-50 dark:bg-neutral-900 border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-[#D9F56B]/50 resize-none"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-neutral-50 dark:bg-[#1A1A1A] border-t border-black/5 dark:border-white/10 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newWsName.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#D9F56B] text-black hover:bg-[#cbf14e] disabled:opacity-50 transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
