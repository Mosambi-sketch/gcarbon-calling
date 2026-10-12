const fs = require('fs');
let code = fs.readFileSync('server/index.mjs', 'utf8');

// 1. Add import
if (!code.includes("from './excel-sync.mjs'")) {
  code = code.replace(
    "import { syncSharePointData } from './sharepoint-sync.mjs'",
    "import { syncSharePointData } from './sharepoint-sync.mjs'\nimport { updateExcelLead } from './excel-sync.mjs'"
  );
}

// 2. Add API endpoints
const target = "app.get('/api/sync/sharepoint'";
const targetIdx = code.indexOf(target);
if (targetIdx >= 0) {
  const nextTarget = "// ── Secure File Storage ──";
  const nextIdx = code.indexOf(nextTarget);

  const excelEndpoints = `
// ── Live On-Time Excel Synchronization ──────────────────────────────────────
app.post('/api/excel/sync-lead', async (req, res) => {
  try {
    const { listId, companyName, updates } = req.body
    if (!companyName) {
      return res.status(400).json({ error: 'companyName is required' })
    }
    const result = updateExcelLead({ listId, companyName, updates: updates || {} })
    res.json(result)
  } catch (err) {
    console.error('[Excel Sync Error]:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/excel/download', (req, res) => {
  const excelFile = path.resolve(__dirname, '../data/CRM.xlsx')
  if (!fs.existsSync(excelFile)) {
    return res.status(404).json({ error: 'CRM.xlsx not found' })
  }
  res.download(excelFile, 'CRM_Live.xlsx')
})

app.get('/api/excel/status', (req, res) => {
  const excelFile = path.resolve(__dirname, '../data/CRM.xlsx')
  if (!fs.existsSync(excelFile)) {
    return res.json({ exists: false })
  }
  const stat = fs.statSync(excelFile)
  res.json({
    exists: true,
    lastModified: stat.mtime.toISOString(),
    sizeBytes: stat.size,
  })
})

`;

  if (!code.includes('/api/excel/sync-lead')) {
    code = code.slice(0, nextIdx) + excelEndpoints + code.slice(nextIdx);
    fs.writeFileSync('server/index.mjs', code, 'utf8');
    console.log('Added excel endpoints to server/index.mjs');
  } else {
    console.log('Endpoints already present');
  }
}
