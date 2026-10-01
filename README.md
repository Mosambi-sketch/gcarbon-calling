# Gcarbon Calling — Internal Sales & Cold-Calling CRM

A high-velocity, clean, and intuitive internal CRM designed specifically for Gcarbon's cold-calling and outbound sales operations. It replaces unwieldy Excel sheets with a streamlined 3-step call logger, live KPI dashboard, task kanban, meeting calendar, private scratchpad notes, and robust Excel import with deduplication.

---

## 🚀 Quick Start

### 1. Requirements
- Node.js 18+ (tested on Node 20+)
- npm or pnpm

### 2. Installation & Run
```bash
# Navigate to the project folder
cd gcarbon-calling

# Install dependencies (already installed)
npm install

# Start the development server
npm run dev
```

Visit **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 👥 Demo Login Credentials

All demo accounts use password: `gcarbon123`

| Name | Role | Email | Password | Permissions |
|---|---|---|---|---|
| **Ajinkya** | Admin | `ajinkya@gcarbon.in` | `gcarbon123` | Full access (CRM, team KPIs, list manager, Excel import) |
| **Himanshi** | Caller | `himanshi@gcarbon.in` | `gcarbon123` | Calling sheet, own tasks, notes, calendar, call logging |
| **Tamanna** | Caller | `tamanna@gcarbon.in` | `gcarbon123` | Calling sheet, own tasks, notes, calendar, call logging |
| **Kunal** | Caller | `kunal@gcarbon.in` | `gcarbon123` | Calling sheet, own tasks, notes, calendar, call logging |
| **Ankesh** | Caller | `ankesh@gcarbon.in` | `gcarbon123` | Calling sheet, own tasks, notes, calendar, call logging |

> **Tip:** On the sign-in screen, click any of the one-click demo chips to prefill the email and password instantly.

---

## 🌟 Key Features

### 1. 📞 Calling Sheet (Core Screen)
- **High-density spreadsheet layout:** Designed for fast navigation and 5-second call logging.
- **List Filtering:** Tabs for each target list (*Connection List*, *Cold Calling 1*, *Cold Calling 2*, *Data Centres*, *Kharadi*, *Chakan*, *Ranjangaon*, *Bhosari*, *Freelancers*).
- **Status Pills:** Color-coded status badges (`Not Called`, `In Progress`, `Follow-up Due`, `Meeting Set`, `Won/Interested`, `Dead`).
- **Click-to-Call:** Direct `tel:` links to call immediately from softphone or connected mobile.
- **Keyboard Shortcuts:**
  - Press `/` to immediately focus the global search bar.
  - Press `N` to navigate directly to the calling sheet.

### 2. ⚡ 3-Step "Log Call" Drawer
- **Step 1: Outcome Chip Selection:** Single-click categorization with clear color psychology (Interested/Meeting = Lime Green, Call Back/Mail Sent = Orange/Yellow, Dead/Invalid = Red/Muted).
- **Step 2: Remarks & Next Actions:** Quick-input note field with smart shortcuts for immediate scheduling.
- **Step 3: Auto-Schedule Follow-up:** Automatically creates a calendar event and assigned task with one click (`Tomorrow`, `In 3 Days`, `Next Week`).
- **Call History Timeline:** View all previous caller remarks and timestamps for that company.

### 3. 📊 Executive & Caller Dashboard
- **Live KPIs:** Total Calls logged, Connected rate, Meetings Scheduled, Follow-ups Due today.
- **Visual Analytics:**
  - Outcome breakdown pie chart.
  - Team call volume comparison.
  - Daily call activity trend over time.
- **Action Queue:** Direct list of high-priority overdue follow-ups and tasks ready to act upon.

### 4. 📋 Task Kanban & List View
- Visual 3-column kanban board: **To Do**, **In Progress**, **Done**.
- Priority badges (`High`, `Medium`, `Low`) with overdue warnings.
- Filter tasks by assignee (view your own or entire team's tasks).

### 5. 📅 Calendar
- Monthly visual grid displaying scheduled meetings (lime green) and follow-up callbacks (orange).
- Day sidebar for viewing all events scheduled on the selected date.
- Quick "Add Event" modal with company tagging.

### 6. 📝 Private Notes & Scratchpad
- Notion-style clean editor with split list/detail layout.
- Auto-saving on type with pinned notes support.
- Fully private to each caller for personal pitch notes, objections, and research.

### 7. ⚙️ Settings & Excel Import Wizard
- **Team Roster:** View all team members and their roles.
- **List Manager:** Create and manage company lists.
- **Excel (.xlsx / .csv) Importer:**
  - Drag-and-drop file upload.
  - Automatic column auto-mapping (Company Name, Contact Person, Phone, Email, Sector, Location, Notes).
  - Built-in duplicate detection (by company name and normalized phone number).
  - Preview before importing.
- **Data Management:** Export data or reset to seed state (Admin only).

---

## 🛠️ Architecture & Tech Stack

- **Framework:** Next.js 14+ (App Router) + TypeScript
- **Styling:** Custom CSS design system inspired by modern industrial UI (curated lime green `#D9F56B`, warm terracotta `#E8894F`, dark `#0B0B0B`, and crisp neutral canvas `#EFEFEF` / `#FFFFFF`).
- **Icons & Fonts:** Lucide React icons, Inter typography.
- **Charts:** SVG-based interactive donut and activity charts.
- **Data Store:** Local-first reactive storage with automatic client-side seeding from the bundled `data/seed.json` (1,232 companies, 972 contacts, and 851 call logs parsed directly from `Connection_List.xlsx`).
- **Backend / Supabase Ready:** Environment variables provided in `.env.example`. Can be seamlessly wired to Supabase PostgreSQL using the matching schema.

---

## 🗄️ Database Schema (Supabase / PostgreSQL)

When connecting a hosted Supabase project, execute the following schema in the SQL Editor:

```sql
-- Profiles / Users
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'caller' CHECK (role IN ('admin', 'caller')),
  color TEXT DEFAULT '#D9F56B',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Company Lists
CREATE TABLE lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'company' CHECK (type IN ('company', 'freelancer')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Companies
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  list_id TEXT REFERENCES lists(id) ON DELETE SET NULL,
  sector TEXT,
  industry TEXT,
  location TEXT,
  website TEXT,
  notes TEXT,
  reference BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'Not Called',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  designation TEXT,
  phones TEXT[] DEFAULT '{}',
  email TEXT,
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call Logs
CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  caller_id TEXT NOT NULL,
  caller_name TEXT NOT NULL,
  called_at TIMESTAMPTZ DEFAULT NOW(),
  outcome TEXT NOT NULL,
  remark TEXT,
  next_action TEXT,
  follow_up_date DATE
);

-- Tasks
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assignee_id TEXT NOT NULL,
  assignee_name TEXT NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  company_name TEXT,
  due_at TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notes
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  pinned BOOLEAN DEFAULT false,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  company_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calendar Events
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  start TIMESTAMPTZ NOT NULL,
  end TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL DEFAULT 'meeting' CHECK (type IN ('meeting', 'follow-up', 'other')),
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  owner_id TEXT NOT NULL,
  all_day BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 📦 Build for Production

```bash
npm run build
npm start
```
The application compiles cleanly into optimized production assets.
