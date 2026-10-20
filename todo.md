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
- [x] **`/vehicles`** — search-first: nothing is listed until a query arrives; search covers owner name, plate, VIN, make and model.
- [x] **`/vehicles/[id]`** — small owner card (hops to the customer) plus inline-editable vehicle details.

## Needs your hands — Supabase SQL editor

- [x] **`0012_invoice_drop_technician.sql`** — pasted; `invoices.technician_id` is gone.
- [x] **`0013_invoice_list_detail.sql`** — pasted; invoice-only payments, invoices under RLS, leaked job_orders SELECT dropped.
- [ ] Paste **`0014_rebuild_job_order_policies.sql`** — until then raising a job order from an invoice fails with `new row violates row-level security policy for table "job_orders"` (the earlier paste left the table with no INSERT policy at all).

## Carried over / open

- **VIN** — `vehicles.vin` already exists (0001) and is searched/edited today; decide whether to surface it on the invoice form and in the vehicle cards.
- Adding a vehicle to an *existing* customer has no UI yet (`NewCustomerDialog` always creates a customer too).
- `job_orders_tech_view` verified after 0014: technicians still see every job's execution fields and still get zero rows (and zero updates) on `job_orders` itself.
- Repair `scripts/rls-test-suite.mjs` and get it green (0010 on disk matches the applied columns).
- Role/privilege matrix redefinition (BUSINESS_RULES §8) — OPEN.
- Invoice state machine: draft/issued — OPEN (schema has no `status` column today).
- Receipts: one per payment, reprint must not duplicate (Phase 2).
