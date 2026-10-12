const fs = require('fs');
let code = fs.readFileSync('server/sharepoint-sync.mjs', 'utf8');

// 1. Download to temporary path instead of directly overwriting excelPath
code = code.replace(
  "await downloadSharePointExcel(excelPath, activeUrl)",
  "const downloadTempPath = path.resolve(rootDir, 'data/CRM.sp_download.xlsx')\n  await downloadSharePointExcel(downloadTempPath, activeUrl)"
);

code = code.replace(
  "const wb = XLSX.readFile(excelPath)",
  "const downloadTempPath = path.resolve(rootDir, 'data/CRM.sp_download.xlsx')\n  const wb = fs.existsSync(downloadTempPath) ? XLSX.readFile(downloadTempPath) : XLSX.readFile(excelPath)"
);

// 2. Also load old contacts and old call logs to preserve user edits
const oldReadBlock = `  // Step 2: Read current JSON to preserve user manual additions
  const crmJsonPath = path.resolve(rootDir, 'data/crm-calling.json')
  let oldCompanies = []
  if (fs.existsSync(crmJsonPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(crmJsonPath, 'utf8'))
      oldCompanies = raw.companies || []
    } catch {
      // ignore
    }
  }`;

const newReadBlock = `  // Step 2: Read current JSON to preserve user manual additions
  const crmJsonPath = path.resolve(rootDir, 'data/crm-calling.json')
  let oldCompanies = []
  let oldContacts = []
  let oldCallLogs = []
  if (fs.existsSync(crmJsonPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(crmJsonPath, 'utf8'))
      oldCompanies = raw.companies || []
      oldContacts = raw.contacts || []
      oldCallLogs = raw.call_logs || []
    } catch {
      // ignore
    }
  }

  const existingContactsMap = new Map()
  oldContacts.forEach(c => {
    if (c.company_id) existingContactsMap.set(c.company_id, c)
  })

  const existingLogsMap = new Map()
  oldCallLogs.forEach(l => {
    if (l.company_id && !existingLogsMap.has(l.company_id)) existingLogsMap.set(l.company_id, l)
  })`;

if (code.includes(oldReadBlock)) {
  code = code.replace(oldReadBlock, newReadBlock);
  console.log('Added oldContacts and oldCallLogs preservation maps');
}

// 3. In Pass 2, preserve user edits to contacts, caller, status, remarks
const compBuildTarget = `      const comp = {
        id: compId,
        name: compName,
        list_id: listId,
        workspace_id: listId,
        status: status,
        reference: Boolean(hasReference),
        location: location,
        owner_name: callerRaw || undefined,
        created_at: existing?.created_at || new Date().toISOString(),
      }`;

const newCompBuild = `      // Preserve existing user manual changes if any
      const existingContact = existing ? existingContactsMap.get(existing.id) : undefined
      const existingLog = existing ? existingLogsMap.get(existing.id) : undefined

      const effectiveCaller = existing?.owner_name || callerRaw || undefined
      const effectiveStatus = (existing?.status && existing.status !== 'Not Called') ? existing.status : status

      const comp = {
        id: compId,
        name: compName,
        list_id: listId,
        workspace_id: listId,
        status: effectiveStatus,
        reference: Boolean(hasReference),
        location: location,
        owner_name: effectiveCaller,
        created_at: existing?.created_at || new Date().toISOString(),
      }`;

if (code.includes(compBuildTarget)) {
  code = code.replace(compBuildTarget, newCompBuild);
  console.log('Comp build updated with edit preservation');
}

// 4. In contact adding, prefer existingContact if user entered a name
const contactTarget = `      // Add Contact with clean person name & designation (NEVER fallback to fake names)
      const phones = normalizePhones(phoneRaw)
      if (contactPerson || phones.length > 0 || email || designation) {
        contacts.push({
          id: uuidv4(),
          company_id: compId,
          name: contactPerson || '', // strictly empty if not known, editable inline
          designation: designation || undefined,
          phones: phones,
          email: email || undefined,
          is_primary: true,
        })
      }`;

const newContactTarget = `      // Add Contact with clean person name & designation (NEVER fallback to fake names)
      const phones = normalizePhones(phoneRaw)
      const effectiveContactPerson = (existingContact?.name && isValidPersonName(existingContact.name))
        ? existingContact.name
        : (contactPerson || '')
      const effectiveDesignation = existingContact?.designation || designation || undefined
      const effectivePhones = (existingContact?.phones && existingContact.phones.length > 0)
        ? existingContact.phones
        : phones
      const effectiveEmail = existingContact?.email || email || undefined

      if (effectiveContactPerson || effectivePhones.length > 0 || effectiveEmail || effectiveDesignation) {
        contacts.push({
          id: existingContact?.id || uuidv4(),
          company_id: compId,
          name: effectiveContactPerson,
          designation: effectiveDesignation,
          phones: effectivePhones,
          email: effectiveEmail,
          is_primary: true,
        })
      }`;

if (code.includes(contactTarget)) {
  code = code.replace(contactTarget, newContactTarget);
  console.log('Contact generation updated with preservation');
}

// 5. Write merged result to excelPath!
const writeTarget = `  // Step 4: Write to data/crm-calling.json & public/data/crm-calling.json`;
const excelWrite = `  // Step 3.5: Write merged clean workbook to CRM.xlsx
  try {
    XLSX.writeFile(wb, excelPath)
  } catch (err) {
    console.warn('[SharePoint Sync] Warning writing CRM.xlsx:', err.message)
  }

  // Step 4: Write to data/crm-calling.json & public/data/crm-calling.json`;

if (code.includes(writeTarget)) {
  code = code.replace(writeTarget, excelWrite);
  console.log('Added step to write merged workbook to CRM.xlsx');
}

fs.writeFileSync('server/sharepoint-sync.mjs', code, 'utf8');
