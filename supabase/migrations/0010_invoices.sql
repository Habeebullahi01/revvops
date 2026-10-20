-- ============================================
-- WMS Migration 0010: Invoices + programmatic financial status
-- Source: owner decision 2026-10-19 -> BUSINESS_RULES.md §1-4
-- Run order: 10 of 11 (paste 0011_rls_phase1.sql next)
-- ============================================

-- ---- 1. Create invoices table ----
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  technician_id UUID REFERENCES profiles(id),
  complaint TEXT NOT NULL,
  cost_breakdown JSONB,
  total_amount DECIMAL(12,2) NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  job_order_id UUID REFERENCES job_orders(id) ON DELETE SET NULL
);

-- ---- 2. Add invoice_id to payments table ----
ALTER TABLE payments ADD COLUMN invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

-- ---- 3. Add execution_status column to job_orders ( alongside status ) ----
ALTER TABLE job_orders ADD COLUMN execution_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (execution_status IN ('pending', 'in_progress', 'waiting_parts', 'completed', 'cancelled'));

-- ---- 4. Trigger: set financial_status from payments ----
-- Programmatic inference from invoices + payments.
-- Manual override: the RLS policy that lets admin/manager/reception UPDATE
-- financial_status remains (see 0011_rls_phase1.sql); this trigger is the
-- default path.  [DEVIATION -- programmatic path primary; manual override
-- kept as defense-in-depth.]
CREATE OR REPLACE FUNCTION set_financial_status_from_payments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_paid DECIMAL(12,2);
  v_invoice_total DECIMAL(12,2);
  v_status TEXT;
  v_job_order_id UUID;
BEGIN
  -- Legacy path: payment linked directly to job_order (no invoice)
  IF NEW.invoice_id IS NULL THEN
    IF NEW.job_order_id IS NOT NULL THEN
      v_total_paid := COALESCE((SELECT SUM(amount) FROM payments WHERE job_order_id = NEW.job_order_id), 0);
      IF v_total_paid > 0 THEN
        v_status := 'part_paid';
      ELSE
        v_status := 'unpaid';
      END IF;
      UPDATE job_orders SET financial_status = v_status WHERE id = NEW.job_order_id;
    END IF;
    RETURN NEW;
  END IF;

  -- New path: payment linked to an invoice
  SELECT job_order_id INTO v_job_order_id FROM invoices WHERE id = NEW.invoice_id;

  v_total_paid := COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = NEW.invoice_id), 0);
  v_invoice_total := COALESCE((SELECT total_amount FROM invoices WHERE id = NEW.invoice_id), 0);

  IF v_invoice_total = 0 THEN
    v_status := 'unpaid';
  ELSIF v_total_paid >= v_invoice_total THEN
    v_status := 'paid';
  ELSIF v_total_paid > 0 THEN
    v_status := 'part_paid';
  ELSE
    v_status := 'unpaid';
  END IF;

  IF v_job_order_id IS NOT NULL THEN
    UPDATE job_orders SET financial_status = v_status WHERE id = v_job_order_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ---- 5. Trigger registration ----
DROP TRIGGER IF EXISTS trg_payments_set_financial_status ON payments;
CREATE TRIGGER trg_payments_set_financial_status
  AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION set_financial_status_from_payments();

-- ---- 6. Verification SELECTs ----
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'invoices'
 ORDER BY ordinal_position;

SELECT column_name
  FROM information_schema.columns
 WHERE table_name = 'payments'
   AND column_name = 'invoice_id';

SELECT trigger_name, event_object_table, action_statement
  FROM information_schema.triggers
 WHERE event_object_table = 'payments';

-- Reload schema so Data API picks up the new column
NOTIFY pgrst, 'reload schema';
