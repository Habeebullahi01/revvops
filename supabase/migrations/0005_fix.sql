-- ============================================================
-- 0005_fix.sql — corrected re-issue of 0004 (which pasted only
-- partially: the function went in with a bug, the audit policy
-- never went in). PLEASE PASTE THIS FILE IN FULL.
-- Verify at the end: the last SELECT must list 3 audit policies.
-- ============================================================

-- [FIX 8, re-issue] audit INSERT policy: technicians/users write own rows only
DROP POLICY IF EXISTS "Users can insert own audit logs" ON audit_logs;
CREATE POLICY "Users can insert own audit logs" ON audit_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- [FIX 9, corrected] numbering RPC: denied to technicians.
-- Corrected vs 0004: no "updated_at" column exists on document_sequences.
DROP FUNCTION IF EXISTS get_next_document_number(TEXT);
CREATE FUNCTION get_next_document_number(p_document_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INT;
  v_last_number INTEGER;
  v_prefix TEXT;
  v_number TEXT;
  v_role TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::INT;

  -- Session users must hold a document-creating role (FIX 9).
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
  SET last_number = last_number + 1
  WHERE document_type = p_document_type AND year = v_year
  RETURNING last_number INTO v_last_number;

  IF p_document_type = 'job_order' THEN
    v_prefix := 'JO';
  ELSIF p_document_type = 'receipt' THEN
    v_prefix := 'RCP';
  ELSE
    RAISE EXCEPTION 'Unknown document type: %', p_document_type;
  END IF;

  v_number := v_prefix || '-' || v_year || '-' || LPAD(v_last_number::TEXT, 4, '0');
  RETURN v_number;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_next_document_number(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_next_document_number(TEXT) TO authenticated, service_role;

-- ---- verification (results appear in the editor output) ----
SELECT 'audit INSERT policy' AS what, policyname AS present
  FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND cmd='INSERT'
UNION ALL
SELECT 'numbering fn live', proname FROM pg_proc
  WHERE proname='get_next_document_number' AND pronamespace='public'::regnamespace;
