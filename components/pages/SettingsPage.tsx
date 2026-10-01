'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import type { AppUser } from '@/lib/store'
import { getUsers, getLists, addList, clearAllData, markSeeded } from '@/lib/store'
import { classifyOutcome, normalizePhones, parseExcelDate, parseSheet } from '@/lib/excel-importer'
import { addCompany, addContact, addCallLog, checkDuplicateCompany } from '@/lib/store'
import { outcomeToStatus, getAvatar } from '@/lib/types'
import type { CompanyStatus } from '@/lib/types'

export default function SettingsPage({ user }: { user: AppUser }) {
  const [tab, setTab] = useState<'team' | 'lists' | 'import' | 'data'>('team')
  const [users] = useState(getUsers())
  const [lists, setLists] = useState(getLists())
  const [newListName, setNewListName] = useState('')
  const [importState, setImportState] = useState<'idle' | 'loading' | 'preview' | 'importing' | 'done'>('idle')
  const [importData, setImportData] = useState<{ sheetName: string; rowCount: number; preview: string[] }[]>([])
  const [importResult, setImportResult] = useState<{ sheet: string; imported: number; skipped: number; duplicates: number }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportState('loading')

    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer)

    const preview = wb.SheetNames.map(name => {
      const ws = wb.Sheets[name]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
      const nonEmpty = rows.filter(r => r.some(c => c !== ''))
      const headers = nonEmpty[0] as string[] || []
      return {
        sheetName: name,
        rowCount: nonEmpty.length - 1,
        preview: headers.slice(0, 8).map(String),
        rawRows: nonEmpty,
      }
    })

    setImportData(preview.map(p => ({ sheetName: p.sheetName, rowCount: p.rowCount, preview: p.preview })))
    setImportState('preview')

    // Store raw for import
    ;(window as typeof window & { __importData?: typeof preview })['__importData'] = preview
  }

  const handleImport = async () => {
    setImportState('importing')
    const raw = (window as typeof window & { __importData?: { sheetName: string; rawRows: unknown[][]; rowCount: number; preview: string[] }[] })['__importData']
    if (!raw) return

    const SHEET_MAP: Record<string, string> = {
      'CONNECTION LIST': 'connection-list',
      'Sheet1': 'cold-calling-1',
      'New List': 'new-list',
      'Freelancers': 'freelancers',
      'COLD CALLING 1': 'cold-calling-1',
      'COLD CALLING 2': 'cold-calling-2',
      'Data Centres': 'data-centres',
      'KHARADI': 'kharadi',
      'RANJANGAON': 'ranjangaon',
      'BHOSARI': 'bhosari',
      'CHAKAN': 'chakan',
    }

    const results = []

    for (const sheet of raw) {
      if (sheet.sheetName === 'profile') continue

      const listId = SHEET_MAP[sheet.sheetName] || sheet.sheetName.toLowerCase().replace(/\s+/g, '-')
      const { rows: parsed } = parseSheet(sheet.rawRows, sheet.sheetName)

      let imported = 0, skipped = 0, duplicates = 0

      for (const row of parsed) {
        if (!row.company) { skipped++; continue }

        const dup = checkDuplicateCompany(row.company, row.phones)
        if (dup) { duplicates++; continue }

        let status: CompanyStatus = outcomeToStatus(row.outcome)
        if (row.follow_up_date && status !== 'Meeting Set' && status !== 'Won/Interested') {
          status = 'Follow-up Due'
        }

        const company = addCompany({
          name: row.company,
          list_id: listId,
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
    setImportState('done')
  }

  const handleClearData = () => {
    if (!confirm('This will delete ALL data. Are you sure?')) return
    clearAllData()
    window.location.reload()
  }

  const handleLoadSeedData = async () => {
    if (!confirm('This will load the original Excel seed data. Current data will be kept. Continue?')) return
    try {
      const res = await fetch('/api/seed')
      const data = await res.json()
      if (data.ok) {
        markSeeded()
        window.location.reload()
      }
    } catch {
      alert('Could not load seed data from API. Try importing the Excel file manually.')
    }
  }

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
              {t.charAt(0).toUpperCase() + t.slice(1)}
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

        {/* Import */}
        {tab === 'import' && (
          <div style={{ maxWidth: 680 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Import Excel / CSV</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
              Upload your Connection List Excel file. The system will auto-detect columns, clean phones, classify outcomes, and de-duplicate companies.
            </div>

            {importState === 'idle' && (
              <div
                style={{
                  border: '2px dashed #DDD', borderRadius: 16, padding: 40,
                  textAlign: 'center', cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onClick={() => fileRef.current?.click()}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#0B0B0B')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#DDD')}
              >
                <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop your Excel file here</div>
                <div style={{ fontSize: 12, color: '#888' }}>Supports .xlsx, .xls, .csv</div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileChange} />
              </div>
            )}

            {importState === 'loading' && (
              <div className="empty-state"><div className="spinner" /><div>Reading file…</div></div>
            )}

            {importState === 'preview' && (
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Preview — {importData.length} sheets found</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  {importData.map(d => (
                    <div key={d.sheetName} style={{ padding: 14, background: '#F9F9F9', borderRadius: 12, border: '1px solid #F0F0F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{d.sheetName}</div>
                        <span className="badge badge-gray">{d.rowCount} rows</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {d.preview.map((h, i) => (
                          <span key={i} style={{ padding: '2px 8px', background: '#E8E8E8', borderRadius: 6, fontSize: 11 }}>{h || '(empty)'}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-ghost" onClick={() => setImportState('idle')}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleImport}>Import All Sheets →</button>
                </div>
              </div>
            )}

            {importState === 'importing' && (
              <div className="empty-state"><div className="spinner" /><div>Importing data…</div></div>
            )}

            {importState === 'done' && (
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12, color: '#15803D' }}>✅ Import Complete!</div>
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Summary</div>
                  {importResult.map(r => (
                    <div key={r.sheet} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                      <span>{r.sheet}</span>
                      <span>
                        <span style={{ color: '#15803D' }}>{r.imported} imported</span>
                        {r.duplicates > 0 && <span style={{ color: '#D97706', marginLeft: 8 }}>{r.duplicates} dupes</span>}
                        {r.skipped > 0 && <span style={{ color: '#DC2626', marginLeft: 8 }}>{r.skipped} skipped</span>}
                      </span>
                    </div>
                  ))}
                </div>
                <button className="btn btn-ghost" onClick={() => setImportState('idle')}>Import another file</button>
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
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Load Seed Data</div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Load the original Excel data from the server</div>
                <button className="btn btn-primary btn-sm" onClick={handleLoadSeedData}>↓ Load Seed Data</button>
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
    </div>
  )
}
