const fs = require('fs');
let code = fs.readFileSync('components/LogCallDrawer.tsx', 'utf8');

// 1. Add deleteCompany to store imports
code = code.replace(
  "import { getContacts, getCallLogs, addCallLog, addTask, addEvent } from '@/lib/store'",
  "import { getContacts, getCallLogs, addCallLog, addTask, addEvent, deleteCompany } from '@/lib/store'"
);

// 2. Add deleteLeadFromExcel import
code = code.replace(
  "import { syncLeadToExcel } from '@/lib/excel-live-sync'",
  "import { syncLeadToExcel, deleteLeadFromExcel } from '@/lib/excel-live-sync'"
);

// 3. Add handleDeleteFromDrawer before return
const target = "  return (\n    <div className=\"drawer-overlay\"";
const deleteFunction = `  const handleDeleteFromDrawer = async () => {
    if (window.confirm(\`Permanently delete "\${row.company.name}" from CRM & Excel?\`)) {
      deleteCompany(row.company.id)
      deleteLeadFromExcel(row.company.list_id, row.company.name)
      fetch(\`/api/companies/\${row.company.id}\`, { method: 'DELETE' }).catch(() => {})
      toast.success(\`Deleted "\${row.company.name}" from CRM & Excel\`)
      onClose()
      window.dispatchEvent(new CustomEvent('gc:data-changed'))
    }
  }

`;

if (!code.includes('handleDeleteFromDrawer')) {
  code = code.replace(target, deleteFunction + target);
}

// 4. Add delete button in footer
const footerKeys = `<div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
            <span>Keys: <kbd style={{ background: 'var(--kbd-bg)', border: '1px solid var(--kbd-border)', color: 'var(--text)', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>1–9</kbd> outcome</span>
            <span>·</span>
            <span><kbd style={{ background: 'var(--kbd-bg)', border: '1px solid var(--kbd-border)', color: 'var(--text)', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>⌘↵</kbd> save</span>
          </div>`;

const newFooterKeys = `<div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-muted)' }}>
            <button
              type="button"
              onClick={handleDeleteFromDrawer}
              style={{
                background: '#FEF2F2',
                color: '#DC2626',
                border: '1px solid #FECACA',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
              title="Delete this company from CRM & Excel"
            >
              🗑 Delete Company
            </button>
            <span><kbd style={{ background: 'var(--kbd-bg)', border: '1px solid var(--kbd-border)', color: 'var(--text)', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>⌘↵</kbd> save</span>
          </div>`;

if (code.includes(footerKeys)) {
  code = code.replace(footerKeys, newFooterKeys);
  console.log('Added delete button to drawer footer');
}

fs.writeFileSync('components/LogCallDrawer.tsx', code, 'utf8');
