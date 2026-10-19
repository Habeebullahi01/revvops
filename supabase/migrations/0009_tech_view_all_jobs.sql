-- ============================================
-- WMS Migration 0009: Technician view — the vehicle lens
-- Source: owner decision 2026-10-19 → BUSINESS_RULES.md §5
-- Run order: 9 of 9  (paste after 0008)
--
-- WHY: a core platform feature is letting a technician look up a vehicle
-- and see its owner plus EVERY associated job order. The 0003 view was
-- filtered to assigned jobs only — that filter is intentionally removed
-- (supersedes the [FIX 1] rationale in 0003_rls.sql).
--
-- UNCHANGED INVARIANT: the view still exposes zero financial columns —
-- no estimated_amount, no actual_amount, no billing_type, and now also no
-- financial_status. RLS is row-level, not column-level, so technicians
-- still get zero rows on the real job_orders table (suite T01); this view
-- remains their only door (suite T02/T03).
-- ============================================

DROP VIEW IF EXISTS job_orders_tech_view;

CREATE VIEW job_orders_tech_view AS
SELECT
  id,
  job_number,
  customer_id,
  vehicle_id,
  execution_status,
  complaint,
  assigned_technician_id,
  date_in,
  expected_date_out,
  actual_date_out,
  notes,
  created_at,
  updated_at
FROM job_orders;

GRANT SELECT ON job_orders_tech_view TO authenticated;

COMMENT ON VIEW job_orders_tech_view IS
  'Technician-safe projection of job_orders: all jobs (vehicle lens),
   execution fields only — never billing_type, amounts, or financial_status.';

-- Make PostgREST re-read the schema (dropped + recreated view)
NOTIFY pgrst, 'reload schema';

-- ============================================
-- VERIFY 0009 — expected: these 13 columns in order, and NO
-- financial_status / estimated_amount / actual_amount / billing_type
SELECT column_name
  FROM information_schema.columns
 WHERE table_name = 'job_orders_tech_view'
 ORDER BY ordinal_position;

SELECT count(*) AS all_jobs_visible_to_view_owner FROM job_orders_tech_view;
-- ============================================
