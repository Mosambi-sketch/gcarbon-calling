-- ============================================================
-- Gcarbon Calling CRM — Supabase Schema
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null unique,
  role        text not null default 'caller' check (role in ('admin', 'caller')),
  color       text not null default '#E8E8E8',
  avatar      text
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Trigger: auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, email, role, color, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'caller'),
    coalesce(new.raw_user_meta_data->>'color', '#E8E8E8'),
    new.raw_user_meta_data->>'avatar'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  list_id     text not null default 'connection-list',
  sector      text,
  industry    text,
  location    text,
  source_data jsonb not null default '{}'::jsonb,
  custom_fields jsonb not null default '{}'::jsonb,
  website     text,
  notes       text,
  reference   boolean not null default false,
  status      text not null default 'Not Called',
  created_at  timestamptz not null default now()
);

-- ============================================================
-- CALLING LISTS
-- ============================================================
create table if not exists public.lists (
  id          text primary key,
  name        text not null,
  type        text not null default 'company' check (type in ('company', 'freelancer')),
  created_at  timestamptz not null default now(),
  columns     text[] not null default '{}'
);

alter table public.lists enable row level security;

drop policy if exists "lists_read" on public.lists;
create policy "lists_read" on public.lists
  for select using (auth.role() = 'authenticated');

drop policy if exists "lists_insert" on public.lists;
create policy "lists_insert" on public.lists
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "lists_update" on public.lists;
create policy "lists_update" on public.lists
  for update using (auth.role() = 'authenticated');

drop policy if exists "lists_delete" on public.lists;
create policy "lists_delete" on public.lists
  for delete using (auth.role() = 'authenticated');

alter table public.companies
  add column if not exists source_data jsonb not null default '{}'::jsonb,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

alter table public.companies enable row level security;

drop policy if exists "companies_read" on public.companies;
create policy "companies_read" on public.companies
  for select using (auth.role() = 'authenticated');

drop policy if exists "companies_insert" on public.companies;
create policy "companies_insert" on public.companies
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "companies_update" on public.companies;
create policy "companies_update" on public.companies
  for update using (auth.role() = 'authenticated');

drop policy if exists "companies_delete" on public.companies;
create policy "companies_delete" on public.companies
  for delete using (auth.role() = 'authenticated');

-- ============================================================
-- CONTACTS
-- ============================================================
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  designation text,
  phones      text[] not null default '{}',
  email       text,
  is_primary  boolean not null default false
);

alter table public.contacts enable row level security;

drop policy if exists "contacts_read" on public.contacts;
create policy "contacts_read" on public.contacts
  for select using (auth.role() = 'authenticated');

drop policy if exists "contacts_insert" on public.contacts;
create policy "contacts_insert" on public.contacts
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "contacts_update" on public.contacts;
create policy "contacts_update" on public.contacts
  for update using (auth.role() = 'authenticated');

drop policy if exists "contacts_delete" on public.contacts;
create policy "contacts_delete" on public.contacts
  for delete using (auth.role() = 'authenticated');

-- ============================================================
-- CALL LOGS
-- ============================================================
create table if not exists public.call_logs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  contact_id      uuid references public.contacts(id) on delete set null,
  caller_id       uuid not null references public.profiles(id),
  caller_name     text not null,
  called_at       timestamptz not null default now(),
  outcome         text not null,
  remark          text,
  next_action     text,
  follow_up_date  date
);

alter table public.call_logs enable row level security;

drop policy if exists "call_logs_read" on public.call_logs;
create policy "call_logs_read" on public.call_logs
  for select using (auth.role() = 'authenticated');

drop policy if exists "call_logs_insert" on public.call_logs;
create policy "call_logs_insert" on public.call_logs
  for insert with check (auth.uid() = caller_id);

drop policy if exists "call_logs_delete" on public.call_logs;
create policy "call_logs_delete" on public.call_logs
  for delete using (auth.uid() = caller_id);

-- ============================================================
-- TASKS
-- ============================================================
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  assignee_id     uuid not null references public.profiles(id),
  assignee_name   text not null,
  company_id      uuid references public.companies(id) on delete set null,
  company_name    text,
  due_at          timestamptz,
  priority        text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status          text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now()
);

alter table public.tasks enable row level security;

drop policy if exists "tasks_read" on public.tasks;
create policy "tasks_read" on public.tasks
  for select using (auth.role() = 'authenticated');

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (auth.uid() = created_by);

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update using (auth.uid() = assignee_id or auth.uid() = created_by);

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete using (auth.uid() = created_by);

-- ============================================================
-- NOTES
-- ============================================================
create table if not exists public.notes (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id),
  title        text,
  body         text not null default '',
  pinned       boolean not null default false,
  company_id   uuid references public.companies(id) on delete set null,
  company_name text,
  updated_at   timestamptz not null default now()
);

alter table public.notes enable row level security;

drop policy if exists "notes_read" on public.notes;
create policy "notes_read" on public.notes
  for select using (auth.uid() = owner_id);

drop policy if exists "notes_insert" on public.notes;
create policy "notes_insert" on public.notes
  for insert with check (auth.uid() = owner_id);

drop policy if exists "notes_update" on public.notes;
create policy "notes_update" on public.notes
  for update using (auth.uid() = owner_id);

drop policy if exists "notes_delete" on public.notes;
create policy "notes_delete" on public.notes
  for delete using (auth.uid() = owner_id);

-- ============================================================
-- CALENDAR EVENTS
-- ============================================================
create table if not exists public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  start_at    timestamptz not null,
  end_at      timestamptz,
  type        text not null default 'other' check (type in ('meeting', 'follow-up', 'other')),
  company_id  uuid references public.companies(id) on delete set null,
  owner_id    uuid not null references public.profiles(id),
  all_day     boolean not null default false
);

alter table public.calendar_events enable row level security;

drop policy if exists "events_read" on public.calendar_events;
create policy "events_read" on public.calendar_events
  for select using (auth.role() = 'authenticated');

drop policy if exists "events_insert" on public.calendar_events;
create policy "events_insert" on public.calendar_events
  for insert with check (auth.uid() = owner_id);

drop policy if exists "events_update" on public.calendar_events;
create policy "events_update" on public.calendar_events
  for update using (auth.uid() = owner_id);

drop policy if exists "events_delete" on public.calendar_events;
create policy "events_delete" on public.calendar_events
  for delete using (auth.uid() = owner_id);

-- ============================================================
-- REALTIME
-- ============================================================
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['lists', 'companies', 'contacts', 'call_logs', 'tasks', 'notes', 'calendar_events'] loop
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
-- TEAM SETUP — update profiles after creating users in Auth
-- ============================================================
-- update public.profiles set name='Ajinkya', role='admin', color='#D9F56B', avatar='/avatars/ajinkya-face.png' where email='ajinkya@gcarbon.in';
-- update public.profiles set name='Himanshi', role='caller', color='#F9E1D2', avatar='/avatars/himanshi-face.jpg' where email='himanshi@gcarbon.in';
-- update public.profiles set name='Tamanna', role='caller', color='#E8894F', avatar='/avatars/tamanna-face.jpg' where email='tamanna@gcarbon.in';
-- update public.profiles set name='Ankesh', role='caller', color='#93C5FD', avatar='/avatars/ankesh-face.jpg' where email='ankesh@gcarbon.in';
-- update public.profiles set name='Aadarsh', role='admin', color='#A7F3D0', avatar='/avatars/aadarsh-face.jpg' where email='aadarsh@gcarbon.in';
-- update public.profiles set name='Naresh', role='caller', color='#FDE047', avatar='/avatars/naresh-face.jpg' where email='naresh@gcarbon.in';
-- update public.profiles set name='Pranita', role='caller', color='#F472B6', avatar='/avatars/pranita-face.jpg' where email='pranita@gcarbon.in';
-- update public.profiles set name='Kunal', role='caller', color='#C4B5FD', avatar='/avatars/kunal-face.jpg' where email='kunal@gcarbon.in';
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

drop policy if exists "workspaces_read" on public.workspaces;
create policy "workspaces_read" on public.workspaces
  for select using (auth.role() = 'authenticated');

drop policy if exists "workspaces_insert" on public.workspaces;
create policy "workspaces_insert" on public.workspaces
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "workspaces_update" on public.workspaces;
create policy "workspaces_update" on public.workspaces
  for update using (auth.role() = 'authenticated');

-- Only admins can delete workspaces
drop policy if exists "workspaces_delete" on public.workspaces;
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

drop policy if exists "ws_cols_read" on public.workspace_columns;
create policy "ws_cols_read" on public.workspace_columns
  for select using (auth.role() = 'authenticated');

drop policy if exists "ws_cols_insert" on public.workspace_columns;
create policy "ws_cols_insert" on public.workspace_columns
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "ws_cols_update" on public.workspace_columns;
create policy "ws_cols_update" on public.workspace_columns
  for update using (auth.role() = 'authenticated');

drop policy if exists "ws_cols_delete" on public.workspace_columns;
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

drop policy if exists "audit_read" on public.audit_logs;
create policy "audit_read" on public.audit_logs
  for select using (auth.role() = 'authenticated');

drop policy if exists "audit_insert" on public.audit_logs;
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

drop policy if exists "imports_read" on public.imports;
create policy "imports_read" on public.imports
  for select using (auth.role() = 'authenticated');

drop policy if exists "imports_insert" on public.imports;
create policy "imports_insert" on public.imports
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "imports_update" on public.imports;
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

drop policy if exists "locks_read" on public.lead_locks;
create policy "locks_read" on public.lead_locks
  for select using (auth.role() = 'authenticated');

drop policy if exists "locks_insert" on public.lead_locks;
create policy "locks_insert" on public.lead_locks
  for insert with check (auth.uid() = user_id);

drop policy if exists "locks_update" on public.lead_locks;
create policy "locks_update" on public.lead_locks
  for update using (auth.uid() = user_id);

drop policy if exists "locks_delete" on public.lead_locks;
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
-- ============================================================
-- Gcarbon Calling CRM — Migration V3: Production Hardening
-- Run this AFTER schema.sql and migration_v2.sql have been applied
-- ============================================================

-- 1. ALLOWED EMPLOYEES TABLE (Single source of employee identity & roles)
create table if not exists public.allowed_employees (
  email       text primary key,
  name        text not null,
  role        text not null check (role in ('admin', 'caller')),
  color       text not null default '#E8E8E8',
  avatar      text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Seed initial team members (Aadarsh = admin, all others = caller)
insert into public.allowed_employees (email, name, role, color, avatar, active)
values
  ('aadarsh.gcarbon@gmail.com', 'Aadarsh', 'admin', '#A7F3D0', '/avatars/aadarsh-face.jpg', true),
  ('tamanna.gcarbon@gmail.com', 'Tamanna', 'caller', '#E8894F', '/avatars/tamanna-face.jpg', true),
  ('naresh.gcarbon@gmail.com', 'Naresh', 'caller', '#FDE047', '/avatars/naresh-face.jpg', true),
  ('pranita.gcarbon@gmail.com', 'Pranita', 'caller', '#F472B6', '/avatars/pranita-face.jpg', true),
  ('himanshi.gcarbon@gmail.com', 'Himanshi', 'caller', '#F9E1D2', '/avatars/himanshi-face.jpg', true),
  ('ankesh.gcarbon@gmail.com', 'Ankesh', 'caller', '#93C5FD', '/avatars/ankesh-face.jpg', true),
  ('kunal.gcarbon114@gmail.com', 'Kunal', 'caller', '#C4B5FD', '/avatars/kunal-face.jpg', true),
  ('ajnikya.gcarbon@gmail.com', 'Ajinkya', 'caller', '#D9F56B', '/avatars/ajinkya-face.png', true)
on conflict (email) do update set
  name = excluded.name,
  role = excluded.role,
  color = excluded.color,
  avatar = excluded.avatar,
  active = excluded.active;

-- 2. SECURITY DEFINER HELPERS
create or replace function public.is_employee()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.allowed_employees ae
    where lower(ae.email) = lower(auth.jwt()->>'email')
      and ae.active = true
  );
$$;

create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.allowed_employees ae
    where lower(ae.email) = lower(auth.jwt()->>'email')
      and ae.role = 'admin'
      and ae.active = true
  );
$$;

-- 3. BEFORE INSERT TRIGGER ON auth.users (Reject non-allowed signups)
create or replace function public.check_allowed_employee_before_signup()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_allowed boolean;
begin
  select exists (
    select 1 from public.allowed_employees
    where lower(email) = lower(new.email) and active = true
  ) into is_allowed;

  if not is_allowed then
    raise exception 'Registration rejected: % is not an active authorized Gcarbon employee.', new.email;
  end if;

  return new;
end;
$$;

drop trigger if exists tr_check_allowed_employee on auth.users;
drop trigger if exists tr_check_allowed_employee on auth.users;
create trigger tr_check_allowed_employee
  before insert on auth.users
  for each row execute function public.check_allowed_employee_before_signup();

-- 4. UPDATE handle_new_user() (Derive profile only from allowed_employees, prevent self-escalation)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  emp record;
begin
  select * from public.allowed_employees
  where lower(email) = lower(new.email) and active = true
  into emp;

  if emp.email is null then
    raise exception 'Unauthorized profile creation for %', new.email;
  end if;

  insert into public.profiles (id, name, email, role, color, avatar)
  values (
    new.id,
    emp.name,
    emp.email,
    emp.role,
    emp.color,
    emp.avatar
  )
  on conflict (id) do update set
    name = excluded.name,
    email = excluded.email,
    role = excluded.role,
    color = excluded.color,
    avatar = excluded.avatar;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. PROFILE ROLE PROTECTION TRIGGER (Users cannot alter their own role)
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Unauthorized: Only administrators can modify employee roles.';
  end if;
  return new;
end;
$$;

drop trigger if exists tr_protect_profile_role on public.profiles;
drop trigger if exists tr_protect_profile_role on public.profiles;
create trigger tr_protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- 6. MAKE IMPORT-FRIENDLY COLUMN CONSTRAINTS
alter table public.call_logs alter column caller_id drop not null;
alter table public.tasks alter column created_by drop not null;
alter table public.tasks alter column assignee_id drop not null;

-- 7. REVISE ROW LEVEL SECURITY POLICIES

-- allowed_employees
alter table public.allowed_employees enable row level security;
drop policy if exists "allowed_employees_read" on public.allowed_employees;
drop policy if exists "allowed_employees_read" on public.allowed_employees;
create policy "allowed_employees_read" on public.allowed_employees
  for select using (public.is_employee());

drop policy if exists "allowed_employees_admin_write" on public.allowed_employees;
drop policy if exists "allowed_employees_admin_write" on public.allowed_employees;
create policy "allowed_employees_admin_write" on public.allowed_employees
  for all using (public.is_admin());

-- profiles
drop policy if exists "profiles_read" on public.profiles;
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select using (public.is_employee());

drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id and public.is_employee());

-- workspaces
drop policy if exists "workspaces_read" on public.workspaces;
drop policy if exists "workspaces_read" on public.workspaces;
create policy "workspaces_read" on public.workspaces
  for select using (public.is_employee());

drop policy if exists "workspaces_insert" on public.workspaces;
drop policy if exists "workspaces_insert" on public.workspaces;
create policy "workspaces_insert" on public.workspaces
  for insert with check (public.is_employee());

drop policy if exists "workspaces_update" on public.workspaces;
drop policy if exists "workspaces_update" on public.workspaces;
create policy "workspaces_update" on public.workspaces
  for update using (public.is_employee());

drop policy if exists "workspaces_delete" on public.workspaces;
drop policy if exists "workspaces_delete" on public.workspaces;
create policy "workspaces_delete" on public.workspaces
  for delete using (public.is_admin());

-- workspace_columns
drop policy if exists "ws_cols_read" on public.workspace_columns;
drop policy if exists "ws_cols_read" on public.workspace_columns;
create policy "ws_cols_read" on public.workspace_columns
  for select using (public.is_employee());

drop policy if exists "ws_cols_insert" on public.workspace_columns;
drop policy if exists "ws_cols_insert" on public.workspace_columns;
create policy "ws_cols_insert" on public.workspace_columns
  for insert with check (public.is_employee());

drop policy if exists "ws_cols_update" on public.workspace_columns;
drop policy if exists "ws_cols_update" on public.workspace_columns;
create policy "ws_cols_update" on public.workspace_columns
  for update using (public.is_employee());

drop policy if exists "ws_cols_delete" on public.workspace_columns;
drop policy if exists "ws_cols_delete" on public.workspace_columns;
create policy "ws_cols_delete" on public.workspace_columns
  for delete using (public.is_admin());

-- lists
drop policy if exists "lists_read" on public.lists;
drop policy if exists "lists_read" on public.lists;
create policy "lists_read" on public.lists
  for select using (public.is_employee());

drop policy if exists "lists_insert" on public.lists;
drop policy if exists "lists_insert" on public.lists;
create policy "lists_insert" on public.lists
  for insert with check (public.is_employee());

drop policy if exists "lists_update" on public.lists;
drop policy if exists "lists_update" on public.lists;
create policy "lists_update" on public.lists
  for update using (public.is_employee());

drop policy if exists "lists_delete" on public.lists;
drop policy if exists "lists_delete" on public.lists;
create policy "lists_delete" on public.lists
  for delete using (public.is_admin());

-- companies
drop policy if exists "companies_read" on public.companies;
drop policy if exists "companies_read" on public.companies;
create policy "companies_read" on public.companies
  for select using (public.is_employee());

drop policy if exists "companies_insert" on public.companies;
drop policy if exists "companies_insert" on public.companies;
create policy "companies_insert" on public.companies
  for insert with check (public.is_employee());

drop policy if exists "companies_update" on public.companies;
drop policy if exists "companies_update" on public.companies;
create policy "companies_update" on public.companies
  for update using (public.is_employee());

drop policy if exists "companies_delete" on public.companies;
drop policy if exists "companies_delete" on public.companies;
create policy "companies_delete" on public.companies
  for delete using (public.is_admin());

-- contacts
drop policy if exists "contacts_read" on public.contacts;
drop policy if exists "contacts_read" on public.contacts;
create policy "contacts_read" on public.contacts
  for select using (public.is_employee());

drop policy if exists "contacts_insert" on public.contacts;
drop policy if exists "contacts_insert" on public.contacts;
create policy "contacts_insert" on public.contacts
  for insert with check (public.is_employee());

drop policy if exists "contacts_update" on public.contacts;
drop policy if exists "contacts_update" on public.contacts;
create policy "contacts_update" on public.contacts
  for update using (public.is_employee());

drop policy if exists "contacts_delete" on public.contacts;
drop policy if exists "contacts_delete" on public.contacts;
create policy "contacts_delete" on public.contacts
  for delete using (public.is_employee());

-- call_logs
drop policy if exists "call_logs_read" on public.call_logs;
drop policy if exists "call_logs_read" on public.call_logs;
create policy "call_logs_read" on public.call_logs
  for select using (public.is_employee());

drop policy if exists "call_logs_insert" on public.call_logs;
drop policy if exists "call_logs_insert" on public.call_logs;
create policy "call_logs_insert" on public.call_logs
  for insert with check (public.is_employee());

drop policy if exists "call_logs_delete" on public.call_logs;
drop policy if exists "call_logs_delete" on public.call_logs;
create policy "call_logs_delete" on public.call_logs
  for delete using (public.is_employee());

-- tasks
drop policy if exists "tasks_read" on public.tasks;
drop policy if exists "tasks_read" on public.tasks;
create policy "tasks_read" on public.tasks
  for select using (public.is_employee());

drop policy if exists "tasks_insert" on public.tasks;
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (public.is_employee());

drop policy if exists "tasks_update" on public.tasks;
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update using (public.is_employee());

drop policy if exists "tasks_delete" on public.tasks;
drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete using (public.is_employee());

-- notes
drop policy if exists "notes_read" on public.notes;
drop policy if exists "notes_read" on public.notes;
create policy "notes_read" on public.notes
  for select using (public.is_employee());

drop policy if exists "notes_insert" on public.notes;
drop policy if exists "notes_insert" on public.notes;
create policy "notes_insert" on public.notes
  for insert with check (public.is_employee());

drop policy if exists "notes_update" on public.notes;
drop policy if exists "notes_update" on public.notes;
create policy "notes_update" on public.notes
  for update using (public.is_employee());

drop policy if exists "notes_delete" on public.notes;
drop policy if exists "notes_delete" on public.notes;
create policy "notes_delete" on public.notes
  for delete using (public.is_employee());

-- calendar_events
drop policy if exists "events_read" on public.calendar_events;
drop policy if exists "events_read" on public.calendar_events;
create policy "events_read" on public.calendar_events
  for select using (public.is_employee());

drop policy if exists "events_insert" on public.calendar_events;
drop policy if exists "events_insert" on public.calendar_events;
create policy "events_insert" on public.calendar_events
  for insert with check (public.is_employee());

drop policy if exists "events_update" on public.calendar_events;
drop policy if exists "events_update" on public.calendar_events;
create policy "events_update" on public.calendar_events
  for update using (public.is_employee());

drop policy if exists "events_delete" on public.calendar_events;
drop policy if exists "events_delete" on public.calendar_events;
create policy "events_delete" on public.calendar_events
  for delete using (public.is_employee());

-- imports (Rollback update is admin only)
drop policy if exists "imports_read" on public.imports;
drop policy if exists "imports_read" on public.imports;
create policy "imports_read" on public.imports
  for select using (public.is_employee());

drop policy if exists "imports_insert" on public.imports;
drop policy if exists "imports_insert" on public.imports;
create policy "imports_insert" on public.imports
  for insert with check (public.is_employee());

drop policy if exists "imports_update" on public.imports;
drop policy if exists "imports_update" on public.imports;
create policy "imports_update" on public.imports
  for update using (public.is_admin());

-- audit_logs (Only admin reads audit logs)
drop policy if exists "audit_read" on public.audit_logs;
drop policy if exists "audit_read" on public.audit_logs;
create policy "audit_read" on public.audit_logs
  for select using (public.is_admin());

drop policy if exists "audit_insert" on public.audit_logs;
drop policy if exists "audit_insert" on public.audit_logs;
create policy "audit_insert" on public.audit_logs
  for insert with check (public.is_employee());

-- lead_locks
drop policy if exists "locks_read" on public.lead_locks;
drop policy if exists "locks_read" on public.lead_locks;
create policy "locks_read" on public.lead_locks
  for select using (public.is_employee());

drop policy if exists "locks_insert" on public.lead_locks;
drop policy if exists "locks_insert" on public.lead_locks;
create policy "locks_insert" on public.lead_locks
  for insert with check (public.is_employee());

drop policy if exists "locks_update" on public.lead_locks;
drop policy if exists "locks_update" on public.lead_locks;
create policy "locks_update" on public.lead_locks
  for update using (public.is_employee());

drop policy if exists "locks_delete" on public.lead_locks;
drop policy if exists "locks_delete" on public.lead_locks;
create policy "locks_delete" on public.lead_locks
  for delete using (public.is_employee());
