# Production Deployment Guide

1. **Supabase SQL**: In Supabase SQL Editor, execute in order:
   `supabase/schema.sql` -> `supabase/migration_v2.sql` -> `supabase/migration_v3_prod.sql`.
   *Verification Note*: Email `ajnikya.gcarbon@gmail.com` preserved; verify if intentional typo for Ajinkya.
2. **Supabase Auth Settings**:
   - Turn **Confirm email** ON (Authentication > Providers > Email).
   - Site URL: `https://<your-vercel-domain>.vercel.app`
   - Redirect URLs: `https://<your-vercel-domain>.vercel.app/**`, `http://localhost:5173/**`
   - Google Provider: Enable and enter Client ID + Client Secret if Google OAuth is desired.
3. **Environment Variables**:
   - **Vercel** (Frontend): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_CLIENT_ID`, `VITE_API_URL` (`https://<render-service>.onrender.com/api`).
   - **Render** (Backend): `PORT=10000`, `ALLOWED_ORIGIN=https://<your-vercel-domain>.vercel.app`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MONGODB_URI`, `MONGODB_DB_NAME`, `SHAREPOINT_EXCEL_URL`, `SHAREPOINT_COOKIES`.
4. **Data Import**:
   Run locally once: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-to-supabase.mjs`.
5. **Admin Activation & Credential Rotation**:
   - Aadarsh signs up at `/` using `aadarsh.gcarbon@gmail.com`, sets a strong password, confirms email.
   - Rotate MongoDB database user password and refresh SharePoint session cookies (`SHAREPOINT_COOKIES`).
6. **Security Verification Steps**:
   - *Blocked Signup Test*: Attempt sign-up with `stranger@gmail.com` -> triggers Postgres exception: `Registration rejected: ... is not an active authorized Gcarbon employee.`
   - *Caller Workspace Delete Test*: Run as caller JWT -> `DELETE FROM workspaces WHERE id = '...'` -> RLS denies delete (`0 rows affected`).
   - *Admin Workspace Delete Test*: Run as Aadarsh JWT -> `DELETE FROM workspaces WHERE id = '...'` -> permitted by `is_admin()`.
   - *Employee Management SQL*:
     `INSERT INTO allowed_employees (email, name, role, color, active) VALUES ('new@gcarbon.in', 'Name', 'caller', '#A7F3D0', true);`
     `UPDATE allowed_employees SET active = false WHERE email = 'user@gcarbon.in';`
