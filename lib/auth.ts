import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LANDING, isRole, type Profile, type Role } from "@/lib/types";

export interface AuthContext {
  userId: string;
  email: string;
  profile: Profile;
}

/**
 * Resolve the signed-in user and their profile row, cached per request.
 * Returns null when there is no valid session (querying Supabase on every
 * call verifies the JWT — an expired cookie never yields a user).
 *
 * Redirects (used by layouts/pages that must not render without a profile):
 *   - no session            → /login
 *   - no profile row        → /login?error=not_provisioned
 *   - profile.is_active=false → /login?error=inactive
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  // Supabase's getUser() reads Date.now() for token-expiry checks, which is
  // unstable during prerendering (Next 16 blocking-prerender-current-time).
  // connection() marks everything after it as request-time work.
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, phone, is_active, created_at, updated_at")
    .eq("id", user.id)
    .single();

  const profile = data && isRole(data.role) ? (data as Profile) : null;

  if (!profile) redirect("/login?error=not_provisioned");
  if (!profile.is_active) redirect("/login?error=inactive");

  return { userId: user.id, email: user.email ?? "", profile };
});

/** Require a signed-in, provisioned, active user. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * Require one of the given roles. Non-matching roles are sent to their own
 * landing page (e.g. a technician hitting /dashboard lands on /technician).
 */
export async function requireRole(roles: readonly Role[]): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!roles.includes(ctx.profile.role)) {
    redirect(ROLE_LANDING[ctx.profile.role]);
  }
  return ctx;
}
