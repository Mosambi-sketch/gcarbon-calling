// Excel import cleaner and outcome classifier

export type OutcomeType =
  | 'Not Called'
  | 'Not Picked'
  | 'Not Reachable / Out of Service'
  | 'Invalid Number'
  | 'Wrong Person / Left Firm'
  | 'Call Back Later'
  | 'Connected - Interested'
  | 'Meeting Scheduled'
  | 'Profile / Mail Sent'
  | 'Not Interested'
  | 'Already Handled Internally'

/**
 * Classify a free-text remark into a structured outcome.
 */
export function classifyOutcome(remark: string, hasFollowUp: boolean): OutcomeType {
  if (!remark || remark.trim() === '') {
    return hasFollowUp ? 'Call Back Later' : 'Not Called'
  }

  const r = remark.toLowerCase().trim()

  // Positive outcomes
  if (r.includes('meeting') && !r.includes('no meeting')) return 'Meeting Scheduled'
  if (r.includes('interested') && !r.includes('not interested')) return 'Connected - Interested'
  if (r.includes('profile') || r.includes('mail sent') || r.includes('profile shared') || r.includes('mail shared') || r.includes('company profile')) return 'Profile / Mail Sent'

  // Negative outcomes
  if (r.includes('not interested') || r.includes('dont have requirement') || r.includes("don't have requirement")) return 'Not Interested'
  if (r.includes('out of service') || r.includes('not reachable') || r.includes('switched off') || r.includes('unreachable')) return 'Not Reachable / Out of Service'
  if (r.includes('invalid') || r.includes('wrong number') || r.includes('does not exist')) return 'Invalid Number'
  if (r.includes('wrong person') || r.includes('left the') || r.includes('no longer')) return 'Wrong Person / Left Firm'
  if (r.includes('already') && (r.includes('handled') || r.includes('internal') || r.includes('done internally') || r.includes('get it done'))) return 'Already Handled Internally'
  if (r.includes('not interested')) return 'Not Interested'

  // In-progress
  if (r.includes("didn't pick") || r.includes('didnt pick') || r.includes('did not pick') || r.includes('not picked') || r.includes('no response') || r.includes('no answer') || r.includes('call disconnected') || r.includes('disconnected')) return 'Not Picked'
  if (r.includes('call back') || r.includes('call me') || r.includes('ring back') || r.includes('after') || r.includes('later') || r.includes('few months') || r.includes('call on')) return 'Call Back Later'
  if (r.includes("he'll call") || r.includes("will call") || r.includes('call back')) return 'Call Back Later'

  // Default: if has follow-up date, call back later
  return hasFollowUp ? 'Call Back Later' : 'Not Called'
}

/**
 * Normalize phone numbers:
 * - Strip country codes (+91, 91)
 * - Strip spaces, dashes, parentheses
 * - Split multiple phones separated by / or ,
 * - Return array of 10-digit numbers as strings
 */
export function normalizePhones(raw: string | number): string[] {
  if (!raw) return []
  const str = String(raw).trim()

  // Split by / or comma
  const parts = str.split(/[\/,\n\r]+/).map(p => p.trim()).filter(Boolean)

  return parts.map(p => {
    // Remove non-digit chars
    let digits = p.replace(/\D/g, '')
    // Strip leading 91 (India code) if more than 10 digits
    if (digits.length === 12 && digits.startsWith('91')) {
      digits = digits.slice(2)
    }
    if (digits.length === 11 && digits.startsWith('0')) {
      digits = digits.slice(1)
    }
    return digits
  }).filter(d => d.length >= 7 && d.length <= 15)
}

import { getISTDateStr } from './date'

/**
 * Parse an Excel date serial to a JS Date string
 */
export function parseExcelDate(val: string | number | undefined): string | undefined {
  if (!val) return undefined
  if (typeof val === 'number' && val > 40000 && val < 60000) {
    // Excel date serial
    const date = new Date((val - 25569) * 86400 * 1000)
    return getISTDateStr(date)
  }
  if (typeof val === 'string') {
    // Try common date formats
    const dateStr = val.trim()
    if (!dateStr) return undefined
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) return getISTDateStr(d)

    // DD/MM/YYYY
    const match = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/)
    if (match) {
      const [, day, month, year] = match
      const fullYear = year.length === 2 ? `20${year}` : year
      return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
  }
  return undefined
}

/**
 * Normalize company name for deduplication
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\b(pvt|ltd|private|limited|india|industries|enterprises|solutions)\b/g, '')
    .trim()
}

/**
 * Match caller name to team member
 */
export function matchCaller(raw: string | undefined): string {
  if (!raw || !raw.trim()) return 'Unknown'
  const r = raw.trim().toLowerCase()
  const team = ['aadarsh', 'ajinkya', 'himanshi', 'tamanna', 'kunal', 'ankesh', 'naresh', 'pranita']
  for (const member of team) {
    if (r.includes(member)) return member.charAt(0).toUpperCase() + member.slice(1)
  }
  return raw.trim()
}

/**
 * Fuzzy column header matching
 */
export function matchColumn(headers: string[], variants: string[]): number {
  const normalized = headers.map(h => h.toLowerCase().trim().replace(/\s+/g, ' '))
  for (const v of variants) {
    const vn = v.toLowerCase().trim()
    const idx = normalized.findIndex(h => h !== '' && h === vn)
    if (idx >= 0) return idx
  }

  const longestFirst = [...variants].sort((a, b) => b.length - a.length)
  for (const v of longestFirst) {
    const vn = v.toLowerCase().trim()
    const idx = normalized.findIndex(h => h !== '' && h.includes(vn))
    if (idx >= 0) return idx
  }
  return -1
}

export interface ParsedRow {
  company: string
  contact_name: string
  phones: string[]
  email?: string
  designation?: string
  sector?: string
  location?: string
  caller: string
  remark1?: string
  remark2?: string
  follow_up_date?: string
  reference: boolean
  outcome: OutcomeType
  custom_fields: Record<string, string>
  source_data: Record<string, unknown>
  raw: Record<string, unknown>
}

export function getDetectedColumnMap(headers: string[]) {
  const companyColumn = matchColumn(headers, ['company name', 'organization name', 'organisation name', 'business name', 'account name', 'lead name', 'prospect name', 'customer name', 'client name', 'name of company', 'company', 'organisation', 'organization', 'client', 'firm name', 'firm', 'business'])
  return {
    company: companyColumn >= 0 ? companyColumn : headers.findIndex(header => header.trim().toLowerCase() === 'name'),
    contact: matchColumn(headers, ['contact person', 'concerned person', 'contact name', 'contact', 'person', 'owner', 'director', 'poc', 'manager']),
    phone: matchColumn(headers, ['number', 'phone number', 'contact no', 'phone', 'mobile', 'mobile no', 'cell', 'tel', 'ph no', 'phone 1', 'contact number']),
    email: matchColumn(headers, ['email id', 'email', 'mail', 'e-mail', 'email address']),
    designation: matchColumn(headers, ['designation', 'designantion', 'role', 'position', 'title', 'post']),
    sector: matchColumn(headers, ['sector', 'industry', 'category', 'domain', 'vertical']),
    location: matchColumn(headers, ['location', 'place', 'city', 'address', 'region', 'state', 'town']),
    caller: matchColumn(headers, ['who called', 'called by', 'called_by', 'caller', 'agent', 'executive', 'assigned to']),
    remark1: matchColumn(headers, ['remarks', 'remark', 'remark 1', 'first remark', 'notes', 'feedback', 'comments']),
    remark2: matchColumn(headers, ['second remark', 'remark 2', 'remark2', 'additional remark', 'latest remark']),
    followup: matchColumn(headers, ['follow up date', 'follow-up date', 'follow up on', 'followup date', 'followup', 'next call', 'due date']),
    reference: matchColumn(headers, ['reference / no reference', 'reference', 'ref', 'source']),
  }
}

/**
 * Parse a single sheet into ParsedRow array
 */
export function parseSheet(
  rows: unknown[][],
  sheetName: string,
  customColMap?: Partial<Record<string, number>>
): { rows: ParsedRow[]; errors: string[]; headerRowIndex: number; headers: string[] } {
  const errors: string[] = []

  // Smart header row detection: finds the row with actual column names
  let headerRowIndex = 0
  let maxHeaderScore = -1

  for (let i = 0; i < Math.min(6, rows.length); i++) {
    const row = (rows[i] as unknown[]) || []
    const cells = row.map(c => String(c ?? '').trim())
    const nonEmpty = cells.filter(Boolean)
    if (nonEmpty.length === 0) continue

    const rowStr = cells.join(' ').toLowerCase()
    let score = nonEmpty.length

    // Strong indicators of column headers
    if (rowStr.includes('company') || rowStr.includes('business') || rowStr.includes('firm')) score += 15
    if (rowStr.includes('phone') || rowStr.includes('mobile') || rowStr.includes('number')) score += 15
    if (rowStr.includes('contact') || rowStr.includes('person')) score += 10
    if (rowStr.includes('designation') || rowStr.includes('role')) score += 8
    if (rowStr.includes('remark') || rowStr.includes('status')) score += 8
    if (rowStr.includes('email') || rowStr.includes('location')) score += 5

    // Penalty for rows that look like high-level section titles (e.g. 2-3 cells across 15+ cols)
    if (nonEmpty.length <= 3 && rows[i + 1] && (rows[i + 1] as unknown[]).length > 8) {
      score -= 10
    }

    if (score > maxHeaderScore) {
      maxHeaderScore = score
      headerRowIndex = i
    }
  }

  const headers = ((rows[headerRowIndex] as unknown[]) || []).map(h => String(h ?? '').trim())

  // Map columns (merge detected with custom overrides)
  const detected = getDetectedColumnMap(headers)
  const colMap = { ...detected, ...(customColMap || {}) }
  const mappedColumns = new Set(Object.values(colMap).filter(index => index >= 0))


  // Freelancer sheet special handling
  const isFreelancer = sheetName.toLowerCase().includes('freelancer')

  const parsed: ParsedRow[] = []

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    
    // Skip empty rows
    if (!row || row.every(c => c === '' || c === null || c === undefined)) continue

    const get = (idx: number) => idx >= 0 ? String(row[idx] ?? '').trim() : ''

    const companyName = get(colMap.company)
    if (!companyName) continue

    const phones = normalizePhones(colMap.phone >= 0 ? (row[colMap.phone] ?? '') as string | number : '')
    const followUpRaw = colMap.followup >= 0 ? row[colMap.followup] : undefined
    const followUpDate = parseExcelDate(followUpRaw as string | number)

    const remark1 = get(colMap.remark1)
    const remark2 = get(colMap.remark2)
    const combinedRemark = [remark1, remark2].filter(Boolean).join(' | ')

    const referenceRaw = get(colMap.reference).toLowerCase()
    const isReference = referenceRaw.includes('reference') && !referenceRaw.includes('no reference')

    const outcome = isFreelancer ? 'Not Called' : classifyOutcome(combinedRemark, !!followUpDate)

    const rawObj: Record<string, unknown> = {}
    headers.forEach((h, idx) => { rawObj[h] = row[idx] })
    const customFields: Record<string, string> = {}
    headers.forEach((header, index) => {
      const name = header.trim()
      if (name && !mappedColumns.has(index)) {
        customFields[name] = String(row[index] ?? '').trim()
      }
    })

    parsed.push({
      company: companyName,
      contact_name: get(colMap.contact),
      phones,
      email: colMap.email >= 0 ? get(colMap.email) : undefined,
      designation: colMap.designation >= 0 ? get(colMap.designation) : undefined,
      sector: colMap.sector >= 0 ? get(colMap.sector) : undefined,
      location: colMap.location >= 0 ? get(colMap.location) : undefined,
      caller: matchCaller(colMap.caller >= 0 ? get(colMap.caller) : undefined),
      remark1,
      remark2,
      follow_up_date: followUpDate,
      reference: isReference,
      outcome,
      custom_fields: customFields,
      source_data: rawObj,
      raw: rawObj,
    })
  }

  return { rows: parsed, errors, headerRowIndex, headers }
}

export interface ImportSummary {
  sheet: string
  listId: string
  totalRows: number
  imported: number
  skipped: number
  duplicates: number
  errors: string[]
}
