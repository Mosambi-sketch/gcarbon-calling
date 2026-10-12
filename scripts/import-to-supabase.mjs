#!/usr/bin/env node
/**
 * scripts/import-to-supabase.mjs
 * Idempotent migration script to import data/crm-calling.json directly into Supabase.
 * Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from environment.
 *
 * Usage:
 *   node scripts/import-to-supabase.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

// Load environment variables
dotenv.config({ path: path.resolve(rootDir, '.env.local') })
dotenv.config({ path: path.resolve(rootDir, '.env') })

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('[Error] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Please configure them in .env or provide via environment variables.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

const dataFile = path.resolve(rootDir, 'data/crm-calling.json')
if (!fs.existsSync(dataFile)) {
  console.error(`[Error] Data file not found: ${dataFile}`)
  process.exit(1)
}

const rawData = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
const { lists = [], companies = [], contacts = [], call_logs = [] } = rawData

console.log(`[Import] Found ${lists.length} lists, ${companies.length} companies, ${contacts.length} contacts, ${call_logs.length} call logs.`)

async function runImport() {
  // 1. Lists
  if (lists.length > 0) {
    console.log(`[Import] Upserting ${lists.length} lists...`)
    const formattedLists = lists.map(l => ({
      id: l.id,
      name: l.name,
      type: l.type || 'company',
      created_at: l.created_at || new Date().toISOString(),
      columns: l.columns || [],
    }))
    const { error: listErr } = await supabase.from('lists').upsert(formattedLists, { onConflict: 'id' })
    if (listErr) console.warn('[Lists] Warning:', listErr.message)
    else console.log('[Lists] Successfully synced lists.')
  }

  // 2. Companies in batches of 100
  console.log(`[Import] Upserting ${companies.length} companies...`)
  const BATCH_SIZE = 100
  let importedCompanies = 0
  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const chunk = companies.slice(i, i + BATCH_SIZE).map(c => ({
      id: c.id,
      name: c.name,
      list_id: c.list_id || 'connection-list',
      status: c.status || 'Not Called',
      reference: Boolean(c.reference),
      owner_name: c.owner_name || null,
      created_at: c.created_at || new Date().toISOString(),
      source_data: c.source_data || {},
      custom_fields: c.custom_fields || {},
      sector: c.sector || null,
      industry: c.industry || null,
      location: c.location || null,
      website: c.website || null,
      notes: c.notes || null,
      archived: Boolean(c.archived),
    }))

    const { error } = await supabase.from('companies').upsert(chunk, { onConflict: 'id' })
    if (error) {
      console.error(`[Companies] Batch ${i} error:`, error.message)
    } else {
      importedCompanies += chunk.length
    }
  }
  console.log(`[Companies] Successfully synced ${importedCompanies}/${companies.length} companies.`)

  // 3. Contacts in batches of 100
  console.log(`[Import] Upserting ${contacts.length} contacts...`)
  let importedContacts = 0
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const chunk = contacts.slice(i, i + BATCH_SIZE).map(c => ({
      id: c.id,
      company_id: c.company_id,
      name: c.name || 'Unknown Contact',
      designation: c.designation || null,
      phones: Array.isArray(c.phones) ? c.phones : (c.phones ? [String(c.phones)] : []),
      email: c.email || null,
      is_primary: Boolean(c.is_primary),
    }))

    const { error } = await supabase.from('contacts').upsert(chunk, { onConflict: 'id' })
    if (error) {
      console.error(`[Contacts] Batch ${i} error:`, error.message)
    } else {
      importedContacts += chunk.length
    }
  }
  console.log(`[Contacts] Successfully synced ${importedContacts}/${contacts.length} contacts.`)

  // 4. Call Logs in batches of 100
  console.log(`[Import] Upserting ${call_logs.length} call logs...`)
  let importedLogs = 0
  for (let i = 0; i < call_logs.length; i += BATCH_SIZE) {
    const chunk = call_logs.slice(i, i + BATCH_SIZE).map(l => ({
      id: l.id,
      company_id: l.company_id,
      contact_id: l.contact_id || null,
      caller_id: l.caller_id || null,
      caller_name: l.caller_name || 'Admin',
      called_at: l.called_at || new Date().toISOString(),
      outcome: l.outcome || 'Attempted',
      remark: l.remark || null,
      next_action: l.next_action || null,
      follow_up_date: l.follow_up_date || null,
    }))

    const { error } = await supabase.from('call_logs').upsert(chunk, { onConflict: 'id' })
    if (error) {
      console.error(`[Call Logs] Batch ${i} error:`, error.message)
    } else {
      importedLogs += chunk.length
    }
  }
  console.log(`[Call Logs] Successfully synced ${importedLogs}/${call_logs.length} call logs.`)

  console.log('[Import] Finished data import to Supabase.')
}

runImport().catch(err => {
  console.error('[Import] Fatal error:', err)
  process.exit(1)
})
