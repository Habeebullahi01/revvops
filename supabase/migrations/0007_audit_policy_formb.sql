-- ============================================================
-- 0007 — final attempt at the audit INSERT policy anomaly, plus
-- cleanup of the 0006 diagnostic function.
--
-- Context: the policy as created in 0005 is provably correct
-- (editor-side repro as role authenticated succeeds), but the
-- Data API denies inserts by non-admin users. This rewrites the
-- same intent as a subquery form — different parse shape — in
-- case the API layer mishandles the direct comparison.
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own audit logs" ON audit_logs;
CREATE POLICY "Users can insert own audit logs" ON audit_logs
  FOR INSERT WITH CHECK (
    user_id IN (SELECT p.id FROM profiles p WHERE p.id = auth.uid())
  );

-- remove the temporary diagnostic from 0006
DROP FUNCTION IF EXISTS whoami();

-- verification: this must return the new policy
SELECT policyname, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'audit_logs' AND cmd = 'INSERT';
