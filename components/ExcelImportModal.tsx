import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Upload, FileSpreadsheet, Check, X, AlertTriangle, Layers,
  ChevronRight, RefreshCw, Eye, ArrowRight, Trash2, Edit2, Plus, Sparkles
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  parseSheet, getDetectedColumnMap, normalizePhones, matchColumn,
  type ParsedRow
} from '@/lib/excel-importer'
import {
  getLists, addList, clearListCompanies, addCompany, addContact,
  addCallLog, checkDuplicateCompany, setListColumns, type AppUser, type ListDef
} from '@/lib/store'
import { genId } from '@/lib/store-helpers'
import { recordImport } from '@/lib/workspace-db'
import { outcomeToStatus, type CompanyStatus } from '@/lib/types'
import toast from 'react-hot-toast'

export interface ExcelImportModalProps {
  isOpen: boolean
  onClose: () => void
  user: AppUser
  currentListId?: string
  onImportComplete?: (targetListId: string, sheetName: string, count: number) => void
}

interface RawSheet {
  name: string
  rows: unknown[][]
  headers: string[]
  rowCount: number
}

type ImportActionType = 'new_list' | 'append' | 'replace'

export default function ExcelImportModal({
  isOpen,
  onClose,
  user,
  currentListId,
  onImportComplete,
}: ExcelImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isReading, setIsReading] = useState(false)
  const [sheets, setSheets] = useState<RawSheet[]>([])
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0)

  // Target Destination Configuration
  const [lists, setLists] = useState<ListDef[]>(getLists())
  const [actionType, setActionType] = useState<ImportActionType>('new_list')
  const [targetListId, setTargetListId] = useState(
    currentListId && currentListId !== 'all' ? currentListId : getLists()[0]?.id || ''
  )
  const [newListName, setNewListName] = useState('')

  // Column Mapping Overrides
  const [customColMap, setCustomColMap] = useState<Record<string, number>>({})
  const [showMapping, setShowMapping] = useState(false)

  // Duplicate and Exclusion Handling
  const [skipDuplicates, setSkipDuplicates] = useState(false)

  // Execution
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Refresh lists when modal opens
  useEffect(() => {
    if (isOpen) {
      const allLists = getLists()
      setLists(allLists)
      if (currentListId && currentListId !== 'all') {
        setTargetListId(currentListId)
      } else {
        setTargetListId(allLists[0]?.id || '')
      }
    }
  }, [isOpen, currentListId])

  // Reset state when closing
  const handleClose = () => {
    if (isImporting) return
    setFile(null)
    setSheets([])
    setSelectedSheetIndex(0)
    setCustomColMap({})
    setShowMapping(false)
    setIsImporting(false)
    setImportProgress(0)
    onClose()
  }

  // Parse uploaded file into workbook sheets
  const handleFileUpload = async (uploadedFile: File) => {
    setIsReading(true)
    setFile(uploadedFile)
    try {
      const buffer = await uploadedFile.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', raw: true })

      const parsedSheets: RawSheet[] = []
      for (const name of wb.SheetNames) {
        if (name.toLowerCase() === 'profile') continue // skip internal meta sheets
        const ws = wb.Sheets[name]
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as unknown[][]
        const nonEmpty = rawRows.filter(r => (r as unknown[]).some(c => c !== '' && c !== null && c !== undefined))
        
        let headerRowIndex = 0
        for (let i = 0; i < Math.min(5, nonEmpty.length); i++) {
          if ((nonEmpty[i] as unknown[]).filter(c => c !== '' && c !== null).length >= 3) {
            headerRowIndex = i
            break
          }
        }

        const headers = nonEmpty.length > 0
          ? (nonEmpty[headerRowIndex] as unknown[]).map(h => String(h ?? '').trim())
          : []

        parsedSheets.push({
          name,
          rows: nonEmpty,
          headers,
          rowCount: Math.max(0, nonEmpty.length - (headerRowIndex + 1)),
        })
      }

      if (parsedSheets.length === 0) {
        toast.error('No sheets with data found in this workbook')
        setIsReading(false)
        return
      }

      setSheets(parsedSheets)
      setSelectedSheetIndex(0)
      setNewListName(cleanSheetName(parsedSheets[0].name))
      setCustomColMap({})
    } catch (err) {
      console.error('Error reading excel file:', err)
      toast.error('Failed to read Excel file. Please ensure it is a valid .xlsx, .xls, or .csv')
    } finally {
      setIsReading(false)
    }
  }

  // Clean sheet name for default list name
  const cleanSheetName = (rawName: string) => {
    return rawName.replace(/[-_]/g, ' ').trim()
  }

  // Switch selected sheet
  const handleSelectSheet = (idx: number) => {
    setSelectedSheetIndex(idx)
    setNewListName(cleanSheetName(sheets[idx].name))
    setCustomColMap({}) // reset custom mapping for the newly picked sheet
  }

  // Active sheet data
  const currentSheet = sheets[selectedSheetIndex]

  // Parse rows of active sheet
  const { parsedRows, activeHeaders, detectedMapping } = useMemo(() => {
    if (!currentSheet || currentSheet.rows.length === 0) {
      return { parsedRows: [], activeHeaders: [], detectedMapping: {} as Record<string, number> }
    }
    const detected = getDetectedColumnMap(currentSheet.headers)
    const effectiveMapping = { ...detected, ...customColMap }
    const res = parseSheet(currentSheet.rows, currentSheet.name, effectiveMapping)
    return {
      parsedRows: res.rows,
      activeHeaders: res.headers || currentSheet.headers,
      detectedMapping: effectiveMapping,
    }
  }, [currentSheet, customColMap])

  // Duplicate analysis
  const duplicateInfo = useMemo(() => {
    let dupCount = 0
    for (const r of parsedRows) {
      if (checkDuplicateCompany(r.company, r.phones)) {
        dupCount++
      }
    }
    return {
      total: parsedRows.length,
      duplicates: dupCount,
      unique: parsedRows.length - dupCount,
    }
  }, [parsedRows])

  // Execute Import
  const handleExecuteImport = async () => {
    if (!currentSheet || parsedRows.length === 0) {
      toast.error('No valid rows to import from this sheet')
      return
    }

    setIsImporting(true)
    setImportProgress(5)

    try {
      let finalTargetListId = targetListId
      const importedCustomColumns = [...new Set(parsedRows.flatMap(row => Object.keys(row.custom_fields)))]

      // 1. Determine list destination
      if (actionType === 'new_list') {
        const listTitle = newListName.trim() || cleanSheetName(currentSheet.name)
        const created = addList(listTitle)
        finalTargetListId = created.id
        setLists(getLists())
      } else if (actionType === 'replace') {
        // Clear old records in this list
        clearListCompanies(finalTargetListId)
        setListColumns(finalTargetListId, importedCustomColumns)
      } else {
        const existingColumns = lists.find(list => list.id === finalTargetListId)?.columns || []
        setListColumns(finalTargetListId, [...existingColumns, ...importedCustomColumns])
      }

      setImportProgress(20)

      // 2. Iterate and import rows
      let importedCount = 0
      let dupSkipped = 0
      const totalToProcess = parsedRows.length
      const importId = genId()

      for (let i = 0; i < totalToProcess; i++) {
        const row = parsedRows[i]
        if (!row.company) continue

        const dup = checkDuplicateCompany(row.company, row.phones)
        if (dup && skipDuplicates) {
          dupSkipped++
          continue
        }

        let status: CompanyStatus = outcomeToStatus(row.outcome)
        if (row.follow_up_date && status !== 'Meeting Set' && status !== 'Won/Interested') {
          status = 'Follow-up Due'
        }

        const comp = addCompany({
          name: row.company,
          list_id: finalTargetListId,
          workspace_id: finalTargetListId,
          import_id: importId,
          source_data: row.source_data,
          custom_fields: row.custom_fields,
          sector: row.sector,
          industry: row.sector,
          location: row.location,
          reference: row.reference,
          status,
        })

        // Add primary contact
        if (row.contact_name || row.phones.length > 0 || row.email) {
          addContact({
            company_id: comp.id,
            name: row.contact_name || 'Primary Contact',
            designation: row.designation,
            phones: row.phones,
            email: row.email,
            is_primary: true,
          })
        }

        // Add historical call log if caller or remark exists
        if (row.caller || row.remark1 || row.remark2 || row.follow_up_date) {
          addCallLog({
            company_id: comp.id,
            caller_id: user.id,
            caller_name: row.caller || 'Excel Import',
            outcome: row.outcome,
            remark: [row.remark1, row.remark2].filter(Boolean).join(' | ') || 'Imported from Excel',
            called_at: new Date().toISOString(),
            follow_up_date: row.follow_up_date,
            contact_id: undefined,
          })
        }

        importedCount++

        // Update progress every 50 rows
        if (i % 50 === 0) {
          setImportProgress(20 + Math.round((i / totalToProcess) * 75))
        }
      }

      setImportProgress(100)

      // Record import for rollback
      await recordImport({
        workspace_id: finalTargetListId,
        user_id: user.id,
        user_name: user.name,
        filename: file?.name || currentSheet.name,
        row_count: importedCount,
        status: 'completed',
        column_mapping: {},
      })

      // Trigger global event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gc:data-changed'))
      }

      toast.success(
        `Imported ${importedCount} companies from "${currentSheet.name}"!` +
        (dupSkipped > 0 ? ` (${dupSkipped} duplicates skipped)` : '')
      )

      if (onImportComplete) {
        onImportComplete(finalTargetListId, currentSheet.name, importedCount)
      }

      handleClose()
    } catch (err) {
      console.error('Import failed:', err)
      toast.error('An error occurred during import. Please check console.')
    } finally {
      setIsImporting(false)
    }
  }

  // Auto-generate all sheets in workbook as CRM lists
  const handleAutoGenerateAllSheets = async () => {
    if (sheets.length === 0) return
    setIsImporting(true)
    setImportProgress(5)

    try {
      let totalImported = 0
      let firstListId = ''

      for (let sIdx = 0; sIdx < sheets.length; sIdx++) {
        const sh = sheets[sIdx]
        const listTitle = cleanSheetName(sh.name)
        const createdList = addList(listTitle)
        if (!firstListId) firstListId = createdList.id

        const detected = getDetectedColumnMap(sh.headers)
        const parsed = parseSheet(sh.rows, sh.name, detected).rows
        setListColumns(createdList.id, [...new Set(parsed.flatMap(row => Object.keys(row.custom_fields)))])

        for (let i = 0; i < parsed.length; i++) {
          const row = parsed[i]
          if (!row.company) continue

          const dup = checkDuplicateCompany(row.company, row.phones)
          if (dup && skipDuplicates) continue

          let status: CompanyStatus = outcomeToStatus(row.outcome)
          if (row.follow_up_date && status !== 'Meeting Set' && status !== 'Won/Interested') {
            status = 'Follow-up Due'
          }

          const comp = addCompany({
            name: row.company,
            list_id: createdList.id,
            source_data: row.source_data,
            custom_fields: row.custom_fields,
            sector: row.sector,
            industry: row.sector,
            location: row.location,
            reference: row.reference,
            status,
          })

          if (row.contact_name || row.phones.length > 0 || row.email) {
            addContact({
              company_id: comp.id,
              name: row.contact_name || 'Primary Contact',
              designation: row.designation,
              phones: row.phones,
              email: row.email,
              is_primary: true,
            })
          }

          if (row.caller || row.remark1 || row.remark2 || row.follow_up_date) {
            addCallLog({
              company_id: comp.id,
              caller_id: user.id,
              caller_name: row.caller || 'Excel Import',
              outcome: row.outcome,
              remark: [row.remark1, row.remark2].filter(Boolean).join(' | ') || 'Imported from Excel',
              called_at: new Date().toISOString(),
              follow_up_date: row.follow_up_date,
              contact_id: undefined,
            })
          }
          totalImported++
        }

        setImportProgress(Math.round(((sIdx + 1) / sheets.length) * 90))
      }

      setImportProgress(100)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gc:data-changed'))
      }

      toast.success(`Generated ${sheets.length} sheets with ${totalImported} leads!`)
      if (onImportComplete && firstListId) {
        onImportComplete(firstListId, 'All Sheets', totalImported)
      }
      handleClose()
    } catch (err) {
      console.error('Batch sheet import failed:', err)
      toast.error('Failed to auto-generate sheets')
    } finally {
      setIsImporting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isImporting) handleClose()
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 20,
          width: '100%',
          maxWidth: 960,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          animation: 'fadeInUp 0.2s ease-out',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #E5E7EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FAFAFA',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: '#0B0B0B',
                color: '#D9F56B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
                Upload & Change Excel Sheet
              </div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>
                Import workbooks, switch sheets dynamically, or update calling lists
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting}
            style={{
              border: 'none',
              background: '#E5E7EB',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isImporting ? 'not-allowed' : 'pointer',
              color: '#374151',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* 1. Upload Dropzone (if no file or user wants to re-upload) */}
          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const dropped = e.dataTransfer.files?.[0]
                if (dropped) handleFileUpload(dropped)
              }}
              style={{
                border: '2px dashed #D1D5DB',
                borderRadius: 16,
                padding: '40px 24px',
                textAlign: 'center',
                background: '#F9FAFB',
                cursor: 'pointer',
                transition: 'border-color 0.2s, background 0.2s',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFileUpload(f)
                }}
              />
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: '#EEF2F6',
                  color: '#0B0B0B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px',
                }}
              >
                <Upload size={24} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
                Drop your Excel (.xlsx, .xls) or CSV here, or <span style={{ color: '#2563EB', textDecoration: 'underline' }}>browse</span>
              </div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>
                Supports multi-sheet workbooks with automatic company, contact, phone, and remark detection
              </div>
            </div>
          ) : (
            <div>
              {/* File Info Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: '#F3F4F6',
                  borderRadius: 12,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileSpreadsheet size={18} color="#059669" />
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{file.name}</span>
                    <span style={{ fontSize: 12, color: '#6B7280', marginLeft: 8 }}>
                      ({Math.round(file.size / 1024)} KB · {sheets.length} {sheets.length === 1 ? 'sheet' : 'sheets'})
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setFile(null)
                    setSheets([])
                  }}
                  style={{
                    border: '1px solid #D1D5DB',
                    background: '#FFFFFF',
                    padding: '4px 10px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <RefreshCw size={12} /> Change File
                </button>
              </div>

              {/* 2. Sheet Selector / Switcher */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Workbook Sheets ({sheets.length} detected)
                  </div>
                  {sheets.length > 1 && (
                    <button
                      type="button"
                      onClick={handleAutoGenerateAllSheets}
                      disabled={isImporting}
                      style={{
                        border: '1px solid #10B981',
                        background: '#ECFDF5',
                        color: '#065F46',
                        padding: '4px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      title="Automatically create a calling list for each sheet and import all rows"
                    >
                      <Sparkles size={13} color="#059669" /> Auto-Generate All {sheets.length} Sheets as CRM Lists
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {sheets.map((sh, idx) => {
                    const isSelected = idx === selectedSheetIndex
                    return (
                      <button
                        key={sh.name}
                        type="button"
                        onClick={() => handleSelectSheet(idx)}
                        style={{
                          border: isSelected ? '2px solid #0B0B0B' : '1px solid #D1D5DB',
                          background: isSelected ? '#0B0B0B' : '#FFFFFF',
                          color: isSelected ? '#D9F56B' : '#374151',
                          padding: '6px 14px',
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: isSelected ? 700 : 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Layers size={13} />
                        <span>{sh.name}</span>
                        <span
                          style={{
                            background: isSelected ? '#D9F56B' : '#E5E7EB',
                            color: '#0B0B0B',
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 10,
                          }}
                        >
                          {sh.rowCount} rows
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 3. Target Destination & Action Options */}
              <div
                style={{
                  background: '#F9FAFB',
                  border: '1px solid #E5E7EB',
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 20,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>
                  Where should data from "{currentSheet?.name}" go?
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 14 }}>
                  {/* Option A: Create New Sheet / List */}
                  <label
                    style={{
                      border: actionType === 'new_list' ? '2px solid #0B0B0B' : '1px solid #D1D5DB',
                      background: actionType === 'new_list' ? '#F0FDF4' : '#FFFFFF',
                      padding: 12,
                      borderRadius: 10,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        name="importAction"
                        checked={actionType === 'new_list'}
                        onChange={() => setActionType('new_list')}
                      />
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>Create New Sheet</span>
                    </div>
                    <span style={{ fontSize: 11, color: '#6B7280', paddingLeft: 22 }}>
                      Create a separate sheet with this worksheet's name
                    </span>
                  </label>

                  {/* Option B: Append to Existing List */}
                  <label
                    style={{
                      border: actionType === 'append' ? '2px solid #0B0B0B' : '1px solid #D1D5DB',
                      background: actionType === 'append' ? '#F0FDF4' : '#FFFFFF',
                      padding: 12,
                      borderRadius: 10,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        name="importAction"
                        checked={actionType === 'append'}
                        disabled={lists.length === 0}
                        onChange={() => setActionType('append')}
                      />
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>Add to Existing Sheet</span>
                    </div>
                    <span style={{ fontSize: 11, color: '#6B7280', paddingLeft: 22 }}>
                      Add leads into an already created calling list
                    </span>
                  </label>

                  {/* Option C: Replace / Overwrite Existing Sheet */}
                  <label
                    style={{
                      border: actionType === 'replace' ? '2px solid #DC2626' : '1px solid #D1D5DB',
                      background: actionType === 'replace' ? '#FEF2F2' : '#FFFFFF',
                      padding: 12,
                      borderRadius: 10,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        name="importAction"
                        checked={actionType === 'replace'}
                        disabled={lists.length === 0}
                        onChange={() => setActionType('replace')}
                      />
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#DC2626' }}>Replace / Overwrite Sheet</span>
                    </div>
                    <span style={{ fontSize: 11, color: '#6B7280', paddingLeft: 22 }}>
                      Clear old records from list and load this sheet freshly
                    </span>
                  </label>
                </div>

                {/* Sub-inputs based on chosen action */}
                {actionType === 'new_list' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', minWidth: 100 }}>
                      New Sheet Name:
                    </span>
                    <input
                      type="text"
                      className="input"
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      placeholder="e.g. Pune Manufacturing Leads"
                      style={{ maxWidth: 360, height: 34, fontSize: 13 }}
                    />
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', minWidth: 100 }}>
                      Select Target Sheet:
                    </span>
                    <div className="select-wrap" style={{ maxWidth: 360, width: '100%' }}>
                      <select
                        value={targetListId}
                        onChange={(e) => setTargetListId(e.target.value)}
                        style={{ height: 34, fontSize: 13 }}
                      >
                        {lists.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {actionType === 'replace' && (
                      <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>
                        ⚠️ Warning: Previous leads in this list will be replaced
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Column Mapping & Duplicates Controls */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <button
                    type="button"
                    onClick={() => setShowMapping(!showMapping)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#2563EB',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: 0,
                    }}
                  >
                    <Edit2 size={12} /> {showMapping ? 'Hide Column Mapping' : 'Customize Column Mapping'}
                  </button>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(e) => setSkipDuplicates(e.target.checked)}
                    />
                    <span>Skip duplicates ({duplicateInfo.duplicates} found)</span>
                  </label>
                </div>

                <div style={{ fontSize: 12, color: '#4B5563' }}>
                  Ready to import: <strong>{skipDuplicates ? duplicateInfo.unique : duplicateInfo.total}</strong> of {duplicateInfo.total} rows
                </div>
              </div>

              {/* Column Mapping Panel (Expandable) */}
              {showMapping && (
                <div
                  style={{
                    background: '#F9FAFB',
                    border: '1px solid #E5E7EB',
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 16,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 10,
                  }}
                >
                  {(
                    [
                      { key: 'company', label: 'Company Name *' },
                      { key: 'contact', label: 'Contact Person' },
                      { key: 'phone', label: 'Phone Number *' },
                      { key: 'designation', label: 'Designation' },
                      { key: 'location', label: 'Location / City' },
                      { key: 'caller', label: 'Assigned Caller' },
                      { key: 'remark1', label: 'Remarks / Notes' },
                      { key: 'followup', label: 'Follow-up Date' },
                    ] as const
                  ).map(({ key, label }) => {
                    const currentIdx = detectedMapping[key] ?? -1
                    return (
                      <div key={key}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#4B5563', marginBottom: 4 }}>
                          {label}
                        </div>
                        <select
                          className="input"
                          style={{ height: 30, fontSize: 11, width: '100%' }}
                          value={currentIdx}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10)
                            setCustomColMap((prev) => ({ ...prev, [key]: val }))
                          }}
                        >
                          <option value={-1}>-- Not Mapped --</option>
                          {activeHeaders.map((h, hIdx) => (
                            <option key={hIdx} value={hIdx}>
                              {h || `Column ${hIdx + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 5. Live Data Preview Table */}
              <div
                style={{
                  border: '1px solid #E5E7EB',
                  borderRadius: 12,
                  overflow: 'hidden',
                  maxHeight: 280,
                  overflowY: 'auto',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#0B0B0B', color: '#FFFFFF', position: 'sticky', top: 0, zIndex: 1 }}>
                      <th style={{ padding: '8px 12px', width: 40 }}>#</th>
                      <th style={{ padding: '8px 12px' }}>Company</th>
                      <th style={{ padding: '8px 12px' }}>Contact</th>
                      <th style={{ padding: '8px 12px' }}>Phone(s)</th>
                      <th style={{ padding: '8px 12px' }}>Location</th>
                      <th style={{ padding: '8px 12px' }}>Remark / Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 25).map((row, idx) => {
                      const isDup = checkDuplicateCompany(row.company, row.phones)
                      return (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: '1px solid #F3F4F6',
                            background: isDup ? '#FEF2F2' : idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB',
                          }}
                        >
                          <td style={{ padding: '6px 12px', color: '#9CA3AF' }}>{idx + 1}</td>
                          <td style={{ padding: '6px 12px', fontWeight: 600, color: '#111827' }}>
                            {row.company}
                            {isDup && (
                              <span
                                style={{
                                  fontSize: 10,
                                  background: '#FEE2E2',
                                  color: '#DC2626',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  marginLeft: 6,
                                }}
                              >
                                Duplicate
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '6px 12px', color: '#4B5563' }}>
                            {row.contact_name || '-'}
                            {row.designation && <div style={{ fontSize: 10, color: '#9CA3AF' }}>{row.designation}</div>}
                          </td>
                          <td style={{ padding: '6px 12px', color: '#111827', fontFamily: 'monospace' }}>
                            {row.phones.join(', ') || '-'}
                          </td>
                          <td style={{ padding: '6px 12px', color: '#6B7280' }}>
                            {row.location || '-'}
                          </td>
                          <td style={{ padding: '6px 12px', color: '#4B5563', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.remark1 || row.outcome || '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {parsedRows.length > 25 && (
                <div style={{ textAlign: 'center', fontSize: 11, color: '#6B7280', marginTop: 6 }}>
                  Showing first 25 of {parsedRows.length} rows. All rows will be imported.
                </div>
              )}
            </div>
          )}

          {/* Progress Bar when importing */}
          {isImporting && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>Importing leads...</span>
                <span>{importProgress}%</span>
              </div>
              <div style={{ height: 8, background: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: '#0B0B0B',
                    width: `${importProgress}%`,
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #E5E7EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FAFAFA',
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleClose}
            disabled={isImporting}
          >
            Cancel
          </button>

          {file && (
            <button
              type="button"
              className="btn btn-lime"
              onClick={handleExecuteImport}
              disabled={isImporting || parsedRows.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 700,
                padding: '8px 20px',
              }}
            >
              {isImporting ? (
                <>Importing...</>
              ) : (
                <>
                  <Check size={16} />
                  <span>
                    Import {skipDuplicates ? duplicateInfo.unique : duplicateInfo.total} Leads into{' '}
                    {actionType === 'new_list'
                      ? `"${newListName || currentSheet?.name}"`
                      : lists.find((l) => l.id === targetListId)?.name || 'List'}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
