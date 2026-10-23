# Phase 1 — to do

Working list. Tick things off as they land; keep the reasons short.

> **All phases, in one place:** see [`PHASES.md`](./PHASES.md) for the phase
> index (what each phase delivered, what it left open, and the Phase 3 scope).
> This file stays the detailed working list.

- [x] **Custom error pages** — 404 (`not-found`), 500 / render errors (`error`, `global-error`) in the same framed-sheet style as the rest of the app, with root and `(dashboard)` variants so the shell survives inside the dashboard.
- [x] **Invoice detail page** — creating an invoice now sends the user to `/invoices/[id]`, which is the hub: record a payment, or raise the job order (button disabled until 50% of the invoice is paid — guarded in the UI *and* in the action).
- [x] **Money formatting** — every monetary figure rendered with thousands separators and ₦ (lib/money.ts `formatNaira`), on the form, the list and the detail page.
- [x] **`Add line` placement** — sits in its own row after the last cost line, not in the section header.
- [x] **Job order creation based on invoice** — `createJobOrderFromInvoice` assigns the `JO-YYYY-NNNN` number, copies customer/vehicle/complaint, stamps `invoices.job_order_id`, and writes an audit entry.
- [x] **`/invoices` is the list** — the root lists invoices (customer, vehicle, total, paid, status) with a *New invoice* button; `/invoices/new` holds the creation form; every row opens `/invoices/[id]`.

- [x] **`/customers`** — list of accounts with search by name or phone; each row opens the customer detail page.
- [x] **`/customers/[id]`** — inline-editable details card (no `/edit` route) plus a small vehicles card that links into each vehicle.
- [x] **Add a vehicle to an existing customer** — the vehicles card has an *Add vehicle* dialog that creates only the vehicle (customer fixed by the page); the invoice form offers the same button once a customer is picked, then auto-selects the new vehicle. Duplicate plates are explained instead of swallowed.
- [x] **`/vehicles`** — search-first: nothing is listed until a query arrives; search covers owner name, plate, VIN, make and model.
- [x] **`/vehicles/[id]`** — small owner card (hops to the customer) plus inline-editable vehicle details.

## Needs your hands — Supabase SQL editor

- [x] **`0012_invoice_drop_technician.sql`** — pasted; `invoices.technician_id` is gone.
- [x] **`0013_invoice_list_detail.sql`** — pasted; invoice-only payments, invoices under RLS, leaked job_orders SELECT dropped.
- [x] Paste **`0014_rebuild_job_order_policies.sql`** — applied; raising a job order from an invoice works again.

## Carried over / open

- **VIN** — `vehicles.vin` already exists (0001) and is searched/edited today; decide whether to surface it on the invoice form and in the vehicle cards.
- `job_orders_tech_view` verified after 0014: technicians still see every job's execution fields and still get zero rows (and zero updates) on `job_orders` itself.
- Repair `scripts/rls-test-suite.mjs` — **done**, and extended. The suite is green at **56/57** (T17 remains the one tracked API-layer anomaly), up from 54/55. Added admin receipt-immutability cases (A03/A03b): receipts are append-only for admin too, so admin's blanket access is not a back door.
- Role/privilege matrix redefinition (BUSINESS_RULES §8) — OPEN.
- Invoice state machine: draft/issued — OPEN (schema has no `status` column today).
- Receipts: one per payment, reprint must not duplicate (Phase 2) — **done**, see the Phase 2 section.

## Phase 2 — job orders and receipts

- [x] **`/job-orders` is a real list** — search over job number, complaint, customer name, plate, make and model; status + payment filter chips; rows open `/job-orders/[id]`.
- [x] **`/job-orders/[id]` hub** — job facts (inline-editable by officers, incl. `actual_amount` / `actual_date_out`), officer status control (cancelled is terminal), assignment control, merged work timeline (job logs + officer status changes + the "raised" moment), money summary, print button.
- [x] **Officer actions** — `updateJobOrderExecutionStatus`, `assignJobOrder`, `updateJobOrder`; all officers-only and audited; officer status moves are audited, never written as job-log rows.
- [x] **Job card** — the sheet printed and left inside the vehicle. Carries owner name + phone, vehicle details, the invoice's work-item **descriptions only**, and a QR code that decodes to this job order's absolute URL. **No money, no timeline, no technician commentary.** Rendered on the job order detail page, hidden on screen and revealed by `@media print`, so printing needs no extra navigation; prints alone on A4.
- [x] **`scripts/job-card-check.mjs`** — 32 checks: content, the absence of money/internals, QR decode, emulated print media (card revealed; screen UI, sidebar and header hidden), print CSS (`@page` A4, shell hidden, card unframed), and no 390px overflow.
- [x] **Receipts (slice 4)** — every payment auto-issues a receipt inside `recordPayment` (gapless `RCP-YYYY-NNNN`, one *original* per payment enforced by the 0015 index). The invoice's payments list shows each receipt's number as a link plus a *Reprint* control; `reprintReceipt` writes a new row flagged `is_duplicate` pointing at the original, never chaining. `app/actions/receipt-actions.ts`; `app/(dashboard)/invoices/[id]/reprint-receipt-button.tsx`.
- [x] **Receipt sheet (slice 5)** — `/receipts/[id]` renders an A4 receipt (workshop, customer, vehicle, invoice, amount, method, reference, invoice total / paid / balance, duplicate watermark when reprinted, signature line). Hidden on screen, revealed by `@media print` — same one-button, no-navigation idiom as the job card. `app/(dashboard)/receipts/[id]/`.
- [x] **`billing_type` moved to the invoice (code)** — see the DONE entry below; vocabulary centralised in `lib/invoice-vocabulary.ts`.
- [x] **Invoice category wired** — set on the form, shown on the list and detail header.
- [x] **`scripts/job-order-flow-check.mjs` (slice 6)** — 53 checks driving the whole Phase 2 surface end to end: list search (job number, complaint) + filter chips, row → detail, officer status change (persisted + audited with `source=officer` + `from`/`to`, and *not* a job-log row), the merged timeline's officer entry, technician assignment (persisted + audited), recording a payment **through the invoice form** so the receipt is genuinely issued by `recordPayment`, the original receipt's number shape, the A4 receipt sheet (carries money, hidden on screen), reprint → a duplicate with its own number pointing at the original, anon cannot UPDATE a receipt, and print media revealing the card with no money. Every DB assertion waits for the *effect* (`waitFor`) rather than sleeping a fixed time, and there is no 390px horizontal overflow on any page it visits.

### Print CSS gotchas (each cost us a silent bug)

1. `@page` must live **outside** `@layer base`. Tailwind v4's parser cannot handle `@page` nested inside `@media print` inside `@layer`, and drops the `@page` rule **and every rule that follows it in the same block** — which silently removed the `.job-card` unframing. The `@media print` rules stay inside `@layer base` (a bare top-level `@media print` is dropped entirely), but `@page` sits at the top level.
2. Do **not** put `display: block !important` on the print rules for `body > div, main`. The card is hidden on screen with `hidden print:block` and the screen UI with `print:hidden`; a global `!important` display override beats those utilities (they are not `!important`) and prints the whole page behind the card. The unframing only needs border/padding/margin/overflow.

### Open in Phase 2

- **`supabase/migrations/0015_receipts_and_invoice_fields.sql` — APPLIED and verified 2026-10-21.** Receipts usable by invoice-first payments, `billing_type` moved to invoices, invoice `category`. Verified against the live project: backfill preserved every existing value (`post_service`/`upfront` inherited, 1 defaulted to `upfront`); `job_orders.billing_type` is gone; one original receipt per payment is enforced (409/23505); a duplicate without an original is refused (403/42501); and receipts are append-only for admin, manager *and* reception.

  Two testing traps, recorded because both produced a wrong answer first:
  1. Testing these policies with the **service-role key proves nothing** — it bypasses RLS, so every policy looks missing. Use a real user token.
  2. PostgREST returns **200 with an empty array** when RLS filters every row, so a status code cannot distinguish "denied" from "no-op". Read the row back and compare.

  A third trap, found while building `job-order-flow-check.mjs`: **a PostgREST filter value
  containing a dot is parsed as a separator.** `action=eq.job_order.execution_status_changed`
  combined with another `eq=` filter silently matched the wrong rows and reported "0 audit
  rows" for an audit row that existed. Filter on one documented column (`entity_id`) and match
  the dotted value in JS.

## Model corrections — raised 2026-10-21

These came out of reviewing the job card. Each is a data-model or flow question, not a
cosmetic one, so they get written down before the next slice rather than folded in
silently. Ordered by how much they block.

- **A complaint is not mandatory.** `invoices.complaint` is `NOT NULL` (0010), and both the
  invoice form and the job card treat "complaint" as the thing the customer reported.
  But plenty of jobs have nothing wrong with them — a car arrives healthy for a CNG
  installation. A mandatory complaint forces staff to invent one. Decide what the field
  means (a *request* / reason the vehicle is here, covering both fault and fitment), make
  it optional, and relabel it on the invoice form, the job card and the job facts card.
  Needs a migration to drop `NOT NULL`.

- **`billing_type` belongs on the invoice, not the job order — DONE (0015 + code).** 0015 adds
  `invoices.billing_type` (NOT NULL, default `upfront`), backfills from the linked job order
  (`cng_installment` → `instalmental`), then drops `job_orders.billing_type`. The agreed
  vocabulary is **upfront**, **instalmental**, **post-service**, and *any* plan may apply to
  *any* service — the old name implied CNG-only. The vocabulary now lives in one module,
  `lib/invoice-vocabulary.ts` (`BILLING_TYPES`, `BILLING_OPTIONS`, `billingLabel`), the way
  `status-pill.tsx` holds the execution-status vocabulary; the three copy-pasted `BILLING_LABEL`
  maps are gone. The invoice form sets it; the job order reads it through its invoice and shows
  it read-only on `job-facts.tsx`, the card and the job-orders list (via the embedded
  `invoices(billing_type)`). Removed from `job-order-actions.ts` (create + update),
  `job-order-panel.tsx` and the list's row type. The technician view (`0009`) never exposed
  `billing_type`, so nothing changed there.

- **Invoices need a category — DONE (0015 + code).** `invoices.category` (NOT NULL, default
  `maintenance`, CHECK `sales | maintenance | cng`) plus an index. Set on the invoice form,
  shown on the invoice list and detail header, and selectable from `CATEGORY_OPTIONS` /
  `CATEGORY_STYLES` in `lib/invoice-vocabulary.ts`. **Still deferred on purpose:** a true
  walk-in parts sale is impossible, because `invoices.customer_id` and `invoices.vehicle_id`
  remain `NOT NULL` — selling a part to a passer-by needs a nullable vehicle and inline
  name/phone capture, which is a UI change of its own. Settle that before building a report
  that assumes the `sales` category can be populated freely.

- **Print the job card from the job order detail page — DONE.** The separate
  `/job-orders/[id]/card` route is gone. The card is now a presentational component
  (`job-card.tsx`) rendered on the detail page inside `hidden print:block`, so the print
  button is a bare `window.print()` with no navigation. `scripts/job-card-check.mjs` drives
  the new flow and emulates print media (`Emulation.setEmulatedMedia`) to prove the card is
  revealed and the screen UI, sidebar and header are all hidden — 32 checks.

  Two traps found while doing it, both now fixed and commented in place:
  - The global print rule `body > div, main { display: block !important }` would have
    overridden the wrapper's `print:hidden` and printed the whole page behind the card.
    The `display` override was dropped; the unframing only needed border/padding/margin.
  - `scripts/rls-test-suite.mjs` R01 asserted an exact payment count (`length === 1`), so
    any other test that recorded a payment turned it red. Loosened to `> 0` — same fix
    already applied to R02 and M01.

- **Payments should require proof before they can be recorded.** Uploads (photo of a
  transfer receipt, a slip, a signed note). Deliberately deferred — it needs storage
  buckets, upload validation, a viewing surface and an RLS story — but it must not be
  forgotten. Decide whether proof is *required* to save a payment or merely *encouraged*,
  because "required" changes `recordPayment`'s signature and every caller.

- **Expected failures must not `throw` across the server-action boundary.** Found while
  fixing the duplicate-plate check (2026-10-23). `createVehicleForCustomer` threw a plain
  `Error` for the `23505` duplicate plate; the client `try/catch` around the `await` looked
  right and worked in `next dev`, but in a **production build** React surfaced it as
  *"Minified React error #441 — an error occurred in the Server Components render"* and the
  page's error boundary swallowed it instead of the dialog. The catch block was real; the
  throw simply happened on a different layer (a render pass, not the caller's stack), so it
  never reached it. The dev server hides this, which is why it cost so much time.

  **Fixed for this action only** — it now returns a discriminated result
  (`{ ok: true; vehicle } | { ok: false; error }`), and the dialog renders `result.error`
  into its `[role="alert"]`. Everything else still throws.

  **The rule to adopt, and the work to do later:** *expected, user-recoverable problems
  return `{ ok: false, error }`; only genuinely unexpected faults throw.* Audit the remaining
  server actions (`updateCustomer`, `updateVehicle`, `invoice-actions.ts`,
  `job-order-actions.ts`, `receipt-actions.ts`) for `throw`-and-`catch` validation patterns
  with the same latent production-only failure, and convert them. Two follow-ons worth doing
  in the same pass: keep the flow-check suite running against `npm run build && npm run start`
  (dev-only testing would not have caught this), and consider whether the error boundary
  should distinguish an expected validation failure from a real 500.

- **`actual_amount` never lives on the invoice — recorded deviation from Phase 2 D4.** Phase 2
  D4 said the invoice would carry an `actual_amount`; it does not, and none will be added. The
  invoice→job-order hand-off sets the job order's `estimated_amount` to the invoice
  `total_amount` and leaves `actual_amount` null; the real figure is settled later by an
  officer via `updateJobOrder`. Recorded in `BUSINESS_RULES.md` §3.3 so the invoice is not
  mistaken for an actual-cost store.

- **Cost-breakdown lines are not all "work to be done" — DONE.** A line was already typed
  `labor | part` (`invoice-actions.ts`, `invoice-form.tsx`, the invoice detail page), but the
  job card flattened both into one "Work to be done" list, so a part read as a task. The card
  now renders **Parts** (items fitted/replaced) and **Work to be done** (labour) as separate
  sections, in that order, via a shared `WorkItemList` helper. A line with no recorded
  `itemType` falls to labour — the old card's reading — because defaulting an unknown line to
  "part" would tell a technician to fit something that may not exist.
  `scripts/job-card-check.mjs` gained 6 assertions (38 total) pinning the split, read from the
  DOM rather than `innerText` (the card is `hidden print:block`, so `innerText` collapses the
  whole sheet to one line on screen).

- **Print must render light even on a dark screen — DONE (dark mode).** The print token
  overrides lost to the `.dark` block. The cause was **cascade layers, not specificity**:
  Tailwind hoists `@layer base` to the top of the bundle, and the real `.dark` block is emitted
  in a later layer, so a more specific selector in an earlier layer still lost. Selector tricks
  could not win *and* did not survive minification (Lightning CSS collapses `:root:root.dark`
  to `.dark`). Fixed by writing `data-theme` alongside the class in `theme-provider.tsx` and
  targeting `html[data-theme="dark"]` in print with `!important` on the token declarations —
  the one thing layer order cannot override. `scripts/dark-mode-check.mjs` is now **33/33**.

- **Flow-check housekeeping is one module — DONE (slice 6).** `scripts/lib/flow-cleanup.mjs`
  holds the child-first delete order (receipts → payments → invoices → job orders → service
  history → job logs → vehicles → customer → audit) and the `KEEP_TEST_DATA` / `--purge`
  behaviour, shared by all three flow checks. It fixes two latent leaks the two older copies
  had: `job-card-check.mjs` deleted invoices by id and skipped receipts entirely;
  `invoice-flow-check.mjs` never deleted `job_logs`.

## Phase 3 — working list (from PRD alignment, 2026-10-23)

The phase index and the full drift register live in [`PHASES.md`](./PHASES.md).
The detailed slice specs, owner decisions (D1–D10), file lists and acceptance
criteria live in [`PHASE3_PLAN.md`](./PHASE3_PLAN.md). This is the actionable
checklist; each item names what already exists so nobody rebuilds it.

**Decision status (2026-10-23):** D1–D7 answered; **D8–D10 still open**. Read the
plan's decision table before starting a slice.

### Track A — management visibility

- [ ] **A1 — Dashboard** — revenue today, outstanding, active jobs; 30-day revenue chart;
  recent job orders. `/dashboard` is currently a placeholder (admin/manager only). **No overdue
  card (D1).**
- [ ] **A2 — Monthly report** — totals (job orders, revenue, collected, outstanding), revenue by
  category/billing type, technician productivity. **Print route (D2)**, no PDF library. Optional
  scheduled email via B2. **No overdue section (D1).**
- [ ] **A3 — Audit log viewer** — admin/manager read of `audit_logs`, filterable by entity,
  action, actor and date. Rows are already written by `logAudit()` and immutable.
- [ ] **A4 — User management** — admin-only invite/disable/role change. Depends on **D9**.

### Track B — workshop floor

- [ ] **B1 — Vehicle service history** — `service_history` table + RLS exist but **no app code
  uses it**. Auto-create an entry when a job order is raised; technicians add minor non-billable
  work; chronological per vehicle; convert a minor item into a job order (via an invoice).
- [ ] **B2 — Email notifications** — job order created, payment received, monthly report.
  **Best-effort only (D3): never roll back an action.** Provider chosen when the slice starts.
  PRD §9 uses `$`; the build uses ₦.
- [ ] **B3 — Technician PWA / offline** — **deferred (D4): will be built later.** Responsive
  vehicle lens remains the mobile answer until then; do not ship a half-built sync queue.

### Track C — sales + hardening

- [ ] **C1 — Walk-in parts sale** — **deferred (D5), shape fixed:** customer required, vehicle
  nullable, category↔billing-type relationship and sales form UI to be designed, and a `sales`
  invoice can **never** raise a job order. Ripples through invoice rendering, search and the
  job-order raise.
- [ ] **C2 — Server-action error contract** — the general fix from the duplicate-plate bug (see
  the entry above). Convert the remaining actions; keep flow checks on the production build.
- [ ] **C3 — Payments require proof** — **required (D6)**: a photo **or** a receipt/reference
  number, plus an optional note. Needs storage + RLS; upload-only would block counter practice.
- [ ] **C4 — Job-order list filters** — PRD §8.2 also asks for **date range** and
  **technician**; today the list filters on status + payment only.
- [ ] **C5 — Payment gating — closed by D7.** Payments are **never blocked**, for any billing
  type including post-service. The **≥ 50% minimum before job-order creation** stays. Work is
  documentation only (`BUSINESS_RULES.md`), not new gates.
- [ ] **C6 — Job card: signature lines** — Technician / Customer / Reception. **D8 open.**
- [ ] **C7 — Open model/access items** — role matrix (**D9 open**); invoice draft/issued
  (**D10 open**); drop or document the dead `job_order_items` table; PRD v1.0 into `docs/`
  (§8.4); VIN on the invoice form and vehicle cards; fix `BUSINESS_RULES.md` accuracy
  (`financial_status` *is* derived by trigger 0010; payments are never blocked; the ≥ 50% rule
  is the single job-order gate).


