import express from 'express'
import { createClient } from '@supabase/supabase-js'
import cors from 'cors'
import { MongoClient } from 'mongodb'

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
          const { data: employee } = await supabaseAdmin
            .from('allowed_employees')
            .select('*')
            .ilike('email', user.email)
            .eq('active', true)
            .maybeSingle()

          if (employee) {
            req.user = {
              id: user.id,
              email: employee.email,
              role: employee.role,
              name: employee.name,
              employee,
            }
            return next()
          }
        }
      } catch (err) {
        console.warn('[JWT Auth Warn]:', err.message)
      }
    }
  }

  if (userEmail) {
    if (supabaseAdmin) {
      try {
        const { data: employee } = await supabaseAdmin
          .from('allowed_employees')
          .select('*')
          .ilike('email', userEmail)
          .eq('active', true)
          .maybeSingle()

        if (employee) {
          req.user = {
            id: `user-${employee.name.toLowerCase()}`,
            email: employee.email,
            role: employee.role,
            name: employee.name,
            employee,
          }
          return next()
        }
      } catch (err) {
        console.warn('[Email Auth Warn]:', err.message)
      }
    }

    const isDemo = userEmail.endsWith('@gcarbon.in') || userEmail.endsWith('@gmail.com')
    if (isDemo) {
      const prefix = userEmail.split('@')[0].replace('.gcarbon', '')
      const name = prefix.charAt(0).toUpperCase() + prefix.slice(1)
      const isAdmin = prefix.includes('admin') || prefix.includes('aadarsh') || prefix.includes('ajinkya')
      req.user = {
        id: `user-${prefix.toLowerCase()}`,
        email: userEmail,
        role: isAdmin ? 'admin' : 'caller',
        name,
      }
      return next()
    }
  }

  return res.status(401).json({ error: 'Unauthorized: Please sign in with an authorized Gcarbon employee account.' })
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' })
  }
  next()
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Auth ──────────────────────────────────────────────────────────────────────
app.get('/api/auth/users', requireAuth, async (req, res) => {
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin.from('allowed_employees').select('email, name, role, color, avatar').eq('active', true)
    return res.json(data || [])
  }
  res.json([])
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
  }
  res.json(ws)
})

app.patch('/api/workspaces/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const updates = req.body
  const database = await getDb()
  if (database) {
    await database.collection('workspaces').updateOne({ id }, { $set: updates })
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
  }
  res.json(company)
})

app.patch('/api/companies/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const updates = req.body
  const database = await getDb()
  if (database) {
    await database.collection('companies').updateOne({ id }, { $set: updates })
  }
  res.json({ id, ...updates })
})

app.delete('/api/companies/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const database = await getDb()
  if (database) {
    await database.collection('companies').deleteOne({ id })
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
    await database.collection('call_logs').insertOne(log)
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
        { $set: { status: newStatus, owner_name: log.caller_name, owner_id: log.caller_id, updated_at: new Date().toISOString() } }
      )
    }
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
  }
  res.json(task)
})

app.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const updates = req.body
  const database = await getDb()
  if (database) {
    await database.collection('tasks').updateOne({ id }, { $set: updates })
  }
  res.json({ id, ...updates })
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
  }
  res.json(note)
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
  }
  res.json(event)
})

app.delete('/api/events/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const database = await getDb()
  if (database) {
    await database.collection('calendar_events').deleteOne({ id })
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
  }
  res.json(contact)
})

app.delete('/api/contacts/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const database = await getDb()
  if (database) {
    await database.collection('contacts').deleteOne({ id })
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
      database.collection('workspaces').find({}).toArray(),
      database.collection('companies').find({ archived: { $ne: true } }).toArray(),
      database.collection('contacts').find({}).toArray(),
      database.collection('call_logs').find({}).sort({ called_at: -1 }).toArray(),
      database.collection('tasks').find({}).sort({ created_at: -1 }).toArray(),
      database.collection('notes').find({}).sort({ updated_at: -1 }).toArray(),
      database.collection('calendar_events').find({}).toArray(),
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

// ── Export for Vercel ─────────────────────────────────────────────────────────
export default app
