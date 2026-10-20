-- ============================================
-- WMS Migration 0012: invoices.technician_id is not an invoice concept
-- Source: owner decision 2026-10-20
-- Run order: 12 of 12 (paste after 0011_rls_phase1.sql)
--
-- Technician assignment belongs to the job order
-- (job_orders.assigned_technician_id), never to the invoice. The invoice
-- names customer + vehicle + complaint + cost breakdown only, so the
-- column 0010 created is dropped rather than left as a dead, FK-joined
-- column the invoice form would have to carry.
-- ============================================

ALTER TABLE invoices DROP COLUMN IF EXISTS technician_id;

COMMENT ON TABLE invoices IS
$$Invoice-first model: customer_id, vehicle_id, complaint, cost_breakdown and
total_amount only. No technician — assignment lives on job_orders
(assigned_technician_id), which the invoice never auto-creates. Payment
totals drive financial_status inference via trigger in 0010. Manual override
of financial_status on the linked job order is possible via the policy in
0011 (see [DEVIATION] note there).$$;

-- Reload schema so Data API drops the column from its OpenAPI document
NOTIFY pgrst, 'reload schema';
