#!/usr/bin/env node
// Seed script: reads the Excel file and outputs seeded data as JSON
// Run: node scripts/seed.mjs

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const __dirname = dirname(fileURLToPath(import.meta.url))

const EXCEL_PATH = join(__dirname, '../data/Connection_List.xlsx')

// Try alternate paths
let excelPath = EXCEL_PATH
const alternates = [
  '/Users/aadi/Downloads/Connection List  (1) (5).xlsx',
  join(__dirname, '../data/Connection_List.xlsx'),
]

let wb
for (const p of alternates) {
  try {
    wb = XLSX.readFile(p)
    excelPath = p
    console.log('Reading from:', p)
    break
  } catch {
    // try next
  }
}

if (!wb) {
  console.error('Could not find Excel file. Place Connection_List.xlsx in data/ directory or update path.')
  process.exit(1)
}

const { v4: uuidv4 } = require('uuid')

function genId() { return uuidv4() }

// Helper: normalize phones
function normalizePhones(raw) {
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

// Helper: parse Excel date
function parseExcelDate(val) {
  if (!val) return undefined
  if (typeof val === 'number' && val > 40000 && val < 60000) {
    const date = new Date((val - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }
  if (typeof val === 'string') {
    const d = new Date(val.trim())
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    const match = val.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/)
    if (match) {
      const [,day,month,year] = match
      const fy = year.length === 2 ? `20${year}` : year
      return `${fy}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`
    }
  }
  return undefined
}

// Helper: classify outcome
function classifyOutcome(remark, hasFollowUp) {
  if (!remark || remark.trim() === '') return hasFollowUp ? 'Call Back Later' : 'Not Called'
  const r = remark.toLowerCase().trim()
  if (r.includes('meeting') && !r.includes('no meeting')) return 'Meeting Scheduled'
  if (r.includes('interested') && !r.includes('not interested')) return 'Connected - Interested'
  if (r.includes('profile') || r.includes('mail sent') || r.includes('profile shared') || r.includes('company profile')) return 'Profile / Mail Sent'
  if (r.includes('not interested') || r.includes('dont have requirement') || r.includes("don't have requirement")) return 'Not Interested'
  if (r.includes('out of service') || r.includes('not reachable') || r.includes('switched off')) return 'Not Reachable / Out of Service'
  if (r.includes('invalid') || r.includes('wrong number')) return 'Invalid Number'
  if (r.includes('already') && (r.includes('handled') || r.includes('internal') || r.includes('get it done'))) return 'Already Handled Internally'
  if (r.includes("didn't pick") || r.includes('didnt pick') || r.includes('not picked') || r.includes('no response') || r.includes('disconnected') || r.includes('no answer')) return 'Not Picked'
  if (r.includes('call back') || r.includes('call me') || r.includes('after') || r.includes('later') || r.includes('few months') || r.includes('call on') || r.includes("he'll call") || r.includes("will call")) return 'Call Back Later'
  return hasFollowUp ? 'Call Back Later' : 'Not Called'
}

function outcomeToStatus(outcome) {
  switch (outcome) {
    case 'Not Called': return 'Not Called'
    case 'Meeting Scheduled': return 'Meeting Set'
    case 'Connected - Interested': return 'Won/Interested'
    case 'Not Interested':
    case 'Invalid Number':
    case 'Already Handled Internally':
    case 'Wrong Person / Left Firm':
    case 'Not Reachable / Out of Service': return 'Dead'
    default: return 'In Progress'
  }
}

function matchCaller(raw) {
  if (!raw) return 'Unknown'
  const r = String(raw).trim().toLowerCase()
  const team = ['ajinkya', 'himanshi', 'tamanna', 'kunal', 'ankesh']
  for (const m of team) {
    if (r.includes(m)) return m.charAt(0).toUpperCase() + m.slice(1)
  }
  return String(raw).trim()
}

function matchCol(headers, variants) {
  const norm = headers.map(h => String(h).toLowerCase().trim().replace(/\s+/g,' '))
  for (const v of variants) {
    const vn = v.toLowerCase().trim()
    const idx = norm.findIndex(h => h === vn || h.includes(vn) || vn.includes(h))
    if (idx >= 0) return idx
  }
  return -1
}

const USERS = {
  'Ajinkya': 'user-ajinkya',
  'Himanshi': 'user-himanshi',
  'Tamanna': 'user-tamanna',
  'Kunal': 'user-kunal',
  'Ankesh': 'user-ankesh',
}

const SHEET_TO_LIST = {
  'CONNECTION LIST': 'connection-list',
  'Sheet1': 'cold-calling-1',
  'New List': 'new-list',
  'Freelancers': 'freelancers',
  'COLD CALLING 1': 'cold-calling-1',
  'COLD CALLING 2': 'cold-calling-2',
  'Data Centres': 'data-centres',
  'KHARADI': 'kharadi',
  'RANJANGAON': 'ranjangaon',
  'BHOSARI': 'bhosari',
  'CHAKAN': 'chakan',
}

const companies = []
const contacts = []
const callLogs = []
const summary = []

// Track phones for dedup
const phoneIndex = {} // phone -> company_id
const nameIndex = {} // normalized name -> company_id

function normName(n) {
  return n.toLowerCase().replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim()
}

for (const sheetName of wb.SheetNames) {
  if (sheetName === 'profile') continue // skip profile list
  
  const listId = SHEET_TO_LIST[sheetName] || sheetName.toLowerCase().replace(/\s+/g,'-')
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const isFreelancer = sheetName.toLowerCase().includes('freelancer')

  // Find header row
  let hdrIdx = 0
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i].filter(c => c !== '').length >= 2) { hdrIdx = i; break }
  }
  const headers = rows[hdrIdx].map(h => String(h))

  const COL = {
    company: matchCol(headers, ['company name', 'company ', 'company', 'name']),
    contact: matchCol(headers, ['contact person', 'concerned person', 'contact', 'person']),
    phone: matchCol(headers, ['number', 'phone number', 'contact no', 'phone', 'mobile']),
    email: matchCol(headers, ['email id', 'email', 'mail']),
    designation: matchCol(headers, ['designantion', 'designation', 'role', 'type']),
    sector: matchCol(headers, ['sector', 'industry']),
    location: matchCol(headers, ['location', 'place']),
    caller: matchCol(headers, ['who called', 'called by', 'called_by']),
    remark1: matchCol(headers, ['remarks', 'remark', 'remark 1']),
    remark2: matchCol(headers, ['second remark', 'remark 2', 'remark2']),
    followup: matchCol(headers, ['follow up date', 'follow-up date', 'follow up on', ' follow up date']),
    reference: matchCol(headers, ['reference / no reference', 'reference']),
  }

  let imported = 0, skipped = 0, dups = 0

  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(c => c === '' || c === null || c === undefined)) continue

    const get = (idx) => idx >= 0 ? String(row[idx] ?? '').trim() : ''
    const companyName = get(COL.company)
    if (!companyName || companyName.toLowerCase() === 'company name') { skipped++; continue }

    const phones = normalizePhones(COL.phone >= 0 ? row[COL.phone] : '')
    const followUpRaw = COL.followup >= 0 ? row[COL.followup] : undefined
    const followUpDate = parseExcelDate(followUpRaw)
    const remark1 = get(COL.remark1)
    const remark2 = get(COL.remark2)
    const combinedRemark = [remark1, remark2].filter(Boolean).join(' | ')
    const referenceRaw = get(COL.reference).toLowerCase()
    const isReference = referenceRaw.includes('reference') && !referenceRaw.includes('no reference')
    const outcome = isFreelancer ? 'Not Called' : classifyOutcome(combinedRemark, !!followUpDate)
    const callerName = matchCaller(get(COL.caller))
    const callerId = USERS[callerName] || 'user-ajinkya'

    // Deduplicate
    const nn = normName(companyName)
    let companyId = nameIndex[nn]
    let isDup = false

    if (!companyId) {
      for (const ph of phones) {
        if (phoneIndex[ph]) { companyId = phoneIndex[ph]; isDup = true; break }
      }
    } else { isDup = true }

    if (isDup && companyId) {
      dups++
      // Still add contacts/logs if new
      if (COL.contact >= 0 && get(COL.contact)) {
        const cname = get(COL.contact)
        const existing = contacts.find(c => c.company_id === companyId && c.name.toLowerCase() === cname.toLowerCase())
        if (!existing) {
          const contactId = genId()
          contacts.push({
            id: contactId,
            company_id: companyId,
            name: cname,
            designation: get(COL.designation) || undefined,
            phones,
            email: COL.email >= 0 ? get(COL.email) || undefined : undefined,
            is_primary: false,
          })
        }
      }
      continue
    }

    // New company
    companyId = genId()
    nameIndex[nn] = companyId
    phones.forEach(ph => { phoneIndex[ph] = companyId })

    let status = outcomeToStatus(outcome)
    if (followUpDate && status !== 'Meeting Set' && status !== 'Won/Interested') {
      status = 'Follow-up Due'
    }

    companies.push({
      id: companyId,
      name: companyName,
      list_id: listId,
      sector: get(COL.sector) || undefined,
      industry: get(COL.sector) || undefined,
      location: get(COL.location) || undefined,
      website: undefined,
      notes: undefined,
      reference: isReference,
      status,
      created_at: new Date().toISOString(),
    })

    // Contact
    let contactId = undefined
    if (COL.contact >= 0 && get(COL.contact)) {
      contactId = genId()
      contacts.push({
        id: contactId,
        company_id: companyId,
        name: get(COL.contact),
        designation: get(COL.designation) || undefined,
        phones,
        email: COL.email >= 0 ? get(COL.email) || undefined : undefined,
        is_primary: true,
      })
    }

    // Call log (only if there's a remark or caller)
    if (combinedRemark || (callerName && callerName !== 'Unknown')) {
      const logDate = followUpDate 
        ? new Date(new Date(followUpDate).getTime() - 86400000 * 3).toISOString()
        : new Date(Date.now() - Math.random() * 30 * 86400000).toISOString()
      
      callLogs.push({
        id: genId(),
        company_id: companyId,
        contact_id: contactId,
        caller_id: callerId,
        caller_name: callerName,
        called_at: logDate,
        outcome,
        remark: combinedRemark || undefined,
        next_action: undefined,
        follow_up_date: followUpDate,
      })
    }

    imported++
  }

  summary.push({ sheet: sheetName, list: listId, imported, skipped, duplicates: dups })
  console.log(`  ${sheetName}: ${imported} imported, ${skipped} skipped, ${dups} duplicates`)
}

const seed = {
  companies,
  contacts,
  call_logs: callLogs,
  tasks: [],
  notes: [],
  events: [],
  generated_at: new Date().toISOString(),
}

const outPath = join(__dirname, '../data/seed.json')
writeFileSync(outPath, JSON.stringify(seed, null, 2))
console.log(`\nSeed written to ${outPath}`)
console.log(`Total: ${companies.length} companies, ${contacts.length} contacts, ${callLogs.length} call logs`)
console.log('\nSummary:', summary)
