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

/**
 * Parse an Excel date serial to a JS Date string
 */
export function parseExcelDate(val: string | number | undefined): string | undefined {
  if (!val) return undefined
  if (typeof val === 'number' && val > 40000 && val < 60000) {
    // Excel date serial
    const date = new Date((val - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }
  if (typeof val === 'string') {
    // Try common date formats
    const dateStr = val.trim()
    if (!dateStr) return undefined
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
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
  if (!raw) return 'Unknown'
  const r = raw.trim().toLowerCase()
  const team = ['ajinkya', 'himanshi', 'tamanna', 'kunal', 'ankesh']
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
    const idx = normalized.findIndex(h => h === vn || h.includes(vn) || vn.includes(h))
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
  raw: Record<string, unknown>
}

/**
 * Parse a single sheet into ParsedRow array
 */
export function parseSheet(
  rows: unknown[][],
  sheetName: string
): { rows: ParsedRow[]; errors: string[]; headerRowIndex: number } {
  const errors: string[] = []

  // Find header row (first row with at least 3 non-empty cells)
  let headerRowIndex = 0
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const nonEmpty = (rows[i] as unknown[]).filter((c) => c !== '' && c !== null && c !== undefined).length
    if (nonEmpty >= 3) {
      headerRowIndex = i
      break
    }
  }

  const headers = (rows[headerRowIndex] as unknown[]).map(h => String(h ?? ''))

  // Map columns
  const colMap = {
    company: matchColumn(headers, ['company name', 'company ', 'company', 'name']),
    contact: matchColumn(headers, ['contact person', 'concerned person', 'contact', 'person']),
    phone: matchColumn(headers, ['number', 'phone number', 'contact no', 'phone', 'mobile']),
    email: matchColumn(headers, ['email id', 'email', 'mail']),
    designation: matchColumn(headers, ['designantion', 'designation', 'role', 'type']),
    sector: matchColumn(headers, ['sector', 'industry']),
    location: matchColumn(headers, ['location', 'place']),
    caller: matchColumn(headers, ['who called', 'called by', 'called_by']),
    remark1: matchColumn(headers, ['remarks', 'remark', 'remark 1']),
    remark2: matchColumn(headers, ['second remark', 'remark 2', 'remark2']),
    followup: matchColumn(headers, ['follow up date', 'follow-up date', 'follow up on', ' follow up date']),
    reference: matchColumn(headers, ['reference / no reference', 'reference']),
  }

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
      raw: rawObj,
    })
  }

  return { rows: parsed, errors, headerRowIndex }
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
