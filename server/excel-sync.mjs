import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const excelPath = path.resolve(rootDir, 'data/CRM.xlsx')
const crmJsonPath = path.resolve(rootDir, 'data/crm-calling.json')
const publicCrmPath = path.resolve(rootDir, 'public/data/crm-calling.json')

function normalizeKey(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Maps a listId to the actual sheet name in CRM.xlsx
 */
export function getSheetNameForList(listId, sheetNames) {
  if (!listId) return sheetNames[0]
  const cleanId = listId.toLowerCase().replace(/[^a-z0-9]/g, '')

  for (const name of sheetNames) {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (cleanName === cleanId) return name
  }

  // Fallback mappings
  if (cleanId.includes('connection')) {
    const found = sheetNames.find(s => s.toLowerCase().includes('connection'))
    if (found) return found
  }
  if (cleanId.includes('quotation')) {
    const found = sheetNames.find(s => s.toLowerCase().includes('quotation'))
    if (found) return found
  }
  if (cleanId.includes('bhosari')) {
    const found = sheetNames.find(s => s.toLowerCase().includes('bhosari'))
    if (found) return found
  }
  if (cleanId.includes('chakan')) {
    const found = sheetNames.find(s => s.toLowerCase().includes('chakan'))
    if (found) return found
  }
  if (cleanId.includes('hinjewadi')) {
    const found = sheetNames.find(s => s.toLowerCase().includes('hinjewadi'))
    if (found) return found
  }
  if (cleanId.includes('pimpri')) {
    const found = sheetNames.find(s => s.toLowerCase().includes('pimpri'))
    if (found) return found
  }
  if (cleanId.includes('other')) {
    const found = sheetNames.find(s => s.toLowerCase().includes('other'))
    if (found) return found
  }

  return sheetNames[0]
}

/**
 * Updates a single lead's fields in CRM.xlsx in real-time
 */
export function updateExcelLead({ listId, companyName, updates }) {
  if (!fs.existsSync(excelPath)) {
    throw new Error('CRM.xlsx file does not exist on server')
  }

  const wb = XLSX.readFile(excelPath)
  let targetSheetName = getSheetNameForList(listId, wb.SheetNames)
  let ws = wb.Sheets[targetSheetName]

  if (!ws) {
    targetSheetName = wb.SheetNames[0]
    ws = wb.Sheets[targetSheetName]
  }

  let data = XLSX.utils.sheet_to_json(ws, { header: 1 })

  // Find header row
  let hRow = 1
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i] || []
    if (row.some(c => String(c).toLowerCase().includes('company'))) {
      hRow = i
      break
    }
  }

  const headers = (data[hRow] || []).map(h => String(h || '').toLowerCase().trim())
  const compCol = headers.findIndex(h => h.includes('company')) >= 0 ? headers.findIndex(h => h.includes('company')) : 0
  const contactCol = headers.findIndex(h => h.includes('contact person') || h === 'contact')
  const desigCol = headers.findIndex(h => h.includes('designation'))
  const phoneCol = headers.findIndex(h => h.includes('phone') || h.includes('mobile'))
  const emailCol = headers.findIndex(h => h.includes('email') || h.includes('mail'))
  const locCol = headers.findIndex(h => h.includes('location') || h.includes('address'))
  const refCol = headers.findIndex(h => h.includes('reference') || h.includes('ref'))
  const calledCol = headers.findIndex(h => h.includes('called by') || h === 'called')
  const rem1Col = headers.findIndex(h => h.includes('remark 1') || h === 'remark')
  const rem2Col = headers.findIndex(h => h.includes('remark 2'))
  const followCol = headers.findIndex(h => h.includes('follow-up') || h.includes('follow up'))
  const stageCol = headers.findIndex(h => h.includes('stage') || h.includes('status'))

  const normTarget = normalizeKey(companyName)

  // Find existing row in this sheet
  let targetRowIdx = -1
  for (let r = hRow + 1; r < data.length; r++) {
    const row = data[r]
    if (row && row[compCol] && normalizeKey(row[compCol]) === normTarget) {
      targetRowIdx = r
      break
    }
  }

  // If not found in designated sheet, search other sheets
  if (targetRowIdx === -1) {
    for (const sName of wb.SheetNames) {
      if (sName === targetSheetName) continue
      const otherWs = wb.Sheets[sName]
      const otherData = XLSX.utils.sheet_to_json(otherWs, { header: 1 })
      for (let r = 1; r < otherData.length; r++) {
        const row = otherData[r]
        if (row && row[0] && normalizeKey(row[0]) === normTarget) {
          targetSheetName = sName
          ws = otherWs
          data = otherData
          targetRowIdx = r
          break
        }
      }
      if (targetRowIdx !== -1) break
    }
  }

  let rowToUpdate = []
  const isNew = targetRowIdx === -1

  if (!isNew) {
    rowToUpdate = [...(data[targetRowIdx] || [])]
  } else {
    // Brand new row
    targetRowIdx = data.length
    rowToUpdate = new Array(Math.max(headers.length, 12)).fill(undefined)
    rowToUpdate[compCol >= 0 ? compCol : 0] = companyName
  }

  // Apply updates to matching columns
  if (updates.companyName !== undefined && compCol >= 0) {
    rowToUpdate[compCol] = updates.companyName
  }

  if (updates.contactName !== undefined && contactCol >= 0) {
    rowToUpdate[contactCol] = updates.contactName || undefined
  }

  if (updates.designation !== undefined && desigCol >= 0) {
    rowToUpdate[desigCol] = updates.designation || undefined
  }

  if (updates.phone !== undefined && phoneCol >= 0) {
    rowToUpdate[phoneCol] = updates.phone || undefined
  }

  if (updates.email !== undefined && emailCol >= 0) {
    rowToUpdate[emailCol] = updates.email || undefined
  }

  if (updates.location !== undefined && locCol >= 0) {
    rowToUpdate[locCol] = updates.location || undefined
  }

  if (updates.reference !== undefined && refCol >= 0) {
    rowToUpdate[refCol] = updates.reference ? 'Reference' : 'No reference'
  }

  if (updates.callerName !== undefined) {
    const targetCalledCol = calledCol >= 0 ? calledCol : 7
    rowToUpdate[targetCalledCol] = updates.callerName || undefined
  }

  if (updates.remark !== undefined) {
    const targetRem1 = rem1Col >= 0 ? rem1Col : 8
    const targetRem2 = rem2Col >= 0 ? rem2Col : 9
    if (!rowToUpdate[targetRem1] || rowToUpdate[targetRem1] === updates.remark) {
      rowToUpdate[targetRem1] = updates.remark
    } else {
      rowToUpdate[targetRem2] = updates.remark
    }
  }

  if (updates.followUpDate !== undefined && followCol >= 0) {
    rowToUpdate[followCol] = updates.followUpDate || undefined
  }

  if (updates.status !== undefined && stageCol >= 0) {
    rowToUpdate[stageCol] = updates.status || undefined
  }

  data[targetRowIdx] = rowToUpdate
  wb.Sheets[targetSheetName] = XLSX.utils.aoa_to_sheet(data)

  // Write Excel file back to disk immediately
  XLSX.writeFile(wb, excelPath)
  console.log(`[Excel Sync] Saved live updates for "${companyName}" to sheet "${targetSheetName}" at row ${targetRowIdx + 1}`)

  // Also update data/crm-calling.json & public/data/crm-calling.json in memory
  try {
    if (fs.existsSync(crmJsonPath)) {
      const crmJson = JSON.parse(fs.readFileSync(crmJsonPath, 'utf8'))
      const comp = crmJson.companies.find(c => normalizeKey(c.name) === normTarget)
      if (comp) {
        if (updates.companyName) comp.name = updates.companyName
        if (updates.callerName !== undefined) comp.owner_name = updates.callerName || undefined
        if (updates.status) comp.status = updates.status
        if (updates.location) comp.location = updates.location
        if (updates.reference !== undefined) comp.reference = Boolean(updates.reference)

        // Update contact
        if (updates.contactName !== undefined || updates.designation !== undefined || updates.phone !== undefined || updates.email !== undefined) {
          const contact = crmJson.contacts.find(c => c.company_id === comp.id)
          if (contact) {
            if (updates.contactName !== undefined) contact.name = updates.contactName
            if (updates.designation !== undefined) contact.designation = updates.designation
            if (updates.phone !== undefined) contact.phones = updates.phone ? [updates.phone] : []
            if (updates.email !== undefined) contact.email = updates.email
          }
        }

        // Update or add call log
        if (updates.remark || updates.callerName || updates.followUpDate) {
          let lastLog = crmJson.call_logs.find(l => l.company_id === comp.id)
          if (!lastLog) {
            lastLog = {
              id: 'log-' + Date.now(),
              company_id: comp.id,
              called_at: new Date().toISOString(),
              outcome: 'Connected - Interested',
            }
            crmJson.call_logs.push(lastLog)
          }
          if (updates.callerName !== undefined) lastLog.caller_name = updates.callerName || ''
          if (updates.remark !== undefined) lastLog.remark = updates.remark
          if (updates.followUpDate !== undefined) lastLog.follow_up_date = updates.followUpDate
        }

        crmJson.last_synced = new Date().toISOString()
        fs.writeFileSync(crmJsonPath, JSON.stringify(crmJson, null, 2))
        fs.writeFileSync(publicCrmPath, JSON.stringify(crmJson, null, 2))
      }
    }
  } catch (err) {
    console.warn('[Excel Sync] JSON cache update error:', err.message)
  }

  return {
    success: true,
    sheetName: targetSheetName,
    row: targetRowIdx + 1,
    isNew,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Deletes a company row from CRM.xlsx in real-time
 */
export function deleteExcelLead({ listId, companyName }) {
  if (!fs.existsSync(excelPath)) {
    throw new Error('CRM.xlsx file does not exist on server')
  }

  const wb = XLSX.readFile(excelPath)
  let targetSheetName = getSheetNameForList(listId, wb.SheetNames)
  let ws = wb.Sheets[targetSheetName]

  if (!ws) {
    targetSheetName = wb.SheetNames[0]
    ws = wb.Sheets[targetSheetName]
  }

  let data = XLSX.utils.sheet_to_json(ws, { header: 1 })
  const normTarget = normalizeKey(companyName)

  // Find header row and company column
  let hRow = 1
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i] || []
    if (row.some(c => String(c).toLowerCase().includes('company'))) {
      hRow = i
      break
    }
  }

  const headers = (data[hRow] || []).map(h => String(h || '').toLowerCase().trim())
  const compCol = headers.findIndex(h => h.includes('company'))
  const colToCheck = compCol >= 0 ? compCol : 0

  // Find existing row in this sheet
  let targetRowIdx = -1
  for (let r = hRow + 1; r < data.length; r++) {
    const row = data[r]
    if (row && row[colToCheck] && normalizeKey(row[colToCheck]) === normTarget) {
      targetRowIdx = r
      break
    }
  }

  // If not found in designated sheet, search other sheets
  if (targetRowIdx === -1) {
    for (const sName of wb.SheetNames) {
      if (sName === targetSheetName) continue
      const otherWs = wb.Sheets[sName]
      const otherData = XLSX.utils.sheet_to_json(otherWs, { header: 1 })
      let otherHRow = 1
      for (let i = 0; i < Math.min(5, otherData.length); i++) {
        if (otherData[i] && otherData[i].some(c => String(c).toLowerCase().includes('company'))) {
          otherHRow = i
          break
        }
      }
      const otherHeaders = (otherData[otherHRow] || []).map(h => String(h || '').toLowerCase().trim())
      const otherCompCol = otherHeaders.findIndex(h => h.includes('company'))
      const otherCol = otherCompCol >= 0 ? otherCompCol : 0

      for (let r = otherHRow + 1; r < otherData.length; r++) {
        const row = otherData[r]
        if (row && row[otherCol] && normalizeKey(row[otherCol]) === normTarget) {
          targetSheetName = sName
          ws = otherWs
          data = otherData
          targetRowIdx = r
          break
        }
      }
      if (targetRowIdx !== -1) break
    }
  }

  if (targetRowIdx !== -1) {
    data.splice(targetRowIdx, 1)
    wb.Sheets[targetSheetName] = XLSX.utils.aoa_to_sheet(data)
    XLSX.writeFile(wb, excelPath)
    console.log(`[Excel Sync] Deleted "${companyName}" from sheet "${targetSheetName}" at row ${targetRowIdx + 1}`)
  }

  // Also remove from data/crm-calling.json & public/data/crm-calling.json and track in deleted_company_keys
  try {
    if (fs.existsSync(crmJsonPath)) {
      const crmJson = JSON.parse(fs.readFileSync(crmJsonPath, 'utf8'))
      if (!crmJson.deleted_company_keys) {
        crmJson.deleted_company_keys = []
      }
      const sKey = `${listId}:::${companyName.toLowerCase()}`
      if (!crmJson.deleted_company_keys.includes(sKey)) crmJson.deleted_company_keys.push(sKey)
      if (!crmJson.deleted_company_keys.includes(normTarget)) crmJson.deleted_company_keys.push(normTarget)

      const comp = crmJson.companies.find(c => normalizeKey(c.name) === normTarget)
      if (comp) {
        crmJson.companies = crmJson.companies.filter(c => c.id !== comp.id)
        crmJson.contacts = crmJson.contacts.filter(c => c.company_id !== comp.id)
        crmJson.call_logs = crmJson.call_logs.filter(l => l.company_id !== comp.id)
      } else {
        crmJson.companies = crmJson.companies.filter(c => normalizeKey(c.name) !== normTarget)
      }
      crmJson.last_synced = new Date().toISOString()
      fs.writeFileSync(crmJsonPath, JSON.stringify(crmJson, null, 2))
      fs.writeFileSync(publicCrmPath, JSON.stringify(crmJson, null, 2))
    }
  } catch (err) {
    console.warn('[Excel Sync] JSON cache delete error:', err.message)
  }

  return {
    success: true,
    deleted: targetRowIdx !== -1,
    sheetName: targetSheetName,
    companyName,
    timestamp: new Date().toISOString(),
  }
}
