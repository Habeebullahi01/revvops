-- ============================================
-- WMS Migration 0003: Row Level Security
-- Source: PRD v1.0 Section 6 + documented fixes
-- Run order: 3 of 3
--
-- DEVIATIONS FROM PRD (all marked inline below):
--   [FIX 1] job_orders: technicians have NO row policy on the real table;
--           they only read the job_orders_tech_view (non-financial columns,
--           assigned jobs only). PRD's own tech SELECT policy would have
--           leaked estimated_amount/actual_amount to technicians.
--   [FIX 2] job_order_items: PRD enabled RLS but never added policies,
--           leaving the table unusable for everyone. Staff policies added;
--           technicians blocked (line items are financial data).
--   [FIX 3] document_sequences: RLS enabled with ZERO policies so only the
--           SECURITY DEFINER numbering function can touch the counters.
--   [FIX 4] audit_logs: INSERT policy added (PRD had only SELECT, which
--           would have silently rejected every audit entry).
--   [FIX 5] (in 0002) status sync trigger for technician job logs.
--   [FIX 6] profiles: own-profile UPDATE policy got a WITH CHECK so users
--           cannot escalate their own role column via the API.
--   [FIX 7] service_history: technicians get INSERT-own only instead of the
--           PRD's FOR ALL (matrix says technicians *add* history, not edit
--           or delete other entries).
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
-- [FIX 3] PRD omitted this table entirely; without RLS any signed-in user
-- could overwrite the numbering counters directly via the API.
ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only SECURITY DEFINER functions may access it.

-- ============================================
-- PROFILES
-- ============================================
CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage profiles" ON profiles
  FOR ALL USING (get_user_role() = 'admin');

-- [FIX 6] PRD: USING (auth.uid() = id) only. Without WITH CHECK, a user
-- could PATCH their own row's role to 'admin'. New row must keep the role
-- they authenticated with (read via SECURITY DEFINER helper, so it returns
-- the pre-update value).
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = get_user_role());

-- ============================================
-- CUSTOMERS & VEHICLES (everyone can view)
-- ============================================
CREATE POLICY "Authenticated users can view customers" ON customers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin/Manager/Reception can manage customers" ON customers
  FOR ALL USING (get_user_role() IN ('admin', 'manager', 'reception'));

CREATE POLICY "Authenticated users can view vehicles" ON vehicles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin/Manager/Reception can manage vehicles" ON vehicles
  FOR ALL USING (get_user_role() IN ('admin', 'manager', 'reception'));

-- ============================================
-- JOB ORDERS
-- ============================================
-- [FIX 1] The PRD's "Technicians see assigned jobs" SELECT policy is
-- INTENTIONALLY ABSENT. RLS is row-level: keeping it would have let a
-- technician query the job_orders table directly and read
-- estimated_amount/actual_amount on their own jobs — violating Core
-- Principle #1. Technicians get zero rows on this table and must use
-- job_orders_tech_view (defined at the bottom of this file).

CREATE POLICY "Staff see all jobs" ON job_orders
  FOR SELECT USING (get_user_role() IN ('admin', 'manager', 'reception'));

CREATE POLICY "Admin/Manager/Reception can manage jobs" ON job_orders
  FOR ALL USING (get_user_role() IN ('admin', 'manager', 'reception'));

-- ============================================
-- [FIX 2] JOB ORDER LINE ITEMS
-- ============================================
-- PRD enabled RLS here but defined no policies at all.
-- Technicians are deliberately excluded: unit prices are financial data.
CREATE POLICY "Staff can manage job items" ON job_order_items
  FOR ALL USING (get_user_role() IN ('admin', 'manager', 'reception'));

-- ============================================
-- PAYMENTS (TECHNICIANS BLOCKED)
-- ============================================
CREATE POLICY "Non-technicians can view payments" ON payments
  FOR SELECT USING (get_user_role() IN ('admin', 'manager', 'reception'));

CREATE POLICY "Admin/Manager/Reception can manage payments" ON payments
  FOR ALL USING (get_user_role() IN ('admin', 'manager', 'reception'));

-- ============================================
-- RECEIPTS (TECHNICIANS BLOCKED)
-- ============================================
-- [extension of the permissions matrix] Receipts are immutable financial
-- records, so admin/manager hold full rights; reception gets SELECT plus
-- INSERT limited to non-duplicates — the matrix gives reception
-- "reprint as duplicate" = NO, which the PRD's single shared FOR ALL
-- policy would not have enforced.
CREATE POLICY "Admin/Manager can manage receipts" ON receipts
  FOR ALL USING (get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Reception can view and issue receipts" ON receipts
  FOR SELECT USING (get_user_role() = 'reception');

CREATE POLICY "Reception can issue non-duplicate receipts" ON receipts
  FOR INSERT WITH CHECK (get_user_role() = 'reception' AND is_duplicate = FALSE);

-- ============================================
-- JOB LOGS & SERVICE HISTORY
-- ============================================
CREATE POLICY "Staff can view job logs" ON job_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- [FIX 1 companion + hardening] The PRD's WITH CHECK used an EXISTS
-- subquery against job_orders. With no technician SELECT policy on
-- job_orders (see FIX 1), RLS would hide those rows from the subquery and
-- technicians could never insert logs. The SECURITY DEFINER helper
-- (0002) checks assignment directly. Also added technician_id = auth.uid()
-- so a technician cannot post logs under someone else's ID.
CREATE POLICY "Technicians can create logs for assigned jobs" ON job_logs
  FOR INSERT WITH CHECK (
    get_user_role() = 'technician' AND
    technician_id = auth.uid() AND
    is_assigned_technician(job_order_id)
  );

CREATE POLICY "Staff can view service history" ON service_history
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- [FIX 7] Split the PRD's single FOR ALL policy:
-- staff keep full manage rights; technicians may only add their own rows.
CREATE POLICY "Staff can manage service history" ON service_history
  FOR ALL USING (get_user_role() IN ('admin', 'manager', 'reception'));

CREATE POLICY "Technicians can add service history" ON service_history
  FOR INSERT WITH CHECK (
    get_user_role() = 'technician' AND technician_id = auth.uid()
  );

-- ============================================
-- AUDIT LOGS
-- ============================================
CREATE POLICY "Admin/Manager can view audit logs" ON audit_logs
  FOR SELECT USING (get_user_role() IN ('admin', 'manager'));

-- [FIX 4] PRD had no INSERT policy: every logAudit() call from a server
-- action would have been silently rejected. Users may log their own
-- actions; there are deliberately no UPDATE/DELETE policies (immutable).
CREATE POLICY "Users can insert own audit logs" ON audit_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- [FIX 1] TECHNICIAN VIEW (hides financial columns, assigned jobs only)
-- ============================================
-- RLS is row-level, not column-level, so technicians never touch the
-- job_orders table. This view exposes only non-financial columns and is
-- filtered to the querying technician (the view owner bypasses table RLS,
-- so the filter must live here — the PRD's unfiltered view would have
-- exposed every job's complaint/notes to every technician).
-- NOTE: the view is technician-only. Staff must query job_orders directly.
CREATE VIEW job_orders_tech_view AS
SELECT
  id,
  job_number,
  customer_id,
  vehicle_id,
  status,
  complaint,
  assigned_technician_id,
  date_in,
  expected_date_out,
  notes,
  created_at
FROM job_orders
WHERE assigned_technician_id = auth.uid();

GRANT SELECT ON job_orders_tech_view TO authenticated;

-- Make PostgREST pick up the new schema immediately
NOTIFY pgrst, 'reload schema';
