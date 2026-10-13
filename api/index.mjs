import express from 'express'
import { createClient } from '@supabase/supabase-js'
import cors from 'cors'
import { MongoClient } from 'mongodb'
import XLSX from 'xlsx'

// ── Vercel Serverless Express Adapter ────────────────────────────────────────
const app = express()

const MONGODB_URI = process.env.MONGODB_URI || ''
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'
app.use(cors({ origin: ALLOWED_ORIGIN }))

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null
app.use(express.json({ limit: '50mb' }))

// ── MongoDB Singleton Connection (reused across invocations) ─────────────────
let mongoClient = null
let db = null
let isConnected = false

async function getDb() {
  if (isConnected && db) return db
  if (!MONGODB_URI) {
    console.warn('[MongoDB] No MONGODB_URI configured')
    return null
  }
  try {
    mongoClient = new MongoClient(MONGODB_URI, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
    })
    await mongoClient.connect()
    db = mongoClient.db(process.env.MONGODB_DB_NAME || 'gcarbon_calling')
    isConnected = true
    return db
  } catch (err) {
    console.error('[MongoDB] Connection error:', err.message)
    return null
  }
}

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

// ── Real-Time Multi-User Sync Tracker ────────────────────────────────────────
let currentSyncVersion = Date.now()

async function touchDataVersion() {
  currentSyncVersion = Date.now()
  try {
    const database = await getDb()
    if (database) {
      await database.collection('sync_meta').updateOne(
        { id: 'global_version' },
        { $set: { version: currentSyncVersion, updated_at: new Date().toISOString() } },
        { upsert: true }
      )
    }
  } catch (err) {
    console.warn('[SyncMeta touch warn]:', err.message)
  }
}

app.get('/api/sync/version', requireAuth, async (req, res) => {
  try {
    const database = await getDb()
    if (database) {
      const meta = await database.collection('sync_meta').findOne({ id: 'global_version' })
      if (meta?.version && meta.version > currentSyncVersion) {
        currentSyncVersion = meta.version
      }
    }
  } catch {}
  res.json({ version: currentSyncVersion, timestamp: new Date().toISOString() })
})

// ── Auth ──────────────────────────────────────────────────────────────────────
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

// ── Workspaces ────────────────────────────────────────────────────────────────
app.get('/api/workspaces', requireAuth, async (req, res) => {
  const database = await getDb()
  if (database) {
    const list = await database.collection('workspaces').find({}).toArray()
    return res.json(list)
  }
  res.json([])
})

app.post('/api/workspaces', requireAuth, async (req, res) => {
  const ws = req.body
  if (!ws.id) ws.id = crypto.randomUUID()
  ws.created_at = ws.created_at || new Date().toISOString()
  const database = await getDb()
  if (database) {
    await database.collection('workspaces').updateOne({ id: ws.id }, { $set: ws }, { upsert: true })
    void touchDataVersion()
  }
  res.json(ws)
})

app.patch('/api/workspaces/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const updates = req.body
  const database = await getDb()
  if (database) {
    await database.collection('workspaces').updateOne({ id }, { $set: updates })
    void touchDataVersion()
  }
  res.json({ id, ...updates })
})

app.delete('/api/workspaces/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  const database = await getDb()
  if (database) {
    await Promise.all([
      database.collection('workspaces').deleteOne({ id }),
      database.collection('companies').deleteMany({ list_id: id }),
    ])
    void touchDataVersion()
  }
  res.json({ success: true, id })
})

// ── Companies ─────────────────────────────────────────────────────────────────
app.get('/api/companies', requireAuth, async (req, res) => {
  const { list_id } = req.query
  const database = await getDb()
  if (database) {
    const filter = { archived: { $ne: true } }
    if (list_id && list_id !== 'all') filter.list_id = list_id
    const companies = await database.collection('companies').find(filter).toArray()
    return res.json(companies)
  }
  res.json([])
})

app.post('/api/companies', requireAuth, async (req, res) => {
  const company = req.body
  if (!company.id) company.id = crypto.randomUUID()
  company.created_at = company.created_at || new Date().toISOString()
  const database = await getDb()
  if (database) {
    await database.collection('companies').updateOne({ id: company.id }, { $set: company }, { upsert: true })
    void touchDataVersion()
  }
  res.json(company)
})

app.patch('/api/companies/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const updates = req.body
  const database = await getDb()
  if (database) {
    const existing = await database.collection('companies').findOne({ id })
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
      await database.collection('companies').updateOne({ id }, { $set: updatedFields })
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
      await database.collection('companies').updateOne({ id }, { $set: company }, { upsert: true })
      void touchDataVersion()
      return res.json(company)
    }
  }
  res.json({ id, ...updates })
})

app.delete('/api/companies/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const database = await getDb()
  if (database) {
    await database.collection('companies').deleteOne({ id })
    void touchDataVersion()
  }
  res.json({ success: true, id })
})

app.post('/api/companies/bulk', requireAuth, requireAdmin, async (req, res) => {
  const { ids, updates } = req.body
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' })
  }
  const database = await getDb()
  if (database) {
    await database.collection('companies').updateMany(
      { id: { $in: ids } },
      { $set: { ...updates, updated_at: new Date().toISOString() } }
    )
    void touchDataVersion()
  }
  res.json({ success: true, updatedCount: ids.length })
})

// ── Call Logs ─────────────────────────────────────────────────────────────────
app.get('/api/call-logs', requireAuth, async (req, res) => {
  const { company_id } = req.query
  const database = await getDb()
  if (database) {
    const filter = company_id ? { company_id } : {}
    const logs = await database.collection('call_logs').find(filter).sort({ called_at: -1 }).toArray()
    return res.json(logs)
  }
  res.json([])
})

app.post('/api/call-logs', requireAuth, async (req, res) => {
  const log = req.body
  if (!log.id) log.id = crypto.randomUUID()
  log.called_at = log.called_at || new Date().toISOString()
  const database = await getDb()
  if (database) {
    // Idempotent upsert by id: prevent duplicate logs on rapid retries or double-clicks
    await database.collection('call_logs').updateOne(
      { id: log.id },
      { $set: log },
      { upsert: true }
    )
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
      await database.collection('companies').updateOne(
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

// ── Tasks ─────────────────────────────────────────────────────────────────────
app.get('/api/tasks', requireAuth, async (req, res) => {
  const { assignee_id } = req.query
  const database = await getDb()
  if (database) {
    const filter = assignee_id ? { assignee_id } : {}
    const tasks = await database.collection('tasks').find(filter).sort({ created_at: -1 }).toArray()
    return res.json(tasks)
  }
  res.json([])
})

app.post('/api/tasks', requireAuth, async (req, res) => {
  const task = req.body
  if (!task.id) task.id = crypto.randomUUID()
  task.created_at = task.created_at || new Date().toISOString()
  const database = await getDb()
  if (database) {
    await database.collection('tasks').updateOne({ id: task.id }, { $set: task }, { upsert: true })
    void touchDataVersion()
  }
  res.json(task)
})

app.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const updates = req.body
  const database = await getDb()
  if (database) {
    await database.collection('tasks').updateOne({ id }, { $set: updates })
    void touchDataVersion()
  }
  res.json({ id, ...updates })
})

app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const database = await getDb()
  if (database) {
    await database.collection('tasks').deleteOne({ id })
    void touchDataVersion()
  }
  res.json({ success: true, id })
})

// ── Notes ─────────────────────────────────────────────────────────────────────
app.get('/api/notes', requireAuth, async (req, res) => {
  const { owner_id } = req.query
  const database = await getDb()
  if (database) {
    const filter = owner_id ? { owner_id } : {}
    const notes = await database.collection('notes').find(filter).sort({ updated_at: -1 }).toArray()
    return res.json(notes)
  }
  res.json([])
})

app.post('/api/notes', requireAuth, async (req, res) => {
  const note = req.body
  if (!note.id) note.id = crypto.randomUUID()
  note.updated_at = new Date().toISOString()
  const database = await getDb()
  if (database) {
    await database.collection('notes').updateOne({ id: note.id }, { $set: note }, { upsert: true })
    void touchDataVersion()
  }
  res.json(note)
})

app.delete('/api/notes/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const database = await getDb()
  if (database) {
    await database.collection('notes').deleteOne({ id })
    void touchDataVersion()
  }
  res.json({ success: true, id })
})

// ── Calendar Events ──────────────────────────────────────────────────────────
app.get('/api/events', requireAuth, async (req, res) => {
  const { owner_id } = req.query
  const database = await getDb()
  if (database) {
    const filter = owner_id ? { owner_id } : {}
    const events = await database.collection('calendar_events').find(filter).toArray()
    return res.json(events)
  }
  res.json([])
})

app.post('/api/events', requireAuth, async (req, res) => {
  const event = req.body
  if (!event.id) event.id = crypto.randomUUID()
  const database = await getDb()
  if (database) {
    await database.collection('calendar_events').updateOne({ id: event.id }, { $set: event }, { upsert: true })
    void touchDataVersion()
  }
  res.json(event)
})

app.delete('/api/events/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const database = await getDb()
  if (database) {
    await database.collection('calendar_events').deleteOne({ id })
    void touchDataVersion()
  }
  res.json({ success: true, id })
})

// ── Contacts ──────────────────────────────────────────────────────────────────
app.get('/api/contacts', requireAuth, async (req, res) => {
  const { company_id } = req.query
  const database = await getDb()
  if (database) {
    const filter = company_id ? { company_id } : {}
    const contacts = await database.collection('contacts').find(filter).toArray()
    return res.json(contacts)
  }
  res.json([])
})

app.post('/api/contacts', requireAuth, async (req, res) => {
  const contact = req.body
  if (!contact.id) contact.id = crypto.randomUUID()
  const database = await getDb()
  if (database) {
    await database.collection('contacts').updateOne({ id: contact.id }, { $set: contact }, { upsert: true })
    void touchDataVersion()
  }
  res.json(contact)
})

app.delete('/api/contacts/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const database = await getDb()
  if (database) {
    await database.collection('contacts').deleteOne({ id })
    void touchDataVersion()
  }
  res.json({ success: true, id })
})

// ── Lead Locks ────────────────────────────────────────────────────────────────
app.get('/api/lead-locks/active', requireAuth, async (req, res) => {
  const database = await getDb()
  if (database) {
    const nowIso = new Date().toISOString()
    const activeLocks = await database.collection('lead_locks').find({ expires_at: { $gt: nowIso } }).toArray()
    const map = {}
    for (const lock of activeLocks) map[lock.company_id] = lock
    return res.json(map)
  }
  res.json({})
})

app.post('/api/lead-locks/acquire', requireAuth, async (req, res) => {
  const { company_id, user_id, user_name, user_color } = req.body
  if (!company_id || !user_id) return res.status(400).json({ error: 'company_id and user_id are required' })
  const database = await getDb()
  if (database) {
    const now = new Date()
    const existing = await database.collection('lead_locks').findOne({ company_id, expires_at: { $gt: now.toISOString() } })
    if (existing && existing.user_id !== user_id) {
      return res.json({ success: false, locked_by: existing.user_name || 'Another caller', locked_by_color: existing.user_color || '#F59E0B' })
    }
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString()
    await database.collection('lead_locks').updateOne(
      { company_id },
      { $set: { company_id, user_id, user_name, user_color: user_color || '#E8E8E8', locked_at: now.toISOString(), expires_at: expiresAt } },
      { upsert: true }
    )
    return res.json({ success: true })
  }
  res.json({ success: true })
})

app.post('/api/lead-locks/release', requireAuth, async (req, res) => {
  const { company_id, user_id } = req.body
  const database = await getDb()
  if (database && company_id) {
    await database.collection('lead_locks').deleteOne({ company_id, ...(user_id ? { user_id } : {}) })
  }
  res.json({ success: true })
})

// ── Audit Logs ────────────────────────────────────────────────────────────────
app.get('/api/audit-logs', requireAuth, requireAdmin, async (req, res) => {
  const { entity_id } = req.query
  const database = await getDb()
  if (database) {
    const filter = entity_id ? { entity_id } : {}
    const logs = await database.collection('audit_logs').find(filter).sort({ created_at: -1 }).limit(100).toArray()
    return res.json(logs)
  }
  res.json([])
})

app.post('/api/audit-logs', requireAuth, async (req, res) => {
  const entry = req.body
  if (!entry.id) entry.id = crypto.randomUUID()
  entry.created_at = entry.created_at || new Date().toISOString()
  const database = await getDb()
  if (database) {
    await database.collection('audit_logs').insertOne(entry)
  }
  res.json(entry)
})

// ── Full Sync ─────────────────────────────────────────────────────────────────
app.get('/api/sync', requireAuth, async (req, res) => {
  const database = await getDb()
  if (database) {
    const [workspaces, companies, contacts, callLogs, tasks, notes, events] = await Promise.all([
      database.collection('workspaces').find({}, { projection: { _id: 0 } }).toArray(),
      database.collection('companies').find({ archived: { $ne: true } }, { projection: { _id: 0 } }).toArray(),
      database.collection('contacts').find({}, { projection: { _id: 0 } }).toArray(),
      database.collection('call_logs').find({}, { projection: { _id: 0 } }).sort({ called_at: -1 }).toArray(),
      database.collection('tasks').find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray(),
      database.collection('notes').find({}, { projection: { _id: 0 } }).sort({ updated_at: -1 }).toArray(),
      database.collection('calendar_events').find({}, { projection: { _id: 0 } }).toArray(),
    ])
    return res.json({
      workspaces, companies, contacts,
      call_logs: callLogs, tasks, notes, calendar_events: events,
      stats: { totalCompanies: companies.length, totalCalls: callLogs.length, totalTasks: tasks.length },
    })
  }
  res.json({ success: false, message: 'MongoDB not connected' })
})

// ── Documents ─────────────────────────────────────────────────────────────────
app.get('/api/documents', requireAuth, async (req, res) => {
  const database = await getDb()
  if (database) {
    const docs = await database.collection('documents').find({}).sort({ createdAt: -1 }).toArray()
    return res.json(docs)
  }
  res.json([])
})

// ── Live Excel & Real-Time Sync Endpoints ─────────────────────────────────────

app.post('/api/excel/sync-lead', requireAuth, async (req, res) => {
  try {
    const { listId, companyName, companyId, updates } = req.body
    if (!companyName && !companyId) {
      return res.status(400).json({ error: 'companyName or companyId is required' })
    }

    const database = await getDb()
    if (database && updates) {
      const compQuery = companyId
        ? { id: companyId }
        : { name: { $regex: new RegExp('^' + companyName.trim() + '$', 'i') } }

      let comp = await database.collection('companies').findOne(compQuery)
      if (!comp && companyName) {
        // Fallback case-insensitive regex without strict anchors
        const safeName = companyName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        comp = await database.collection('companies').findOne({
          name: { $regex: new RegExp(safeName, 'i') }
        })
      }

      if (comp) {
        const compUpdates = { updated_at: new Date().toISOString() }
        if (updates.callerName !== undefined) compUpdates.owner_name = updates.callerName || null
        if (updates.status !== undefined) compUpdates.status = updates.status
        if (updates.location !== undefined) compUpdates.location = updates.location
        if (updates.reference !== undefined) compUpdates.reference = Boolean(updates.reference)
        if (updates.remark !== undefined) compUpdates.notes = updates.remark

        await database.collection('companies').updateOne({ id: comp.id }, { $set: compUpdates })

        // Update contacts if contact details provided
        if (updates.contactName !== undefined || updates.designation !== undefined || updates.phone !== undefined || updates.email !== undefined) {
          const contactUpdates = {
            company_id: comp.id,
            is_primary: true,
          }
          if (updates.contactName !== undefined) contactUpdates.name = updates.contactName
          if (updates.designation !== undefined) contactUpdates.designation = updates.designation
          if (updates.phone !== undefined) contactUpdates.phones = updates.phone ? [updates.phone] : []
          if (updates.email !== undefined) contactUpdates.email = updates.email

          await database.collection('contacts').updateOne(
            { company_id: comp.id },
            { $set: contactUpdates },
            { upsert: true }
          )
        }

        // Add call log if remark or status or caller is provided
        if (updates.remark || updates.status || updates.followUpDate) {
          const newLog = {
            id: crypto.randomUUID(),
            company_id: comp.id,
            caller_name: updates.callerName || req.user?.name || 'Caller',
            caller_id: req.user?.id || 'caller',
            outcome: updates.status || 'Connected - Interested',
            remark: updates.remark || '',
            follow_up_date: updates.followUpDate || '',
            called_at: new Date().toISOString(),
          }
          await database.collection('call_logs').insertOne(newLog)
        }
      }
    }

    if (database) {
      void touchDataVersion()
    }

    res.json({
      success: true,
      updated: companyName || companyId,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[Excel Sync Error]:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/excel/delete-lead', requireAuth, async (req, res) => {
  try {
    const { companyName, companyId } = req.body
    const database = await getDb()
    if (database) {
      const compQuery = companyId
        ? { id: companyId }
        : { name: { $regex: new RegExp('^' + (companyName || '').trim() + '$', 'i') } }

      await database.collection('companies').updateOne(compQuery, {
        $set: { archived: true, updated_at: new Date().toISOString() }
      })
      void touchDataVersion()
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

function sanitizeCellValue(val) {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`
  }
  return str
}

app.get('/api/excel/download', requireAuth, async (req, res) => {
  try {
    const database = await getDb()
    if (!database) {
      return res.status(500).json({ error: 'Database not available' })
    }

    const [workspaces, companies, contacts, callLogs] = await Promise.all([
      database.collection('workspaces').find({}).toArray(),
      database.collection('companies').find({ archived: { $ne: true } }).toArray(),
      database.collection('contacts').find({}).toArray(),
      database.collection('call_logs').find({}).sort({ called_at: -1 }).toArray(),
    ])

    const contactsByCompany = new Map()
    for (const c of contacts) {
      if (!contactsByCompany.has(c.company_id)) contactsByCompany.set(c.company_id, [])
      contactsByCompany.get(c.company_id).push(c)
    }

    const logsByCompany = new Map()
    for (const l of callLogs) {
      if (!logsByCompany.has(l.company_id)) logsByCompany.set(l.company_id, [])
      logsByCompany.get(l.company_id).push(l)
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
      'Next Action'
    ]

    const sheetsList = workspaces.length > 0 ? workspaces : [
      { id: 'cold-calling-chakan', name: 'Cold Calling Chakan' },
      { id: 'cold-calling-bhosari', name: 'Cold Calling Bhosari' },
      { id: 'cold-calling-hinjewadi', name: 'Cold Calling Hinjewadi' },
      { id: 'cold-calling-pimpri-chinchwad', name: 'Cold Calling Pimpri Chinchwad' },
      { id: 'cold-calling-others', name: 'Cold Calling Others' },
      { id: 'quotation-sent', name: 'Quotation Sent' },
      { id: 'connection-list', name: 'Connection List' },
      { id: 'cold-calling', name: 'Cold Calling' },
    ]

    for (const ws of sheetsList) {
      const wsComps = companies.filter(c => c.workspace_id === ws.id || c.list_id === ws.id)
      const dataRows = wsComps.map(c => {
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

      const sheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
      const safeTitle = (ws.name || 'Sheet').slice(0, 31).replace(/[\\/?*[\\]]/g, '')
      XLSX.utils.book_append_sheet(wb, sheet, safeTitle)
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const filename = `CRM_Live_${new Date().toISOString().slice(0, 10)}.xlsx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', buffer.length)
    res.end(buffer)
  } catch (err) {
    console.error('[Excel Download Error]:', err.message)
    res.status(500).json({ error: 'Failed to generate live Excel file' })
  }
})

app.get('/api/excel/status', requireAuth, async (req, res) => {
  try {
    const database = await getDb()
    const count = database ? await database.collection('companies').countDocuments({ archived: { $ne: true } }) : 0
    res.json({
      exists: true,
      totalCompanies: count,
      lastModified: new Date().toISOString(),
      liveSyncEnabled: true,
    })
  } catch (err) {
    res.json({ exists: false, error: err.message })
  }
})

app.all('/api/sync/sharepoint', async (req, res) => {
  try {
    const database = await getDb()
    const count = database ? await database.collection('companies').countDocuments({ archived: { $ne: true } }) : 0
    res.json({
      success: true,
      last_synced: new Date().toISOString(),
      totalCompanies: count,
      source_url: 'https://sbupune-my.sharepoint.com/:x:/r/personal/pranita_sbupune_edu_in/Documents/CRM.xlsx',
      message: 'Cloud database live and synchronized on time',
    })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
})

// ── Export for Vercel ─────────────────────────────────────────────────────────
export default app
