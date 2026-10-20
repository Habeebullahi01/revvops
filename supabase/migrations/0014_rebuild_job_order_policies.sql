-- ============================================
-- WMS Migration 0014: rebuild the job_orders policy set
--
-- Why: an earlier pasted script replaced the policies on job_orders with a
-- single permissive SELECT (the leak suite T01 caught), and 0013 dropped
-- that leak. What is left has no INSERT path at all, so an officer raising
-- a job order from an invoice gets:
--   "new row violates row-level security policy for table job_orders"
-- Rebuild exactly the set documented in BUSINESS_RULES.md §4.
-- Run order: 14 of 14 (paste after 0013_invoice_list_detail.sql)
-- ============================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'job_orders'
  LOOP
    EXECUTE format('DROP POLICY %I ON job_orders', pol.policyname);
  END LOOP;
END $$;

-- READ: officers only. Technicians read through job_orders_tech_view,
-- which carries no financial columns — so they get zero rows here.
CREATE POLICY "Staff see all jobs" ON job_orders
  FOR SELECT TO authenticated
  USING (get_user_role() IN ('admin', 'manager', 'reception'));

-- WRITE: officers manage every column of a job order.
CREATE POLICY "Admin/Manager/Reception can manage jobs" ON job_orders
  FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'manager', 'reception'))
  WITH CHECK (get_user_role() IN ('admin', 'manager', 'reception'));

-- CREATE: any signed-in user may raise a job order (owner decision
-- 2026-10-19). INSERT-only, so technicians still cannot UPDATE a row and
-- still cannot SELECT one.
CREATE POLICY "All authenticated can create job orders" ON job_orders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

NOTIFY pgrst, 'reload schema';
