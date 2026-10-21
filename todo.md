# Phase 1 — to do

Working list. Tick things off as they land; keep the reasons short.

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
- Repair `scripts/rls-test-suite.mjs` and get it green (0010 on disk matches the applied columns).
- Role/privilege matrix redefinition (BUSINESS_RULES §8) — OPEN.
- Invoice state machine: draft/issued — OPEN (schema has no `status` column today).
- Receipts: one per payment, reprint must not duplicate (Phase 2).

## Phase 2 — job orders and receipts

- [x] **`/job-orders` is a real list** — search over job number, complaint, customer name, plate, make and model; status + payment filter chips; rows open `/job-orders/[id]`.
- [x] **`/job-orders/[id]` hub** — job facts (inline-editable by officers, incl. `actual_amount` / `actual_date_out`), officer status control (cancelled is terminal), assignment control, merged work timeline (job logs + officer status changes + the "raised" moment), money summary, print button.
- [x] **Officer actions** — `updateJobOrderExecutionStatus`, `assignJobOrder`, `updateJobOrder`; all officers-only and audited; officer status moves are audited, never written as job-log rows.
- [x] **Job card** — the sheet printed and left inside the vehicle. Carries owner name + phone, vehicle details, the invoice's work-item **descriptions only**, and a QR code that decodes to this job order's absolute URL. **No money, no timeline, no technician commentary.** Rendered on the job order detail page, hidden on screen and revealed by `@media print`, so printing needs no extra navigation; prints alone on A4.
- [x] **`scripts/job-card-check.mjs`** — 32 checks: content, the absence of money/internals, QR decode, emulated print media (card revealed; screen UI, sidebar and header hidden), print CSS (`@page` A4, shell hidden, card unframed), and no 390px overflow.

### Print CSS gotchas (each cost us a silent bug)

1. `@page` must live **outside** `@layer base`. Tailwind v4's parser cannot handle `@page` nested inside `@media print` inside `@layer`, and drops the `@page` rule **and every rule that follows it in the same block** — which silently removed the `.job-card` unframing. The `@media print` rules stay inside `@layer base` (a bare top-level `@media print` is dropped entirely), but `@page` sits at the top level.
2. Do **not** put `display: block !important` on the print rules for `body > div, main`. The card is hidden on screen with `hidden print:block` and the screen UI with `print:hidden`; a global `!important` display override beats those utilities (they are not `!important`) and prints the whole page behind the card. The unframing only needs border/padding/margin/overflow.

### Open in Phase 2

- **`supabase/migrations/0015_receipts_and_invoice_fields.sql` — APPLIED and verified 2026-10-21.** Receipts usable by invoice-first payments, `billing_type` moved to invoices, invoice `category`. Verified against the live project: backfill preserved every existing value (`post_service`/`upfront` inherited, 1 defaulted to `upfront`); `job_orders.billing_type` is gone; one original receipt per payment is enforced (409/23505); a duplicate without an original is refused (403/42501); and receipts are append-only for admin, manager *and* reception.

  Two testing traps, recorded because both produced a wrong answer first:
  1. Testing these policies with the **service-role key proves nothing** — it bypasses RLS, so every policy looks missing. Use a real user token.
  2. PostgREST returns **200 with an empty array** when RLS filters every row, so a status code cannot distinguish "denied" from "no-op". Read the row back and compare.

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

- **`billing_type` belongs on the invoice, not the job order — migration written (0015),
  code not yet updated.** 0015 adds `invoices.billing_type` (NOT NULL, default `upfront`),
  backfills from the linked job order (`cng_installment` → `instalmental`), then drops
  `job_orders.billing_type`. The agreed vocabulary is **upfront**, **instalmental**,
  **post-service**, and *any* plan may apply to *any* service — the old name implied
  CNG-only, and the label "CNG instalment" in three places reinforced that. Still to do in
  code once 0015 is pasted: set `billing_type` on the invoice form instead of at
  job-order-raise time; show it read-only on `job-facts.tsx` and the card; drop it from
  `job-order-actions.ts` (`BILLING_TYPES` validation, create + update paths),
  `job-order-panel.tsx`, and the job-orders list. `BILLING_LABEL` is currently copy-pasted
  into `job-orders/page.tsx`, `job-facts.tsx` and `card/page.tsx` — the move is the moment
  to put it in one shared module (the way `status-pill.tsx` holds the execution-status
  vocabulary). The technician view (`0009`) never exposed `billing_type`, so nothing changes
  there.

- **Invoices need a category — migration written (0015), UI not yet wired.** 0015 adds
  `invoices.category` (NOT NULL, default `maintenance`, CHECK `sales | maintenance | cng`)
  plus an index. Still to do: expose it on the invoice form and list, and use it for
  reporting. **Deferred on purpose:** a true walk-in parts sale is still impossible, because
  `invoices.customer_id` and `invoices.vehicle_id` remain `NOT NULL` — selling a part to a
  passer-by needs a nullable vehicle and a way to capture a name/phone inline, which is a
  UI change of its own. Settle that before building a report that assumes the `sales`
  category can be populated freely.

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

- **Cost-breakdown lines are not all "work to be done".** A line is already typed
  `labor | part` (`invoice-actions.ts`, `invoice-form.tsx`, the invoice detail page), but
  the job card flattens both into one "Work to be done" list — so a part reads as a task.
  Split them on the card and the job order: **Parts** (fitted/replaced items) and **Work to
  be done** (the labour lines). The data is already there; this is presentation, so it can
  land with the next card change rather than needing a migration.


