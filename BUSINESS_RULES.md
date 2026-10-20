# WMS — Business Rules (Source of Truth)

**Last updated:** 2026-10-19 · **Status:** living document

This file defines *how the workshop runs*. Owner decisions recorded here
supersede the original PRD v1.0 wherever they differ; PRD areas not
redefined here (feature scope, phases) remain in force.

Enforcement tags used per rule:

| Tag | Means |
|---|---|
| [SCHEMA] | column / constraint in `supabase/migrations/` |
| [RLS] | row-level security policy |
| [TRIGGER] | database trigger / function |
| [APP] | application code (server actions) |
| [OPEN] | decided as intent, not yet enforced |

**Executable spec:** `scripts/rls-test-suite.mjs` must exit 0 (currently
44 PASS + the one documented T17 KNOWN ISSUE). Every data-access rule below
has a test there.

---

## 1. Roles

Four roles exist: **admin**, **manager**, **reception**, **technician**.

> ⚠️ **OPEN — matrix redefinition pending.** Parts of the current
> role/privilege matrix (PRD-derived) do not match how the workshop actually
> runs; a redefinition is expected from the owner. Until it lands, §4 is
> exactly what the database enforces — do not change it casually.

## 2. Core invariants

1. **Technicians have zero access to financial data.** Enforced in the
   database (RLS), never merely hidden in the UI. [RLS]
2. **Document numbers are gapless and sequential** — `JO-YYYY-NNNN` (job
   orders), `RCP-YYYY-NNNN` (receipts). Per-year counters, no gaps, no
   reuse. Counters only advance through the numbering RPC, callable by
   officers and server-side code only. [SCHEMA+RLS]
3. **Everything is audited** — every create/update/delete produces an
   immutable audit entry. [APP+RLS]
4. **Financial state belongs to the front desk** — admin, manager,
   reception exclusively. Technicians cannot read or write it, on any
   table. [RLS]

## 3. Job orders — two independent statuses

Decided 2026-10-19: a job order carries **two orthogonal statuses** (the
original single `status` column wrongly mixed `'paid'` in with workflow
states). Schema: migrations `0008`/`0009`.

### 3.1 Execution status — `execution_status`

| Value | Meaning |
|---|---|
| `pending` | created, work not started |
| `in_progress` | being worked on |
| `waiting_parts` | blocked on parts |
| `completed` | work finished |
| `cancelled` | aborted — officers only |

- **Who may change it:** officers directly; technicians **only** by posting
  a job log on an *assigned* job (PRD §10.4). A SECURITY DEFINER trigger
  syncs `job_orders.execution_status` from the log and enforces the
  transition map `pending → in_progress ⇄ waiting_parts → completed`
  (`cancelled` is not reachable from a job log). [TRIGGER]
- Technicians never UPDATE the `job_orders` table itself. [RLS]

### 3.2 Financial status — `financial_status`

| Value | Meaning |
|---|---|
| `unpaid` | no payment recorded |
| `part_paid` | partial payment |
| `paid` | settled |

- **Who may change it: admin, manager, reception — exclusively.**
  Technicians have no write path (no UPDATE policy on `job_orders`) and no
  read path (the technician view omits the column entirely). [RLS+SCHEMA]
- A job order may be **created with partial payment or with no payment at
  all** — a front-desk decision at intake. The officer sets
  `financial_status`; it is not derived (for now — see §8.2). The one
  exception is a job order raised *from an invoice*, which requires ≥ 50%
  of that invoice to be paid first (§3.3).
- The value set may be extended when invoicing arrives. [OPEN]

### 3.3 Invoicing — built (Phase 1, 2026-10-20)

Invoice-first: the invoice exists before any money moves and before any
job order exists. [SCHEMA]

- **`invoices`** holds customer, vehicle, complaint, `cost_breakdown`
  (JSONB labour/parts lines) and `total_amount`. There is deliberately
  **no technician and no status column** on an invoice. [SCHEMA]
- An invoice never creates a job order by itself. The only bridge is the
  explicit *Create job order* action on the invoice's detail page, and only
  once **≥ 50% of the invoice total is paid** — enforced in the UI *and* in
  `createJobOrderFromInvoice` (lib/invoice-rules.ts). [APP]
- Payments record against the invoice directly: `payments.invoice_id`,
  with `job_order_id` nullable since 0013, so money can arrive before a
  job order exists. [SCHEMA]
- An invoice's paid / part paid / unpaid state is **derived on read** from
  the sum of its payments vs `total_amount`; nothing stores it. [APP]
- Officers only (admin, manager, reception) read or write invoices;
  technicians have no path to them at all. [RLS]
- Surfaces: `/invoices` (list), `/invoices/new` (form), `/invoices/[id]`
  (detail: payments + job-order raise). Creating an invoice lands on the
  detail page.

## 4. Data access matrix (as enforced today)

| Data | admin | manager | reception | technician |
|---|---|---|---|---|
| Job orders — execution fields | RW | RW | RW | R (all jobs, via view) |
| Job orders — financial fields¹ | RW | RW | RW | — |
| Execution status | RW | RW | RW | job logs only (assigned jobs) |
| Financial status | RW | RW | RW | — |
| Job order line items | RW | RW | RW | — |
| Customers | RW | RW | RW | R (owner lookup) |
| Vehicles | RW | RW | RW | R (search) |
| Job logs | RW | RW | RW | R; INSERT own/assigned |
| Service history | RW | RW | RW | INSERT own only |
| Payments | RW | RW | RW | — |
| Invoices | RW | RW | RW | — |
| Receipts | RW + reprint | RW + reprint | R + issue (non-dup) | — |
| Document counters (RPC) | ✓ | ✓ | ✓ | — |
| Audit log | RW | R | — | own-entry insert only² |
| Profiles | RW (manage) | R + own name | R + own name | R + own name |

¹ `billing_type`, `estimated_amount`, `actual_amount`, `financial_status`.
² Defense-in-depth only; app writes audit entries server-side (§7).

Notes:

- Technician job-order reads go through `job_orders_tech_view`, which
  contains no financial columns *by construction*. RLS is row-level, not
  column-level, so technicians get **zero rows** on the real `job_orders`
  table (suite T01) — the view is the only door.
- Receipts are append-only documents: issued and reprinted, never edited
  (see §8.3 for one open edge).

## 5. The technician's view: the vehicle lens

Decided 2026-10-19 — supersedes the PRD's "assigned jobs only" and the
FIX 1 rationale in `0003_rls.sql`:

A core platform feature is letting a technician look up a vehicle and see:

1. **the vehicle** — plate, make, model… searchable [RLS, plain SELECT]
2. **its owner** (customer) [RLS, plain SELECT]
3. **every** job order associated with that vehicle — complaint, schedule,
   assignment, work timeline [R via `job_orders_tech_view`]

Financial fields never appear on any technician surface, on any table.
`/job-orders` (the list with financial columns) stays officer-only;
technicians get their own non-financial route(s) in Phase 1.

## 6. Numbering rules

- Job orders: `JO-YYYY-NNNN`, assigned at creation by officers.
- Receipts: `RCP-YYYY-NNNN`, assigned when a receipt is issued.
- Counters live in `document_sequences` (type × year).
- `get_next_document_number` is denied to anon and technicians — only
  admin/manager/reception and server-side code can advance counters
  (gap/spam risk). [RLS+RPC]

## 7. Audit rules

- Every create/update/delete writes `audit_logs` (action, entity, user,
  details). [APP]
- Entries are immutable: SELECT for admin/manager only; no UPDATE/DELETE
  policy for anyone. [RLS]
- **How entries get written:** app server actions via a service-role
  `logAudit()` (Phase 2, [APP]) — the own-entry INSERT policy is
  defense-in-depth.
- **KNOWN ISSUE (suite T17):** audit INSERT through the Data API returns
  42501 for non-admin roles even though the policy proves correct in the
  SQL editor as the same role/claims (investigated in migrations
  `0006`/`0007`). App mitigation: service-role writes. Recorded as a known
  issue in the suite — suite still exits 0.

## 8. Open items

1. **Role/privilege matrix redefinition** (owner) — the current matrix
   predates how the workshop actually runs. Everything in §4 changes only
   through a new migration + suite update + an edit to this file.
2. **Financial status lifecycle** — today officers set it manually. When
   payment recording (Phase 2) and invoicing land, decide whether
   `financial_status` should be derived from payment totals, and which
   invoice states join the value set.
3. **Receipt immutability edge** — admin/manager currently hold FOR ALL on
   receipts (theoretically able to UPDATE/DELETE; only reception is
   suite-tested as immutable). Decide whether receipts become append-only
   for *everyone*.
4. **PRD v1.0 is not in the repo** — paste it into `docs/` so this document
   can be diffed against it.

## 9. Changelog

- **2026-10-19** — Created this document. Split `job_orders.status` into
  `execution_status` + `financial_status` (migration `0008`); technicians
  gain the vehicle lens — vehicles, owners, and ALL job orders without
  financials (migration `0009`). Invoicing deferred. Matrix redefinition
  flagged OPEN.
- **2026-10-19** — Security layer shipped: migrations `0004`–`0007`, suite
  at 44 PASS + T17 known issue.
- **2026-10-19** — Design foundation: framed-sheet direction
  (`.taste-skill/app/direction.json`), L-frame shell, IBM Plex.
- **2026-10-18/19** — Scaffold (`3324617`), auth shell (`03f7908`).

## 10. Sources of truth

| Concern | File |
|---|---|
| Business rules | **this file** |
| Feature scope & phases | PRD v1.0 (not yet committed — §8.4) |
| Enforcement | `supabase/migrations/` (0001–0009) |
| Executable access spec | `scripts/rls-test-suite.mjs` |
| Design system | `.taste-skill/app/direction.json` |
