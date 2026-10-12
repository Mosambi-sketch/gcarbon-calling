const fs = require('fs');
let code = fs.readFileSync('components/LogCallDrawer.tsx', 'utf8');

// 1. Add import
if (!code.includes("from '@/lib/excel-live-sync'")) {
  code = `import { syncLeadToExcel } from '@/lib/excel-live-sync'\n` + code;
}

// 2. Add sync call in handleSubmit
const target = "onSaved(createdLog, row.company.name)";
const syncCall = `      syncLeadToExcel(row.company.list_id, row.company.name, {
        callerName: user.name,
        remark: remark.trim() || undefined,
        followUpDate: followUpDate || undefined,
        status: outcome,
      })
      `;

if (code.includes(target) && !code.includes("syncLeadToExcel(row.company.list_id")) {
  code = code.replace(target, syncCall + target);
  fs.writeFileSync('components/LogCallDrawer.tsx', code, 'utf8');
  console.log('LogCallDrawer updated with live excel sync call');
} else {
  console.log('Target already present or not found');
}
