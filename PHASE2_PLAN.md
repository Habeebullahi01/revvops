# Phase 2 — implementation plan

**Scope (agreed 2026-10-20):** the job-order module and receipts.

Phase 1 shipped the money-in path: invoice → payments → job order raised from
an invoice. Phase 2 ships what happens to that job order afterwards, and the
paper the customer walks away with:

1. **Job orders** — a real list at `/job-orders` and a detail page at
   `/job-orders/[id]`: assignment, execution status, the work timeline, and a
   job card that prints.
2. **Receipts** — a receipt is issued automatically with every payment
   (`RCP-YYYY-NNNN`), prints on a plain A4 sheet from the browser, and can be
   reprinted as a marked duplicate.

Explicitly **not** in Phase 2: dashboard KPIs and reports (Phase 3), the
role/privilege matrix redefinition, invoice draft/issued states, and the
technician-facing job-order detail (the vehicle lens keeps its current shape).

---

## What already exists (don't rebuild it)

| Piece                                                             | State                                                                                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `receipts`, `document_sequences`, `get_next_document_number`      | Schema + RPC shipped in `0001`/`0002`/`0004`; `receipt` is an allowed counter type and RLS exists for all four roles. **No application code touches receipts today.**     |
| `job_orders` columns                                              | `job_number`, `billing_type`, `execution_status`, `financial_status`, `assigned_technician_id`, `date_in`, `expected_date_out`, `actual_date_out`, `notes` — all present. |
| `job_logs` + `sync_job_order_status_from_log`                     | Technicians post logs; the trigger enforces the transition map and syncs `job_orders.execution_status`.                                                                   |
| `createJobOrderFromInvoice`                                       | Raises a job order from a ≥ 50% paid invoice, stamps `invoices.job_order_id`, audits.                                                                                     |
| `logExecutionStatus`, `job_orders_tech_view`, `/technician`       | The technician lens works and must keep working untouched.                                                                                                                |
| Money, pills, inline-edit card, search sanitising, audit, dialogs | Shared building blocks from Phase 1.                                                                                                                                      |

The gaps are: no job-order routes beyond a stub page, no officer edit path
after creation, no timeline UI, no receipts at all, no `actual_amount`
editing (invoices never fill it), and `/api/jobs` leaks financial columns to
any signed-in caller.

---

## Decisions taken

| #   | Decision                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | A receipt is issued **automatically** inside `recordPayment`, in the same request. A payment without a receipt is a bug, not a state.                                                                         |
| D2  | Receipts print as a **single A4 sheet** via the browser's print dialog (`window.print()`), not a thermal roll.                                                                                                |
| D3  | Reprint means **issue a duplicate**: a new row with its own `RCP-YYYY-NNNN` number and `is_duplicate = true`, pointing at `original_receipt_id`. Nothing is ever updated or deleted.                          |
| D4  | Missing finance fields are fixed **at creation first** (invoice form gains `actual_amount`); editing existing job orders ships in the same phase as a follow-on step, since mis-keyed amounts are inevitable. |

---

## Phase 2 slices

Each slice is independently shippable, leaves the tree green, and ends in a
commit. Slices 1–3 are the job-order module; 4–5 are receipts.

### Slice 1 — `/job-orders` becomes a real list

**Files:** `app/(dashboard)/job-orders/page.tsx` (rewrite), new
`components/status-pill.tsx`.

- Server component, `requireRole(["admin","manager","reception"])`,
  `export const instant = false` (matches `/invoices`).
- Columns: job number → detail, customer, vehicle (plate + make model),
  technician, date in, expected out, execution pill, financial pill, total.
- Search `?q=` over job number, customer name and plate — reuse
  `lib/search.ts` (`sanitizeQuery`, `likePattern`) exactly as the directories
  do, including the two-query merge (owner/vehicle join vs job number).
- Filters: execution status and financial status via `?status=` /
  `?payment=` (plain links, no client JS), plus a month filter on `date_in`.
- Header: the sheet-style title row with a `New invoice`-style secondary
  action **Raise job order** → links to `/invoices` (job orders come from
  invoices; there is no standalone creation form in Phase 2).
- Rows are `<Link>`s with the `after:absolute after:inset-0` first-cell
  pattern used by the invoice list.
- `components/status-pill.tsx`: extracts the tonal pill styling currently
  duplicated between the invoice list and `/technician`, and adds the
  execution-status vocabulary (`pending`, `in_progress`, `waiting_parts`,
  `completed`, `cancelled`). `FinancialPill` in `components/money.tsx`
  stays as-is for money.

### Slice 2 — `/job-orders/[id]` hub

**Files:** new `app/(dashboard)/job-orders/[id]/page.tsx`,
`.../status-control.tsx`, `.../assignment-control.tsx`, `.../job-timeline.tsx`,
`.../job-card.tsx`.

Layout follows the invoice detail page (sheet, facts, cards):

1. **Header** — `JO-2026-0007`, execution pill, financial pill, customer →
   `/customers/[id]`, vehicle → `/vehicles/[id]`, and a `Print job card`
   button.
2. **Job facts card** — complaint, billing type, date in, expected/actual
   date out, notes; created by / assigned technician.
3. **Execution status card** — an officer **select** (native `<select>` per
   house style) offering the legal targets; officers may jump straight to any
   of the five values, technicians remain restricted to the job-log path.
   Saved through a new server action; the change is audited.
4. **Assignment card** — reassign the technician. Reuses the existing
   lazy `/api/technicians` fetch pattern from `JobOrderPanel`, so no new
   route or eager query.
5. **Timeline** — `job_logs` for this job merged with status changes into one
   reverse-chronological list: who, what status, notes, timestamp.
6. **Money summary** — the invoice this job came from (`invoices.job_order_id`),
   its total, paid to date, balance, and a link back to the invoice. Read-only
   here; money keeps moving on the invoice (Phase 1 rule).
7. **Link** _Back to invoices_.

### Slice 3 — edit and settle an existing job order

**Files:** `app/actions/job-order-actions.ts` (extend), `.../[id]/job-facts.tsx`.

- New actions, all officers-only and audited:
  - `updateJobOrderExecutionStatus(id, status)` — validates against the
    seven-value enum; refuses to move a `cancelled` job.
  - `assignJobOrder(id, technicianId | null)` — validates that the profile is
    an active technician.
  - `updateJobOrder(id, { complaint, billingType, dateIn, expectedDateOut,
actualDateOut, actualAmount, notes })` — the officer correction path.
    Editing `actual_amount` keeps `financial_status` consistent through the
    existing trigger semantics, and the job detail shows amount vs paid.
- Small **Edit details** form on the detail page (same inline-edit idiom as
  the customer/vehicle cards, but a dialog, because there are eight fields).
- **Invoice form gains `actual_amount`** (optional) so the invoice →
  job-order hand-off can carry a settled figure instead of always copying the
  estimate; `createJobOrderFromInvoice` passes it through when present.
- Guard rail to document in `BUSINESS_RULES.md` §3.1: officers may set any
  execution status, but the job order may never be deleted while an invoice or
  payment points at it.

### Slice 4 — receipts issued with every payment

**Files:** new `supabase/migrations/0015_receipts.sql`,
`app/actions/payment-actions.ts` (extend), new `app/actions/receipt-actions.ts`,
`app/(dashboard)/invoices/[id]/page.tsx` (payments list),
new `app/(dashboard)/invoices/[id]/payments-list.tsx`.

- **Migration 0015 (pasted by you):**
  - `receipts.job_order_id` is `NOT NULL` today, but invoice-first payments may
    have no job order yet — make it **nullable** (same move as `payments` in
    `0013`), and add `receipts.invoice_id` so a receipt knows its invoice.
  - Keep receipts append-only: `SELECT` + `INSERT` for officers, no `UPDATE`
    and no `DELETE` policy for anyone. Tighten the existing
    `Admin/Manager can manage receipts` FOR ALL policy down to
    `SELECT`/`INSERT` (this also closes open item §8.3).
  - A `duplicate_of_issued` guard: a duplicate may only reference a receipt
    that is not itself a duplicate (CHECK or trigger), so duplicates never
    chain.
  - Verification SELECTs at the end, per house style.
- `recordPayment` gains a receipt step: after the payment insert succeeds,
  call `get_next_document_number('receipt')`, insert the receipt row, audit
  `receipt.issued`, and **return the receipt number** so the UI can confirm.
  If the receipt insert fails the whole action fails loudly — a payment with
  no receipt is not an acceptable end state (D1).
- The invoice detail payments card becomes a component listing each payment
  with method, reference, received-by, amount, and its receipt number plus
  _Print_ and _Reprint as duplicate_ actions.
- `issueDuplicateReceipt(paymentId)` in `receipt-actions.ts`: officers only;
  blocks duplicate-of-duplicate; audits `receipt.reprinted` with the original
  number in `details`. Reception keeps the 0003 restriction (`is_duplicate`
  insert blocked for that role) — the UI explains that only admin/manager may
  mark a duplicate.

### Slice 5 — the printed sheet

**Files:** new `app/(dashboard)/invoices/[id]/receipts/[receiptId]/page.tsx`,
`.../print-button.tsx`, plus `@media print` rules in `app/globals.css`.

- A receipt route renders the sheet: workshop header (name, address, phone),
  receipt number, date, customer and vehicle, the invoice it settles, the
  payment (amount, method, reference, received by), the invoice total and the
  balance after this payment, and a clear **DUPLICATE** banner when
  `is_duplicate`.
- Screen shows the sheet with print controls; `@media print` hides the app
  shell (sidebar, header, buttons) and prints the sheet alone on A4 at
  `@page { size: A4; margin: 14mm }`.
- Numbers are rendered with the existing `formatNaira` so the paper and the
  screen never disagree.
- A reprint is the same route with `?duplicate=1`, which triggers the duplicate
  issue and then renders the new number.

### Slice 6 — access rules, docs and the gate — DONE (2026-10-21)

**Files:** `supabase/migrations/0015_receipts.sql` (final form),
`scripts/rls-test-suite.mjs` (repair + extend), `BUSINESS_RULES.md`,
`todo.md`, README scripts table, new `scripts/job-order-flow-check.mjs`.

**Outcome.** The plan's red-suite premise was **stale**: slice 4–5 had already
fixed T13/T27/T28 and R03b, and the suite entered this slice green at 54/55.
So the repair work reduced to the receipts cases. The suite now exits at
**56/57** (T17 the one tracked anomaly).

- The hand-rolled policy checks the plan named (technician sees nothing on
  `job_orders`, execution-only view, receipts immutability) were already in the
  suite as T01/T13*–T14* and R04–R06b; nothing needed migrating. Reception's
  reprint right (R05b/M02) supersedes the plan's "reception may issue but not
  mark a duplicate" — the owner decision is that issue is **not** gated to
  reception and reprints are permitted; the RLS suite pins that instead.
- **Added** the genuine gap: admin receipt immutability (A03/A03b). Append-only
  holds for admin too, so a blanket-access role cannot edit or erase a money
  document.
- **`scripts/job-order-flow-check.mjs`** — 53 checks driving the whole Phase 2
  surface, cleaning up after itself. The shared cleanup was factored into
  **`scripts/lib/flow-cleanup.mjs`** and both older checks now use it.
- **`BUSINESS_RULES.md`** — §3.3 gained the `actual_amount`-not-on-invoices
  deviation from D4; §4 receipts note gained the admin cases; §8.3 closed;
  changelog entry added. **`todo.md`** and the README scripts table updated.

---

## Order, dependencies and estimate

| Slice                          | Depends on                                         | Rough size                      |
| ------------------------------ | -------------------------------------------------- | ------------------------------- |
| 1. Job-order list              | —                                                  | 1 session                       |
| 2. Job-order detail + timeline | 1                                                  | 1–2 sessions                    |
| 3. Edit / settle               | 2                                                  | 1 session                       |
| 4. Receipts on payment         | 3 (payment list lives on the invoice, independent) | 1 session + one migration paste |
| 5. Printed sheet               | 4                                                  | 1 session                       |
| 6. Suite, docs, flow gate      | 1–5                                                | 1–2 sessions                    |

Slices 1–3 and 4–5 are independent tracks: receipts can start while the
job-order detail page is still being polished, but both need slice 6 before
Phase 2 is called done.

---

## Risks and how the plan absorbs them

1. **`receipts.job_order_id NOT NULL` vs invoice-first payments.** Money can
   arrive before a job order exists (Phase 1), so a receipt may legitimately
   have no job order. Migration 0015 makes the column nullable **and** adds
   `invoice_id`; until 0015 is pasted, `recordPayment` cannot issue receipts —
   so slice 4 waits for your SQL editor paste. The plan keeps the migration
   first in that slice for exactly this reason.
2. **Two sources of execution status.** Officers write `job_orders` directly;
   technicians write `job_logs` and let the trigger sync. The officer control
   must not be confused with a job log, so officer changes audit an
   `execution_status` change (no `job_logs` row) and the timeline labels the
   two sources differently.
3. **Receipt numbering gaps.** `RCP` numbers come from the same gapless
   counter as `JO`, and the counter advances even if a later step in the
   transaction fails. `recordPayment` therefore does the receipt insert
   immediately after the payment insert, with no user input in between, and
   any failure rolls back the receipt too — a gap would require a genuine
   mid-transaction crash, which is the same exposure job orders already carry.
4. **RLS suite is red.** Repairing it is the first task of slice 6 so Phase 2
   documentation can cite a green suite again; the alternative (declaring it
   obsolete) would erase the only executable spec for §4.
5. **`/api/jobs` leaks finance columns** to any signed-in caller. It is used by
   the technician lens, which needs the non-financial view only. Fix in
   slice 2 by switching the route to `job_orders_tech_view`, keeping its
   response shape exactly what `/technician` already consumes.

---

## Definition of done for Phase 2

- `/job-orders` lists, searches and filters real job orders; every row opens
  `/job-orders/[id]`.
- An officer can change execution status, reassign the technician, correct the
  facts and settle `actual_amount`, all audited; a technician's only path
  remains a job log on an assigned job.
- Every payment produces exactly one receipt with a gapless number; reprint
  produces a marked duplicate with its own number; receipts cannot be edited or
  deleted by anyone.
- The receipt prints on one A4 sheet from the browser, with the same figures
  the screen shows.
- `scripts/rls-test-suite.mjs` exits 0; `scripts/invoice-flow-check.mjs` and
  `scripts/job-order-flow-check.mjs` pass and clean up after themselves.
- `BUSINESS_RULES.md` §3.1/§3.4/§4 and §8.3 match what the database enforces.
