const fs = require('fs');
let code = fs.readFileSync('components/pages/CallingSheetPage.tsx', 'utf8');

// 1. Update handleUpdateCaller
const oldHandler = `  const handleUpdateCaller = useCallback((companyId: string, callerName: string) => {
    updateCompany(companyId, { owner_name: callerName || undefined })
    loadData()
    toast.success(callerName ? \`Assigned to \${callerName}\` : 'Unassigned caller', { duration: 1500, style: { fontSize: 12 } })
  }, [loadData])`;

const newHandler = `  const handleUpdateCaller = useCallback((companyId: string, callerName: string) => {
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

if (code.includes(oldHandler)) {
  code = code.replace(oldHandler, newHandler);
  console.log('handleUpdateCaller updated successfully');
} else {
  console.log('oldHandler pattern not found directly, checking...');
}

// 2. Update Table Headers
const oldThead = `<table className="data-table" style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Company</th>
                <th style={{ minWidth: 150 }}>Contact person</th>
                <th style={{ minWidth: 120 }}>Designation</th>
                <th style={{ minWidth: 120 }}>Phone</th>
                <th style={{ minWidth: 100 }}>Sector</th>
                <th style={{ minWidth: 100 }}>Location</th>
                <th>Ref</th>
                <th style={{ minWidth: 100 }}>Status</th>
                <th style={{ minWidth: 100 }}>Called by</th>
                <th style={{ minWidth: 130 }}>Last remark</th>
                <th style={{ minWidth: 80 }}>Follow-up</th>
                <th style={{ minWidth: 80 }}></th>
              </tr>
            </thead>`;

const newThead = `<table className="data-table" style={{ minWidth: 1200, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ minWidth: 210, maxWidth: 260 }}>Company</th>
                <th style={{ minWidth: 160, maxWidth: 180 }}>Contact person</th>
                <th style={{ minWidth: 120, maxWidth: 140 }}>Designation</th>
                <th style={{ minWidth: 125 }}>Phone</th>
                <th style={{ minWidth: 90 }}>Sector</th>
                <th style={{ minWidth: 90 }}>Location</th>
                <th style={{ width: 45, textAlign: 'center' }}>Ref</th>
                <th style={{ minWidth: 110 }}>Status</th>
                <th style={{ minWidth: 130 }}>Called by</th>
                <th style={{ minWidth: 180, maxWidth: 260 }}>Last remark</th>
                <th style={{ minWidth: 85 }}>Follow-up</th>
                <th style={{ minWidth: 70, textAlign: 'center' }}></th>
              </tr>
            </thead>`;

if (code.includes(oldThead)) {
  code = code.replace(oldThead, newThead);
  console.log('Table thead updated successfully');
} else {
  console.log('oldThead pattern not found directly, checking...');
}

// 3. Update Contact Person cell placeholder and hygiene
const oldCpCell = `<EditableCell
                            value={contactName}
                            onSave={val => {
                              if (row.primaryContact) {
                                handleUpdateContact(row.primaryContact.id, 'name', val)
                              } else {
                                handleAddContactInline(row.company.id, 'name', val)
                              }
                            }}
                            style={{ fontWeight: 500 }}
                            placeholder={wasCalled ? '+ Add contact person' : '+ Add contact'}
                          />`;

const newCpCell = `<EditableCell
                            value={contactName}
                            onSave={val => {
                              if (row.primaryContact) {
                                handleUpdateContact(row.primaryContact.id, 'name', val)
                              } else {
                                handleAddContactInline(row.company.id, 'name', val)
                              }
                            }}
                            style={{ fontWeight: 500, maxWidth: 170 }}
                            placeholder="+ Add person"
                          />`;

if (code.includes(oldCpCell)) {
  code = code.replace(oldCpCell, newCpCell);
  console.log('Contact Person cell updated successfully');
}

fs.writeFileSync('components/pages/CallingSheetPage.tsx', code, 'utf8');
