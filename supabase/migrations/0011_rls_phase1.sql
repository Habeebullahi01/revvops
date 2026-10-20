-- ============================================
-- WMS Migration 0011: RLS Phase 1 — Invoice flow
-- Source: owner decision 2026-10-19 -> BUSINESS_RULES.md §1-4
-- Run order: 11 of 11  (paste after 0010_invoices.sql)
-- ============================================

-- ---- 1. Customers: add authenticated INSERT alongside existing SELECT ----
-- Existing policy: authenticated users can view customers
-- New policy: authenticated users can create customers (tech at intake)
CREATE POLICy "Authenticated users can create customers" ON customers
  FOR INSERT TO authenticated;

-- ---- 2. Vehicles: add authenticated INSERT alongside existing SELECT ----
CREATE POLICy "Authenticated users can create vehicles" ON vehicles
  FOR INSERT TO authenticated;

-- ---- 3. Job orders: add authenticated INSERT alongside existing SELECT ----
-- Existing SELECT policy preserved: staff see all jobs (admin/manager/reception only)
-- New policy: authenticated users can create job orders (tech via invoice flow)
CREATE POLICy "All authenticated can create job orders" ON job_orders
  FOR INSERT TO authenticated;

-- ---- 4. Financial status: manual override via USING clause only ----
-- [DEVIATION — manual override; programmatic inference primary; see 0010 trigger]
CREATE POLICy "Officers can manually set financial_status" ON job_orders
  FOR UPDATE
  USING (get_user_role() IN ('admin', 'manager', 'reception'));

-- ---- 5. Payments: no change needed; invoice_id column is just a link ----
-- (The new invoice_id column on payments is a plain foreign key; no RLS change required.)

-- ---- 6. Invoices: no new RLS needed; inherits from customers/vehicles ----
COMMENT ON TABLE invoices IS
$$Invoice-first model: total_amount and cost_breakdown drive financial_status inference
via trigger in 0010. Manual override of financial_status on linked job order
is possible via the policy above (see [DEVIATION] note on 'Officers can manually set financial_status' policy).$$;
