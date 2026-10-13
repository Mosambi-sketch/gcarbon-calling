import express from 'express'
import { createClient } from '@supabase/supabase-js'
import cors from 'cors'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { syncSharePointData } from './sharepoint-sync.mjs'
import { updateExcelLead, deleteExcelLead } from './excel-sync.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const app = express()
const PORT = process.env.PORT || 3001
const MONGODB_URI = process.env.MONGODB_URI || ''

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'
app.use(cors({ origin: ALLOWED_ORIGIN }))

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null
app.use(express.json({ limit: '50mb' }))

// ── Authorized Company Roster ─────────────────────────────────────
const AUTHORIZED_COMPANY_EMPLOYEES = [
  { name: 'Aadarsh', email: 'aadarsh.gcarbon@gmail.com', altEmail: 'aadarsh@gcarbon.in', role: 'admin' },
  { name: 'Tamanna', email: 'tamanna.gcarbon@gmail.com', altEmail: 'tamanna@gcarbon.in', role: 'caller' },
  { name: 'Naresh', email: 'naresh.gcarbon@gmail.com', altEmail: 'naresh@gcarbon.in', role: 'caller' },
  { name: 'Himanshi', email: 'himanshi.gcarbon@gmail.com', altEmail: 'himanshi@gcarbon.in', role: 'caller' },
  { name: 'Kunal', email: 'kunal.gcarbon114@gmail.com', altEmail: 'kunal@gcarbon.in', role: 'caller' },
  { name: 'Ankesh', email: 'ankesh.gcarbon@gmail.com', altEmail: 'ankesh@gcarbon.in', role: 'caller' },
  { name: 'Pranita', email: 'pranita.gcarbon@gmail.com', altEmail: 'pranita@gcarbon.in', role: 'caller' },
  { name: 'Ajinkya', email: 'ajinkya.gcarbon@gmail.com', altEmail: 'ajinkya@gcarbon.in', role: 'caller' },
]

function findAuthorizedEmployee(email) {
  if (!email) return null
  const norm = email.toLowerCase().trim()
  if (!norm.endsWith('@gcarbon.in') && !norm.endsWith('@gmail.com')) {
    return null
  }
  return AUTHORIZED_COMPANY_EMPLOYEES.find(e => {
    const e1 = e.email.toLowerCase()
    const e2 = e.altEmail.toLowerCase()
    return norm === e1 || norm === e2 ||
      (norm.endsWith('@gcarbon.in') && norm.split('@')[0] === e.name.toLowerCase()) ||
      (norm.endsWith('@gcarbon.in') && norm.split('@')[0] === e1.split('@')[0])
  }) || null
}

// ── Authentication Middleware ─────────────────────────────────────
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  const userEmail = (req.headers['x-user-email'] || req.body?.user_email || '').toLowerCase().trim()

  // 1. Try JWT Bearer token if provided
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1]
    if (supabaseAdmin) {
      try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
        if (!error && user?.email) {
          const emailLower = user.email.toLowerCase().trim()
          let employee = null
          try {
            const { data } = await supabaseAdmin
              .from('allowed_employees')
              .select('*')
              .ilike('email', emailLower)
              .eq('active', true)
              .maybeSingle()
            employee = data
          } catch {}

          const rosterMatch = findAuthorizedEmployee(emailLower)
          if (!employee && !rosterMatch) {
            return res.status(403).json({ error: 'Access denied: Unauthorized account. Only company employees approved by Admin (Aadarsh) can access this system.' })
          }

          const isAdmin = emailLower.includes('admin') || emailLower.includes('aadarsh')
          const role = employee?.role || rosterMatch?.role || (isAdmin ? 'admin' : 'caller')
          const name = employee?.name || rosterMatch?.name || emailLower.split('@')[0]

          req.user = {
            id: user.id,
            email: emailLower,
            role,
            name,
            employee: employee || rosterMatch,
          }
          return next()
        }
      } catch (err) {
        console.warn('[JWT Auth Warn]:', err.message)
      }
    }
  }

  // 2. Fallback to authorized employee email header
  if (userEmail) {
    let employee = null
    if (supabaseAdmin) {
      try {
        const { data } = await supabaseAdmin
          .from('allowed_employees')
          .select('*')
          .ilike('email', userEmail)
          .eq('active', true)
          .maybeSingle()
        employee = data
      } catch (err) {
        console.warn('[Email Auth Warn]:', err.message)
      }
    }

    const rosterMatch = findAuthorizedEmployee(userEmail)
    if (employee || rosterMatch) {
      const match = employee || rosterMatch
      req.user = {
        id: `user-${match.name.toLowerCase()}`,
        email: match.email || userEmail,
        role: match.role || (userEmail.includes('aadarsh') ? 'admin' : 'caller'),
        name: match.name,
        employee: match,
      }
      return next()
    }

    return res.status(403).json({ error: 'Access denied: Unauthorized employee email. Contact Admin (Aadarsh) for access.' })
  }

  return res.status(401).json({ error: 'Unauthorized: Please sign in with an authorized Gcarbon employee account.' })
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' })
  }
  next()
}

// ── MongoDB State & Connection ───────────────────────────────────────────────
let mongoClient = null
let db = null
let isConnected = false
let connectionError = null

async function connectToMongo() {
  if (!MONGODB_URI) {
    console.warn('[MongoDB] No MONGODB_URI provided in environment. Running in offline/standby mode.')
    isConnected = false
    connectionError = 'MONGODB_URI is not set. Please provide your MongoDB connection string in .env.local.'
    return
  }

  try {
    console.log('[MongoDB] Connecting to MongoDB...')
    mongoClient = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    })
    await mongoClient.connect()
    db = mongoClient.db(process.env.MONGODB_DB_NAME || 'gcarbon_calling')
    isConnected = true
    connectionError = null
    console.log('[MongoDB] Connected successfully to database:', db.databaseName)

    await initializeDatabase()
  } catch (err) {
    isConnected = false
    connectionError = err.message
    console.error('[MongoDB] Connection error:', err.message)
  }
}

async function initializeDatabase() {
  if (!db) return
  try {
    // Indexes
    await db.collection('companies').createIndex({ list_id: 1 })
    await db.collection('companies').createIndex({ status: 1 })
    await db.collection('call_logs').createIndex({ company_id: 1 })
    await db.collection('call_logs').createIndex({ called_at: -1 })
    await db.collection('tasks').createIndex({ assignee_id: 1 })

    // Auto-seed if empty
    const count = await db.collection('companies').countDocuments()
    if (count === 0) {
      console.log('[MongoDB] Seeding 1,841 companies and workspace lists into MongoDB...')
      const crmJsonPath = path.resolve(__dirname, '../data/crm-calling.json')
      if (fs.existsSync(crmJsonPath)) {
        const raw = JSON.parse(fs.readFileSync(crmJsonPath, 'utf8'))
        if (raw.lists && raw.lists.length > 0) {
          await db.collection('workspaces').deleteMany({})
          await db.collection('workspaces').insertMany(raw.lists)
        }
        if (raw.companies && raw.companies.length > 0) {
          await db.collection('companies').insertMany(raw.companies)
        }
        if (raw.contacts && raw.contacts.length > 0) {
          await db.collection('contacts').insertMany(raw.contacts)
        }
        console.log(`[MongoDB] Initial seeding complete! Seeded ${raw.companies?.length || 0} companies.`)
      }
    }

    // Live on-time synchronization from SharePoint Excel
    setTimeout(() => {
      console.log('[MongoDB] Running live on-time sync from SharePoint...')
      syncSharePointData(db).catch(err => console.warn('[SharePoint Startup Sync Warning]:', err.message))
    }, 1500)

    // Automated continuous sync every 60 seconds (1 minute) to keep CRM permanently updated in real time
    setInterval(() => {
      syncSharePointData(db).catch(err => console.warn('[SharePoint Continuous Sync Warning]:', err.message))
    }, 60 * 1000)
  } catch (err) {
    console.warn('[MongoDB] Init/seed error:', err.message)
  }
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongodb: {
      connected: isConnected,
      uriConfigured: Boolean(MONGODB_URI),
    },
  })
})

// ── Auth Endpoints ───────────────────────────────────────────────────────────
app.get('/api/auth/users', requireAuth, async (req, res) => {
  const isAdmin = req.user?.role === 'admin'
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin.from('allowed_employees').select('email, name, role, color, avatar').eq('active', true)
    const sanitized = (data || []).map(u => {
      if (isAdmin || u.email?.toLowerCase() === req.user?.email?.toLowerCase()) {
        return u
      }
      return { name: u.name, role: u.role, color: u.color, avatar: u.avatar }
    })
    return res.json(sanitized)
  }
  const roster = AUTHORIZED_COMPANY_EMPLOYEES.map(u => {
    if (isAdmin || u.email.toLowerCase() === req.user?.email?.toLowerCase() || u.altEmail.toLowerCase() === req.user?.email?.toLowerCase()) {
      return { email: u.email, name: u.name, role: u.role, color: '#E8E8E8', avatar: '' }
    }
    return { name: u.name, role: u.role, color: '#E8E8E8', avatar: '' }
  })
  res.json(roster)
})

// ── Workspaces & Lists ───────────────────────────────────────────────────────
app.get('/api/workspaces', requireAuth, async (req, res) => {
  if (isConnected && db) {
    const list = await db.collection('workspaces').find({}).toArray()
    return res.json(list)
  }
  const crmJsonPath = path.resolve(__dirname, '../data/crm-calling.json')
  const raw = JSON.parse(fs.readFileSync(crmJsonPath, 'utf8'))
  res.json(raw.lists || [])
})

// ── Companies ────────────────────────────────────────────────────────────────
app.get('/api/companies', requireAuth, async (req, res) => {
  const { list_id } = req.query
  if (isConnected && db) {
    const filter = { archived: { $ne: true } }
    if (list_id && list_id !== 'all') filter.list_id = list_id
    const companies = await db.collection('companies').find(filter).toArray()
    return res.json(companies)
  }

  const crmJsonPath = path.resolve(__dirname, '../data/crm-calling.json')
  const raw = JSON.parse(fs.readFileSync(crmJsonPath, 'utf8'))
  let list = raw.companies || []
  if (list_id && list_id !== 'all') {
    list = list.filter(c => c.list_id === list_id)
  }
  res.json(list)
})

app.post('/api/companies', requireAuth, async (req, res) => {
  const company = req.body
  if (!company.id) company.id = crypto.randomUUID()
  company.created_at = company.created_at || new Date().toISOString()

  if (isConnected && db) {
    await db.collection('companies').updateOne(
      { id: company.id },
      { $set: company },
      { upsert: true }
    )
  }
  res.json(company)
})

app.patch('/api/companies/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const updates = req.body

  if (isConnected && db) {
    const existing = await db.collection('companies').findOne({ id })
    if (existing) {
      if (
        updates.expected_version !== undefined &&
        existing.version !== undefined &&
        Number(updates.expected_version) < Number(existing.version)
      ) {
        return res.status(409).json({
          error: 'Conflict: This company was modified by another employee. Please refresh and review before saving.',
          currentRecord: existing,
        })
      }
      const newVersion = (Number(existing.version) || 1) + 1
      const updatedFields = {
        ...updates,
        version: newVersion,
        updated_at: new Date().toISOString(),
      }
      delete updatedFields.expected_version
      await db.collection('companies').updateOne({ id }, { $set: updatedFields })
      void touchDataVersion()
      return res.json({ id, ...updatedFields })
    } else {
      const company = {
        id,
        ...updates,
        version: 1,
        updated_at: new Date().toISOString(),
      }
      delete company.expected_version
      await db.collection('companies').updateOne({ id }, { $set: company }, { upsert: true })
      void touchDataVersion()
      return res.json(company)
    }
  }
  res.json({ id, ...updates })
})

// ── Call Logs ────────────────────────────────────────────────────────────────
app.get('/api/call-logs', requireAuth, async (req, res) => {
  const { company_id } = req.query
  if (isConnected && db) {
    const filter = company_id ? { company_id } : {}
    const logs = await db.collection('call_logs').find(filter).sort({ called_at: -1 }).toArray()
    return res.json(logs)
  }
  res.json([])
})

app.post('/api/call-logs', requireAuth, async (req, res) => {
  const log = req.body
  if (!log.id) log.id = crypto.randomUUID()
  log.called_at = log.called_at || new Date().toISOString()

  if (isConnected && db) {
    // Idempotent upsert by id: prevent duplicate logs on rapid retries or double-clicks
    await db.collection('call_logs').updateOne(
      { id: log.id },
      { $set: log },
      { upsert: true }
    )
    // Update company status & owner
    if (log.company_id && log.outcome) {
      const statusMap = {
        'Not Called': 'Not Called',
        'Not Picked': 'Attempted',
        'Not Reachable / Out of Service': 'Attempted',
        'Invalid Number': 'Dead',
        'Wrong Person / Left Firm': 'Attempted',
        'Call Back Later': 'Follow-up Due',
        'Connected - Interested': 'Interested',
        'Meeting Scheduled': 'Meeting Scheduled',
        'Profile / Mail Sent': 'Follow-up Due',
        'Not Interested': 'Lost',
        'Already Handled Internally': 'Lost',
      }
      const newStatus = statusMap[log.outcome] || 'Attempted'
      await db.collection('companies').updateOne(
        { id: log.company_id },
        {
          $set: {
            status: newStatus,
            owner_name: log.caller_name,
            owner_id: log.caller_id,
            updated_at: new Date().toISOString(),
          },
          $inc: { version: 1 }
        }
      )
    }
    void touchDataVersion()
  }
  res.json(log)
})

// ── Tasks ────────────────────────────────────────────────────────────────────
app.get('/api/tasks', requireAuth, async (req, res) => {
  const { assignee_id } = req.query
  if (isConnected && db) {
    const filter = assignee_id ? { assignee_id } : {}
    const tasks = await db.collection('tasks').find(filter).sort({ created_at: -1 }).toArray()
    return res.json(tasks)
  }
  res.json([])
})

app.post('/api/tasks', requireAuth, async (req, res) => {
  const task = req.body
  if (!task.id) task.id = crypto.randomUUID()
  task.created_at = task.created_at || new Date().toISOString()

  if (isConnected && db) {
    await db.collection('tasks').updateOne(
      { id: task.id },
      { $set: task },
      { upsert: true }
    )
  }
  res.json(task)
})

app.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const updates = req.body

  if (isConnected && db) {
    await db.collection('tasks').updateOne(
      { id },
      { $set: updates }
    )
  }
  res.json({ id, ...updates })
})

app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  if (isConnected && db) {
    await db.collection('tasks').deleteOne({ id })
    void touchDataVersion()
  }
  res.json({ success: true, id })
})

// ── Notes ────────────────────────────────────────────────────────────────────
app.get('/api/notes', requireAuth, async (req, res) => {
  const { owner_id } = req.query
  if (isConnected && db) {
    const filter = owner_id ? { owner_id } : {}
    const notes = await db.collection('notes').find(filter).sort({ updated_at: -1 }).toArray()
    return res.json(notes)
  }
  res.json([])
})

app.post('/api/notes', requireAuth, async (req, res) => {
  const note = req.body
  if (!note.id) note.id = crypto.randomUUID()
  note.updated_at = new Date().toISOString()

  if (isConnected && db) {
    await db.collection('notes').updateOne(
      { id: note.id },
      { $set: note },
      { upsert: true }
    )
  }
  res.json(note)
})

app.delete('/api/notes/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  if (isConnected && db) {
    await db.collection('notes').deleteOne({ id })
    void touchDataVersion()
  }
  res.json({ success: true, id })
})

// ── Calendar Events ──────────────────────────────────────────────────────────
app.get('/api/events', requireAuth, async (req, res) => {
  const { owner_id } = req.query
  if (isConnected && db) {
    const filter = owner_id ? { owner_id } : {}
    const events = await db.collection('calendar_events').find(filter).toArray()
    return res.json(events)
  }
  res.json([])
})

app.post('/api/events', requireAuth, async (req, res) => {
  const event = req.body
  if (!event.id) event.id = crypto.randomUUID()

  if (isConnected && db) {
    await db.collection('calendar_events').updateOne(
      { id: event.id },
      { $set: event },
      { upsert: true }
    )
  }
  res.json(event)
})

app.delete('/api/events/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  if (isConnected && db) {
    await db.collection('calendar_events').deleteOne({ id })
  }
  res.json({ success: true, id })
})

// ── Contacts ─────────────────────────────────────────────────────────────────
app.get('/api/contacts', requireAuth, async (req, res) => {
  const { company_id } = req.query
  if (isConnected && db) {
    const filter = company_id ? { company_id } : {}
    const contacts = await db.collection('contacts').find(filter).toArray()
    return res.json(contacts)
  }
  res.json([])
})

app.post('/api/contacts', requireAuth, async (req, res) => {
  const contact = req.body
  if (!contact.id) contact.id = crypto.randomUUID()

  if (isConnected && db) {
    await db.collection('contacts').updateOne(
      { id: contact.id },
      { $set: contact },
      { upsert: true }
    )
  }
  res.json(contact)
})

app.delete('/api/contacts/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  if (isConnected && db) {
    await db.collection('contacts').deleteOne({ id })
  }
  res.json({ success: true, id })
})

// ── Workspaces Mutation ──────────────────────────────────────────────────────
app.post('/api/workspaces', requireAuth, async (req, res) => {
  const ws = req.body
  if (!ws.id) ws.id = crypto.randomUUID()
  ws.created_at = ws.created_at || new Date().toISOString()

  if (isConnected && db) {
    await db.collection('workspaces').updateOne(
      { id: ws.id },
      { $set: ws },
      { upsert: true }
    )
  }
  res.json(ws)
})

app.patch('/api/workspaces/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const updates = req.body

  if (isConnected && db) {
    await db.collection('workspaces').updateOne(
      { id },
      { $set: updates }
    )
  }
  res.json({ id, ...updates })
})

app.delete('/api/workspaces/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  if (isConnected && db) {
    await Promise.all([
      db.collection('workspaces').deleteOne({ id }),
      db.collection('companies').deleteMany({ list_id: id }),
    ])
  }
  res.json({ success: true, id })
})

// ── Bulk Company Operations ──────────────────────────────────────────────────
app.post('/api/companies/bulk', requireAuth, requireAdmin, async (req, res) => {
  const { ids, updates } = req.body
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' })
  }

  if (isConnected && db) {
    await db.collection('companies').updateMany(
      { id: { $in: ids } },
      { $set: { ...updates, updated_at: new Date().toISOString() } }
    )
  }
  res.json({ success: true, updatedCount: ids.length })
})

app.delete('/api/companies/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  if (isConnected && db) {
    await db.collection('companies').deleteOne({ id })
  }
  res.json({ success: true, id })
})

// ── Lead Locks ───────────────────────────────────────────────────────────────
app.get('/api/lead-locks/active', requireAuth, async (req, res) => {
  if (isConnected && db) {
    const nowIso = new Date().toISOString()
    const activeLocks = await db.collection('lead_locks').find({
      expires_at: { $gt: nowIso },
    }).toArray()

    const map = {}
    for (const lock of activeLocks) {
      map[lock.company_id] = lock
    }
    return res.json(map)
  }
  res.json({})
})

app.post('/api/lead-locks/acquire', requireAuth, async (req, res) => {
  const { company_id, user_id, user_name, user_color } = req.body
  if (!company_id || !user_id) {
    return res.status(400).json({ error: 'company_id and user_id are required' })
  }

  if (isConnected && db) {
    const now = new Date()
    const existing = await db.collection('lead_locks').findOne({
      company_id,
      expires_at: { $gt: now.toISOString() },
    })

    if (existing && existing.user_id !== user_id) {
      return res.json({
        success: false,
        locked_by: existing.user_name || 'Another caller',
        locked_by_color: existing.user_color || '#F59E0B',
      })
    }

    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString()
    await db.collection('lead_locks').updateOne(
      { company_id },
      {
        $set: {
          company_id,
          user_id,
          user_name,
          user_color: user_color || '#E8E8E8',
          locked_at: now.toISOString(),
          expires_at: expiresAt,
        },
      },
      { upsert: true }
    )
    return res.json({ success: true })
  }
  res.json({ success: true })
})

app.post('/api/lead-locks/release', requireAuth, async (req, res) => {
  const { company_id, user_id } = req.body
  if (isConnected && db && company_id) {
    await db.collection('lead_locks').deleteOne({
      company_id,
      ...(user_id ? { user_id } : {}),
    })
  }
  res.json({ success: true })
})

// ── Audit Logs ───────────────────────────────────────────────────────────────
app.get('/api/audit-logs', requireAuth, requireAdmin, async (req, res) => {
  const { entity_id } = req.query
  if (isConnected && db) {
    const filter = entity_id ? { entity_id } : {}
    const logs = await db.collection('audit_logs').find(filter).sort({ created_at: -1 }).limit(100).toArray()
    return res.json(logs)
  }
  res.json([])
})

app.post('/api/audit-logs', requireAuth, async (req, res) => {
  const entry = req.body
  if (!entry.id) entry.id = crypto.randomUUID()
  entry.created_at = entry.created_at || new Date().toISOString()

  if (isConnected && db) {
    await db.collection('audit_logs').insertOne(entry)
  }
  res.json(entry)
})

// ── Full Sync Data Endpoint ──────────────────────────────────────────────────
app.get('/api/sync', requireAuth, async (req, res) => {
  if (isConnected && db) {
    const [workspaces, companies, contacts, callLogs, tasks, notes, events] = await Promise.all([
      db.collection('workspaces').find({}).toArray(),
      db.collection('companies').find({ archived: { $ne: true } }).toArray(),
      db.collection('contacts').find({}).toArray(),
      db.collection('call_logs').find({}).sort({ called_at: -1 }).toArray(),
      db.collection('tasks').find({}).sort({ created_at: -1 }).toArray(),
      db.collection('notes').find({}).sort({ updated_at: -1 }).toArray(),
      db.collection('calendar_events').find({}).toArray(),
    ])
    return res.json({
      workspaces,
      companies,
      contacts,
      call_logs: callLogs,
      tasks,
      notes,
      calendar_events: events,
      stats: {
        totalCompanies: companies.length,
        totalCalls: callLogs.length,
        totalTasks: tasks.length,
      },
    })
  }
  res.json({ success: false, message: 'MongoDB not connected' })
})

let currentSyncVersion = Date.now()

async function touchDataVersion() {
  currentSyncVersion = Date.now()
  if (db) {
    try {
      await db.collection('sync_meta').updateOne(
        { id: 'global_version' },
        { $set: { version: currentSyncVersion, updated_at: new Date().toISOString() } },
        { upsert: true }
      )
    } catch {}
  }
}

app.get('/api/sync/version', requireAuth, async (req, res) => {
  if (db) {
    try {
      const meta = await db.collection('sync_meta').findOne({ id: 'global_version' })
      if (meta?.version && meta.version > currentSyncVersion) {
        currentSyncVersion = meta.version
      }
    } catch {}
  }
  res.json({ version: currentSyncVersion, timestamp: new Date().toISOString() })
})

// ── Live SharePoint Excel Sync ───────────────────────────────────────────────
app.post('/api/sync/sharepoint', requireAuth, requireAdmin, async (req, res) => {
  try {
    const customUrl = req.body?.url || req.query?.url
    const result = await syncSharePointData(db, customUrl)
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/sync/sharepoint', requireAuth, requireAdmin, async (req, res) => {
  try {
    const crmJsonPath = path.resolve(__dirname, '../data/crm-calling.json')
    let metadata = {}
    if (fs.existsSync(crmJsonPath)) {
      const raw = JSON.parse(fs.readFileSync(crmJsonPath, 'utf8'))
      metadata = {
        last_synced: raw.last_synced,
        totalCompanies: raw.companies?.length || 0,
        totalLists: raw.lists?.length || 0,
        source_url: raw.source_url,
      }
    }
    res.json({ success: true, ...metadata })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})


// ── Live On-Time Excel Synchronization ──────────────────────────────────────
app.post("/api/excel/delete-lead", requireAuth, async (req, res) => {
  try {
    const { listId, companyName } = req.body
    if (!companyName) {
      return res.status(400).json({ error: "companyName is required" })
    }
    const result = deleteExcelLead({ listId, companyName })

    if (isConnected && db) {
      try {
        const comp = await db.collection("companies").findOne({
          name: { $regex: new RegExp("^" + companyName.trim() + "$", "i") }
        })
        if (comp) {
          await Promise.all([
            db.collection("companies").deleteOne({ id: comp.id }),
            db.collection("contacts").deleteMany({ company_id: comp.id }),
            db.collection("call_logs").deleteMany({ company_id: comp.id })
          ])
        }
      } catch (dbErr) {
        console.warn("[MongoDB Delete Sync Warning]:", dbErr.message)
      }
    }

    res.json(result)
  } catch (err) {
    console.error("[Excel Delete Error]:", err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post("/api/excel/sync-lead", requireAuth, async (req, res) => {
  try {
    const { listId, companyName, updates } = req.body
    if (!companyName) {
      return res.status(400).json({ error: "companyName is required" })
    }
    const result = updateExcelLead({ listId, companyName, updates: updates || {} })

    if (isConnected && db && updates) {
      try {
        const comp = await db.collection("companies").findOne({
          name: { $regex: new RegExp("^" + companyName.trim() + "$", "i") }
        })
        if (comp) {
          const compUpdates = {}
          if (updates.callerName !== undefined) compUpdates.owner_name = updates.callerName || null
          if (updates.status !== undefined) compUpdates.status = updates.status
          if (updates.location !== undefined) compUpdates.location = updates.location
          if (updates.reference !== undefined) compUpdates.reference = Boolean(updates.reference)
          if (Object.keys(compUpdates).length > 0) {
            await db.collection("companies").updateOne({ id: comp.id }, { $set: compUpdates })
          }
          if (updates.contactName !== undefined || updates.designation !== undefined || updates.phone !== undefined || updates.email !== undefined) {
            const contactUpdates = {}
            if (updates.contactName !== undefined) contactUpdates.name = updates.contactName
            if (updates.designation !== undefined) contactUpdates.designation = updates.designation
            if (updates.phone !== undefined) contactUpdates.phones = updates.phone ? [updates.phone] : []
            if (updates.email !== undefined) contactUpdates.email = updates.email
            await db.collection("contacts").updateOne({ company_id: comp.id }, { $set: contactUpdates }, { upsert: true })
          }
        }
      } catch (dbErr) {
        console.warn("[MongoDB Sync Warning]:", dbErr.message)
      }
    }

    res.json(result)
  } catch (err) {
    console.error("[Excel Sync Error]:", err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/excel/download', requireAuth, (req, res) => {
  const excelFile = path.resolve(__dirname, '../data/CRM.xlsx')
  if (!fs.existsSync(excelFile)) {
    return res.status(404).json({ error: 'CRM.xlsx not found' })
  }
  res.download(excelFile, 'CRM_Live.xlsx')
})

app.get('/api/excel/status', requireAuth, (req, res) => {
  const excelFile = path.resolve(__dirname, '../data/CRM.xlsx')
  if (!fs.existsSync(excelFile)) {
    return res.json({ exists: false })
  }
  const stat = fs.statSync(excelFile)
  res.json({
    exists: true,
    lastModified: stat.mtime.toISOString(),
    sizeBytes: stat.size,
  })
})

// ── Secure File Storage ──────────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
])

app.post('/api/upload', requireAuth, requireAdmin, async (req, res) => {
  const { fileName, mimeType, base64Data, uploadedBy } = req.body
  if (!fileName || !base64Data) {
    return res.status(400).json({ error: 'fileName and base64Data are required' })
  }

  // Validate MIME type
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
    return res.status(400).json({ error: 'File type not permitted' })
  }

  try {
    const ext = path.extname(fileName).toLowerCase()
    const safeExt = ['.pdf', '.xlsx', '.xls', '.docx', '.doc', '.csv', '.txt', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)
      ? ext
      : '.bin'

    const id = crypto.randomUUID()
    const storedName = `${id}${safeExt}`
    const targetSubdir = safeExt.match(/\.(png|jpg|jpeg|webp)$/) ? 'images' : 'documents'
    const storageDir = path.resolve(__dirname, '../uploads', targetSubdir)
    const filePath = path.join(storageDir, storedName)

    const buffer = Buffer.from(base64Data.replace(/^data:[^;]+;base64,/, ''), 'base64')
    if (buffer.length > 25 * 1024 * 1024) {
      return res.status(400).json({ error: 'File exceeds 25MB limit' })
    }

    fs.writeFileSync(filePath, buffer)

    const metadata = {
      id,
      originalName: path.basename(fileName),
      storedName,
      mimeType: mimeType || 'application/octet-stream',
      size: buffer.length,
      storagePath: `uploads/${targetSubdir}/${storedName}`,
      uploadedBy: uploadedBy || req.user?.email || 'anonymous',
      createdAt: new Date().toISOString(),
    }

    if (isConnected && db) {
      await db.collection('documents').insertOne(metadata)
    }

    res.json({ success: true, document: metadata })
  } catch (err) {
    console.error('[Upload error]', err)
    res.status(500).json({ error: 'Upload failed' })
  }
})

app.get('/api/documents', requireAuth, async (req, res) => {
  if (isConnected && db) {
    const docs = await db.collection('documents').find({}).sort({ createdAt: -1 }).toArray()
    return res.json(docs)
  }
  res.json([])
})

// ── Connect & Start Server ───────────────────────────────────────────────────
connectToMongo().then(() => {
  app.listen(PORT, () => {
    console.log(`[Backend] Gcarbon CRM Server listening on port ${PORT}`)
  })
})
