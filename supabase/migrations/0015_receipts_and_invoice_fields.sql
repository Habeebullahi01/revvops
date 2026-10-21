-- ============================================
-- WMS Migration 0015: receipts for invoice-first payments, invoice billing
--                     type + category
--
-- Three things, one round, because they all touch the invoice/receipt shape
-- and pasting three migrations for one afternoon's decisions is waste.
--
-- WHY EACH PART EXISTS
--
-- 1. Receipts. `receipts.job_order_id` is NOT NULL (0001) and there is no
--    `receipts.invoice_id`. Payments are recorded against *invoices* in the
--    invoice-first flow, so no receipt can be issued for the payments that
--    actually happen (BUSINESS_RULES.md §3.1). A receipt is now allowed to
--    hang off either an invoice or a job order.
--
-- 2. Receipts are append-only. The inherited policy "Admin/Manager can
--    manage receipts" is FOR ALL: it lets an admin UPDATE or DELETE a
--    receipt, so a financial document could be quietly altered. Receipts are
--    evidence, so from here they are SELECT + INSERT only, for every role
--    including admin. Corrections are made by issuing a duplicate, never by
--    editing history.
--
-- 3. A payment has exactly one *original* receipt (owner decision D4,
--    2026-10-20). Reprints are additional rows with is_duplicate = true
--    pointing back at the original; they never chain. A partial unique index
--    makes "one original per payment" a database guarantee rather than a
--    convention the application is trusted to keep.
--
-- 4. `billing_type` moves from job_orders to invoices. How an invoice is
--    billed is a property of the invoice; the job order *references* it. The
--    vocabulary was also wrong: 'cng_installment' named a payment plan after
--    one service, but any plan may apply to any service. The agreed terms are
--    upfront / instalmental / post-service.
--    Existing values are backfilled from the linked job order before the
--    column is dropped, so no row loses its meaning.
--
-- 5. Invoices gain a category (sales / maintenance / cng) so reporting can
--    tell a parts sale from servicing from a conversion.
--    DELIBERATELY NOT DONE HERE: a true walk-in sale (no vehicle, possibly
--    no customer record) is still impossible, because invoices.customer_id
--    and invoices.vehicle_id remain NOT NULL. That is a separate change with
--    its own UI consequences — see todo.md.
--
-- Run order: 15 of 15 (paste after 0014_rebuild_job_order_policies.sql)
-- ============================================


-- ============================================
-- PART 1 — receipts can belong to an invoice
-- ============================================

-- The legacy column becomes optional: a receipt now hangs off an invoice
-- (invoice-first) or a job order (the old direct path), never required to
-- hang off both.
ALTER TABLE receipts ALTER COLUMN job_order_id DROP NOT NULL;

ALTER TABLE receipts ADD COLUMN invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE;

-- A receipt with neither parent would be unreachable from either side.
-- (Postgres has no "exactly one of" constraint, so this is the enforceable
-- half; the application always sets one.)
ALTER TABLE receipts ADD CONSTRAINT receipts_have_a_parent
  CHECK (invoice_id IS NOT NULL OR job_order_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_receipts_invoice ON receipts(invoice_id);

-- One original per payment. Reprints (is_duplicate = true) are exempt.
-- COALESCE keeps the index total: a NULL is_duplicate would otherwise make
-- every row distinct and silently disable the guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_one_original_per_payment
  ON receipts(payment_id)
  WHERE COALESCE(is_duplicate, FALSE) = FALSE;


-- ============================================
-- PART 2 — receipts are append-only
-- ============================================

-- Replace the inherited set (0003) with SELECT + INSERT for staff and no
-- UPDATE/DELETE for anyone. Drop by name so re-running this file is safe.
DROP POLICY IF EXISTS "Admin/Manager can manage receipts" ON receipts;
DROP POLICY IF EXISTS "Reception can view and issue receipts" ON receipts;
DROP POLICY IF EXISTS "Reception can issue non-duplicate receipts" ON receipts;
DROP POLICY IF EXISTS "Staff can view receipts" ON receipts;
DROP POLICY IF EXISTS "Staff can issue receipts" ON receipts;

-- Everyone on the desk sees receipts; technicians do not (they hold no
-- financial surface at all — BUSINESS_RULES.md §5).
CREATE POLICY "Staff can view receipts" ON receipts
  FOR SELECT TO authenticated
  USING (get_user_role() IN ('admin', 'manager', 'reception'));

-- Issue either an original or a duplicate. Reception is deliberately allowed
-- to reprint here: the matrix's "reprint as duplicate = NO" was about not
-- *altering* a receipt, and a duplicate is a new immutable row, not an edit.
-- What is not allowed is a duplicate without a parent original.
CREATE POLICY "Staff can issue receipts" ON receipts
  FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() IN ('admin', 'manager', 'reception')
    AND (
      COALESCE(is_duplicate, FALSE) = FALSE
      OR original_receipt_id IS NOT NULL
    )
  );

-- No UPDATE policy and no DELETE policy exist on purpose: under RLS, absent
-- policy means denied for everyone, including admin. That is the intent.


-- ============================================
-- PART 3 — billing_type moves to invoices
-- ============================================

ALTER TABLE invoices ADD COLUMN billing_type TEXT;

-- Backfill from the job order this invoice was raised into. An invoice with
-- no job order yet has nothing to inherit and takes the default.
UPDATE invoices i
   SET billing_type = CASE j.billing_type
                        -- old name -> agreed name
                        WHEN 'cng_installment' THEN 'instalmental'
                        ELSE j.billing_type
                      END
  FROM job_orders j
 WHERE i.job_order_id = j.id;

UPDATE invoices SET billing_type = 'upfront' WHERE billing_type IS NULL;

-- Now that every row has a value, constrain and require it. Defaults to
-- upfront because that is the common case at the counter.
ALTER TABLE invoices ALTER COLUMN billing_type SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN billing_type SET DEFAULT 'upfront';
ALTER TABLE invoices ADD CONSTRAINT invoices_billing_type_check
  CHECK (billing_type IN ('upfront', 'instalmental', 'post_service'));

-- The job order no longer owns this. Dropping the constraint first keeps the
-- drop valid regardless of the constraint's generated name.
ALTER TABLE job_orders DROP CONSTRAINT IF EXISTS job_orders_billing_type_check;
ALTER TABLE job_orders DROP COLUMN IF EXISTS billing_type;


-- ============================================
-- PART 4 — invoice category
-- ============================================

ALTER TABLE invoices ADD COLUMN category TEXT NOT NULL DEFAULT 'maintenance';
ALTER TABLE invoices ADD CONSTRAINT invoices_category_check
  CHECK (category IN ('sales', 'maintenance', 'cng'));

CREATE INDEX IF NOT EXISTS idx_invoices_category ON invoices(category);


-- ============================================
-- PART 5 — verification SELECTs (read the output before trusting this)
-- ============================================

-- Expect: job_order_id nullable = YES, invoice_id present, is_duplicate,
-- original_receipt_id.
SELECT column_name, is_nullable, data_type
  FROM information_schema.columns
 WHERE table_name = 'receipts'
 ORDER BY ordinal_position;

-- Expect exactly: receipts_have_a_parent, and the two indexes.
SELECT conname FROM pg_constraint WHERE conrelid = 'receipts'::regclass;
SELECT indexname FROM pg_indexes WHERE tablename = 'receipts';

-- Expect: two policies, both SELECT or INSERT. Any UPDATE/DELETE here means
-- receipts are editable, which this migration exists to prevent.
SELECT policyname, cmd, roles
  FROM pg_policies
 WHERE tablename = 'receipts'
 ORDER BY cmd;

-- Expect: invoices has billing_type (NOT NULL) and category (NOT NULL),
-- and job_orders has NO billing_type.
SELECT column_name, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'invoices'
   AND column_name IN ('billing_type', 'category');

SELECT count(*) AS job_orders_billing_type_should_be_zero
  FROM information_schema.columns
 WHERE table_name = 'job_orders' AND column_name = 'billing_type';

-- Expect: no invoice left without a billing type or category.
SELECT count(*) AS invoices_missing_billing FROM invoices WHERE billing_type IS NULL;
SELECT category, count(*) FROM invoices GROUP BY category ORDER BY category;

-- Make PostgREST re-read the schema (new/changed columns and policies)
NOTIFY pgrst, 'reload schema';

-- ============================================
-- VERIFIED 2026-10-21 against the live project. What was actually exercised,
-- and how, so a re-run can be trusted:
--
--   * one original per payment — a second original insert as reception
--     returns 409 / 23505 (unique violation). A duplicate with
--     original_receipt_id set is accepted.
--   * a duplicate WITHOUT original_receipt_id is refused 403 / 42501 by the
--     INSERT policy's WITH CHECK.
--   * receipts are append-only — admin, manager and reception can neither
--     UPDATE nor DELETE a row.
--
-- TESTING TRAPS (both caused a false result first time round):
--   1. Do not test these policies with the service-role key: it BYPASSES RLS,
--      so every policy looks absent. Use a real signed-in user's token.
--   2. PostgREST answers 200 with an EMPTY ARRAY when RLS filters out every
--      row, so a status code alone cannot tell "denied" from "no-op". Read the
--      row back (with the service role) and compare values instead.
-- ============================================
