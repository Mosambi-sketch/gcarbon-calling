-- ============================================================
-- Gcarbon Calling CRM — Migration V2: Workspace Transformation
-- Run this AFTER schema.sql has been applied
-- ============================================================

-- ============================================================
-- 1. WORKSPACES (replaces lists)
-- ============================================================
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null default 'company' check (type in ('company', 'freelancer')),
  description text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived    boolean not null default false,
  columns     text[] not null default '{}'
);

alter table public.workspaces enable row level security;

create policy "workspaces_read" on public.workspaces
  for select using (auth.role() = 'authenticated');

create policy "workspaces_insert" on public.workspaces
  for insert with check (auth.role() = 'authenticated');

create policy "workspaces_update" on public.workspaces
  for update using (auth.role() = 'authenticated');

-- Only admins can delete workspaces
create policy "workspaces_delete" on public.workspaces
  for delete using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================================
-- 2. WORKSPACE COLUMNS (structured column definitions)
-- ============================================================
create table if not exists public.workspace_columns (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  type         text not null default 'text' check (type in ('text', 'number', 'date', 'select', 'phone', 'email', 'url')),
  position     integer not null default 0,
  required     boolean not null default false,
  options      jsonb not null default '[]'::jsonb,
  hidden       boolean not null default false
);

alter table public.workspace_columns enable row level security;

create policy "ws_cols_read" on public.workspace_columns
  for select using (auth.role() = 'authenticated');

create policy "ws_cols_insert" on public.workspace_columns
  for insert with check (auth.role() = 'authenticated');

create policy "ws_cols_update" on public.workspace_columns
  for update using (auth.role() = 'authenticated');

create policy "ws_cols_delete" on public.workspace_columns
  for delete using (auth.role() = 'authenticated');

-- ============================================================
-- 3. MODIFY COMPANIES — add workspace support
-- ============================================================

-- Add workspace_id (nullable initially for migration)
alter table public.companies
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

-- Add ownership and archival
alter table public.companies
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;

alter table public.companies
  add column if not exists owner_name text;

alter table public.companies
  add column if not exists archived boolean not null default false;

alter table public.companies
  add column if not exists archived_at timestamptz;

alter table public.companies
  add column if not exists import_id uuid;

-- ============================================================
-- 4. AUDIT LOGS
-- ============================================================
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id   uuid not null,
  user_id     uuid not null references public.profiles(id),
  user_name   text not null,
  action      text not null check (action in ('create', 'update', 'delete', 'archive', 'restore', 'assign', 'import')),
  field_name  text,
  old_value   text,
  new_value   text,
  created_at  timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

create policy "audit_read" on public.audit_logs
  for select using (auth.role() = 'authenticated');

create policy "audit_insert" on public.audit_logs
  for insert with check (auth.role() = 'authenticated');

-- ============================================================
-- 5. IMPORTS (for rollback tracking)
-- ============================================================
create table if not exists public.imports (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  user_id        uuid not null references public.profiles(id),
  user_name      text not null,
  filename       text not null,
  row_count      integer not null default 0,
  status         text not null default 'completed' check (status in ('completed', 'rolled_back')),
  column_mapping jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

alter table public.imports enable row level security;

create policy "imports_read" on public.imports
  for select using (auth.role() = 'authenticated');

create policy "imports_insert" on public.imports
  for insert with check (auth.role() = 'authenticated');

create policy "imports_update" on public.imports
  for update using (auth.role() = 'authenticated');

-- ============================================================
-- 6. LEAD LOCKS (temporary claim mechanism)
-- ============================================================
create table if not exists public.lead_locks (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null references public.profiles(id),
  user_name   text not null,
  user_color  text not null default '#E8E8E8',
  locked_at   timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '15 minutes'),
  constraint  lead_locks_company_unique unique (company_id)
);

alter table public.lead_locks enable row level security;

create policy "locks_read" on public.lead_locks
  for select using (auth.role() = 'authenticated');

create policy "locks_insert" on public.lead_locks
  for insert with check (auth.uid() = user_id);

create policy "locks_update" on public.lead_locks
  for update using (auth.uid() = user_id);

create policy "locks_delete" on public.lead_locks
  for delete using (auth.uid() = user_id);

-- Function to clean expired locks
create or replace function public.clean_expired_locks()
returns void language plpgsql security definer as $$
begin
  delete from public.lead_locks where expires_at < now();
end;
$$;

-- Function to acquire a lead lock (upsert with expiry check)
create or replace function public.acquire_lead_lock(
  p_company_id uuid,
  p_user_id uuid,
  p_user_name text,
  p_user_color text default '#E8E8E8'
)
returns jsonb language plpgsql security definer as $$
declare
  existing record;
  result jsonb;
begin
  -- Clean expired locks first
  delete from public.lead_locks where expires_at < now();

  -- Check if already locked by someone else
  select * into existing from public.lead_locks
  where company_id = p_company_id and user_id != p_user_id;

  if found then
    return jsonb_build_object(
      'success', false,
      'locked_by', existing.user_name,
      'locked_by_color', existing.user_color
    );
  end if;

  -- Upsert the lock
  insert into public.lead_locks (company_id, user_id, user_name, user_color, locked_at, expires_at)
  values (p_company_id, p_user_id, p_user_name, p_user_color, now(), now() + interval '15 minutes')
  on conflict (company_id) do update set
    user_id = p_user_id,
    user_name = p_user_name,
    user_color = p_user_color,
    locked_at = now(),
    expires_at = now() + interval '15 minutes';

  return jsonb_build_object('success', true);
end;
$$;

-- ============================================================
-- 7. FIX SECURITY: Prevent self-promotion via signup metadata
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, email, role, color, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'caller',  -- ALWAYS caller, never from metadata
    coalesce(new.raw_user_meta_data->>'color', '#E8E8E8'),
    new.raw_user_meta_data->>'avatar'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ============================================================
-- 8. MIGRATE EXISTING LISTS → WORKSPACES
-- ============================================================
-- Copy existing lists into workspaces table
insert into public.workspaces (id, name, type, created_at, columns)
select
  gen_random_uuid(),
  l.name,
  l.type,
  l.created_at,
  coalesce(l.columns, '{}')
from public.lists l
where not exists (
  select 1 from public.workspaces w where w.name = l.name
)
on conflict do nothing;

-- Update companies.workspace_id from lists → workspaces name mapping
update public.companies c
set workspace_id = w.id
from public.lists l
join public.workspaces w on w.name = l.name
where c.list_id = l.id
  and c.workspace_id is null;

-- ============================================================
-- 9. REALTIME: add new tables to publication
-- ============================================================
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['workspaces', 'workspace_columns', 'lead_locks', 'audit_logs', 'imports'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;

-- ============================================================
-- 10. INDEX for performance
-- ============================================================
create index if not exists idx_companies_workspace_id on public.companies(workspace_id);
create index if not exists idx_companies_owner_id on public.companies(owner_id);
create index if not exists idx_companies_archived on public.companies(archived);
create index if not exists idx_companies_status on public.companies(status);
create index if not exists idx_companies_import_id on public.companies(import_id);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);
create index if not exists idx_lead_locks_expires on public.lead_locks(expires_at);
create index if not exists idx_workspace_columns_ws on public.workspace_columns(workspace_id);
