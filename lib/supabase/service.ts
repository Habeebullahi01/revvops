import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — server-side only, bypasses RLS.
 *
 * Reserved for work that must succeed regardless of the caller's policies
 * (today: audit entries, see lib/audit.ts). Never return it to the client and
 * never use it for reads that a user should be allowed or denied by policy.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service-role credentials are not configured");
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
