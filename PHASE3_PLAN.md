# Phase 3 — implementation plan

**Status:** scoped, not started. **Written:** 2026-10-23.
**Companion:** `PHASES.md` (phase index + drift register), `BUSINESS_RULES.md`
(enforcement), `todo.md` (working list).

Phase 1 shipped the money-in path; Phase 2 shipped the job-order module, the job
card and receipts. Phase 3 is **everything the PRD still asks for that is not
built**, plus the hardening the build has exposed. It is grouped into three
independent tracks so any slice can ship alone:

- **Track A — Management visibility** (PRD §8.2 dashboard, §11 Phase 3)
- **Track B — Workshop floor** (PRD §9, §10.6, §10.7, §11 Phase 2 leftovers)
- **Track C — Sales + hardening** (PRD §8.2 gaps, §10.3, and debt from Phase 1/2)

Explicitly **not** in Phase 3: anything already shipped in Phase 1/2, and any
role-matrix change that would alter `BUSINESS_RULES.md` §4 — that is a decision
first (C7), implementation second.

**Why there is no "Phase 4".** The PRD's Phase 2 deliverables that never shipped
(vehicle service history, email notifications, offline support) are folded into
**Track B** rather than left behind in a closed phase. The phase numbers in this
file describe *work remaining*, not calendar order; the PRD's own bands are
mapped in `PHASES.md` §PRD alignment.

---

## What already exists (don't rebuild it)

| Piece | State |
|---|---|
| `service_history` table + RLS | Schema (0001) and policies (0003) exist; **no app code uses it**. Columns: `vehicle_id`, `technician_id`, `description`, `is_billable`, `linked_job_order_id`, `created_at`. |
| `audit_logs` | Written by `logAudit()` through the service role; `SELECT` for admin/manager (0003). No viewer. |
| `profiles` | `is_active`, `role`, `full_name`, `phone`; admin has `FOR ALL` (0003). No management screen. |
| `payments` | `invoice_id` + nullable `job_order_id`; `amount`, `payment_method` ∈ cash/transfer/card/other, `reference_number`, `notes`, `received_by`. |
| `invoices` | `customer_id` + `vehicle_id` both `NOT NULL`; `cost_breakdown` JSONB; `billing_type`, `category`; `job_order_id`. |
| `financial_status` | Derived by trigger `set_financial_status_from_payments` (0010) on every payment insert; manual officer override kept. |
| Money, pills, search, audit, inline-edit card, dialogs | Shared Phase 1/2 building blocks (`lib/money.ts`, `lib/search.ts`, `components/status-pill.tsx`, `lib/audit.ts`). |
| `job_order_items` | Table exists (0001) but **no app code uses it** — the invoice's `cost_breakdown` replaced it. Only test scripts seed it. Decide whether to drop it (C7). |
| Email | **Nothing installed.** No provider, no templates, no queue. |

---

## Decisions required before (or during) the build

Owner decisions, not implementation details. Each blocks or shapes the slice it
names. Answers recorded 2026-10-23; **D8–D10 are still open**.

| # | Decision | Answer | Effect |
|---|---|---|---|
| **D1** | **CNG instalment overdue** | **No overdue reporting.** `instalmental` billing will later grow a proper payment schedule; revisit then. | A1 loses the overdue card; A2 is the monthly report only |
| **D2** | **Report export** | **Print route** reusing `@media print` + browser "Save as PDF". No PDF library. | A2 |
| **D3** | **Email failure policy** | **Best-effort notifications — never roll back an action.** Emails are a convenience; the business carries on without them. Provider chosen when B2 starts. | B2 |
| **D4** | **Offline technician support** | **Build the PWA — but later, not in the current pass.** | B3 deferred, not dropped |
| **D5** | **Walk-in parts sale shape** | **Customer required, vehicle nullable.** Category↔billing-type relationship and the sales form UI still to be designed. Sales invoices must never raise a job order. **Later.** | C1 deferred with the shape fixed |
| **D6** | **Payment proof** | **Required.** A photo, a receipt/reference number, or similar evidence, **plus an optional note**. | C3 |
| **D7** | **Payment / job-order gating** | **Never block recording a payment**, including post-service. **Retain the ≥ 50% minimum before job-order creation.** | C5 closes as "keep + document"; no new gates |
| **D8** | **Signatures on the job card** | **Open — deferred.** | C6 |
| **D9** | **Role/privilege matrix** | **Open — deferred.** | A4, C7 |
| **D10** | **Invoice draft/issued states** | **Open — deferred.** | C7 |

---

## PRD coverage — every deliverable, mapped

Nothing in PRD §11 is left orphaned. ✅ = already shipped.

| PRD §11 deliverable | Status | Slice |
|---|---|---|
| Supabase setup, schema, RLS | ✅ | — |
| Next.js, auth flow, role routing | ✅ | — |
| Customer CRUD | ✅ | — |
| Vehicle CRUD (linked to customer) | ✅ | — |
| Job order creation with line items | ✅ superseded | invoice-first; see `PHASES.md` drift #1–2 |
| Sequential job-order numbering | ✅ | — |
| Job order list & details | ✅ | — |
| Print job card (A4) | ✅ (content differs) | C6 for signatures |
| Basic payment recording | ✅ | — |
| Receipt generation & printing | ✅ | — |
| Sequential receipt numbering | ✅ | — |
| Basic search (customer, phone, plate, job #) | ✅ | — |
| Technician mobile interface (PWA) | ❌ deferred | **B3** (build later, D4) |
| Technician job list (assigned only) | ✅ superseded | vehicle lens; drift #6 |
| Technician job details with status update | ✅ | — |
| Job log timeline | ✅ | — |
| Vehicle service history page | ❌ | **B1** |
| Add minor complaint to service history | ❌ | **B1** |
| Offline capability | ❌ deferred | **B3** (build later, D4) |
| Email notifications | ❌ | **B2** (best-effort, D3) |
| Financial dashboard | ❌ | **A1** |
| Outstanding balance tracking | ❌ | **A1** |
| Overdue account alerts | ❌ **dropped** | D1: no overdue until `instalmental` schedules exist |
| Monthly report generation (print/PDF) | ❌ | **A2** (print route, D2) |
| Automated monthly email reports | ❌ | **A2 + B2** |
| Receipt reprint with duplicate tracking | ✅ (ahead of PRD) | — |
| Audit log viewer | ❌ | **A3** |
| User management (admin only) | ❌ | **A4** (D9) |

Page-spec gaps that are not §11 checkboxes are folded into **C4** (date-range +
technician filters), **C1** (walk-in sale) and **C5** (payment rules).

---

## Track A — Management visibility

### A1 — Dashboard

**Goal:** the admin/manager landing page answers "how is the workshop doing
today?" without opening invoices.

**Files:** `app/(dashboard)/dashboard/page.tsx` (replace the placeholder); new
`components/dashboard/` pieces (stat card, revenue chart, recent-orders table).
No migration.

**Data**

- **Today's revenue** — `SUM(payments.amount)` where `created_at::date = today`.
- **Outstanding balance** — `SUM(invoices.total_amount) - SUM(payments.amount)`,
  per invoice, aggregated; only invoices with a positive balance.
- **Active jobs** — `job_orders.execution_status IN ('pending','in_progress','waiting_parts')`.
- **Revenue over 30 days** — daily sums of payments.
- **Recent job orders** — reuse the `/job-orders` row shape, last 10.
- **No overdue card** (D1). Overdue reporting is out until `instalmental`
  billing grows a payment schedule; do not approximate it.

**Chart:** no chart library is installed. Prefer a small inline SVG / CSS bar
chart in the house style over adding a dependency; if a library is chosen, say
so in the plan first.

**Acceptance:** reception and technicians cannot reach `/dashboard`
(`requireRole` already enforces); figures match a direct SQL check; empty states
render without `NaN` or `₦0` noise; no horizontal scroll at 390px.

### A2 — Monthly report

**Export is a print route (D2).** No PDF library. Reuse the job-card/receipt
pattern: a sheet hidden on screen, revealed by `@media print`, one page, with
`@page { size: A4 }`.

**Files:** new `app/(dashboard)/reports/page.tsx`;
`app/(dashboard)/reports/monthly/page.tsx` (print sheet); `lib/reports.ts`.

**Content:** totals (job orders, revenue, collected, outstanding), revenue by
`category` and `billing_type`, and technician productivity (jobs completed by
assignee). **No overdue section** (D1).

**Automated send:** a Route Handler protected by a shared secret, called by a
cron (Vercel Cron or `pg_cron` + `pg_net`); delegates to B2's mailer. Must be
idempotent per month. The report still works as a manual print when email is
absent (D3).

**Acceptance:** report figures reconcile with the dashboard; the print sheet is
one page and carries the same numbers as the screen; running the cron twice in
a month sends one email; failure is logged and never blocks anything.

### A3 — Audit log viewer

**Files:** new `app/(dashboard)/audit/page.tsx`; optional `app/(dashboard)/audit/[id]/page.tsx`.
No migration — `audit_logs` SELECT already allows admin/manager.

**Content:** reverse-chronological table — when, actor, action, entity, entity id,
details (JSONB expanded or a drawer). Filters: action, entity type, actor, date
range. Read-only; no edit or delete path exists by design.

**Notes:** `details` is `JSONB` and varies by action (`invoice.created`,
`payment.recorded`, `receipt.reprinted`, `job_order.execution_status_changed`
with `source:"officer"`, …). Render unknown shapes as pretty-printed JSON rather
than assuming a schema.

**Acceptance:** a technician and reception get redirected by `requireRole`; the
row written by recording a payment appears without a refresh after a hard load;
the viewer cannot mutate anything (no buttons, no action).

### A4 — User management

**Blocked by D9 (role matrix) for role changes.**

**Files:** new `app/(dashboard)/users/page.tsx`, `app/actions/user-actions.ts`;
Supabase admin API via a service-role client (`lib/supabase/service.ts` already
exists).

**Capabilities:** list profiles (name, email, role, active); invite a user by
email; set role; deactivate/reactivate (`profiles.is_active` — `getAuthContext`
already refuses inactive users at login).

**Security notes:** the admin API bypasses RLS — every action must
`requireRole(["admin"])` **before** touching the service client, and every
change is audited (`user.invited`, `user.role_changed`, `user.deactivated`).
Never accept a role from a non-admin. Decide how password resets work (Supabase
recovery email vs admin-set).

**Acceptance:** a manager and reception cannot see the route or call the action;
deactivating a user blocks their next login; role change is reflected on their
next request; audit rows exist for each change.

---

## Track B — Workshop floor

### B1 — Vehicle service history

**Files:** `app/(dashboard)/vehicles/[id]/page.tsx` (history card); new
`app/actions/service-history-actions.ts`; `app/(dashboard)/technician/page.tsx`
(add history for the selected vehicle). Migration optional (see below).

**What exists:** `service_history` (vehicle, technician, description,
`is_billable`, `linked_job_order_id`) and RLS (staff read; technicians insert
own). Nothing writes it.

**Work**

1. **Auto-entry on job-order creation.** Either a trigger on `job_orders`
   insert or a step in `createJobOrderFromInvoice`. Prefer the app step if the
   entry must carry a readable description; prefer a trigger if it must be
   impossible to forget. Record the choice.
2. **Technician adds minor work.** A small form on the technician vehicle lens:
   description, non-billable by default, `technician_id` from the session.
3. **Read-only history** on the vehicle detail page, chronological, with a link
   to the job order when `linked_job_order_id` is set.
4. **Convert to a job order.** Per the invoice-first rule, "convert" means
   "create an invoice for this work, then raise a job order once ≥ 50% paid".
   Do not add a second creation path. Mark the history row billable and link it
   when the job order is raised.

**Acceptance:** raising a job order creates exactly one history row (no
duplicates on retry); a technician can add non-billable work but cannot edit or
delete history; the vehicle page shows history in order; conversion never
bypasses the invoice/50% rule.

### B2 — Email notifications

**D3 answered: best-effort only.** An email failure is logged and never rolls
back a payment, job order or status change. The provider is chosen when this
slice starts (Resend / Postmark / Supabase SMTP).

**Files:** `lib/email.ts` (provider adapter + templates), `lib/email-templates.ts`,
calls from `job-order-actions.ts` (created), `payment-actions.ts` (received),
and the A2 cron (monthly). Env vars for the provider key and from-address.

**Templates (PRD §9):** job order created, payment received, monthly report.
Correct the PRD's `$` to ₦ and use `formatNaira`.

**Rules:** never roll back an action on send failure; never send financial
detail to a technician address; log sends in `audit_logs`
(`email.sent` / `email.failed`) so a silent provider outage is visible.

**Acceptance:** recording a payment sends exactly one email (keyed by receipt
number); a provider failure still records the payment; the recipient list comes
from profiles, not client input; templates render with a real ₦ figure.

### B3 — Technician PWA / offline *(deferred — build later, D4)*

**Decision taken: it will be built, but not in the current pass.** Do not
half-build it. The spec below is what to pick up when it is scheduled.

**Files:** `app/manifest.ts`, a service worker (cache the vehicle lens shell and
last-read vehicles/jobs), IndexedDB (or Cache API) queue for status updates and
notes, a sync indicator, and conflict handling when a job changed on the server
while offline. The existing `logExecutionStatus` action is the sync target.

**Acceptance (when built):** a job opened offline still opens after a reload; a
queued status update syncs once on reconnect and is not duplicated; the
indicator tells the truth; no financial data is ever cached.

---

## Track C — Sales + hardening

### C1 — Walk-in parts sale *(deferred — build later, D5)*

**D5 answered: customer required, vehicle nullable.** The category↔billing-type
relationship and the sales form UI still need design, so this slice is **later**.
The shape is fixed so it is not re-litigated:

- `invoices.customer_id` stays `NOT NULL`.
- `invoices.vehicle_id` becomes nullable **for `category = 'sales'`**.
- Category and billing type gain a deliberate relationship (a sale can be
  upfront, for example); the form shows only the valid combinations.
- A `sales` invoice **can never raise a job order** — no button, and the action
  refuses it.

**Files:** `supabase/migrations/0017_*.sql`; `app/actions/invoice-actions.ts`;
`app/(dashboard)/invoices/new/invoice-form.tsx`; invoice detail/list renderers.

**Consequences to handle everywhere:** the vehicle card on the invoice detail,
the job-order raise (block cleanly with a reason), search joins, and any report
that assumes a vehicle exists.

**Acceptance:** a parts sale saves with no vehicle; the detail page renders
without a vehicle link; raising a job order from it is impossible with a clear
reason; existing invoices are unaffected.

### C2 — Server-action error contract

**Files:** new `lib/action-result.ts`; `app/actions/directory-actions.ts`
(already converted for `createVehicleForCustomer`), `invoice-actions.ts`,
`job-order-actions.ts`, `receipt-actions.ts`, `payment-actions.ts`; the client
components that call them.

**Rule:** expected, user-recoverable problems return
`{ ok: false, error: string }`; only genuinely unexpected faults throw. The
duplicate-plate bug (2026-10-23) is the proof: a `throw` on a validation error
became React #441 in production and hit the error boundary instead of the
caller's `catch`.

**Work:** define a shared `ActionResult<T>`; convert validation throws
(required fields, bad enum, duplicate, over-payment) to results; keep throws
for auth failure and unexpected DB errors; update every caller to branch on
`ok`; add at least one flow-check assertion per converted action.

**Acceptance:** no expected validation error reaches an error boundary in a
**production** build; each converted action has a test that triggers its failure
inline; `npm run build` clean.

### C3 — Payments require proof

**D6 answered: required.** Evidence may be **a photo, a receipt/reference
number, or something similar**, plus an **optional note**. That means the model
must support both a file and free text — a reference number is not an upload.

**Files:** `supabase/migrations/0017_*.sql` (or a later number: a
`payment_proofs` table or `payments.proof_path` + `payments.proof_reference` +
`payments.proof_note`), a private storage bucket + policies,
`app/actions/payment-actions.ts`, `app/(dashboard)/invoices/[id]/` payment
dialog and list, a viewing surface.

**Shape:** at least one form of evidence is required; the note is optional.
Storage: private bucket, signed URLs, upload size/type validation. Required
proof changes `recordPayment`'s signature and every caller.

**Acceptance:** a payment without evidence is refused in the action *and* the
UI; a reference-number-only payment is accepted; a proof can be viewed by
officers and never by technicians; a receipt never exposes the storage path.

### C4 — Job-order list filters

**Files:** `app/(dashboard)/job-orders/page.tsx` only. No migration.

**Add:** date range (`?from=` / `?to=` on `date_in`) and technician
(`?tech=<profile id>`). Reuse the existing `?status=` / `?payment=` chip pattern
and `lib/search.ts`; keep filters as plain links so no client JS is needed.
Remember the two-query merge already used for search.

**Acceptance:** combining search + status + date + technician narrows correctly;
filters survive pagination/navigation; clearing one filter leaves the others.

### C5 — Payment gating *(closed by D7 — keep and document)*

**D7 answered: payment recording is never blocked**, including for
post-service. The **≥ 50% minimum before job-order creation** stays.

**Work is documentation, not new gates:**

- Make sure no UI disables "Record payment" for a billing type, and
  `recordPayment` has no billing-type check.
- Keep `JOB_ORDER_PAID_RATIO = 0.5` in `lib/invoice-rules.ts` as the single
  source of the job-order gate; both the UI and `createJobOrderFromInvoice`
  already use it.
- Record the rule in `BUSINESS_RULES.md` §3.2/§3.3 (and fix the stale
  `financial_status` wording there while in the file).

**Acceptance:** a post-service invoice can still take a payment; the job-order
button stays disabled below 50%; one shared predicate.

### C6 — Job card signatures *(D8 open — deferred)*

**Files:** `app/(dashboard)/job-orders/[id]/job-card.tsx`,
`scripts/job-card-check.mjs`.

**If yes:** add Technician / Customer / Reception signature lines. Keep the
existing no-money rule and the QR code. Add print assertions to the card check.

**Acceptance:** signatures print on the A4 sheet, are hidden on screen with the
rest of the card, and no financial figure appears.

### C7 — Open model / access items

**D9 and D10 are still open**, so this slice waits. The non-decision items
(`job_order_items`, PRD into `docs/`, VIN, stale wording) can proceed now.

- **Role/privilege matrix** (D9, open) — migration + RLS suite + §4 rewrite.
- **Invoice draft/issued** (D10, open) — `invoices.status` column, policies, UI,
  and a rule for what a draft may do (edit freely?) vs issued.
- **`job_order_items`** — dead in the app (only tests use it). Drop it in a
  migration, or keep it with a comment saying the invoice is the line-item
  store. Do not leave it ambiguous.
- **PRD v1.0 into `docs/`** — so `BUSINESS_RULES.md` can be diffed (§8.4).
- **VIN** — decide whether it appears on the invoice form and vehicle cards
  (already searched and editable on the vehicle page).
- **`BUSINESS_RULES.md` accuracy** — §3.2 says `financial_status` "is not
  derived (for now)" and §8.2 lists derivation as OPEN; trigger 0010 has
  derived it since Phase 1. Also record D7 here: payments are never blocked,
  and the ≥ 50% rule is the single job-order gate (it is not an
  invoice-only exception).

---

## Order, dependencies and rough size

Sizes are sessions, not calendar time.

| Slice | Depends on | Size | Notes |
|---|---|---|---|
| C2 error contract | — | 1–2 | Quality debt; do first, it is cheap and prevents repeat bugs |
| C4 list filters | — | 0.5 | Small, self-contained |
| C5 payment gating | — | 0.25 | Closed by D7: document only, no new gates |
| A1 dashboard | — | 1–2 | Chart dependency decision inside |
| A3 audit viewer | — | 1 | RLS already permits |
| A4 user management | D9 (role changes) | 1–2 | Admin API + audit |
| B1 service history | — | 1–2 | Schema + RLS already exist |
| A2 monthly report | — (D2 answered) | 1–2 | Print route; no overdue section |
| C3 payment proof | — (D6 answered) | 2–3 | Storage + reference text + RLS |
| B2 email | Chooses provider | 1–2 | Best-effort only (D3) |
| C7 non-decision items | — | 0.5 | `job_order_items`, PRD docs, VIN, wording |
| C7 role/invoice items | **D9, D10** | varies | Waits on the open decisions |
| C6 job-card signatures | **D8** | 0.5 | Waits on D8 |
| C1 walk-in sale | — (D5 answered) | 1–2 | **Deferred**, shape fixed |
| B3 PWA/offline | — (D4 answered) | 3–5 | **Deferred**, build later |

**Suggested sequence:** C2 → C4 → C5 (docs) → A1 → A3 → B1 → A4 → A2 → C3 → B2
→ C7 (non-decision items) → *later:* B3, C1 → *when D8–D10 land:* C6, A4 role
changes, C7 role/invoice items. Tracks are independent; reorder freely. Hard
ordering: role work waits on **D9**, invoice states on **D10**, signatures on
**D8**.

---

## Risks and how the plan absorbs them

1. **Overdue reporting was assumed, not specified.** The PRD asks for it, but
   there is no due-date or instalment model. D1 drops it rather than inventing a
   number; it returns when `instalmental` billing gets a payment schedule. Keep
   it out of the dashboard until then.
2. **Walk-in sales ripple.** Making `vehicle_id` nullable touches invoice
   rendering, search joins and the job-order raise. C1 names each surface; the
   `sales` category must never offer "Create job order".
3. **Email is a notification, not a transaction.** D3 makes sends best-effort;
   a provider timeout must never roll back a payment. Log failures so a silent
   outage is still visible.
4. **Service history can double-write.** Auto-creation from both a trigger and
   the app would create duplicates. B1 picks one path and tests a retry.
5. **Admin API bypasses RLS.** A4 must gate on `requireRole(["admin"])` before
   the service client, and audit every change; a client-supplied role is never
   trusted.
6. **Offline is deferred, not cancelled.** D4 says build it later; until then,
   the responsive lens is the mobile answer and no half-built sync queue should
   ship.
7. **Proof can be text, not a file.** D6 allows a receipt/reference number, so
   the model needs a reference field and an optional note — not a mandatory
   upload. Building it upload-only would block real counter practice.
8. **Documentation is already stale.** `BUSINESS_RULES.md` §3.2/§8.2 describe
   `financial_status` as manual/OPEN; trigger 0010 derives it. C7 fixes it, and
   records D7 (payments are never blocked).
9. **Flow checks must run on a production build.** The duplicate-plate bug was
   invisible in `next dev`. Every slice's acceptance runs against
   `npm run build && npm run start`.

---

## Definition of done for Phase 3

- Every row in the PRD coverage table is ✅, shipped in this phase, or
  **explicitly deferred** with the owner decision recorded (D1–D10).
- Every D-decision is answered and recorded in `BUSINESS_RULES.md`; no slice
  ships on a guessed rule. D8–D10 are still open and gate C6/A4/C7.
- `scripts/rls-test-suite.mjs` exits 0 (56/57 with T17 tracked), and new access
  surfaces (audit viewer, user management, service history, proof uploads) have
  cases in it.
- New flow checks pass **against a production build** and clean up after
  themselves.
- `BUSINESS_RULES.md` §3.2/§3.3/§4/§8 match what the database enforces,
  including D7 (payments are never blocked; ≥ 50% gates job-order creation).
- `npm run build` and `npx tsc --noEmit` are clean.
