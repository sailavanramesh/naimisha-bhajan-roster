# Naimisha Bhajan Roster — Web App (Starter)

This project is a web app version of the Google Sheets roster you provided (exported as XLSX).

## What you get in this starter
- Bhajan Masterlist browse/search
- Session roster (by date) view + per-session detail page
- Singer detail page (history)
- Instrumentalist roster view (by date)
- One-command seed/import from your XLSX into the database

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- Prisma ORM
- Database: **SQLite for local dev** (easy) OR Postgres/Supabase for sharing

## Quick start (local)
1. Create `.env` from `.env.example`
2. Install dependencies
   - `npm install`
3. Create DB + migrate
   - `npm run prisma:migrate`
4. Seed from your XLSX
   - Put your file at `data/roster.xlsx` (or update `XLSX_PATH` in `.env`)
   - `npm run db:seed`
5. Run
   - `npm run dev`

## Deploy / share with multiple people
For sharing, switch to Postgres (recommended: Supabase).
- Set `DATABASE_URL` to the Supabase Postgres connection string
- Run migrations
- Redeploy to Vercel

## Notes
- Authentication/roles aren’t wired yet in this starter. Add Supabase Auth or NextAuth once the core workflow feels right.
- The seed script maps these sheets:
  - `Bhajan Masterlist` → `bhajans`
  - `Singer Roster` → `sessions` + `session_singers`
  - `Instrumentalist Roster` → `session_instruments`
  - `Lookup tables` → `singers`, `pitch_lookup`, `instrument_people`
  - `Festival Bhajans` → `festival_bhajans`


## Link-based editing (no login)

This app supports **"anyone with the link can edit"** using an **edit key**.

- Set `EDIT_KEY` in your environment (local `.env`, and Vercel env vars).
- Share your normal link for read-only access.
- Share an **edit link** that includes the key once, e.g. `https://your-app.vercel.app/?k=YOUR_LONG_KEY`
  - The app will set an `edit=1` cookie and then redirect to remove the key from the URL.
  - Any browser with that cookie can edit.

If you need to revoke access, change `EDIT_KEY` and redeploy (or just update env var + redeploy).
