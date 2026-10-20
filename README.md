# WMS — Workshop Management System

Cloud-based management system for a CNG installation/repair workshop:
customers, vehicles, job orders, payments/receipts, and technician job logs —
with role-based access enforced **at the database level** (Supabase Postgres
+ Row Level Security), not just in the UI.

- **Business rules (source of truth):** [BUSINESS_RULES.md](./BUSINESS_RULES.md)
- **Design system:** `.taste-skill/app/direction.json` (framed-sheet
  direction; light theme, IBM Plex Sans/Mono)
- **Agent skills:** `.agents/skills/` (manifest in `skills-lock.json`)

## Stack

Next.js 16 (App Router, `proxy.ts`) · React 19 · TypeScript · Tailwind v4 ·
shadcn/ui · Supabase (Postgres, RLS, Auth)

## Getting started

1. `npm install`
2. Copy `.env.example` → `.env.local` and fill in the Supabase keys
3. Apply `supabase/migrations/*.sql` **in numeric order** via the Supabase
   SQL editor (short files with trailing verification SELECTs — check each
   result before the next paste)
4. `npm run dev` → http://localhost:3000

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `lint` | standard Next.js |
| `node --env-file=.env.local scripts/db-health-check.mjs` | DB + RLS health probe |
| `node --env-file=.env.local scripts/rls-test-suite.mjs` | PRD §13 access-control suite — must exit 0 |
| `CHROME_PATH=<chrome> node --env-file=.env.local scripts/design-preview.mjs --who admin` | per-role screenshots + numeric design gate |
| `CHROME_PATH=<chrome> node --env-file=.env.local scripts/invoice-flow-check.mjs` | invoice → payment → job-order end-to-end gate; deletes its own test rows (`--purge` clears older runs, `KEEP_TEST_DATA=1` keeps them) |

## Layout

```
app/                  routes: (auth) login, (dashboard) role-gated screens
components/           app shell (L-frame) + shadcn/ui primitives
lib/                  auth/session, Supabase clients
supabase/migrations/  schema, functions, RLS — the enforcement layer
scripts/              health check, RLS suite, design preview gate
.taste-skill/         dealt design direction + generated previews
```
