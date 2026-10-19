-- ============================================
-- WMS Migration 0008: Status split
-- Source: owner decision 2026-10-19 → BUSINESS_RULES.md §3
-- Run order: 8 of 9  (paste 0009 immediately after)
--
-- WHY: job_orders.status mixed workflow states with money — 'paid' sat
-- next to 'pending'. Two independent statuses now:
--
--   execution_status  pending|in_progress|waiting_parts|completed|cancelled
--     workflow state. Officers set it directly; technicians change it ONLY
--     via job logs (PRD §10.4) through the SECURITY DEFINER sync trigger.
--   financial_status  unpaid|part_paid|paid
--     admin/manager/reception exclusively (RLS: technicians have no write
--     path to job_orders at all, and 0009 keeps it off the tech view).
--     A job order may be created part-paid or unpaid (front desk).
--
-- [DEVIATION from PRD §4]: job_orders.status renamed execution_status and
-- job_logs.status renamed execution_status too — one vocabulary everywhere
-- (no app code depended on the old names yet; cheapest possible moment).
-- The PRD's mixed status enum and its 'paid' execution state are gone.
-- ============================================

-- ---- PART 1: job_orders -------------------------------------

-- CHECK constraint and index follow the column automatically (expression
-- references are attnum-based); names are updated below for clarity.
ALTER TABLE job_orders RENAME COLUMN status TO execution_status;

ALTER TABLE job_orders
  ADD COLUMN financial_status TEXT NOT NULL DEFAULT 'unpaid'
  CHECK (financial_status IN ('unpaid', 'part_paid', 'paid'));

-- Move the legacy mixed value into the two proper domains (no production
-- rows exist yet, but be safe for any environment).
UPDATE job_orders
   SET execution_status = 'completed',
       financial_status = 'paid'
 WHERE execution_status = 'paid';

-- Old mixed enum → execution-only enum ('paid' removed from execution).
ALTER TABLE job_orders DROP CONSTRAINT job_orders_status_check;
ALTER TABLE job_orders ADD CONSTRAINT job_orders_execution_status_check
  CHECK (execution_status IN
    ('pending', 'in_progress', 'waiting_parts', 'completed', 'cancelled'));

ALTER INDEX idx_job_orders_status RENAME TO idx_job_orders_execution_status;
CREATE INDEX idx_job_orders_financial_status ON job_orders(financial_status);

-- ---- PART 2: job_logs (same vocabulary) ---------------------

ALTER TABLE job_logs RENAME COLUMN status TO execution_status;
ALTER TABLE job_logs RENAME CONSTRAINT job_logs_status_check
  TO job_logs_execution_status_check;

-- ---- PART 3: sync trigger (replaces 0002 definition) -------
-- Column references updated; transition map unchanged: a job log may drive
-- pending → in_progress ⇄ waiting_parts → completed. 'cancelled' and
-- financial_status are unreachable from job logs by construction.
CREATE OR REPLACE FUNCTION sync_job_order_status_from_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE job_orders
  SET execution_status = NEW.execution_status,
      updated_at = NOW()
  WHERE id = NEW.job_order_id
    AND execution_status IS DISTINCT FROM NEW.execution_status
    AND (
      (NEW.execution_status = 'in_progress'   AND execution_status IN ('pending', 'waiting_parts')) OR
      (NEW.execution_status = 'waiting_parts' AND execution_status IN ('pending', 'in_progress')) OR
      (NEW.execution_status = 'completed'     AND execution_status IN ('pending', 'in_progress', 'waiting_parts'))
    );
  RETURN NEW;
END;
$$;

-- Make PostgREST re-read the schema (renamed columns + new column)
NOTIFY pgrst, 'reload schema';

-- ============================================
-- VERIFY 0008 — expected: 2 columns; check with execution-only enum
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'job_orders'
   AND column_name IN ('execution_status', 'financial_status')
 ORDER BY column_name;

SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'job_orders'::regclass
   AND contype = 'c'
   AND conname LIKE '%status%';
-- ============================================
