# Implementation phases — tracking

One file for the whole build. Phase 1 and Phase 2 have shipped; the rest is
scoped but not started. Detailed plans live in `PHASE2_PLAN.md` (Phase 2) and
`PHASE3_PLAN.md` (Phase 3: decisions, slices, acceptance), with `todo.md` as the
working list and `BUSINESS_RULES.md` as what the DB enforces. This file is the
index: what each phase delivered, where the build has drifted from the PRD, and
what comes next.

**Last updated:** 2026-10-23 · **Enforcement:** migrations `0001`–`0016`

| Phase | Scope | Status |
|---|---|---|
| **1** | Directory + money-in: customers, vehicles, invoices, payments, job order raised from invoice | ✅ Done (2026-10-20) |
| **2** | Job-order module + receipts: list/detail/timeline, officer actions, job card, auto-issued receipts | ✅ Done (2026-10-21) |
| **3** | Everything still unbuilt, grouped into three tracks (management, workshop floor, sales & hardening) | 🔜 Scoped, not started |

Legend: ✅ done · 🟡 in progress · 🔜 scoped · ⬜ idea only · ❌ dropped/superseded

> **On the PRD.** The PRD (§8–§11) describes a **job-order-first** system with a
> standalone job-order form, technician "assigned jobs only", financial figures
> on the job card, and three phase bands. The system that was actually built is
> **invoice-first**, and several PRD rules were deliberately superseded. The
> PRD is still not committed to the repo (`BUSINESS_RULES.md` §8.4), so the
> master list below is the *actual* build, with a drift register explaining
> every difference.

---

## Phase 1 — directory + money-in ✅

**Shipped 2026-10-20.** Migrations `0001`–`0013`.

**Delivered**

- **Auth shell** — Supabase auth, `proxy.ts` gate, role-based landing
  (`ROLE_LANDING`), role-gated screens (`admin`, `manager`, `reception`,
  `technician`).
- **Invoices are the root of the money path.** `/invoices` lists; `/invoices/new`
  creates; `/invoices/[id]` is the hub. Invoice-first: the invoice exists before
  any money moves and before any job order exists.
- **Cost breakdown** — JSONB labour/parts lines, `Add line` after the last row,
  every figure as ₦ with thousands separators (`lib/money.ts`).
- **Payments** — recorded manually against the invoice; paid / part-paid /
  unpaid state derived on read. Payment above the remaining balance is refused.
- **Job order raised from an invoice** — the only bridge, explicit, and gated by
  ≥ 50% of the invoice paid in both UI and `createJobOrderFromInvoice`
  (`lib/invoice-rules.ts`).
- **Customer + vehicle directories** — `/customers` (list + search by name or
  phone) and `/vehicles` (search-first: nothing until a query, covering name,
  plate, VIN, make, model). Both have root + detail pages with **inline
  editing** — no separate `/edit` route.
- **Add a vehicle to an existing customer** — shared `NewVehicleDialog`; also
  offered from the invoice form once a customer is picked, then auto-selects the
  new vehicle.
- **Custom error pages** — 404, 500 / render errors (`error`, `global-error`)
  in the framed-sheet style, with root and `(dashboard)` variants.
- **Money formatting** — `formatNaira` everywhere money appears.

**Left open** (see `todo.md` §Carried over)

- VIN surfaced on the invoice form and in the vehicle cards — decide.
- Role/privilege matrix redefinition — OPEN (`BUSINESS_RULES.md` §8.1).
- Invoice draft/issued state machine — OPEN; schema has no `status` column.

---

## Phase 2 — job orders + receipts ✅

**Shipped 2026-10-21.** Migrations `0014`–`0016`. Full plan: `PHASE2_PLAN.md`.

**Delivered** — six slices

1. **`/job-orders` is a real list** — search over job number, complaint,
   customer name, plate, make and model; execution + payment filter chips; rows
   open the detail page.
2. **`/job-orders/[id]` hub** — inline-editable job facts, officer execution
   status control (cancelled terminal), technician assignment, merged work
   timeline (job logs + officer changes + the "raised" moment), money summary,
   print button.
3. **Officer actions** — `updateJobOrderExecutionStatus`, `assignJobOrder`,
   `updateJobOrder`; officers-only, audited, officer status moves audited (never
   written as job-log rows).
4. **Receipts on every payment** — `recordPayment` auto-issues a gapless
   `RCP-YYYY-NNNN`; exactly one original per payment (partial unique index);
   reprint writes a new flagged duplicate pointing at the original, never
   chaining; receipts append-only for every role including admin.
5. **Receipt sheet** — `/receipts/[id]` renders an A4 sheet, hidden on screen
   and revealed by `@media print`; duplicate watermark when reprinted.
6. **Suite, docs, flow gate** — RLS suite at 56/57 (T17 the tracked anomaly);
   `scripts/job-order-flow-check.mjs` (53 checks); shared
   `scripts/lib/flow-cleanup.mjs`.

**Also in Phase 2**

- **Job card** — the sheet left inside the vehicle: owner name + phone, vehicle
  details, invoice work-item **descriptions only**, QR code to the job order.
  **No money, no timeline, no technician commentary.** Parts and labour split
  into separate sections; a line with no `itemType` defaults to labour. Prints
  from the detail page with no extra navigation (38 checks in
  `scripts/job-card-check.mjs`).
- **`billing_type` moved to invoices** (0015) — vocabulary `upfront` /
  `instalmental` / `post-service`, centralised in `lib/invoice-vocabulary.ts`.
- **Invoice `category`** (0015) — `sales` / `maintenance` / `cng`.
- **Dark mode** — class-driven via `next-themes`; print forced light. 33/33 in
  `scripts/dark-mode-check.mjs`.
- **"Work requested" made optional** (0016) — `invoices.complaint` and
  `job_orders.complaint` nullable; blank values render as placeholders.

**Left open**

- **Duplicate-plate dialog bug** — fixed 2026-10-23 by returning a result object
  from `createVehicleForCustomer`. The *general* fix (audit every server action
  for `throw`-across-the-boundary) is Phase 3, Track C below.
- Walk-in parts sale — blocked by `invoices.customer_id` / `vehicle_id` being
  `NOT NULL`; needs a UI change of its own.
- `actual_amount` never lives on the invoice — recorded deviation from Phase 2
  D4 (`BUSINESS_RULES.md` §3.3).

---

## PRD alignment — how the docs map to the build

### Phases

The PRD's three bands do not map one-to-one onto what shipped. The real split:

| PRD §11 band | PRD scope | What actually happened |
|---|---|---|
| **Phase 1** (weeks 1–4) Core operations | schema/RLS, auth, customer/vehicle CRUD, job order creation + numbering, list/detail, print job card, payments, receipts, search | Split across our **Phase 1 + Phase 2**: directories, invoices, payments in P1; job-order module, numbering, job card, receipts in P2. The standalone *New Job Order* form was replaced by invoice-first. |
| **Phase 2** (weeks 5–8) Workshop integration | technician PWA (assigned only), job list/detail, job-log timeline, vehicle service history, offline, email notifications | Vehicle lens, job logs and timeline shipped in P1/P2; "assigned only" superseded. **Service history, offline, emails were never built.** |
| **Phase 3** (weeks 9–10) Management | dashboard, outstanding/overdue, monthly PDF + email reports, receipt reprint, audit log viewer, user management | Dashboard/reports still scoped; **receipt reprint was already delivered in our Phase 2**; audit viewer and user management not built. |

### Drift register

Every place the build differs from the PRD, and why. **Verdict** is one of:

- **Superseded** — an owner decision replaced the PRD rule; recorded in
  `BUSINESS_RULES.md` or the phase plan.
- **Built differently** — same outcome, different mechanism.
- **Not built** — still on the list.
- **Decision needed** — only the owner can settle it, and it is not recorded yet.

| # | Item | PRD says | Actual | Verdict |
|---|---|---|---|---|
| 1 | **Creation flow** | Standalone *New Job Order* form (customer, vehicle, billing, complaint, estimated amount, technician, line items) | Job orders exist only by raising one from a ≥ 50% paid **invoice**; the invoice owns the cost breakdown. Technician assignment happens **after** creation, on the job-order detail | **Superseded** (invoice-first, `BUSINESS_RULES.md` §3.3) |
| 2 | **Line items** | Job order has its own line-items table | Cost breakdown lives on the **invoice**; the job order reads it and carries `estimated_amount` / `actual_amount` | **Superseded** |
| 3 | **Billing types** | CNG Installment / Post-Service / Upfront | `upfront` / `instalmental` / `post-service` on the **invoice** (any plan, any service) | **Superseded** (0015) |
| 4 | **Currency** | `$` throughout §9 | ₦ (naira), `formatNaira` everywhere | **Superseded** |
| 5 | **Status model** | One status incl. `paid`, transitions `pending → in_progress → completed → paid` | Split into `execution_status` + `financial_status` (0008); `paid` is financial, not execution | **Superseded** |
| 6 | **Technician scope** | Technicians see **only jobs assigned to them** | Vehicle lens: search a vehicle, see **all** its job orders, non-financial only (`job_orders_tech_view`, 0009) | **Superseded** (`BUSINESS_RULES.md` §5) |
| 7 | **Job card content** | Company header, complaint, **estimated amount**, line-item totals, assigned technician, signature lines | Owner + phone, vehicle, work-item **descriptions only** (no money), parts/labour split, **QR code**; no technician, no signatures | **Decision needed** — no-money rule is deliberate; signatures were never discussed |
| 8 | **Receipt medium** | 80 mm thermal **or** A4 | A4 only (`@page` size A4) | **Superseded** (Phase 2 D2) |
| 9 | **Payment location** | Record Payment and the **payment history table** live on the job-order detail | Payments record against the **invoice**; the invoice detail shows the payment history and receipts, and the job-order detail links to its invoice | **Superseded** (money stays on the invoice) |
| 10 | **Job-order list filters** | Status, **date range**, **technician** | Status + payment chips only | **Not built** — date range and technician filters missing |
| 11 | **Payment > remaining** | Refuse | Refused in `payment-actions.ts` | ✅ **Matches** |
| 12 | **Auto `paid` status** | When paid ≥ due, auto-update the job order to `paid` | `set_financial_status_from_payments` (0010) derives `unpaid` / `part_paid` / `paid` on every payment insert; invoice state is also derived on read. A manual officer override is kept as defence-in-depth | ✅ **Matches** — but `BUSINESS_RULES.md` §3.2/§8.2 still describe it as manual/OPEN (**docs stale, fix**) |
| 13 | **Post-service / upfront rules** | Post-service: no payment until completed. Upfront: full payment before work starts | **Payments are never blocked (D7).** The only gate is **≥ 50% before a job order exists**, for all billing types | **Superseded** — owner decision D7 |
| 14 | **Vehicle service history** | Every job order auto-creates an entry; technicians add minor non-billable work; convertible to a job order | `service_history` table + RLS exist, **no app code uses it** | **Not built** — Phase 3, Track B (B1) |
| 15 | **Dashboard** | Revenue today, outstanding, active jobs, overdue, 30-day chart, recent orders, overdue accounts | `/dashboard` is a placeholder (admin/manager only) | **Not built** — A1; **overdue card dropped (D1)** |
| 16 | **Overdue / monthly reports** | Overdue alerts, monthly PDF, automated email on the 1st | None | **Overdue dropped (D1)**; monthly report → **A2** (print route, D2), email → B2 |
| 17 | **Email notifications** | Templates for job order created, payment received, monthly report | No email provider wired | **Not built** — B2; **best-effort, never blocks (D3)** |
| 18 | **Offline technician app** | PWA, cache assigned jobs, queue status updates offline, sync indicator | Responsive web vehicle lens; no PWA, no offline queue | **Deferred (D4)** — will be built later |
| 19 | **Audit log viewer** | Admin/manager can view audit logs | Audit rows are written (`logAudit`); no viewer | **Not built** — Phase 3, Track A |
| 20 | **User management** | Admin-only user management | Profiles exist; no management screen | **Not built** — Phase 3, Track A |
| 21 | **Receipt reprint** | PRD puts it in Phase 3 | Delivered in our **Phase 2** | ✅ **Ahead of PRD** |
| 22 | **Job-log timeline** | PRD puts it in Phase 2 | Delivered in our **Phase 2** (merged with officer changes) | ✅ **Ahead of PRD** |
| 23 | **Complaint** | Required textarea | Optional "Work requested" (0016) | **Superseded** |

---

## Phase 3 — remaining work 🔜

**Scoped; D1–D7 answered, implementation not started.** Full slice specs,
decisions, file lists and acceptance criteria live in
**[`PHASE3_PLAN.md`](./PHASE3_PLAN.md)**. This section is the summary; the plan
is the working document.

**Decision gates.** Ten owner decisions shape the build. **D1–D7 are answered**
(2026-10-23); **D8–D10 are still open**. They are listed in the plan — a slice
does not ship on a guessed rule.

**Deferred by decision, not forgotten:** overdue reporting (D1), the walk-in
parts sale (D5) and the technician PWA (D4) are all explicitly *later*. The
`instalmental` billing type will grow a payment schedule in its own pass.

**PRD coverage.** Every deliverable in PRD §11 is mapped to a slice — or marked
dropped — in the plan's coverage table, so nothing in the source document is
orphaned.

Grouped into three independent tracks. Slice IDs match `PHASE3_PLAN.md`.

### Track A — Management visibility

- **A1 — Dashboard** — revenue today, outstanding balance, active jobs, 30-day
  chart, recent job orders. No overdue card (D1).
- **A2 — Monthly report** — totals, revenue by category/billing type, technician
  productivity; print route + browser "Save as PDF" (D2); optional scheduled
  email via B2.
- **A3 — Audit log viewer** — admin/manager read of `audit_logs`, filterable.
  RLS already permits it.
- **A4 — User management** — admin-only invite/disable/role change. Needs the
  admin API and **D9** (open).

### Track B — Workshop floor

- **B1 — Vehicle service history** — auto-entry on job-order creation,
  technician minor work, chronological history, convert via an invoice. Table
  and RLS already exist; no app code uses them.
- **B2 — Email notifications** — job order created, payment received, monthly
  report. **Best-effort only (D3): never rolls back an action.**
- **B3 — Technician PWA / offline** — **deferred (D4): will be built, later.**
  The responsive lens remains the mobile answer until then.

### Track C — Sales + hardening

- **C1 — Walk-in parts sale** — **deferred (D5)**. Shape fixed: customer
  required, vehicle nullable, category↔billing-type relationship to design,
  sales invoices can never raise a job order.
- **C2 — Server-action error contract** — expected failures return
  `{ ok: false, error }`; only unexpected faults throw. Convert the remaining
  actions; keep flow checks on the **production build**.
- **C3 — Payments require proof** — **required (D6)**: a photo **or** a
  receipt/reference number, plus an optional note. Needs storage + RLS.
- **C4 — Job-order list filters** — date range and technician (PRD §8.2).
- **C5 — Payment gating** — **closed by D7**: payments are never blocked, for
  any billing type; the ≥ 50% minimum before job-order creation stays. Work is
  documentation only.
- **C6 — Job-card signatures** — Technician / Customer / Reception (**D8**,
  open).
- **C7 — Open model/access items** — role matrix (**D9**, open), invoice
  draft/issued (**D10**, open), dead `job_order_items` table, PRD into `docs/`,
  VIN, and `BUSINESS_RULES.md` accuracy (including D7).

---

## Definition of done (all phases)

- `scripts/rls-test-suite.mjs` exits 0 (currently 56/57, T17 tracked).
- `scripts/invoice-flow-check.mjs`, `scripts/job-order-flow-check.mjs`,
  `scripts/job-card-check.mjs`, `scripts/dark-mode-check.mjs` pass against a
  **production build** and clean up after themselves.
- `BUSINESS_RULES.md` matches what the database enforces, and every row in the
  drift register above is either **Superseded** (with a citation) or **built**.
- `npm run build` and `npx tsc --noEmit` are clean.
