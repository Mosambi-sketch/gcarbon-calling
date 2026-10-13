/**
 * lib/excel-live-sync.ts — Real-time live synchronization of CRM changes to master Excel
 */

import { toast } from 'react-hot-toast'
import { getCachedUser } from './db'
import { supabase } from './supabase'
import { getCompanies, getContacts, getCallLogs, getLists } from './store'
import { API_BASE_URL } from './api'

export interface LeadExcelUpdates {
  companyName?: string
  contactName?: string
  designation?: string
  phone?: string
  email?: string
  location?: string
  reference?: boolean
  callerName?: string
  remark?: string
  followUpDate?: string
  status?: string
}

export function sanitizeCellValue(val: unknown): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`
  }
  return str
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const user = getCachedUser()
  if (user?.email) {
    headers['x-user-email'] = user.email
  }
  try {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.access_token) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`
    }
  } catch {
    // quiet ignore
  }
  return headers
}

export async function syncLeadToExcel(
  listId: string,
  companyName: string,
  updates: LeadExcelUpdates
): Promise<boolean> {
  if (!companyName) return false
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_BASE_URL}/excel/sync-lead`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        listId,
        companyName,
        updates,
      }),
    })
    const data = await res.json()
    return Boolean(data.success)
  } catch (err) {
    console.warn('[Excel Live Sync] Warning: could not reach backend excel sync:', err)
    return false
  }
}

export async function downloadLiveExcelFile(): Promise<void> {
  const toastId = toast.loading('Preparing live Excel workbook...')
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_BASE_URL}/excel/download`, { headers })

    if (res.ok) {
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Gcarbon_CRM_Live_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      toast.success('Live Excel downloaded on-time!', { id: toastId })
      return
    }
    throw new Error(`Download status: ${res.status}`)
  } catch (err) {
    console.warn('[Excel Download] Server download failed, falling back to instant client-side export:', err)
    try {
      const XLSX = await import('xlsx')
      const companies = getCompanies()
      const contacts = getContacts()
      const callLogs = getCallLogs()
      const workspaces = getLists()

      const contactsByCompany = new Map<string, typeof contacts>()
      for (const c of contacts) {
        if (!contactsByCompany.has(c.company_id)) contactsByCompany.set(c.company_id, [])
        contactsByCompany.get(c.company_id)!.push(c)
      }

      const logsByCompany = new Map<string, typeof callLogs>()
      for (const l of callLogs) {
        if (!logsByCompany.has(l.company_id)) logsByCompany.set(l.company_id, [])
        logsByCompany.get(l.company_id)!.push(l)
      }

      const wb = XLSX.utils.book_new()
      const headers = [
        'Company Name',
        'Contact Person',
        'Designation',
        'Phone',
        'Email',
        'Location',
        'Reference?',
        'Called By',
        'Remark 1',
        'Remark 2',
        'Follow-up Date',
        'Stage',
        'Next Action',
      ]

      const activeSheets = workspaces.length > 0 ? workspaces : [{ id: 'all', name: 'All Companies' }]

      for (const ws of activeSheets) {
        const wsComps = ws.id === 'all'
          ? companies
          : companies.filter(c => (c.workspace_id && c.workspace_id === ws.id) || c.list_id === ws.id)

        const rows = wsComps.map(c => {
          const compContacts = contactsByCompany.get(c.id) || []
          const primary = compContacts.find(p => p.is_primary) || compContacts[0]
          const compLogs = logsByCompany.get(c.id) || []
          const phoneStr = (primary?.phones || []).join(', ')

          return [
            sanitizeCellValue(c.name || ''),
            sanitizeCellValue(primary?.name || ''),
            sanitizeCellValue(primary?.designation || ''),
            sanitizeCellValue(phoneStr),
            sanitizeCellValue(primary?.email || ''),
            sanitizeCellValue(c.location || ''),
            sanitizeCellValue(c.reference ? 'Reference' : 'No reference'),
            sanitizeCellValue(c.owner_name || ''),
            sanitizeCellValue(compLogs[0]?.remark || c.notes || ''),
            sanitizeCellValue(compLogs[1]?.remark || ''),
            sanitizeCellValue(compLogs[0]?.follow_up_date || ''),
            sanitizeCellValue(c.status || 'Not Started'),
            sanitizeCellValue(compLogs[0]?.next_action || ''),
          ]
        })

        const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
        const safeTitle = (ws.name || 'Sheet').slice(0, 31).replace(/[\\/?*[\\]]/g, '')
        XLSX.utils.book_append_sheet(wb, sheet, safeTitle)
      }

      XLSX.writeFile(wb, `Gcarbon_CRM_Live_${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success('Live Excel downloaded successfully!', { id: toastId })
    } catch (fallbackErr) {
      console.error('[Excel Download Failed completely]:', fallbackErr)
      toast.error('Failed to generate Excel file.', { id: toastId })
    }
  }
}

export async function deleteLeadFromExcel(
  listId: string,
  companyName: string
): Promise<boolean> {
  if (!companyName) return false
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_BASE_URL}/excel/delete-lead`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        listId,
        companyName,
      }),
    })
    const data = await res.json()
    return Boolean(data.success)
  } catch (err) {
    console.warn('[Excel Live Sync] Warning: could not reach backend excel delete:', err)
    return false
  }
}
