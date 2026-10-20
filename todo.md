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
- [x] **Job card** (`/job-orders/[id]/card`) — the sheet printed and left inside the vehicle. Carries owner name + phone, vehicle details, the invoice's work-item **descriptions only**, and a QR code that decodes to this job order's absolute URL. **No money, no timeline, no technician commentary.** Prints alone on A4 (the app shell is hidden and `.job-card` is unframed).
- [x] **`scripts/job-card-check.mjs`** — 22 checks: content, the absence of money/internals, QR decode, print CSS (`@page` A4, shell hidden, card unframed), and no 390px overflow.

### Print CSS gotcha (cost us a silent bug)

`@page` must live **outside** `@layer base`. Tailwind v4's parser cannot handle `@page` nested inside `@media print` inside `@layer`, and drops the `@page` rule **and every rule that follows it in the same block** — which silently removed the `.job-card` unframing. The `@media print` rules stay inside `@layer base` (a bare top-level `@media print` is dropped entirely), but `@page` sits at the top level.

### Open in Phase 2

- Receipts (slice 4): `supabase/migrations/0015_receipts.sql` needs pasting — `receipts.job_order_id` is `NOT NULL` today and there is no `receipts.invoice_id`, so invoice-first payments cannot have receipts yet.

