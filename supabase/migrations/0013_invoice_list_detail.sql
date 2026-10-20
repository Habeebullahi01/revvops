-- ============================================
-- WMS Migration 0013: invoice list/detail flow
-- Source: Phase 1 owner direction (todo.md) — /invoices becomes a list with
--         a detail page per invoice, and a payment can be recorded against an
--         invoice BEFORE any job order exists.
-- Run order: 13 of 13 (paste after 0012_invoice_drop_technician.sql)
-- ============================================

-- ---- 1. A payment may target an invoice on its own ----
-- Invoice-first: money arrives before a job order exists, so job_order_id can
-- no longer be NOT NULL. At least one target is still mandatory.
ALTER TABLE payments ALTER COLUMN job_order_id DROP NOT NULL;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_needs_a_target;
ALTER TABLE payments ADD CONSTRAINT payments_needs_a_target
  CHECK (job_order_id IS NOT NULL OR invoice_id IS NOT NULL);

COMMENT ON COLUMN payments.job_order_id IS
  'Parallel target: a payment raised directly on a job order. Invoice-first payments always set invoice_id, and job_order_id too once the invoice has a job order.';

-- ---- 2. Invoices: 0010 never switched RLS on ----
-- Until this migration the table was readable AND writable by anyone holding
-- the anon key. Drop every existing policy (the file and the pasted history
-- had drifted) and install the officer-only set from BUSINESS_RULES.md §4.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'invoices'
  LOOP
    EXECUTE format('DROP POLICY %I ON invoices', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Officers can view invoices" ON invoices
  FOR SELECT TO authenticated
  USING (get_user_role() IN ('admin', 'manager', 'reception'));

CREATE POLICY "Officers can create invoices" ON invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() IN ('admin', 'manager', 'reception')
    AND created_by = auth.uid()
  );

-- Needed so the detail page can stamp invoices.job_order_id after the job
-- order is raised from the invoice.
CREATE POLICY "Officers can update invoices" ON invoices
  FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'manager', 'reception'))
  WITH CHECK (get_user_role() IN ('admin', 'manager', 'reception'));

CREATE POLICY "Officers can delete invoices" ON invoices
  FOR DELETE TO authenticated
  USING (get_user_role() IN ('admin', 'manager', 'reception'));

COMMENT ON TABLE invoices IS
$$Invoice-first model: total_amount and cost_breakdown drive financial_status inference
via the trigger in 0010. RLS enabled by 0013 — officers (admin/manager/reception)
only; technicians have no read or write path (BUSINESS_RULES.md §4).$$;

-- ---- 3. Corrective: technicians must not read raw job_orders ----
-- A policy pasted during an earlier 0011 run left "All authenticated can view
-- job orders" on the table, handing technicians estimated_amount,
-- actual_amount, billing_type and financial_status (suite T01 red).
DROP POLICY IF EXISTS "All authenticated can view job orders" ON job_orders;
DROP POLICY IF EXISTS "Authenticated users can view job orders" ON job_orders;
DROP POLICY IF EXISTS "All authenticated can view jobs" ON job_orders;

-- Restore the staff-only SELECT from 0003 if that paste also removed it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'job_orders'
       AND policyname = 'Staff see all jobs'
       AND cmd = 'SELECT'
  ) THEN
    CREATE POLICY "Staff see all jobs" ON job_orders
      FOR SELECT USING (get_user_role() IN ('admin', 'manager', 'reception'));
  END IF;
END $$;

-- Reload schema so Data API picks up the constraint + policies
NOTIFY pgrst, 'reload schema';
