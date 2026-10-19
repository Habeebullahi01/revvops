-- ============================================================
-- 0006_diagnostic.sql — TEMPORARY diagnostic function.
-- Reveals what role/context PostgREST actually uses per user.
-- Safe: read-only. DELETE this function after investigation:
--   DROP FUNCTION whoami();
-- ============================================================
CREATE OR REPLACE FUNCTION whoami() RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT json_build_object(
    'current_user', current_user,
    'session_user', session_user,
    'jwt_claims', coalesce(current_setting('request.jwt.claims', true), 'NONE')
  )::jsonb
$$;
REVOKE EXECUTE ON FUNCTION whoami() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION whoami() TO anon, authenticated, service_role;
