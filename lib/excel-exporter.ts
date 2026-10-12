/**
 * lib/excel-exporter.ts — High Quality Excel & CSV Exporter for Gcarbon Calling Workspace
 *
 * Produces clean, professional, well-organized Excel spreadsheets:
 * - Proper columns (S.No, Company, Contact, Phone, Status, Owner, Remark, Follow-up, Call Log summary)
 * - Auto-filtered headers
 * - Frozen header row
 * - Formatted dates and clean phone numbers
 * - Auto-adjusted column widths
 */

import * as XLSX from 'xlsx'
import type { Company, Contact, CallLog } from './types'
import type { ListDef } from './store'
import { getISTDateStr } from './date'

export interface CleanExportLead {
  'S.No': number
  'Company Name': string
  'Contact Person': string
  'Designation': string
  'Primary Phone': string
  'Alternative Phones': string
  'Email Address': string
  'Location / City': string
  'Industry / Sector': string
  'Lead Status': string
  'Assigned Caller': string
  'Total Calls': number
  'Latest Call Date': string
  'Latest Outcome': string
  'Latest Remark': string
  'Next Follow-Up Date': string
  'Call History Summary': string
  [key: string]: unknown
}

/**
 * Build clean, well-formatted, professional rows for Excel export
 */
export function buildExportRows(
  companies: Company[],
  contacts: Contact[],
  callLogs: CallLog[]
): CleanExportLead[] {
  const contactsByCompany: Record<string, Contact[]> = {}
  for (const c of contacts) {
    if (!contactsByCompany[c.company_id]) contactsByCompany[c.company_id] = []
    contactsByCompany[c.company_id].push(c)
  }

  const logsByCompany: Record<string, CallLog[]> = {}
  for (const l of callLogs) {
    if (!logsByCompany[l.company_id]) logsByCompany[l.company_id] = []
    logsByCompany[l.company_id].push(l)
  }

  return companies.map((company, index) => {
    const compContacts = contactsByCompany[company.id] || []
    const primaryContact = compContacts.find(c => c.is_primary) || compContacts[0]
    const compLogs = (logsByCompany[company.id] || []).sort(
      (a, b) => new Date(b.called_at).getTime() - new Date(a.called_at).getTime()
    )
    const lastLog = compLogs[0]

    // Phone numbers formatting
    const allPhones = primaryContact?.phones || []
    const primaryPhone = allPhones[0] || ''
    const altPhones = allPhones.slice(1).join(', ')

    // Formatted Call History summary: "[Date] Caller: Outcome - Remark"
    const historySummary = compLogs.map(l => {
      const dateStr = l.called_at ? l.called_at.slice(0, 10) : ''
      const remarkStr = l.remark ? ` ("${l.remark}")` : ''
      return `[${dateStr}] ${l.caller_name || 'Caller'}: ${l.outcome}${remarkStr}`
    }).join(' | ')

    return {
      'S.No': index + 1,
      'Company Name': company.name || 'Untitled Company',
      'Contact Person': primaryContact?.name || '',
      'Designation': primaryContact?.designation || '',
      'Primary Phone': primaryPhone,
      'Alternative Phones': altPhones,
      'Email Address': primaryContact?.email || '',
      'Location / City': company.location || '',
      'Industry / Sector': company.sector || company.industry || '',
      'Lead Status': company.status || 'Not Called',
      'Assigned Caller': company.owner_name || lastLog?.caller_name || 'Unassigned',
      'Total Calls': compLogs.length,
      'Latest Call Date': lastLog?.called_at ? lastLog.called_at.slice(0, 10) : '',
      'Latest Outcome': lastLog?.outcome || 'Not Called',
      'Latest Remark': lastLog?.remark || '',
      'Next Follow-Up Date': lastLog?.follow_up_date || '',
      'Call History Summary': historySummary || 'No calls recorded yet',
    }
  })
}

/**
 * Calculate optimal column widths for an XLSX worksheet
 */
export function calculateColumnWidths(data: Record<string, unknown>[]): XLSX.ColInfo[] {
  if (data.length === 0) return []
  const keys = Object.keys(data[0])

  return keys.map(key => {
    let maxLength = key.length
    for (let i = 0; i < Math.min(data.length, 150); i++) {
      const val = data[i][key]
      if (val !== undefined && val !== null) {
        const str = String(val)
        if (str.length > maxLength) {
          maxLength = Math.min(str.length, 50)
        }
      }
    }
    // S.No can be compact
    if (key === 'S.No') return { wch: 6 }
    return { wch: Math.max(maxLength + 4, 14) }
  })
}

/**
 * Browser-safe binary Excel download triggering standard .xlsx file download
 */
export function triggerExcelDownload(wb: XLSX.WorkBook, filename: string): void {
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8',
  })

  if (typeof window !== 'undefined') {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const safeName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
    link.setAttribute('download', safeName)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
  }
}

/**
 * Browser-safe CSV download
 */
export function triggerCsvDownload(data: Record<string, unknown>[], filename: string): void {
  const ws = XLSX.utils.json_to_sheet(data)
  const csv = XLSX.utils.sheet_to_csv(ws)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  if (typeof window !== 'undefined') {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const safeName = filename.endsWith('.csv') ? filename : `${filename}.csv`
    link.setAttribute('download', safeName)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }
}

/**
 * Export a single list or filtered selection to a well-formatted Excel (.xlsx) file
 */
export function exportSingleSheetToExcel(
  companies: Company[],
  contacts: Contact[],
  callLogs: CallLog[],
  sheetTitle: string
): void {
  const rows = buildExportRows(companies, contacts, callLogs)
  const ws = XLSX.utils.json_to_sheet(rows)

  // Auto-calculated column widths
  ws['!cols'] = calculateColumnWidths(rows)

  // Auto-filter on top row
  if (rows.length > 0) {
    const colCount = Object.keys(rows[0]).length
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: rows.length, c: colCount - 1 },
      }),
    }
  }

  const wb = XLSX.utils.book_new()
  const sanitizedSheetName = sheetTitle.replace(/[:\\/?*\[\]]/g, '').slice(0, 31) || 'Calling Sheet'
  XLSX.utils.book_append_sheet(wb, ws, sanitizedSheetName)

  const todayStr = getISTDateStr()
  const safeFileName = `Gcarbon_Calling_${sanitizedSheetName.replace(/\s+/g, '_')}_${todayStr}.xlsx`
  triggerExcelDownload(wb, safeFileName)
}

/**
 * Export a single list or filtered selection to CSV
 */
export function exportSingleSheetToCsv(
  companies: Company[],
  contacts: Contact[],
  callLogs: CallLog[],
  sheetTitle: string
): void {
  const rows = buildExportRows(companies, contacts, callLogs)
  const sanitizedSheetName = sheetTitle.replace(/[:\\/?*\[\]]/g, '').slice(0, 31) || 'Calling Sheet'
  const todayStr = getISTDateStr()
  const safeFileName = `Gcarbon_Calling_${sanitizedSheetName.replace(/\s+/g, '_')}_${todayStr}.csv`
  triggerCsvDownload(rows, safeFileName)
}

/**
 * Export ALL lists in the workspace into a multi-sheet Excel workbook with Summary tab
 */
export function exportAllSheetsToWorkbook(
  lists: ListDef[],
  allCompanies: Company[],
  allContacts: Contact[],
  allCallLogs: CallLog[]
): void {
  const wb = XLSX.utils.book_new()

  // 1. Executive Summary Sheet
  const summaryRows = lists.map(l => {
    const listCompanies = allCompanies.filter(c => c.list_id === l.id)
    const listCompIds = new Set(listCompanies.map(c => c.id))
    const listLogs = allCallLogs.filter(log => listCompIds.has(log.company_id))

    return {
      'Calling Sheet Name': l.name,
      'Total Leads': listCompanies.length,
      'Total Calls Made': listLogs.length,
      'Meetings Scheduled': listCompanies.filter(c => c.status === 'Meeting Set' || c.status === 'Meeting Scheduled').length,
      'Interested / Won': listCompanies.filter(c => c.status === 'Won' || c.status === 'Won/Interested' || c.status === 'Interested').length,
      'Follow-up Due': listCompanies.filter(c => c.status === 'Follow-up Due').length,
      'In Progress': listCompanies.filter(c => c.status === 'In Progress' || c.status === 'Attempted').length,
      'Not Called': listCompanies.filter(c => c.status === 'Not Called').length,
      'Dead / Closed': listCompanies.filter(c => c.status === 'Dead' || c.status === 'Lost').length,
    }
  })

  // Grand total summary
  summaryRows.push({
    'Calling Sheet Name': '=== TOTAL ALL SHEETS ===',
    'Total Leads': allCompanies.length,
    'Total Calls Made': allCallLogs.length,
    'Meetings Scheduled': allCompanies.filter(c => c.status === 'Meeting Set' || c.status === 'Meeting Scheduled').length,
    'Interested / Won': allCompanies.filter(c => c.status === 'Won' || c.status === 'Won/Interested' || c.status === 'Interested').length,
    'Follow-up Due': allCompanies.filter(c => c.status === 'Follow-up Due').length,
    'In Progress': allCompanies.filter(c => c.status === 'In Progress' || c.status === 'Attempted').length,
    'Not Called': allCompanies.filter(c => c.status === 'Not Called').length,
    'Dead / Closed': allCompanies.filter(c => c.status === 'Dead' || c.status === 'Lost').length,
  })

  const summaryWs = XLSX.utils.json_to_sheet(summaryRows)
  summaryWs['!cols'] = calculateColumnWidths(summaryRows)
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Overview Summary')

  // 2. Add each list sheet
  const usedNames = new Set<string>(['Overview Summary'])
  for (const l of lists) {
    const listCompanies = allCompanies.filter(c => c.list_id === l.id)
    if (listCompanies.length === 0) continue

    const rows = buildExportRows(listCompanies, allContacts, allCallLogs)
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = calculateColumnWidths(rows)

    if (rows.length > 0) {
      ws['!autofilter'] = {
        ref: XLSX.utils.encode_range({
          s: { r: 0, c: 0 },
          e: { r: rows.length, c: Object.keys(rows[0]).length - 1 },
        }),
      }
    }

    let tabName = l.name.replace(/[:\\/?*\[\]]/g, '').slice(0, 31)
    let counter = 1
    while (usedNames.has(tabName.toLowerCase())) {
      tabName = `${l.name.slice(0, 27)}_${counter++}`
    }
    usedNames.add(tabName.toLowerCase())

    XLSX.utils.book_append_sheet(wb, ws, tabName)
  }

  const todayStr = getISTDateStr()
  const safeFileName = `Gcarbon_Calling_CRM_All_Sheets_${todayStr}.xlsx`
  triggerExcelDownload(wb, safeFileName)
}
