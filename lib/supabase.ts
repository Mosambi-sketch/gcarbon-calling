// Supabase client for Gcarbon Calling CRM (Vite)
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

// Detect whether real credentials have been provided
export const isSupabaseReady =
  supabaseUrl.length > 0 &&
  !supabaseUrl.includes('placeholder') &&
  supabaseAnonKey.length > 0 &&
  !supabaseAnonKey.includes('placeholder')

// Create client regardless — operations will fail gracefully when not configured
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'gc_supabase_auth',
  },
})

// Database type helpers
export type Tables = {
  profiles: {
    id: string
    name: string
    email: string
    role: 'admin' | 'caller'
    color: string
    avatar: string | null
  }
  workspaces: {
    id: string
    name: string
    type: 'company' | 'freelancer'
    description: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    archived: boolean
    columns: string[]
  }
  workspace_columns: {
    id: string
    workspace_id: string
    name: string
    type: 'text' | 'number' | 'date' | 'select' | 'phone' | 'email' | 'url'
    position: number
    required: boolean
    options: string[] | Record<string, unknown>
    hidden: boolean
  }
  lists: {
    id: string
    name: string
    type: 'company' | 'freelancer'
    created_at: string
    columns: string[]
  }
  companies: {
    id: string
    name: string
    list_id: string
    workspace_id: string | null
    owner_id: string | null
    owner_name: string | null
    archived: boolean
    archived_at: string | null
    import_id: string | null
    source_data: Record<string, unknown>
    custom_fields: Record<string, string>
    sector: string | null
    industry: string | null
    location: string | null
    website: string | null
    notes: string | null
    reference: boolean
    status: string
    created_at: string
  }
  audit_logs: {
    id: string
    entity_type: string
    entity_id: string
    user_id: string
    user_name: string
    action: string
    field_name: string | null
    old_value: string | null
    new_value: string | null
    created_at: string
  }
  imports: {
    id: string
    workspace_id: string
    user_id: string
    user_name: string
    filename: string
    row_count: number
    status: 'completed' | 'rolled_back'
    column_mapping: Record<string, string>
    created_at: string
  }
  lead_locks: {
    id: string
    company_id: string
    user_id: string
    user_name: string
    user_color: string
    locked_at: string
    expires_at: string
  }
  contacts: {
    id: string
    company_id: string
    name: string
    designation: string | null
    phones: string[]
    email: string | null
    is_primary: boolean
  }
  call_logs: {
    id: string
    company_id: string
    contact_id: string | null
    caller_id: string
    caller_name: string
    called_at: string
    outcome: string
    remark: string | null
    next_action: string | null
    follow_up_date: string | null
  }
  tasks: {
    id: string
    title: string
    description: string | null
    assignee_id: string
    assignee_name: string
    company_id: string | null
    company_name: string | null
    due_at: string | null
    priority: string
    status: string
    created_by: string
    created_at: string
  }
  notes: {
    id: string
    owner_id: string
    title: string | null
    body: string
    pinned: boolean
    company_id: string | null
    company_name: string | null
    updated_at: string
  }
  calendar_events: {
    id: string
    title: string
    start_at: string
    end_at: string | null
    type: string
    company_id: string | null
    owner_id: string
    all_day: boolean
  }
}
