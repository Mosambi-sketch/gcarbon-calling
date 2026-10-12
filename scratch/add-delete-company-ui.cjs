const fs = require('fs');
let code = fs.readFileSync('components/pages/CallingSheetPage.tsx', 'utf8');

// 1. Add deleteCompany to @/lib/store import
if (!code.includes('deleteCompany')) {
  code = code.replace(
    'updateCompany, updateContact, updateCallLog',
    'updateCompany, updateContact, updateCallLog, deleteCompany'
  );
  console.log('Added deleteCompany to store imports');
}

// 2. Add deleteLeadFromExcel import
if (!code.includes('deleteLeadFromExcel')) {
  code = code.replace(
    "import { syncLeadToExcel, downloadLiveExcelFile } from '@/lib/excel-live-sync'",
    "import { syncLeadToExcel, downloadLiveExcelFile, deleteLeadFromExcel } from '@/lib/excel-live-sync'"
  );
  console.log('Added deleteLeadFromExcel to excel-live-sync imports');
}

// 3. Add state for delete
const stateTarget = "const [addingSaving, setAddingSaving] = useState(false)";
const deleteState = `const [addingSaving, setAddingSaving] = useState(false)
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)`;

if (code.includes(stateTarget) && !code.includes('companyToDelete')) {
  code = code.replace(stateTarget, deleteState);
  console.log('Added delete state');
}

// 4. Add handleDeleteCompany handler
const handlerTarget = "  const handleLogSaved = () => {";
const deleteHandler = `  const handleDeleteCompany = useCallback(async () => {
    if (!companyToDelete) return
    setIsDeleting(true)
    const comp = companyToDelete
    try {
      // 1. Delete locally from store
      deleteCompany(comp.id)

      // 2. Delete from Excel file on time
      await deleteLeadFromExcel(comp.list_id, comp.name)

      // 3. Delete from backend DB if available
      fetch(\`/api/companies/\${comp.id}\`, { method: 'DELETE' }).catch(() => {})

      // 4. Close drawer if this company was active
      if (selectedRow?.company.id === comp.id) {
        setSelectedRow(null)
        setDrawerOpen(false)
      }

      setCompanyToDelete(null)
      loadData()
      toast.success(\`Deleted "\${comp.name}" from CRM & Excel\`, { duration: 2500 })
    } catch (err) {
      console.error('Delete company error:', err)
      toast.error('Failed to delete company')
    } finally {
      setIsDeleting(false)
    }
  }, [companyToDelete, selectedRow, loadData])

  const handleLogSaved = () => {`;

if (code.includes(handlerTarget) && !code.includes('handleDeleteCompany')) {
  code = code.replace(handlerTarget, deleteHandler);
  console.log('Added handleDeleteCompany handler');
}

// 5. Update table header and row action button
code = code.replace(
  '<th style={{ minWidth: 70, textAlign: ' + "'center'" + ' }}></th>',
  '<th style={{ minWidth: 90, textAlign: ' + "'right'" + ' }}></th>'
);

const oldActionButton = `<button
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
                      </button>`;

const newActionButtons = `<div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
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
                          onClick={e => { e.stopPropagation(); setSelectedRow(row); setDrawerOpen(true) }}
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
                          title={\`Delete \${row.company.name}\`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>`;

if (code.includes(oldActionButton)) {
  code = code.replace(oldActionButton, newActionButtons);
  console.log('Action buttons updated with Delete button');
}

// 6. Add Delete Confirmation Modal to bottom of page
const modalTarget = '{/* Add Company Modal */}';
const deleteModal = `{/* Delete Confirmation Modal */}
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

      `;

if (code.includes(modalTarget) && !code.includes('Delete Confirmation Modal')) {
  code = code.replace(modalTarget, deleteModal + modalTarget);
  console.log('Added Delete Confirmation Modal');
}

fs.writeFileSync('components/pages/CallingSheetPage.tsx', code, 'utf8');
