import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import { v4 as uuidv4 } from 'uuid'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

export const DEFAULT_SHAREPOINT_URL =
  'https://sbupune-my.sharepoint.com/:x:/g/personal/pranita_bba2403084_sbup_edu_in/IQBFjWY_vTVNQq-lYSE-oyz1AV8QWYOnL7f13UUt8koDqtk?e=wCEXaW'

export function normalizeSharePointUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return DEFAULT_SHAREPOINT_URL
  const trimmed = rawUrl.trim()
  if (!trimmed) return DEFAULT_SHAREPOINT_URL
  const base = trimmed.split('?')[0]
  return `${base}?download=1`
}

export function parseExcelDate(v) {
  if (!v) return undefined
  if (typeof v === 'number' && v > 40000 && v < 60000) {
    const d = new Date((v - 25569) * 86400 * 1000)
    return d.toISOString().slice(0, 10)
  }
  if (typeof v === 'string') {
    const s = v.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/)
    if (m) {
      const year = m[3].length === 2 ? '20' + m[3] : m[3]
      return year + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0')
    }
  }
  return undefined
}

export function normalizePhones(raw) {
  if (!raw) return []
  const str = String(raw).trim()
  const parts = str.split(/[\/,\n\r]+/).map(p => p.trim()).filter(Boolean)
  return parts.map(p => {
    let digits = p.replace(/\D/g, '')
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
    return digits
  }).filter(d => d.length >= 7 && d.length <= 15)
}

export function outcomeToStatus(outcome, followUpDate) {
  switch (outcome) {
    case 'Meeting Scheduled': return 'Meeting Set'
    case 'Connected - Interested': return 'Won/Interested'
    case 'Profile / Mail Sent': return 'In Progress'
    case 'Call Back Later': return 'Follow-up Due'
    case 'Wrong Number / Not Reachable':
    case 'Disconnected / Invalid':
    case 'Not Interested': return 'Dead'
    case 'Not Picked': return 'In Progress'
    default: return followUpDate ? 'Follow-up Due' : 'Not Called'
  }
}

export function classifyOutcome(remark, hasFollowUp) {
  if (!remark) return hasFollowUp ? 'Call Back Later' : 'Not Called'
  const r = remark.toLowerCase()
  if (r.includes('meeting') || r.includes('schedule') || r.includes('demo')) return 'Meeting Scheduled'
  if (r.includes('interest') || r.includes('positive') || r.includes('deal') || r.includes('lead')) return 'Connected - Interested'
  if (r.includes('mail') || r.includes('email') || r.includes('profile') || r.includes('sent') || r.includes('brochure')) return 'Profile / Mail Sent'
  if (r.includes('not interest') || r.includes('declined') || r.includes('reject') || r.includes('no req') || r.includes('not required') || r.includes('short scale')) return 'Not Interested'
  if (r.includes('wrong') || r.includes('invalid') || r.includes('not reachable') || r.includes('switch off') || r.includes('out of service') || r.includes('does not exist')) return 'Wrong Number / Not Reachable'
  if (r.includes('pick') || r.includes('no response') || r.includes('disconnected') || r.includes('not connected') || r.includes('busy')) return 'Not Picked'
  if (r.includes('call back') || r.includes('call later') || r.includes('ring') || r.includes('asked to call')) return 'Call Back Later'
  return hasFollowUp ? 'Call Back Later' : 'Not Called'
}

// ── Strict Team Caller Whitelist ─────────────────────────────────────────────
export const VALID_TEAM_CALLERS = [
  'ankesh', 'kunal', 'aadarsh', 'himanshi', 'pranita', 'tamanna', 'naresh', 'ajinkya', 'anupam', 'aprmay'
]

export function formatCallerName(raw) {
  if (!raw) return undefined
  const str = String(raw).trim()
  const lower = str.toLowerCase()
  for (const k of VALID_TEAM_CALLERS) {
    if (
      lower === k ||
      lower.startsWith(k + ' ') ||
      lower.endsWith(' ' + k) ||
      lower.includes(' ' + k + ' ') ||
      lower === k + ' sir' ||
      lower === '(' + k + ')' ||
      lower.includes('(' + k + ')')
    ) {
      if (k === 'anupam') return 'Anupam Sir'
      if (k === 'aprmay') return 'Aprmay Sir'
      return k.charAt(0).toUpperCase() + k.slice(1)
    }
  }
  return undefined // STRICTLY undefined if not an actual human team member
}

const DESIG_KEYWORDS = [
  'Environment, Health, Safety & Sustainability',
  'Head - Corporate EHS',
  'Assistant General Manager',
  'Quality Engineer',
  'Quality Manager',
  'Plant Head',
  'Maintenance', 'Maintanince',
  'Founder', 'Co-Founder',
  'EHS', 'CEO', 'MD', 'Director', 'Manager', 'Purchase', 'HR',
  'Quality', 'Factory', 'Safety', 'Sustainability', 'Engineer', 'Lead', 'Head'
]

const NON_NAME_WORDS = [
  'call', 'calling', 'called', 'send', 'sent', 'mail', 'email', 'disconnected',
  'disconnecetd', 'disconnect', 'connect', 'connected', 'connecting', 'not', 'no',
  'reachable', 'unreachable', 'requirement', 'required', 'doing', 'already', 'busy',
  'pick', 'picked', 'picking', 'tomorrow', 'tommorrow', 'today', 'yesterday',
  'meeting', 'meet', 'online', 'brochure', 'details', 'detail', 'tentative',
  'short', 'scale', 'directly', 'direct', 'primary', 'contact', 'reference',
  'cut', 'ring', 'ringing', 'internal', 'team', 'society', 'services', 'service',
  'whatsapp', 'visiting', 'card', 'spoke', 'asked', 'asking', 'ask', 'talk', 'talked',
  'person', 'company', 'lead', 'client', 'vendor', 'follow', 'followup', 'follow-up',
  'audit', 'auditing', 'carbon', 'energy', 'tiny', 'sended', 'forward'
]

export function isValidPersonName(str) {
  if (!str) return false
  const s = String(str).trim()
  if (s.length < 2 || s.length > 40) return false
  if (s.includes('@') || /^\+?\d+$/.test(s)) return false

  const lower = s.toLowerCase()
  for (const w of NON_NAME_WORDS) {
    if (lower === w || lower.startsWith(w + ' ') || lower.endsWith(' ' + w) || lower.includes(' ' + w + ' ')) {
      return false
    }
  }
  return true
}

export function formatPersonName(str) {
  if (!str) return ''
  return str.trim().split(/\s+/).map(w => {
    const l = w.toLowerCase()
    if (l === 'sir') return 'Sir'
    if (l === 'ehs') return 'EHS'
    if (l === 'ceo') return 'CEO'
    if (l === 'md') return 'MD'
    if (l === 'hr') return 'HR'
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }).join(' ')
}

export function cleanContactPersonAndDesignation(rawPerson, rawDesig) {
  let name = String(rawPerson || '').trim()
  let designation = String(rawDesig || '').trim()
  let email = ''

  if (!name) return { name: '', designation, email }

  // If contains email address (e.g. jay@thuse.net)
  if (name.includes('@')) {
    email = name
    name = ''
  }

  // Extract parentheses e.g. "Anurag agarwal (CEO)" or "Pranav (EHS)"
  const parenMatch = name.match(/^([^(]+)\s*\(([^)]+)\)?$/)
  if (parenMatch) {
    name = parenMatch[1].trim()
    if (!designation) designation = parenMatch[2].trim()
  }

  // Separate trailing designation keywords from name (e.g. "Udayan Patankar Maintanince")
  for (const d of DESIG_KEYWORDS) {
    const lowerD = d.toLowerCase()
    if (name.toLowerCase().endsWith(' ' + lowerD)) {
      name = name.slice(0, -(d.length + 1)).trim()
      if (!designation) {
        designation = (lowerD === 'maintanince' ? 'Maintenance' : d)
      }
    }
  }

  // Remove trailing slashes / punctuation
  name = name.replace(/[\/\-,]+$/, '').trim()
  if (designation.toLowerCase() === 'maintanince') designation = 'Maintenance'

  // Validate that name is an actual person name and not an action phrase/remark
  if (!isValidPersonName(name)) {
    return { name: '', designation, email }
  }

  name = formatPersonName(name)
  return { name, designation, email }
}

function normalizeKey(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Downloads the latest live Excel workbook from SharePoint
 */
export async function downloadSharePointExcel(targetPath, sourceUrl = null) {
  const cookieJar = process.env.SHAREPOINT_COOKIE_PATH || path.resolve(rootDir, 'data/.sp_cookies.txt')
  if (process.env.SHAREPOINT_COOKIES && (!fs.existsSync(cookieJar) || fs.statSync(cookieJar).size === 0)) {
    try {
      fs.writeFileSync(cookieJar, process.env.SHAREPOINT_COOKIES, 'utf8')
    } catch {}
  }
  const tempPath = targetPath || path.resolve(rootDir, 'data/CRM.xlsx')
  const downloadUrl = normalizeSharePointUrl(sourceUrl || process.env.SHAREPOINT_EXCEL_URL || DEFAULT_SHAREPOINT_URL)
  
  fs.mkdirSync(path.dirname(tempPath), { recursive: true })

  try {
    const cmd = `curl -s -c "${cookieJar}" -b "${cookieJar}" -L "${downloadUrl}" -o "${tempPath}"`
    execSync(cmd, { timeout: 45000 })
    
    const head = fs.readFileSync(tempPath, { encoding: null }).subarray(0, 4)
    const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
    if (!isZip) {
      throw new Error('Downloaded file is not a valid XLSX zip package')
    }
    return tempPath
  } catch (err) {
    console.error('[SharePoint Sync] Download error:', err.message)
    throw err
  }
}

/**
 * Synchronizes SharePoint Excel to JSON and MongoDB with strict column hygiene
 */
export async function syncSharePointData(db = null, customUrl = null) {
  const excelPath = path.resolve(rootDir, 'data/CRM.xlsx')
  const activeUrl = customUrl || process.env.SHAREPOINT_EXCEL_URL || DEFAULT_SHAREPOINT_URL
  
  // Step 1: Download latest version
  console.log('[SharePoint Sync] Fetching latest Excel from SharePoint...', activeUrl)
  try {
    const downloadTempPath = path.resolve(rootDir, 'data/CRM.sp_download.xlsx')
  await downloadSharePointExcel(downloadTempPath, activeUrl)
    console.log('[SharePoint Sync] Downloaded successfully!')
  } catch (err) {
    console.warn('[SharePoint Sync] Could not download live SharePoint, falling back to local CRM.xlsx:', err.message)
    if (!fs.existsSync(excelPath)) {
      throw err
    }
  }

  // Step 2: Read current JSON to preserve user manual additions
  const crmJsonPath = path.resolve(rootDir, 'data/crm-calling.json')
  let oldCompanies = []
  let oldContacts = []
  let oldCallLogs = []
  let deletedCompanyKeys = new Set()
  if (fs.existsSync(crmJsonPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(crmJsonPath, 'utf8'))
      oldCompanies = raw.companies || []
      oldContacts = raw.contacts || []
      oldCallLogs = raw.call_logs || []
      deletedCompanyKeys = new Set(raw.deleted_company_keys || [])
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
  })

  const existingMap = new Map()
  oldCompanies.forEach(c => {
    const key = `${c.list_id}:::${(c.name || '').trim().toLowerCase()}`
    existingMap.set(key, c)
  })

  const downloadTempPath = path.resolve(rootDir, 'data/CRM.sp_download.xlsx')
  const wb = fs.existsSync(downloadTempPath) ? XLSX.readFile(downloadTempPath) : XLSX.readFile(excelPath)
  const targetSheets = wb.SheetNames

  // ── PASS 1: Build Master Cross-Sheet Knowledge Base ─────────────────────────
  const globalContactMap = new Map()

  for (const sheetName of targetSheets) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
    let hIdx = 1
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      if (rows[i] && rows[i].some(c => String(c).toLowerCase().includes('company'))) {
        hIdx = i
        break
      }
    }
    const headers = (rows[hIdx] || []).map(h => String(h || '').toLowerCase().trim())
    const compCol = headers.findIndex(h => h.includes('company'))
    const contactCol = headers.findIndex(h => h.includes('contact person') || h === 'contact')
    const desigCol = headers.findIndex(h => h.includes('designation'))
    const phoneCol = headers.findIndex(h => h.includes('phone') || h.includes('mobile'))
    const emailCol = headers.findIndex(h => h.includes('email') || h.includes('mail'))

    for (let r = hIdx + 1; r < rows.length; r++) {
      const row = rows[r]
      if (!row || !row[compCol >= 0 ? compCol : 0]) continue
      const compName = String(row[compCol >= 0 ? compCol : 0]).trim()
      const normKey = normalizeKey(compName)
      if (!normKey || normKey === 'companyname') continue

      const rawPerson = contactCol >= 0 && row[contactCol] ? String(row[contactCol]).trim() : ''
      const rawDesig = desigCol >= 0 && row[desigCol] ? String(row[desigCol]).trim() : ''
      const phone = phoneCol >= 0 && row[phoneCol] ? String(row[phoneCol]).trim() : ''
      const rawEmail = emailCol >= 0 && row[emailCol] ? String(row[emailCol]).trim() : ''

      const { name: person, designation: desig, email } = cleanContactPersonAndDesignation(rawPerson, rawDesig)

      if (person) {
        if (!globalContactMap.has(normKey) || (globalContactMap.get(normKey).person.length < person.length)) {
          globalContactMap.set(normKey, { person, desig, phone, email: email || rawEmail })
        }
      }
    }
  }

  // Also check remarks for phone + contact name (e.g. "9011029711 vaibbhav")
  for (const sheetName of targetSheets) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
    for (let r = 2; r < rows.length; r++) {
      const row = rows[r]
      if (!row || !row[0]) continue
      const normKey = normalizeKey(row[0])
      if (globalContactMap.has(normKey)) continue

      const remarkText = row.slice(6, 12).filter(Boolean).map(String).join(' ')
      // Match phone followed by name e.g. "9011029711 vaibbhav"
      const mPhoneName = remarkText.match(/\b\d{10}\s+([A-Za-z]+)\b/)
      if (mPhoneName) {
        const candidate = mPhoneName[1].trim()
        if (isValidPersonName(candidate) && !VALID_TEAM_CALLERS.includes(candidate.toLowerCase())) {
          const cleanName = formatPersonName(candidate)
          globalContactMap.set(normKey, { person: cleanName, desig: '', phone: '', email: '', fromRemark: true })
        }
      }
    }
  }

  console.log(`[SharePoint Sync] Knowledge base created: ${globalContactMap.size} verified contact persons mapped.`)

  // ── PASS 2: Parse and Build Normalized CRM Data ──────────────────────────────
  const lists = []
  const companies = []
  const contacts = []
  const callLogs = []
  const processedCompanyKeys = new Set()  // Dedup: track companies already added in this run

  for (const sheetName of targetSheets) {
    const cleanName = sheetName.trim()
    let listId = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (cleanName === 'Cold Calling') listId = 'cold-calling'

    lists.push({
      id: listId,
      name: cleanName,
      type: 'company',
      created_at: '2026-09-01T00:00:00.000Z',
      archived: false,
    })

    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
    
    let hRow = 1
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const row = rows[i] || []
      if (row.some(c => String(c).toLowerCase().includes('company'))) {
        hRow = i
        break
      }
    }

    const headers = (rows[hRow] || []).map(h => String(h || '').toLowerCase().trim())
    const compCol = headers.findIndex(h => h.includes('company')) >= 0 ? headers.findIndex(h => h.includes('company')) : 0
    const contactCol = headers.findIndex(h => h.includes('contact person') || h === 'contact')
    const desigCol = headers.findIndex(h => h.includes('designation'))
    const phoneCol = headers.findIndex(h => h.includes('phone') || h.includes('mobile'))
    const emailCol = headers.findIndex(h => h.includes('email') || h.includes('mail'))
    const locationCol = headers.findIndex(h => h.includes('location') || h.includes('address'))
    const refCol = headers.findIndex(h => h.includes('reference') || h.includes('ref'))
    const calledByCol = headers.findIndex(h => h.includes('called by') || h === 'called')
    const remark1Col = headers.findIndex(h => h.includes('remark 1') || h === 'remark')
    const remark2Col = headers.findIndex(h => h.includes('remark 2'))
    const followUpCol = headers.findIndex(h => h.includes('follow-up') || h.includes('follow up'))
    const stageCol = headers.findIndex(h => h.includes('stage') || h.includes('status'))

    const dataRows = rows.slice(hRow + 1).filter(r => r && r[compCol])

    for (const r of dataRows) {
      const compName = String(r[compCol] || '').trim()
      if (!compName || compName.toLowerCase() === 'company name') continue

      const normKey = normalizeKey(compName)
      const key = `${listId}:::${compName.toLowerCase()}`

      // Skip duplicate entries within this sync run (same company name in same sheet)
      if (processedCompanyKeys.has(key)) continue
      processedCompanyKeys.add(key)

      // Skip companies explicitly deleted by user
      if (deletedCompanyKeys.has(normKey) || deletedCompanyKeys.has(key)) continue

      const existing = existingMap.get(key)
      const compId = existing ? existing.id : uuidv4()

      // Resolve contact person and designation
      let rawContactPerson = (contactCol >= 0 && r[contactCol]) ? String(r[contactCol]).trim() : undefined
      let rawDesignation = (desigCol >= 0 && r[desigCol]) ? String(r[desigCol]).trim() : undefined
      const phoneRaw = phoneCol >= 0 ? r[phoneCol] : undefined
      let email = (emailCol >= 0 && r[emailCol]) ? String(r[emailCol]).trim() : undefined
      const location = (locationCol >= 0 && r[locationCol]) ? String(r[locationCol]).trim() : (existing?.location || undefined)

      // Fallback to cross-sheet knowledge base
      const known = globalContactMap.get(normKey)
      if (!rawContactPerson && known) {
        rawContactPerson = known.person
        if (!rawDesignation && known.desig) rawDesignation = known.desig
        if (!email && known.email) email = known.email
      }

      // Clean contact person and designation
      const { name: contactPerson, designation, email: extractedEmail } = cleanContactPersonAndDesignation(rawContactPerson, rawDesignation)
      if (extractedEmail && !email) email = extractedEmail

      // Resolve Reference (header-mapped only)
      let hasReference = false
      const refCandidate = (refCol >= 0 && r[refCol]) ? String(r[refCol]).toLowerCase() : ''
      if (refCandidate.includes('reference') && !refCandidate.includes('no reference') && refCandidate !== 'no') {
        hasReference = true
      } else if (existing?.reference) {
        hasReference = true
      }

      // ── Resolve Caller (Header-Based Only) ──────────────────────────────
      let callerRaw = undefined

      // ONLY use the header-mapped "Called By" column — no hardcoded fallbacks
      if (calledByCol >= 0 && r[calledByCol]) {
        const parsed = formatCallerName(r[calledByCol])
        if (parsed) callerRaw = parsed
      }

      // Check remarks for caller signatures e.g. '(Pranita)', 'Pranita:', '(Kunal)'
      const remarkCols = [remark1Col, remark2Col].filter(c => c >= 0)
      const combinedRemarkText = remarkCols.map(c => r[c]).filter(Boolean).map(String).join(' ')

      if (!callerRaw) {
        for (const k of VALID_TEAM_CALLERS) {
          if (
            new RegExp('\\(' + k + '\\)', 'i').test(combinedRemarkText) ||
            new RegExp('\\b' + k + ':', 'i').test(combinedRemarkText) ||
            new RegExp('by\\s+' + k + '\\b', 'i').test(combinedRemarkText)
          ) {
            callerRaw = formatCallerName(k)
            break
          }
        }
      }

      if (!callerRaw && existing?.owner_name) {
        callerRaw = formatCallerName(existing.owner_name)
      }

      // Resolve Remarks & Follow-up Date (header-mapped only, no hardcoded fallbacks)
      const remark1 = (remark1Col >= 0 && r[remark1Col]) ? String(r[remark1Col]).trim() : ''
      const remark2 = (remark2Col >= 0 && r[remark2Col]) ? String(r[remark2Col]).trim() : ''

      let followUpDate = followUpCol >= 0 ? parseExcelDate(r[followUpCol]) : undefined

      const stageRaw = stageCol >= 0 && r[stageCol] ? String(r[stageCol]).trim() : ''
      const combinedRemark = [remark1, remark2, stageRaw].filter(Boolean).join(' | ')
      const outcome = classifyOutcome(combinedRemark, Boolean(followUpDate))
      const status = (combinedRemark || followUpDate || callerRaw)
        ? outcomeToStatus(outcome, followUpDate)
        : (existing?.status || 'Not Called')

      // Preserve existing user manual changes if any
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
      }
      companies.push(comp)

      // Add Contact with clean person name & designation (NEVER fallback to fake names)
      const phones = normalizePhones(phoneRaw)
      const effectiveContactPerson = (existingContact?.name && isValidPersonName(existingContact.name))
        ? existingContact.name
        : (contactPerson || '')
      const effectiveDesignation = existingContact?.designation || designation || undefined
      const effectivePhones = (existingContact?.phones && existingContact.phones.length > 0)
        ? existingContact.phones
        : phones
      const effectiveEmail = existingContact?.email || email || undefined

      // Reflect clean values back into the sheet row for CRM.xlsx
      if (contactCol >= 0 && effectiveContactPerson) r[contactCol] = effectiveContactPerson
      if (desigCol >= 0 && effectiveDesignation) r[desigCol] = effectiveDesignation
      if (calledByCol >= 0 && effectiveCaller) r[calledByCol] = effectiveCaller

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
      }

      // Add Call Log if called
      if (combinedRemark || followUpDate || callerRaw) {
        callLogs.push({
          id: uuidv4(),
          company_id: compId,
          caller_name: callerRaw || '',
          outcome: outcome,
          remark: combinedRemark || undefined,
          follow_up_date: followUpDate,
          called_at: new Date().toISOString(),
        })
      }
    }

    // Filter ws rows to remove deleted or duplicate companies
    const updatedSheetRows = [
      ...rows.slice(0, hRow + 1),
      ...dataRows.filter(r => {
        const cName = String(r[compCol] || '').trim()
        const nKey = normalizeKey(cName)
        const sKey = `${listId}:::${cName.toLowerCase()}`
        return !deletedCompanyKeys.has(nKey) && !deletedCompanyKeys.has(sKey)
      })
    ]
    wb.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(updatedSheetRows)
  }

  const payload = {
    lists,
    companies,
    contacts,
    call_logs: callLogs,
    deleted_company_keys: Array.from(deletedCompanyKeys),
    last_synced: new Date().toISOString(),
    source_url: activeUrl,
  }

  // Step 3.5: Write merged clean workbook to CRM.xlsx
  try {
    XLSX.writeFile(wb, excelPath)
  } catch (err) {
    console.warn('[SharePoint Sync] Warning writing CRM.xlsx:', err.message)
  }

  // Step 4: Write to data/crm-calling.json & public/data/crm-calling.json
  fs.writeFileSync(crmJsonPath, JSON.stringify(payload, null, 2))
  const publicCrmPath = path.resolve(rootDir, 'public/data/crm-calling.json')
  fs.mkdirSync(path.dirname(publicCrmPath), { recursive: true })
  fs.writeFileSync(publicCrmPath, JSON.stringify(payload, null, 2))
  console.log(`[SharePoint Sync] Updated JSON caches: ${companies.length} companies, ${contacts.length} contacts across ${lists.length} lists.`)

  // Step 5: Update MongoDB if connected
  if (db) {
    try {
      console.log('[SharePoint Sync] Synchronizing to MongoDB...')
      for (const list of lists) {
        await db.collection('workspaces').updateOne(
          { id: list.id },
          { $set: list },
          { upsert: true }
        )
      }

      const bulkOps = companies.map(c => ({
        updateOne: {
          filter: { id: c.id },
          update: { $set: c },
          upsert: true,
        },
      }))
      if (bulkOps.length > 0) {
        await db.collection('companies').bulkWrite(bulkOps)
      }

      const compIds = companies.map(c => c.id)
      await db.collection('contacts').deleteMany({ company_id: { $in: compIds } })
      if (contacts.length > 0) {
        await db.collection('contacts').insertMany(contacts)
      }

      console.log('[SharePoint Sync] MongoDB synchronization complete!')
    } catch (err) {
      console.warn('[SharePoint Sync] MongoDB sync error:', err.message)
    }
  }

  return {
    success: true,
    totalWorkspaces: lists.length,
    totalCompanies: companies.length,
    totalContacts: contacts.length,
    totalCallLogs: callLogs.length,
    timestamp: new Date().toISOString(),
    sourceUrl: activeUrl,
  }
}
