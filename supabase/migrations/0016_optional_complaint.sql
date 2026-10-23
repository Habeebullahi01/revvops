-- ============================================
-- WMS Migration 0016: the complaint becomes optional
--
-- WHY
--
-- `invoices.complaint` (0010) and `job_orders.complaint` (0001) are both
-- NOT NULL, and both the invoice form and the job-facts editor treat it as
-- required. But plenty of jobs have nothing wrong with them — a healthy car
-- arrives for a CNG conversion, or for a fitment the customer simply asked
-- for. A mandatory field forces staff to invent a fault to get past the form,
-- which then reads back on the job card and the receipt as if the customer
-- had reported something they never did.
--
-- The field is really "what the customer asked for / why the vehicle is
-- here", covering both a fault and a requested fitment. It is renamed to
-- **Work requested** throughout the UI, and it is now optional.
--
-- SCOPE: BOTH TABLES. Raising a job order copies `invoices.complaint` straight
-- into `job_orders.complaint` (createJobOrderFromInvoice). If only the invoice
-- became optional, a blank invoice would fail to raise a job order at all, so
-- the hand-off would break rather than stay consistent. The officer's
-- job-facts edit also stops requiring it.
--
-- No data is changed: every existing row already has a value. This migration
-- only relaxes the constraint.
--
-- Run order: 16 of 16 (paste after 0015_receipts_and_invoice_fields.sql)
-- ============================================


-- ============================================
-- PART 1 — drop the NOT NULL constraint on both tables
-- ============================================

-- Idempotent: DROP NOT NULL is a no-op if the column is already nullable, so
-- re-pasting this file is safe.
ALTER TABLE invoices   ALTER COLUMN complaint DROP NOT NULL;
ALTER TABLE job_orders ALTER COLUMN complaint DROP NOT NULL;


-- ============================================
-- PART 2 — verification SELECTs (read the output before trusting this)
-- ============================================

-- Expect: complaint is_nullable = YES on both tables, and no other column
-- changed.
SELECT table_name, column_name, is_nullable, data_type
  FROM information_schema.columns
 WHERE table_name IN ('invoices', 'job_orders')
   AND column_name = 'complaint'
 ORDER BY table_name;

-- Expect: zero rows still carrying a NOT NULL on complaint. A non-empty
-- result means the ALTERs above did not take.
SELECT table_name
  FROM information_schema.columns
 WHERE table_name IN ('invoices', 'job_orders')
   AND column_name = 'complaint'
   AND is_nullable = 'NO';

-- Expect: no row actually became NULL (nothing should have been touched).
SELECT
  (SELECT count(*) FROM invoices   WHERE complaint IS NULL) AS invoices_blank,
  (SELECT count(*) FROM job_orders WHERE complaint IS NULL) AS job_orders_blank;

-- Make PostgREST re-read the schema (nullable change)
NOTIFY pgrst, 'reload schema';
