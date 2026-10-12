import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type { AppUser } from '@/lib/store'
import { getUsers, getLists, addList, clearAllData, addCompany, addContact, addCallLog, checkDuplicateCompany } from '@/lib/store'
import { parseSheet, normalizePhones, matchColumn } from '@/lib/excel-importer'
import type { ParsedRow } from '@/lib/excel-importer'
import { outcomeToStatus, getAvatar } from '@/lib/types'
import type { CompanyStatus, OutcomeType } from '@/lib/types'
import {
  Upload, FileSpreadsheet, ChevronRight, ChevronLeft, Check, X,
  AlertTriangle, Trash2, Edit3, Plus, Download, RefreshCw, Eye
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Types ────────────────────────────────────────────────────────────────────

interface SheetData {
  sheetName: string
  rawRows: unknown[][]
  headers: string[]
  rowCount: number
  enabled: boolean
  targetListId: string
  targetListName: string
}

interface ImportPreviewRow extends ParsedRow {
  _selected: boolean
  _duplicate: boolean
  _rowIndex: number
}

type WizardStep = 'idle' | 'loading' | 'select-sheets' | 'preview-data' | 'importing' | 'done'

// ── Main Component ───────────────────────────────────────────────────────────

export default function SettingsPage({ user }: { user: AppUser }) {
  const [tab, setTab] = useState<'team' | 'lists' | 'import' | 'data'>('import')
  const [users] = useState(getUsers())
  const [lists, setLists] = useState(getLists())
  const [newListName, setNewListName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const refreshLists = () => setLists(getLists())
    window.addEventListener('gc:data-changed', refreshLists)
    return () => window.removeEventListener('gc:data-changed', refreshLists)
  }, [])

  // ── Import Wizard State ──────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>('idle')
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets] = useState<SheetData[]>([])
  const [activeSheetIndex, setActiveSheetIndex] = useState(0)
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([])
  const [editingRow, setEditingRow] = useState<number | null>(null)
  const [importResult, setImportResult] = useState<{ sheet: string; imported: number; skipped: number; duplicates: number }[]>([])
  const [newListModal, setNewListModal] = useState(false)
  const [newListInput, setNewListInput] = useState('')

  // Refs to persist raw workbook data across steps
  const workbookRef = useRef<SheetData[]>([])

  if (user.role !== 'admin') {
    return (
      <div className="empty-state" style={{ height: '100%' }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontWeight: 600 }}>Admin only</div>
        <div style={{ fontSize: 13, color: '#888' }}>Settings are only accessible to admins.</div>
      </div>
    )
  }

  const handleAddList = () => {
    if (!newListName.trim()) return
    addList(newListName.trim())
    setLists(getLists())
    setNewListName('')
  }

  // ── Step 1: File Upload ──────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setStep('loading')
    setFileName(file.name)

    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)

      const parsed: SheetData[] = wb.SheetNames
        .filter(name => name.toLowerCase() !== 'profile') // skip profile sheet
        .map(name => {
          const ws = wb.Sheets[name]
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
          const nonEmpty = rows.filter(r => (r as unknown[]).some(c => c !== '' && c !== null && c !== undefined))
          const headers = nonEmpty.length > 0 ? (nonEmpty[0] as unknown[]).map(h => String(h ?? '')) : []

          // Auto-detect target list ID from sheet name
          const listId = guessListId(name)
          const listMatch = getLists().find(l => l.id === listId)

          return {
            sheetName: name,
            rawRows: nonEmpty,
            headers: headers.slice(0, 12),
            rowCount: Math.max(0, nonEmpty.length - 1),
            enabled: nonEmpty.length > 1, // at least 1 data row
            targetListId: listId,
            targetListName: listMatch?.name || name,
          }
        })

      workbookRef.current = parsed
      setSheets(parsed)
      setStep('select-sheets')
    } catch (err) {
      console.error('File parse error:', err)
      toast.error('Failed to read file. Make sure it\'s a valid Excel/CSV file.')
      setStep('idle')
    }

    // Reset file input
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── Step 2 → 3: Parse selected sheets and generate preview ─────────────
  const handleProceedToPreview = () => {
    const enabledSheets = sheets.filter(s => s.enabled)
    if (enabledSheets.length === 0) {
      toast.error('Select at least one sheet to import.')
      return
    }
    setActiveSheetIndex(0)
    generatePreviewForSheet(0, enabledSheets)
    setStep('preview-data')
  }

  const generatePreviewForSheet = (index: number, sourceSheets?: SheetData[]) => {
    const enabledSheets = (sourceSheets || sheets.filter(s => s.enabled))
    if (index >= enabledSheets.length) return

    const sheet = enabledSheets[index]
    const { rows: parsed } = parseSheet(sheet.rawRows, sheet.sheetName)

    const preview: ImportPreviewRow[] = parsed.map((row, i) => {
      const isDup = !!checkDuplicateCompany(row.company, row.phones)
      return {
        ...row,
        _selected: !isDup, // deselect duplicates by default
        _duplicate: isDup,
        _rowIndex: i,
      }
    })

    setPreviewRows(preview)
    setActiveSheetIndex(index)
  }

  // ── Navigate between sheet previews ────────────────────────────────────
  const enabledSheets = useMemo(() => sheets.filter(s => s.enabled), [sheets])

  const handlePrevSheet = () => {
    if (activeSheetIndex > 0) {
      generatePreviewForSheet(activeSheetIndex - 1)
    }
  }

  const handleNextSheet = () => {
    if (activeSheetIndex < enabledSheets.length - 1) {
      generatePreviewForSheet(activeSheetIndex + 1)
    }
  }

  // ── Toggle row selection ───────────────────────────────────────────────
  const toggleRow = (idx: number) => {
    setPreviewRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, _selected: !r._selected } : r
    ))
  }

  const toggleAll = (selected: boolean) => {
    setPreviewRows(prev => prev.map(r => ({ ...r, _selected: selected })))
  }

  // ── Edit row inline ────────────────────────────────────────────────────
  const updateRowField = (idx: number, field: keyof ParsedRow, value: string) => {
    setPreviewRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      if (field === 'phones') {
        return { ...r, phones: value.split(',').map(p => p.trim()).filter(Boolean) }
      }
      return { ...r, [field]: value }
    }))
  }

  // ── Change target list for current sheet ───────────────────────────────
  const changeSheetTarget = (sheetIdx: number, listId: string) => {
    const listMatch = getLists().find(l => l.id === listId)
    setSheets(prev => prev.map((s, i) =>
      i === sheetIdx ? { ...s, targetListId: listId, targetListName: listMatch?.name || s.sheetName } : s
    ))
  }

  // ── Create new list on-the-fly ─────────────────────────────────────────
  const handleCreateList = () => {
    if (!newListInput.trim()) return
    const newList = addList(newListInput.trim())
    setLists(getLists())
    // Apply to current sheet
    const sheetToUpdate = enabledSheets[activeSheetIndex]
    if (sheetToUpdate) {
      const globalIdx = sheets.findIndex(s => s.sheetName === sheetToUpdate.sheetName)
      if (globalIdx >= 0) changeSheetTarget(globalIdx, newList.id)
    }
    setNewListInput('')
    setNewListModal(false)
    toast.success(`List "${newList.name}" created`)
  }

  // ── Step 4: Do the import ──────────────────────────────────────────────
  const handleImport = async () => {
    setStep('importing')
    const results: typeof importResult = []

    for (const sheet of enabledSheets) {
      const { rows: parsed } = parseSheet(sheet.rawRows, sheet.sheetName)

      // If this is the currently previewed sheet, use edited preview rows instead
      const rowsToImport = sheet.sheetName === enabledSheets[activeSheetIndex]?.sheetName
        ? previewRows.filter(r => r._selected)
        : parsed

      let imported = 0, skipped = 0, duplicates = 0

      for (const row of rowsToImport) {
        if (!row.company) { skipped++; continue }

        const dup = checkDuplicateCompany(row.company, row.phones)
        if (dup) { duplicates++; continue }

        let status: CompanyStatus = outcomeToStatus(row.outcome)
        if (row.follow_up_date && status !== 'Meeting Set' && status !== 'Won/Interested') {
          status = 'Follow-up Due'
        }

        const company = addCompany({
          name: row.company,
          list_id: sheet.targetListId,
          sector: row.sector,
          industry: row.sector,
          location: row.location,
          reference: row.reference,
          status,
        })

        if (row.contact_name) {
          addContact({
            company_id: company.id,
            name: row.contact_name,
            designation: row.designation,
            phones: row.phones,
            email: row.email,
            is_primary: true,
          })
        }

        if (row.remark1 || row.caller !== 'Unknown') {
          const callerUser = getUsers().find(u => u.name.toLowerCase() === row.caller.toLowerCase())
          const remark = [row.remark1, row.remark2].filter(Boolean).join(' | ')
          addCallLog({
            company_id: company.id,
            caller_id: callerUser?.id || user.id,
            caller_name: row.caller,
            called_at: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
            outcome: row.outcome,
            remark: remark || undefined,
            follow_up_date: row.follow_up_date,
          })
        }

        imported++
      }

      results.push({ sheet: sheet.sheetName, imported, skipped, duplicates })
    }

    setImportResult(results)
    setStep('done')
    // Dispatch event so other pages refresh
    window.dispatchEvent(new CustomEvent('gc:data-changed', { detail: 'import' }))
  }

  // ── Reset import wizard ────────────────────────────────────────────────
  const resetImport = () => {
    setStep('idle')
    setSheets([])
    setPreviewRows([])
    setImportResult([])
    setFileName('')
    setActiveSheetIndex(0)
    workbookRef.current = []
  }

  const handleClearData = () => {
    if (!confirm('This will delete ALL data (companies, contacts, calls, tasks, notes). Are you sure?')) return
    clearAllData()
    window.location.reload()
  }


  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header">
        <div className="page-header-left">
          <div className="greeting" style={{ fontSize: 18 }}>Settings</div>
          <div className="greeting-sub">Admin panel — manage team, lists, and data</div>
        </div>
      </div>

      <div style={{ padding: '0 24px', borderBottom: '1px solid #F0F0F0', flexShrink: 0 }}>
        <div className="tab-list" style={{ width: 'auto', background: 'transparent', padding: 0, gap: 0 }}>
          {(['team', 'lists', 'import', 'data'] as const).map(t => (
            <button
              key={t}
              className={`tab-item ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
              style={{
                borderRadius: 0, borderBottom: `2px solid ${tab === t ? '#0B0B0B' : 'transparent'}`,
                paddingBottom: 14, background: 'none',
              }}
            >
              {t === 'import' ? '📂 Import' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {/* Team */}
        {tab === 'team' && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Team Members</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {users.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: '#F9F9F9', borderRadius: 14, border: '1px solid #F0F0F0' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: u.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 14, overflow: 'hidden', border: '1px solid #E5E5E5'
                  }}>
                    {u.avatar || getAvatar(u.name) ? (
                      <img
                        src={u.avatar || getAvatar(u.name)}
                        alt={u.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }}
                      />
                    ) : (
                      u.name[0]
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{u.email}</div>
                  </div>
                  <span className={`badge ${u.role === 'admin' ? 'badge-black' : 'badge-gray'}`}>
                    {u.role}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: 14, background: '#FEF3C7', borderRadius: 12, fontSize: 12, color: '#92400E' }}>
              💡 To change passwords or add team members, update the <code>DEFAULT_USERS</code> array in <code>lib/store.ts</code> and clear local storage.
            </div>
          </div>
        )}

        {/* Lists */}
        {tab === 'lists' && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Calling Lists</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input className="input" style={{ maxWidth: 280 }} placeholder="New list name…" value={newListName} onChange={e => setNewListName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddList()} />
              <button className="btn btn-primary" onClick={handleAddList}>+ Add List</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {lists.map(l => (
                <div key={l.id} style={{ padding: '6px 14px', background: '#F9F9F9', borderRadius: 10, border: '1px solid #E8E8E8', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {l.type === 'freelancer' ? '👤' : '🏢'} {l.name}
                  <span className="badge badge-gray" style={{ fontSize: 10 }}>{l.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Import — Multi-step Wizard */}
        {tab === 'import' && (
          <div style={{ maxWidth: step === 'preview-data' ? '100%' : 680 }}>
            {/* Wizard Progress Bar */}
            {step !== 'idle' && step !== 'loading' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24 }}>
                {['Upload', 'Select Sheets', 'Preview & Edit', 'Import'].map((label, i) => {
                  const stepOrder: WizardStep[] = ['select-sheets', 'preview-data', 'importing']
                  const currentIdx = step === 'done' ? 3 : stepOrder.indexOf(step)
                  const isActive = i <= currentIdx + 1
                  const isCurrent = i === currentIdx + 1
                  return (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: isActive ? '#0B0B0B' : '#E8E8E8',
                        color: isActive ? '#FFF' : '#888',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                        border: isCurrent ? '2px solid #D9F56B' : 'none',
                      }}>
                        {i < currentIdx + 1 ? <Check size={12} /> : i + 1}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: isCurrent ? 700 : 500, color: isActive ? '#0B0B0B' : '#888', marginLeft: 6, whiteSpace: 'nowrap' }}>
                        {label}
                      </div>
                      {i < 3 && <div style={{ flex: 1, height: 2, background: isActive ? '#0B0B0B' : '#E8E8E8', margin: '0 8px' }} />}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Step: Idle — Upload */}
            {step === 'idle' && (
              <>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Import Excel / CSV</div>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
                  Upload your calling sheet. The system will auto-detect columns, clean phone numbers, classify outcomes, and de-duplicate companies.
                </div>
                <div
                  style={{
                    border: '2px dashed #DDD', borderRadius: 16, padding: 48,
                    textAlign: 'center', cursor: 'pointer',
                    transition: 'border-color 0.2s, background 0.2s',
                    background: '#FAFAFA',
                  }}
                  onClick={() => fileRef.current?.click()}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#0B0B0B'; e.currentTarget.style.background = '#F5F5F5' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#DDD'; e.currentTarget.style.background = '#FAFAFA' }}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#D9F56B'; e.currentTarget.style.background = '#F5FFD0' }}
                  onDragLeave={e => { e.currentTarget.style.borderColor = '#DDD'; e.currentTarget.style.background = '#FAFAFA' }}
                  onDrop={e => {
                    e.preventDefault()
                    e.currentTarget.style.borderColor = '#DDD'
                    e.currentTarget.style.background = '#FAFAFA'
                    const file = e.dataTransfer.files[0]
                    if (file) {
                      const fakeEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>
                      handleFileChange(fakeEvent)
                    }
                  }}
                >
                  <Upload size={40} color="#888" strokeWidth={1.5} style={{ marginBottom: 12 }} />
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Drop your Excel file here</div>
                  <div style={{ fontSize: 12, color: '#888' }}>or click to browse — supports .xlsx, .xls, .csv</div>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileChange} />
                </div>
              </>
            )}

            {/* Step: Loading */}
            {step === 'loading' && (
              <div className="empty-state" style={{ padding: '60px 0' }}>
                <div className="spinner" />
                <div style={{ marginTop: 12 }}>Reading {fileName}…</div>
              </div>
            )}

            {/* Step: Select Sheets */}
            {step === 'select-sheets' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>Select Sheets to Import</div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
                      <FileSpreadsheet size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      {fileName} — {sheets.length} sheets found
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                  {sheets.map((s, i) => (
                    <div
                      key={s.sheetName}
                      style={{
                        padding: 16, background: s.enabled ? '#FAFFFE' : '#F9F9F9',
                        borderRadius: 14, border: `1px solid ${s.enabled ? '#D9F56B' : '#F0F0F0'}`,
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Checkbox */}
                        <div
                          onClick={() => setSheets(prev => prev.map((ss, ii) => ii === i ? { ...ss, enabled: !ss.enabled } : ss))}
                          style={{
                            width: 22, height: 22, borderRadius: 6, cursor: 'pointer',
                            border: `2px solid ${s.enabled ? '#0B0B0B' : '#CCC'}`,
                            background: s.enabled ? '#0B0B0B' : '#FFF',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s', flexShrink: 0,
                          }}
                        >
                          {s.enabled && <Check size={13} color="#FFF" strokeWidth={3} />}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{s.sheetName}</div>
                          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                            {s.rowCount} rows · {s.headers.filter(h => h).length} columns
                          </div>
                        </div>

                        <span className="badge badge-gray">{s.rowCount} rows</span>
                      </div>

                      {/* Target list selector */}
                      {s.enabled && (
                        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>Import to:</span>
                          <select
                            value={s.targetListId}
                            onChange={e => changeSheetTarget(i, e.target.value)}
                            className="input"
                            style={{ fontSize: 12, padding: '4px 8px', maxWidth: 220 }}
                          >
                            {getLists().map(l => (
                              <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                          </select>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: 11, padding: '2px 8px' }}
                            onClick={() => setNewListModal(true)}
                          >
                            <Plus size={12} /> New List
                          </button>
                        </div>
                      )}

                      {/* Column preview */}
                      {s.enabled && (
                        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {s.headers.filter(h => h).slice(0, 10).map((h, hi) => (
                            <span key={hi} style={{
                              padding: '2px 8px', background: '#F0F0F0', borderRadius: 6,
                              fontSize: 10, color: '#555', fontFamily: 'monospace',
                            }}>
                              {h}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                  <button className="btn btn-ghost" onClick={resetImport}>
                    <X size={14} /> Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleProceedToPreview}
                    disabled={sheets.filter(s => s.enabled).length === 0}
                  >
                    Preview Data <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Step: Preview & Edit Data */}
            {step === 'preview-data' && (
              <div>
                {/* Sheet tabs */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={handlePrevSheet}
                      disabled={activeSheetIndex === 0}
                      style={{ padding: '4px 8px' }}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {enabledSheets[activeSheetIndex]?.sheetName}
                      <span style={{ fontWeight: 400, color: '#888', marginLeft: 8, fontSize: 12 }}>
                        Sheet {activeSheetIndex + 1} of {enabledSheets.length}
                      </span>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={handleNextSheet}
                      disabled={activeSheetIndex >= enabledSheets.length - 1}
                      style={{ padding: '4px 8px' }}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Target list for current sheet */}
                    <span style={{ fontSize: 12, color: '#666' }}>→</span>
                    <select
                      value={enabledSheets[activeSheetIndex]?.targetListId}
                      onChange={e => {
                        const globalIdx = sheets.findIndex(s => s.sheetName === enabledSheets[activeSheetIndex]?.sheetName)
                        if (globalIdx >= 0) changeSheetTarget(globalIdx, e.target.value)
                      }}
                      className="input"
                      style={{ fontSize: 12, padding: '4px 8px', maxWidth: 180 }}
                    >
                      {getLists().map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Selection controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => toggleAll(true)}>Select All</button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => toggleAll(false)}>Deselect All</button>
                    <span style={{ color: '#888', padding: '4px 0' }}>
                      {previewRows.filter(r => r._selected).length} of {previewRows.length} selected
                      {previewRows.filter(r => r._duplicate).length > 0 && (
                        <span style={{ color: '#D97706', marginLeft: 8 }}>
                          ⚠ {previewRows.filter(r => r._duplicate).length} duplicates
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Data Table */}
                <div style={{
                  overflow: 'auto', borderRadius: 12, border: '1px solid #E8E8E8',
                  maxHeight: 'calc(100vh - 380px)', background: '#FFF',
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F5F5F5', position: 'sticky', top: 0, zIndex: 2 }}>
                        <th style={{ ...thStyle, width: 36 }}>✓</th>
                        <th style={thStyle}>Company</th>
                        <th style={thStyle}>Contact</th>
                        <th style={thStyle}>Phone</th>
                        <th style={thStyle}>Designation</th>
                        <th style={thStyle}>Location</th>
                        <th style={thStyle}>Outcome</th>
                        <th style={thStyle}>Remark</th>
                        <th style={thStyle}>Follow-up</th>
                        <th style={{ ...thStyle, width: 60 }}>Edit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, idx) => (
                        <tr
                          key={idx}
                          style={{
                            background: row._duplicate ? '#FFF8EC' : idx % 2 === 0 ? '#FFF' : '#FCFCFC',
                            opacity: row._selected ? 1 : 0.5,
                            transition: 'opacity 0.1s',
                          }}
                        >
                          <td style={tdStyle}>
                            <div
                              onClick={() => toggleRow(idx)}
                              style={{
                                width: 18, height: 18, borderRadius: 4, cursor: 'pointer',
                                border: `2px solid ${row._selected ? '#0B0B0B' : '#CCC'}`,
                                background: row._selected ? '#0B0B0B' : '#FFF',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >
                              {row._selected && <Check size={10} color="#FFF" strokeWidth={3} />}
                            </div>
                          </td>

                          {editingRow === idx ? (
                            <>
                              <td style={tdStyle}>
                                <input className="input" style={inlineInputStyle} value={row.company} onChange={e => updateRowField(idx, 'company', e.target.value)} />
                              </td>
                              <td style={tdStyle}>
                                <input className="input" style={inlineInputStyle} value={row.contact_name} onChange={e => updateRowField(idx, 'contact_name', e.target.value)} />
                              </td>
                              <td style={tdStyle}>
                                <input className="input" style={inlineInputStyle} value={row.phones.join(', ')} onChange={e => updateRowField(idx, 'phones', e.target.value)} />
                              </td>
                              <td style={tdStyle}>
                                <input className="input" style={inlineInputStyle} value={row.designation || ''} onChange={e => updateRowField(idx, 'designation', e.target.value)} />
                              </td>
                              <td style={tdStyle}>
                                <input className="input" style={inlineInputStyle} value={row.location || ''} onChange={e => updateRowField(idx, 'location', e.target.value)} />
                              </td>
                              <td style={tdStyle}>
                                <span style={{ fontSize: 11 }}>{row.outcome}</span>
                              </td>
                              <td style={tdStyle}>
                                <input className="input" style={inlineInputStyle} value={row.remark1 || ''} onChange={e => updateRowField(idx, 'remark1', e.target.value)} />
                              </td>
                              <td style={tdStyle}>
                                <input className="input" style={inlineInputStyle} type="date" value={row.follow_up_date || ''} onChange={e => updateRowField(idx, 'follow_up_date', e.target.value)} />
                              </td>
                              <td style={tdStyle}>
                                <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }} onClick={() => setEditingRow(null)}>
                                  <Check size={12} color="#16A34A" />
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={tdStyle}>
                                <div style={{ fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {row.company}
                                </div>
                                {row._duplicate && (
                                  <div style={{ fontSize: 10, color: '#D97706', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <AlertTriangle size={10} /> Duplicate
                                  </div>
                                )}
                              </td>
                              <td style={tdStyle}>{row.contact_name || <span style={{ color: '#CCC' }}>—</span>}</td>
                              <td style={tdStyle}>
                                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                                  {row.phones[0] || <span style={{ color: '#CCC' }}>—</span>}
                                </span>
                              </td>
                              <td style={tdStyle}>{row.designation || <span style={{ color: '#CCC' }}>—</span>}</td>
                              <td style={tdStyle}>{row.location || <span style={{ color: '#CCC' }}>—</span>}</td>
                              <td style={tdStyle}>
                                <span style={{
                                  fontSize: 10, padding: '2px 6px', borderRadius: 4,
                                  background: getOutcomeBg(row.outcome), color: getOutcomeColor(row.outcome),
                                  fontWeight: 600, whiteSpace: 'nowrap',
                                }}>
                                  {row.outcome}
                                </span>
                              </td>
                              <td style={tdStyle}>
                                <div style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: '#555' }}>
                                  {row.remark1 || <span style={{ color: '#CCC' }}>—</span>}
                                </div>
                              </td>
                              <td style={tdStyle}>
                                <span style={{ fontSize: 11, color: row.follow_up_date ? '#0B0B0B' : '#CCC' }}>
                                  {row.follow_up_date || '—'}
                                </span>
                              </td>
                              <td style={tdStyle}>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '2px 6px' }}
                                  onClick={() => setEditingRow(idx)}
                                >
                                  <Edit3 size={12} />
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                  <button className="btn btn-ghost" onClick={() => setStep('select-sheets')}>
                    <ChevronLeft size={14} /> Back to Sheets
                  </button>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-ghost" onClick={resetImport}>
                      <X size={14} /> Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleImport}
                      disabled={previewRows.filter(r => r._selected).length === 0}
                      style={{ minWidth: 160 }}
                    >
                      Import {previewRows.filter(r => r._selected).length} companies <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step: Importing */}
            {step === 'importing' && (
              <div className="empty-state" style={{ padding: '60px 0' }}>
                <div className="spinner" />
                <div style={{ marginTop: 12, fontWeight: 600 }}>Importing data…</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>This may take a moment for large files</div>
              </div>
            )}

            {/* Step: Done */}
            {step === 'done' && (
              <div>
                <div style={{
                  textAlign: 'center', padding: '24px 0', marginBottom: 20,
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%', background: '#D9F56B',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}>
                    <Check size={28} color="#0B0B0B" strokeWidth={3} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>Import Complete!</div>
                  <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
                    {importResult.reduce((s, r) => s + r.imported, 0)} companies imported across {importResult.length} sheets
                  </div>
                </div>

                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 14, padding: 16, marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>Summary</div>
                  {importResult.map(r => (
                    <div key={r.sheet} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #DCFCE7', fontSize: 13 }}>
                      <span style={{ fontWeight: 500 }}>{r.sheet}</span>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <span style={{ color: '#15803D', fontWeight: 600 }}>{r.imported} imported</span>
                        {r.duplicates > 0 && <span style={{ color: '#D97706' }}>{r.duplicates} dupes</span>}
                        {r.skipped > 0 && <span style={{ color: '#DC2626' }}>{r.skipped} skipped</span>}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-ghost" onClick={resetImport}>
                    <RefreshCw size={14} /> Import Another File
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Data management */}
        {tab === 'data' && (
          <div style={{ maxWidth: 480 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Data Management</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: 16, background: '#F9F9F9', borderRadius: 14, border: '1px solid #F0F0F0' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Import Calling Data</div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Import companies and contacts from your Excel sheet (.xlsx, .xls)</div>
                <button className="btn btn-primary btn-sm" onClick={() => setTab('import')}>↗ Go to Excel Importer</button>
              </div>

              <div style={{ padding: 16, background: '#FFF5F5', borderRadius: 14, border: '1px solid #FECACA' }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: '#DC2626' }}>⚠ Clear All Data</div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>This will delete all companies, contacts, calls, tasks, and notes.</div>
                <button className="btn btn-orange btn-sm" onClick={handleClearData}>🗑 Clear All Data</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New List Modal */}
      {newListModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          onClick={() => setNewListModal(false)}
        >
          <div
            style={{
              background: '#FFF', borderRadius: 16, padding: 24, width: 360,
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Create New List</div>
            <input
              className="input"
              placeholder="List name (e.g. Hinjewadi)"
              value={newListInput}
              onChange={e => setNewListInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateList()}
              autoFocus
              style={{ marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setNewListModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateList}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function guessListId(sheetName: string): string {
  // Convert sheet name to a URL-safe slug to use as the list ID.
  // Lists are fully dynamic — no hardcoded presets.
  return sheetName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'imported-list'
}

function getOutcomeBg(outcome: string): string {
  if (outcome === 'Meeting Scheduled' || outcome === 'Connected - Interested') return '#DCFCE7'
  if (outcome === 'Not Picked' || outcome === 'Call Back Later') return '#FEF3C7'
  if (outcome === 'Not Interested' || outcome === 'Invalid Number' || outcome === 'Dead') return '#FEE2E2'
  if (outcome === 'Profile / Mail Sent') return '#EFF6FF'
  return '#F3F4F6'
}

function getOutcomeColor(outcome: string): string {
  if (outcome === 'Meeting Scheduled' || outcome === 'Connected - Interested') return '#15803D'
  if (outcome === 'Not Picked' || outcome === 'Call Back Later') return '#92400E'
  if (outcome === 'Not Interested' || outcome === 'Invalid Number' || outcome === 'Dead') return '#DC2626'
  if (outcome === 'Profile / Mail Sent') return '#1D4ED8'
  return '#555'
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11,
  borderBottom: '2px solid #E8E8E8', color: '#555', whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '6px 10px', borderBottom: '1px solid #F0F0F0', verticalAlign: 'middle',
}

const inlineInputStyle: React.CSSProperties = {
  fontSize: 11, padding: '3px 6px', borderRadius: 6, width: '100%', minWidth: 80,
}
