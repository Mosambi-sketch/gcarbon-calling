import React, { useState, useEffect } from 'react'
import type { ImportRecord } from '@/lib/types'
import { fetchImports, rollbackImport } from '@/lib/workspace-db'
import { History, RotateCcw, CheckCircle, AlertTriangle, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  workspaceId: string
  isOpen: boolean
  onClose: () => void
  onRollbackComplete: () => void
}

export default function ImportRollback({
  workspaceId,
  isOpen,
  onClose,
  onRollbackComplete,
}: Props) {
  const [imports, setImports] = useState<ImportRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [rollingBackId, setRollingBackId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    fetchImports(workspaceId)
      .then((res) => {
        setImports(res.data || [])
      })
      .finally(() => setLoading(false))
  }, [workspaceId, isOpen])

  if (!isOpen) return null

  const handleRollback = async (record: ImportRecord) => {
    if (
      !window.confirm(
        `Are you sure you want to rollback import "${record.filename}"? This will archive all ${record.row_count} leads added in this batch.`
      )
    ) {
      return
    }

    setRollingBackId(record.id)
    try {
      const res = await rollbackImport(record.id, workspaceId)
      if (res.error) {
        toast.error(`Rollback failed: ${res.error}`)
      } else {
        toast.success(`Successfully rolled back import. Archived ${res.data} leads.`)
        // Update local state
        setImports((prev) =>
          prev.map((i) => (i.id === record.id ? { ...i, status: 'rolled_back' } : i))
        )
        onRollbackComplete()
      }
    } catch (err) {
      toast.error('An error occurred during rollback')
    } finally {
      setRollingBackId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-xl bg-white dark:bg-[#1E1E1E] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <History size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                Import History & Rollback
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                View past Excel uploads and revert batches if needed
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-400 gap-2">
              <Loader2 size={24} className="animate-spin text-[#D9F56B]" />
              <span className="text-xs">Loading import history...</span>
            </div>
          ) : imports.length === 0 ? (
            <div className="text-center py-12 text-neutral-400 dark:text-neutral-500">
              <History size={36} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">No imports recorded yet</p>
              <p className="text-xs mt-1">
                When you import Excel files into this workspace, rollback records will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {imports.map((item) => {
                const isRolledBack = item.status === 'rolled_back'
                const isRolling = rollingBackId === item.id

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isRolledBack
                        ? 'bg-neutral-50 dark:bg-neutral-900/40 border-neutral-200 dark:border-neutral-800 opacity-60'
                        : 'bg-white dark:bg-[#252525] border-black/10 dark:border-white/10 shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-neutral-900 dark:text-white">
                            {item.filename}
                          </span>
                          {isRolledBack ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                              <AlertTriangle size={11} /> Rolled back
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle size={11} /> Active
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          Imported by <strong>{item.user_name}</strong> •{' '}
                          {new Date(item.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>

                        <div className="text-xs text-neutral-600 dark:text-neutral-300">
                          {item.row_count} rows processed
                        </div>
                      </div>

                      {!isRolledBack && (
                        <button
                          disabled={isRolling}
                          onClick={() => handleRollback(item)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-medium text-xs transition-colors border border-rose-500/20"
                        >
                          {isRolling ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              <span>Rolling back...</span>
                            </>
                          ) : (
                            <>
                              <RotateCcw size={13} />
                              <span>Rollback</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-neutral-50 dark:bg-[#1A1A1A] border-t border-black/5 dark:border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
