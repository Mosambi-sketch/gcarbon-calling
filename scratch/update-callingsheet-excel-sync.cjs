const fs = require('fs');
let code = fs.readFileSync('components/pages/CallingSheetPage.tsx', 'utf8');

// 1. Add import for excel-live-sync
if (!code.includes("from '@/lib/excel-live-sync'")) {
  code = `import { syncLeadToExcel, downloadLiveExcelFile } from '@/lib/excel-live-sync'\n` + code;
}

// 2. Update inline edit handlers to call syncLeadToExcel
const oldCompanyHandler = `  const handleUpdateCompany = useCallback((companyId: string, field: string, value: string) => {
    updateCompany(companyId, { [field]: value })
    loadData()
    toast.success(\`Updated \${field}\`, { duration: 1500, style: { fontSize: 12 } })
  }, [loadData])`;

const newCompanyHandler = `  const handleUpdateCompany = useCallback((companyId: string, field: string, value: string) => {
    updateCompany(companyId, { [field]: value })
    const targetRow = rows.find(r => r.company.id === companyId)
    if (targetRow) {
      syncLeadToExcel(targetRow.company.list_id, targetRow.company.name, {
        [field === 'name' ? 'companyName' : field]: value
      })
    }
    loadData()
    toast.success(\`Updated \${field} in CRM & Excel\`, { duration: 1500, style: { fontSize: 12 } })
  }, [rows, loadData])`;

if (code.includes(oldCompanyHandler)) {
  code = code.replace(oldCompanyHandler, newCompanyHandler);
  console.log('handleUpdateCompany updated');
}

const oldContactHandler = `  const handleUpdateContact = useCallback((contactId: string, field: string, value: string) => {
    if (field === 'phones') {
      updateContact(contactId, { phones: value ? [value] : [] })
    } else {
      updateContact(contactId, { [field]: value })
    }
    loadData()
    toast.success(\`Updated \${field}\`, { duration: 1500, style: { fontSize: 12 } })
  }, [loadData])`;

const newContactHandler = `  const handleUpdateContact = useCallback((contactId: string, field: string, value: string) => {
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
    toast.success(\`Updated \${field} in CRM & Excel\`, { duration: 1500, style: { fontSize: 12 } })
  }, [rows, loadData])`;

if (code.includes(oldContactHandler)) {
  code = code.replace(oldContactHandler, newContactHandler);
  console.log('handleUpdateContact updated');
}

const oldCallerHandler = `  const handleUpdateCaller = useCallback((companyId: string, callerName: string) => {
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
    loadData()
    toast.success(callerName ? \`Assigned to \${callerName}\` : 'Unassigned caller', { duration: 1500, style: { fontSize: 12 } })
  }, [loadData])`;

const newCallerHandler = `  const handleUpdateCaller = useCallback((companyId: string, callerName: string) => {
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
    toast.success(callerName ? \`Assigned to \${callerName} & synced to Excel\` : 'Unassigned caller', { duration: 1500, style: { fontSize: 12 } })
  }, [rows, loadData])`;

if (code.includes(oldCallerHandler)) {
  code = code.replace(oldCallerHandler, newCallerHandler);
  console.log('handleUpdateCaller updated');
}

const oldRemarkHandler = `  const handleUpdateRemark = useCallback((companyId: string, remark: string) => {
    addCallLog({
      company_id: companyId,
      caller_name: user.name,
      outcome: 'Connected - Interested',
      remark,
      called_at: new Date().toISOString(),
    })
    loadData()
    toast.success('Updated remark', { duration: 1500, style: { fontSize: 12 } })
  }, [user.name, loadData])`;

const newRemarkHandler = `  const handleUpdateRemark = useCallback((companyId: string, remark: string) => {
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
  }, [user.name, rows, loadData])`;

if (code.includes(oldRemarkHandler)) {
  code = code.replace(oldRemarkHandler, newRemarkHandler);
  console.log('handleUpdateRemark updated');
}

const oldAddContactHandler = `  const handleAddContactInline = useCallback((companyId: string, field: string, value: string) => {
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
    loadData()
    toast.success('Contact added', { duration: 1500, style: { fontSize: 12 } })
  }, [loadData])`;

const newAddContactHandler = `  const handleAddContactInline = useCallback((companyId: string, field: string, value: string) => {
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
  }, [rows, loadData])`;

if (code.includes(oldAddContactHandler)) {
  code = code.replace(oldAddContactHandler, newAddContactHandler);
  console.log('handleAddContactInline updated');
}

// 3. Add Download Live Excel button and status pill in Header
const headerTarget = `<button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            + Add Company
          </button>`;

const newHeaderControls = `<button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
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
          </div>`;

if (code.includes(headerTarget)) {
  code = code.replace(headerTarget, newHeaderControls);
  console.log('Header controls updated with Download Live Excel button and status pill');
}

fs.writeFileSync('components/pages/CallingSheetPage.tsx', code, 'utf8');
