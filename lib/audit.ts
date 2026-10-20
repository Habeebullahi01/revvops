import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export interface AuditEntry {
  /** Who did it — the profile id from the session, never from the client. */
  userId: string;
  /** e.g. "invoice.created", "payment.recorded", "job_order.created" */
  action: string;
  /** e.g. "invoice", "payment", "job_order" */
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
}

/**
 * Immutable audit entry (BUSINESS_RULES.md §2.3).
 *
 * Written with the service role because the audit RLS policy only lets a user
 * insert their *own* row while the API layer rejects it — see the T17 known
 * issue in scripts/rls-test-suite.mjs. Best effort by design: a failed audit
 * write is logged, never rolled back over the user's action.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const { error } = await createServiceClient().from("audit_logs").insert({
      user_id: entry.userId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      details: entry.details ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("[audit] failed to write", entry.action, error);
  }
}
