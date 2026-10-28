-- Ensure tech view includes financial_status
DROP VIEW IF EXISTS job_orders_tech_view;

CREATE VIEW job_orders_tech_view AS
SELECT
  id,
  job_number,
  customer_id,
  vehicle_id,
  execution_status,
  financial_status,
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
   execution fields + payment status (financial_status) — never billing_type or amounts.';

NOTIFY pgrst, 'reload schema';
