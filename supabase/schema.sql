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

create policy "profiles_read" on public.profiles
  for select using (auth.role() = 'authenticated');

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

create policy "lists_read" on public.lists
  for select using (auth.role() = 'authenticated');

create policy "lists_insert" on public.lists
  for insert with check (auth.role() = 'authenticated');

create policy "lists_update" on public.lists
  for update using (auth.role() = 'authenticated');

create policy "lists_delete" on public.lists
  for delete using (auth.role() = 'authenticated');

alter table public.companies
  add column if not exists source_data jsonb not null default '{}'::jsonb,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

alter table public.companies enable row level security;

create policy "companies_read" on public.companies
  for select using (auth.role() = 'authenticated');

create policy "companies_insert" on public.companies
  for insert with check (auth.role() = 'authenticated');

create policy "companies_update" on public.companies
  for update using (auth.role() = 'authenticated');

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

create policy "contacts_read" on public.contacts
  for select using (auth.role() = 'authenticated');

create policy "contacts_insert" on public.contacts
  for insert with check (auth.role() = 'authenticated');

create policy "contacts_update" on public.contacts
  for update using (auth.role() = 'authenticated');

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

create policy "call_logs_read" on public.call_logs
  for select using (auth.role() = 'authenticated');

create policy "call_logs_insert" on public.call_logs
  for insert with check (auth.uid() = caller_id);

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

create policy "tasks_read" on public.tasks
  for select using (auth.role() = 'authenticated');

create policy "tasks_insert" on public.tasks
  for insert with check (auth.uid() = created_by);

create policy "tasks_update" on public.tasks
  for update using (auth.uid() = assignee_id or auth.uid() = created_by);

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

create policy "notes_read" on public.notes
  for select using (auth.uid() = owner_id);

create policy "notes_insert" on public.notes
  for insert with check (auth.uid() = owner_id);

create policy "notes_update" on public.notes
  for update using (auth.uid() = owner_id);

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

create policy "events_read" on public.calendar_events
  for select using (auth.role() = 'authenticated');

create policy "events_insert" on public.calendar_events
  for insert with check (auth.uid() = owner_id);

create policy "events_update" on public.calendar_events
  for update using (auth.uid() = owner_id);

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
