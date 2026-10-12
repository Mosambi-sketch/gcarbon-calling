const fs = require('fs');
let code = fs.readFileSync('server/index.mjs', 'utf8');

// 1. Update import
code = code.replace(
  "import { updateExcelLead } from './excel-sync.mjs'",
  "import { updateExcelLead, deleteExcelLead } from './excel-sync.mjs'"
);

// 2. Add endpoint right after app.post('/api/excel/sync-lead'...)
const target = "app.post('/api/excel/sync-lead', async (req, res) => {";
const deleteEndpoint = `app.post('/api/excel/delete-lead', async (req, res) => {
  try {
    const { listId, companyName } = req.body
    if (!companyName) {
      return res.status(400).json({ error: 'companyName is required' })
    }
    const result = deleteExcelLead({ listId, companyName })
    res.json(result)
  } catch (err) {
    console.error('[Excel Delete Error]:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

`;

if (!code.includes('/api/excel/delete-lead')) {
  code = code.replace(target, deleteEndpoint + target);
  fs.writeFileSync('server/index.mjs', code, 'utf8');
  console.log('Added delete-lead endpoint to server/index.mjs');
} else {
  console.log('Delete endpoint already present');
}
