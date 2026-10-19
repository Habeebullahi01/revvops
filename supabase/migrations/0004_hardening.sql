-- ============================================================
-- 0004_hardening.sql — gaps found by the §13 RLS test suite
-- ============================================================

-- [FIX 8] Restore the audit INSERT policy from 0003 (FIX 4).
-- The suite proved this single statement is missing in the database
-- (verified: 0003_rls.sql contains it, so the original paste skipped
-- it). DROP IF EXISTS + CREATE keeps this migration re-runnable and
-- idempotent regardless of what state the policy is in.
DROP POLICY IF EXISTS "Users can insert own audit logs" ON audit_logs;
CREATE POLICY "Users can insert own audit logs" ON audit_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- [FIX 9] Numbering RPC must be denied to technicians.
-- Before: GRANT to ALL "authenticated" let any signed-in user advance
-- document counters (suite check T22 — gap/DoS risk: a technician
-- could burn numbers and create gaps for future documents).
-- Now: raise if the caller has a session AND lacks a doc-creating role.
-- - service_role / scripts: auth.uid() is NULL → allowed
-- - technicians: denied (they never create job orders or receipts)
-- - admin / manager / reception: allowed
CREATE OR REPLACE FUNCTION get_next_document_number(p_document_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INT := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
  v_last INT;
  v_next INT;
  v_prefix TEXT;
  v_role TEXT;
BEGIN
  IF p_document_type NOT IN ('job_order', 'receipt') THEN
    RAISE EXCEPTION 'Invalid document type: %', p_document_type;
  END IF;

  -- Session users must hold a document-creating role (see FIX 9 above).
  IF auth.uid() IS NOT NULL THEN
    v_role := get_user_role();
    IF v_role IS NULL OR v_role NOT IN ('admin', 'manager', 'reception') THEN
      RAISE EXCEPTION 'Not authorized to allocate document numbers';
    END IF;
  END IF;

  INSERT INTO document_sequences (document_type, year, last_number)
  VALUES (p_document_type, v_year, 0)
  ON CONFLICT (document_type, year) DO NOTHING;

  UPDATE document_sequences
  SET last_number = last_number + 1,
      updated_at = now()
  WHERE document_type = p_document_type AND year = v_year
  RETURNING last_number INTO v_last;

  v_next := v_last;

  v_prefix := CASE p_document_type
    WHEN 'job_order' THEN 'JO'
    WHEN 'receipt' THEN 'RCP'
  END;

  RETURN v_prefix || '-' || v_year || '-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

-- Re-assert grants (CREATE OR REPLACE preserves them, but explicit):
REVOKE EXECUTE ON FUNCTION get_next_document_number(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_next_document_number(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_document_number(TEXT) TO service_role;
-- anon stays denied (0003 already revoked; belt and braces)
REVOKE EXECUTE ON FUNCTION get_next_document_number(TEXT) FROM anon;
