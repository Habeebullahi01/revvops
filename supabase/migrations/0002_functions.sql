-- ============================================
-- WMS Migration 0002: Functions & Triggers
-- Sources: PRD v1.0 Sections 5 & 6 (helpers) + documented fixes
-- Run order: 2 of 3
-- ============================================

-- ============================================
-- PRD §5: Gapless sequential document numbering
-- (SECURITY DEFINER: runs as table owner, bypasses RLS on document_sequences)
-- ============================================
CREATE OR REPLACE FUNCTION get_next_document_number(p_document_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER -- runs with table owner privileges
AS $$
DECLARE
  v_year INTEGER;
  v_last_number INTEGER;
  v_prefix TEXT;
  v_number TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW());

  -- Ensure sequence row exists for this year
  INSERT INTO document_sequences (document_type, year, last_number)
  VALUES (p_document_type, v_year, 0)
  ON CONFLICT (document_type, year) DO NOTHING;

  -- Atomically increment and get the number
  UPDATE document_sequences
  SET last_number = last_number + 1
  WHERE document_type = p_document_type AND year = v_year
  RETURNING last_number INTO v_last_number;

  -- Format prefix
  IF p_document_type = 'job_order' THEN
    v_prefix := 'JO';
  ELSIF p_document_type = 'receipt' THEN
    v_prefix := 'RCP';
  ELSE
    RAISE EXCEPTION 'Unknown document type: %', p_document_type;
  END IF;

  -- Format: PREFIX-YEAR-0001
  v_number := v_prefix || '-' || v_year || '-' || LPAD(v_last_number::TEXT, 4, '0');

  RETURN v_number;
END;
$$;

-- ============================================
-- [DEVIATION from PRD §5] Lock down who can call the numbering function.
-- Without this, an unauthenticated (anon) API caller could spam the RPC
-- and burn sequence numbers, creating gaps. Numbering must only be
-- callable by signed-in users and server-side (service role).
-- ============================================
REVOKE EXECUTE ON FUNCTION get_next_document_number(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_next_document_number(TEXT) TO authenticated, service_role;

-- ============================================
-- PRD §6: Helper function to get current user's role
-- ============================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- ============================================
-- [DEVIATION from PRD §6] Assignment check helper for RLS policies.
-- The PRD's job_logs INSERT policy used an EXISTS subquery against
-- job_orders. Policy subqueries are themselves subject to RLS, and
-- technicians have no SELECT policy on job_orders (see 0003 FIX 1), so
-- that subquery would always return false and technicians could never
-- insert job logs. This SECURITY DEFINER helper reads job_orders as the
-- table owner, bypassing that problem.
-- ============================================
CREATE OR REPLACE FUNCTION is_assigned_technician(p_job_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM job_orders
    WHERE id = p_job_order_id
      AND assigned_technician_id = auth.uid()
  );
$$;

-- ============================================
-- [DEVIATION from PRD §10.4] Technician status sync trigger.
-- The PRD lets technicians change job status only "via job log", but RLS
-- gives technicians no UPDATE rights on job_orders, so nothing would ever
-- change. This SECURITY DEFINER trigger syncs job_orders.status from an
-- inserted job_logs row, enforcing the §10.4 transition map in the database.
-- ============================================
CREATE OR REPLACE FUNCTION sync_job_order_status_from_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE job_orders
  SET status = NEW.status,
      updated_at = NOW()
  WHERE id = NEW.job_order_id
    AND status IS DISTINCT FROM NEW.status
    -- Allowed transitions targeting statuses a job log may set (PRD §10.4):
    -- pending -> in_progress | waiting_parts
    -- waiting_parts -> in_progress
    -- in_progress -> waiting_parts | completed
    -- pending/in_progress/waiting_parts -> completed
    AND (
      (NEW.status = 'in_progress'  AND status IN ('pending', 'waiting_parts')) OR
      (NEW.status = 'waiting_parts' AND status IN ('pending', 'in_progress')) OR
      (NEW.status = 'completed'    AND status IN ('pending', 'in_progress', 'waiting_parts'))
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_logs_sync_status ON job_logs;
CREATE TRIGGER trg_job_logs_sync_status
  AFTER INSERT ON job_logs
  FOR EACH ROW
  EXECUTE FUNCTION sync_job_order_status_from_log();
