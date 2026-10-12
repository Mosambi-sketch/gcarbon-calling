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
create policy "allowed_employees_read" on public.allowed_employees
  for select using (public.is_employee());

drop policy if exists "allowed_employees_admin_write" on public.allowed_employees;
create policy "allowed_employees_admin_write" on public.allowed_employees
  for all using (public.is_admin());

-- profiles
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select using (public.is_employee());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id and public.is_employee());

-- workspaces
drop policy if exists "workspaces_read" on public.workspaces;
create policy "workspaces_read" on public.workspaces
  for select using (public.is_employee());

drop policy if exists "workspaces_insert" on public.workspaces;
create policy "workspaces_insert" on public.workspaces
  for insert with check (public.is_employee());

drop policy if exists "workspaces_update" on public.workspaces;
create policy "workspaces_update" on public.workspaces
  for update using (public.is_employee());

drop policy if exists "workspaces_delete" on public.workspaces;
create policy "workspaces_delete" on public.workspaces
  for delete using (public.is_admin());

-- workspace_columns
drop policy if exists "ws_cols_read" on public.workspace_columns;
create policy "ws_cols_read" on public.workspace_columns
  for select using (public.is_employee());

drop policy if exists "ws_cols_insert" on public.workspace_columns;
create policy "ws_cols_insert" on public.workspace_columns
  for insert with check (public.is_employee());

drop policy if exists "ws_cols_update" on public.workspace_columns;
create policy "ws_cols_update" on public.workspace_columns
  for update using (public.is_employee());

drop policy if exists "ws_cols_delete" on public.workspace_columns;
create policy "ws_cols_delete" on public.workspace_columns
  for delete using (public.is_admin());

-- lists
drop policy if exists "lists_read" on public.lists;
create policy "lists_read" on public.lists
  for select using (public.is_employee());

drop policy if exists "lists_insert" on public.lists;
create policy "lists_insert" on public.lists
  for insert with check (public.is_employee());

drop policy if exists "lists_update" on public.lists;
create policy "lists_update" on public.lists
  for update using (public.is_employee());

drop policy if exists "lists_delete" on public.lists;
create policy "lists_delete" on public.lists
  for delete using (public.is_admin());

-- companies
drop policy if exists "companies_read" on public.companies;
create policy "companies_read" on public.companies
  for select using (public.is_employee());

drop policy if exists "companies_insert" on public.companies;
create policy "companies_insert" on public.companies
  for insert with check (public.is_employee());

drop policy if exists "companies_update" on public.companies;
create policy "companies_update" on public.companies
  for update using (public.is_employee());

drop policy if exists "companies_delete" on public.companies;
create policy "companies_delete" on public.companies
  for delete using (public.is_admin());

-- contacts
drop policy if exists "contacts_read" on public.contacts;
create policy "contacts_read" on public.contacts
  for select using (public.is_employee());

drop policy if exists "contacts_insert" on public.contacts;
create policy "contacts_insert" on public.contacts
  for insert with check (public.is_employee());

drop policy if exists "contacts_update" on public.contacts;
create policy "contacts_update" on public.contacts
  for update using (public.is_employee());

drop policy if exists "contacts_delete" on public.contacts;
create policy "contacts_delete" on public.contacts
  for delete using (public.is_employee());

-- call_logs
drop policy if exists "call_logs_read" on public.call_logs;
create policy "call_logs_read" on public.call_logs
  for select using (public.is_employee());

drop policy if exists "call_logs_insert" on public.call_logs;
create policy "call_logs_insert" on public.call_logs
  for insert with check (public.is_employee());

drop policy if exists "call_logs_delete" on public.call_logs;
create policy "call_logs_delete" on public.call_logs
  for delete using (public.is_employee());

-- tasks
drop policy if exists "tasks_read" on public.tasks;
create policy "tasks_read" on public.tasks
  for select using (public.is_employee());

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (public.is_employee());

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update using (public.is_employee());

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete using (public.is_employee());

-- notes
drop policy if exists "notes_read" on public.notes;
create policy "notes_read" on public.notes
  for select using (public.is_employee());

drop policy if exists "notes_insert" on public.notes;
create policy "notes_insert" on public.notes
  for insert with check (public.is_employee());

drop policy if exists "notes_update" on public.notes;
create policy "notes_update" on public.notes
  for update using (public.is_employee());

drop policy if exists "notes_delete" on public.notes;
create policy "notes_delete" on public.notes
  for delete using (public.is_employee());

-- calendar_events
drop policy if exists "events_read" on public.calendar_events;
create policy "events_read" on public.calendar_events
  for select using (public.is_employee());

drop policy if exists "events_insert" on public.calendar_events;
create policy "events_insert" on public.calendar_events
  for insert with check (public.is_employee());

drop policy if exists "events_update" on public.calendar_events;
create policy "events_update" on public.calendar_events
  for update using (public.is_employee());

drop policy if exists "events_delete" on public.calendar_events;
create policy "events_delete" on public.calendar_events
  for delete using (public.is_employee());

-- imports (Rollback update is admin only)
drop policy if exists "imports_read" on public.imports;
create policy "imports_read" on public.imports
  for select using (public.is_employee());

drop policy if exists "imports_insert" on public.imports;
create policy "imports_insert" on public.imports
  for insert with check (public.is_employee());

drop policy if exists "imports_update" on public.imports;
create policy "imports_update" on public.imports
  for update using (public.is_admin());

-- audit_logs (Only admin reads audit logs)
drop policy if exists "audit_read" on public.audit_logs;
create policy "audit_read" on public.audit_logs
  for select using (public.is_admin());

drop policy if exists "audit_insert" on public.audit_logs;
create policy "audit_insert" on public.audit_logs
  for insert with check (public.is_employee());

-- lead_locks
drop policy if exists "locks_read" on public.lead_locks;
create policy "locks_read" on public.lead_locks
  for select using (public.is_employee());

drop policy if exists "locks_insert" on public.lead_locks;
create policy "locks_insert" on public.lead_locks
  for insert with check (public.is_employee());

drop policy if exists "locks_update" on public.lead_locks;
create policy "locks_update" on public.lead_locks
  for update using (public.is_employee());

drop policy if exists "locks_delete" on public.lead_locks;
create policy "locks_delete" on public.lead_locks
  for delete using (public.is_employee());
