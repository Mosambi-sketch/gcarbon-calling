/**
 * lib/excel-live-sync.ts — Real-time live synchronization of CRM changes to master Excel
 */

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

export async function syncLeadToExcel(
  listId: string,
  companyName: string,
  updates: LeadExcelUpdates
): Promise<boolean> {
  if (!companyName) return false
  try {
    const res = await fetch('/api/excel/sync-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

export function downloadLiveExcelFile() {
  const link = document.createElement('a')
  link.href = '/api/excel/download'
  link.download = 'CRM_Live.xlsx'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export async function deleteLeadFromExcel(
  listId: string,
  companyName: string
): Promise<boolean> {
  if (!companyName) return false
  try {
    const res = await fetch('/api/excel/delete-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
