const fs = require('fs');
let code = fs.readFileSync('components/LogCallDrawer.tsx', 'utf8');

const target = '  return (\n    <>';
const func = `  const handleDeleteFromDrawer = async () => {
    if (window.confirm('Permanently delete "' + row.company.name + '" from CRM & Excel?')) {
      deleteCompany(row.company.id)
      deleteLeadFromExcel(row.company.list_id, row.company.name)
      fetch('/api/companies/' + row.company.id, { method: 'DELETE' }).catch(() => {})
      toast.success('Deleted "' + row.company.name + '" from CRM & Excel')
      onClose()
      window.dispatchEvent(new CustomEvent('gc:data-changed'))
    }
  }

`;

if (!code.includes('const handleDeleteFromDrawer')) {
  code = code.replace(target, func + target);
  fs.writeFileSync('components/LogCallDrawer.tsx', code, 'utf8');
  console.log('Inserted handleDeleteFromDrawer successfully');
}
