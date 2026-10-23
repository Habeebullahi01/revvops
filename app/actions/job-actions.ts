"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionStatus } from "@/lib/action-result";

/** Statuses a job log may carry (job_logs CHECK, 0008 vocabulary). */
const TECHNICAL_STATUSES = ["in_progress", "waiting_parts", "completed"] as const;
export type ExecutionStatus = (typeof TECHNICAL_STATUSES)[number];

/**
 * Technicians change execution status ONLY by posting a job log — the
 * SECURITY DEFINER trigger in 0002/0008 syncs job_orders.execution_status
 * and enforces the transition map, so an illegal jump simply does nothing.
 *
 * No financial column is read or written anywhere on this path.
 */
export async function logExecutionStatus(input: {
  jobOrderId: string;
  executionStatus: ExecutionStatus;
  notes?: string;
}): Promise<ActionStatus> {
  const { profile } = await requireRole(["technician"]);

  if (!input.jobOrderId) return { ok: false, error: "Job order is required" };
  if (!TECHNICAL_STATUSES.includes(input.executionStatus)) {
    return { ok: false, error: "Unsupported status" };
  }

  const supabase = await createClient();

  // Friendly assignment check first: RLS would reject the insert anyway,
  // but the reason should be readable rather than a raw 42501.
  const { data: job, error: jobError } = await supabase
    .from("job_orders_tech_view")
    .select("assigned_technician_id")
    .eq("id", input.jobOrderId)
    .single();

  if (jobError) return { ok: false, error: "Job order not found" };
  if (job.assigned_technician_id !== profile.id) {
    return {
      ok: false,
      error: "You are not the assigned technician for this job order",
    };
  }

  const { error } = await supabase.from("job_logs").insert({
    job_order_id: input.jobOrderId,
    technician_id: profile.id,
    execution_status: input.executionStatus,
    notes: input.notes?.trim() || null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/technician");
  return { ok: true };
}
