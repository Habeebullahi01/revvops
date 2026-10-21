"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { JOB_ORDER_PAID_RATIO } from "@/lib/invoice-rules";

/**
 * The execution vocabulary (job_orders CHECK, 0008). Officers may jump to any
 * value from any value; a cancelled job is terminal.
 */
const EXECUTION_STATUSES = [
  "pending",
  "in_progress",
  "waiting_parts",
  "completed",
  "cancelled",
] as const;
export type OfficerExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export interface CreateJobOrderFromInvoiceInput {
  invoiceId: string;
  dateIn: string; // YYYY-MM-DD
  expectedDateOut?: string; // YYYY-MM-DD
  assignedTechnicianId?: string;
  notes?: string;
}

/**
 * Raise a job order from an invoice — the one explicit bridge in the
 * invoice-first flow. The invoice is NOT allowed to create a job order by
 * itself; this action is the only place it happens.
 *
 * Guard: the invoice must be at least 50% paid (checked here as well as in
 * the UI, so the rule survives a stale page).
 */
export async function createJobOrderFromInvoice(
  input: CreateJobOrderFromInvoiceInput,
) {
  const { profile } = await requireRole(["admin", "manager", "reception"]);

  if (!input.invoiceId) throw new Error("Invoice is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateIn)) {
    throw new Error("Date in is required");
  }
  if (input.expectedDateOut && !/^\d{4}-\d{2}-\d{2}$/.test(input.expectedDateOut)) {
    throw new Error("Expected date out is not a valid date");
  }

  const supabase = await createClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, customer_id, vehicle_id, complaint, total_amount, job_order_id")
    .eq("id", input.invoiceId)
    .maybeSingle();

  if (invoiceError) throw new Error(invoiceError.message);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.job_order_id) throw new Error("This invoice already has a job order");

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("amount")
    .eq("invoice_id", input.invoiceId);
  if (paymentsError) throw new Error(paymentsError.message);

  const total = Number(invoice.total_amount);
  const paid = (payments ?? []).reduce(
    (sum, row) => sum + Number(row.amount),
    0,
  );
  const required = total * JOB_ORDER_PAID_RATIO;
  if (paid + 0.004 < required) {
    throw new Error(
      `At least 50% of the invoice must be paid before a job order can be raised (₦${paid.toFixed(
        2,
      )} paid of the ₦${required.toFixed(2)} required)`,
    );
  }

  // Gapless JO-YYYY-NNNN (numbering RPC, officers + server only).
  const { data: jobNumber, error: numberError } = await supabase.rpc(
    "get_next_document_number",
    { p_document_type: "job_order" },
  );
  if (numberError) throw new Error(numberError.message);

  const financialStatus =
    paid + 0.004 >= total ? "paid" : paid > 0 ? "part_paid" : "unpaid";

  const { data: jobOrder, error: insertError } = await supabase
    .from("job_orders")
    .insert({
      job_number: jobNumber,
      customer_id: invoice.customer_id,
      vehicle_id: invoice.vehicle_id,
      complaint: invoice.complaint,
      estimated_amount: total,
      assigned_technician_id: input.assignedTechnicianId || null,
      created_by: profile.id,
      date_in: input.dateIn,
      expected_date_out: input.expectedDateOut || null,
      notes: input.notes?.trim() || null,
      financial_status: financialStatus,
    })
    .select("id, job_number")
    .single();

  if (insertError) throw new Error(insertError.message);

  const { error: linkError } = await supabase
    .from("invoices")
    .update({ job_order_id: jobOrder.id })
    .eq("id", input.invoiceId);

  if (linkError) throw new Error(linkError.message);

  revalidatePath(`/invoices/${input.invoiceId}`);
  revalidatePath("/invoices");

  await logAudit({
    userId: profile.id,
    action: "job_order.created_from_invoice",
    entityType: "job_order",
    entityId: jobOrder.id,
    details: {
      invoice_id: input.invoiceId,
      job_number: jobOrder.job_number,
      paid,
      total,
    },
  });

  return jobOrder;
}

/**
 * Officer path: set execution_status directly, any value to any value.
 *
 * This is deliberately NOT a job log. Technicians drive the workflow from
 * the workshop floor and their history lives in `job_logs`; an officer
 * correcting or closing a job writes `job_orders` itself and the audit log
 * records the move (BUSINESS_RULES.md §3.1). A cancelled job is terminal —
 * undoing a cancellation is a decision, not a status change.
 */
export async function updateJobOrderExecutionStatus(input: {
  jobOrderId: string;
  executionStatus: OfficerExecutionStatus;
}) {
  const { profile } = await requireRole(["admin", "manager", "reception"]);

  if (!input.jobOrderId) throw new Error("Job order is required");
  if (!EXECUTION_STATUSES.includes(input.executionStatus)) {
    throw new Error("Unsupported status");
  }

  const supabase = await createClient();

  const { data: current, error: readError } = await supabase
    .from("job_orders")
    .select("id, job_number, execution_status")
    .eq("id", input.jobOrderId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);
  if (!current) throw new Error("Job order not found");
  if (current.execution_status === input.executionStatus) {
    throw new Error("The job order is already in that status");
  }
  if (current.execution_status === "cancelled") {
    throw new Error("A cancelled job order is final and cannot be reopened");
  }

  // An actual date out is what "completed" means on the paper trail; stamp
  // it if the job finished without one having been entered.
  const patch: Record<string, string> = {
    execution_status: input.executionStatus,
  };
  if (input.executionStatus === "completed") {
    const { data: existing } = await supabase
      .from("job_orders")
      .select("actual_date_out")
      .eq("id", input.jobOrderId)
      .maybeSingle();
    if (!existing?.actual_date_out) {
      patch.actual_date_out = new Date().toISOString().slice(0, 10);
    }
  }

  const { error } = await supabase
    .from("job_orders")
    .update(patch)
    .eq("id", input.jobOrderId);

  if (error) throw new Error(error.message);

  revalidatePath(`/job-orders/${input.jobOrderId}`);
  revalidatePath("/job-orders");

  await logAudit({
    userId: profile.id,
    action: "job_order.execution_status_changed",
    entityType: "job_order",
    entityId: input.jobOrderId,
    details: {
      job_number: current.job_number,
      from: current.execution_status,
      to: input.executionStatus,
      source: "officer",
    },
  });

  return { ok: true };
}

/**
 * Assign or clear the technician on an existing job order. The profile must
 * be an active technician — assignment drives who may post job logs, so a
 * typo here locks the wrong person out of the work.
 */
export async function assignJobOrder(input: {
  jobOrderId: string;
  technicianId: string | null;
}) {
  const { profile } = await requireRole(["admin", "manager", "reception"]);

  if (!input.jobOrderId) throw new Error("Job order is required");

  const supabase = await createClient();

  let technicianName: string | null = null;
  if (input.technicianId) {
    const { data: technician, error: techError } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", input.technicianId)
      .maybeSingle();

    if (techError) throw new Error(techError.message);
    if (!technician) throw new Error("Technician not found");
    if (technician.role !== "technician" || !technician.is_active) {
      throw new Error("That profile is not an active technician");
    }
    technicianName = technician.full_name;
  }

  const { data: job, error: readError } = await supabase
    .from("job_orders")
    .select("id, job_number, assigned_technician_id")
    .eq("id", input.jobOrderId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);
  if (!job) throw new Error("Job order not found");

  const { error } = await supabase
    .from("job_orders")
    .update({ assigned_technician_id: input.technicianId })
    .eq("id", input.jobOrderId);

  if (error) throw new Error(error.message);

  revalidatePath(`/job-orders/${input.jobOrderId}`);
  revalidatePath("/job-orders");

  await logAudit({
    userId: profile.id,
    action: "job_order.technician_assigned",
    entityType: "job_order",
    entityId: input.jobOrderId,
    details: {
      job_number: job.job_number,
      technician_id: input.technicianId,
      technician_name: technicianName,
    },
  });

  return { ok: true };
}

export interface UpdateJobOrderInput {
  jobOrderId: string;
  complaint: string;
  dateIn: string;
  expectedDateOut?: string | null;
  actualDateOut?: string | null;
  actualAmount?: string | null;
  notes?: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Officer correction path. Keys get mistyped and vehicles leave early, so
 * the facts on a job order stay editable after creation — except the money
 * that has already been counted: `actual_amount` may be set or corrected,
 * but `financial_status` is never written here (it belongs to the payments
 * recorded against the invoice).
 */
export async function updateJobOrder(input: UpdateJobOrderInput) {
  const { profile } = await requireRole(["admin", "manager", "reception"]);

  if (!input.jobOrderId) throw new Error("Job order is required");
  if (!input.complaint?.trim()) throw new Error("Complaint is required");
  if (!ISO_DATE.test(input.dateIn)) throw new Error("Date in is required");
  if (input.expectedDateOut && !ISO_DATE.test(input.expectedDateOut)) {
    throw new Error("Expected date out is not a valid date");
  }
  if (input.actualDateOut && !ISO_DATE.test(input.actualDateOut)) {
    throw new Error("Actual date out is not a valid date");
  }

  let actualAmount: number | null = null;
  if (input.actualAmount != null && `${input.actualAmount}`.trim() !== "") {
    actualAmount = Number(input.actualAmount);
    if (!Number.isFinite(actualAmount) || actualAmount < 0) {
      throw new Error("Actual amount must be zero or more");
    }
    actualAmount = Math.round(actualAmount * 100) / 100;
  }

  const supabase = await createClient();

  const { data: current, error: readError } = await supabase
    .from("job_orders")
    .select("id, job_number, actual_amount, execution_status")
    .eq("id", input.jobOrderId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);
  if (!current) throw new Error("Job order not found");

  const { error } = await supabase
    .from("job_orders")
    .update({
      complaint: input.complaint.trim(),
      date_in: input.dateIn,
      expected_date_out: input.expectedDateOut || null,
      actual_date_out: input.actualDateOut || null,
      actual_amount: actualAmount,
      notes: input.notes?.trim() || null,
    })
    .eq("id", input.jobOrderId);

  if (error) throw new Error(error.message);

  revalidatePath(`/job-orders/${input.jobOrderId}`);
  revalidatePath("/job-orders");

  await logAudit({
    userId: profile.id,
    action: "job_order.updated",
    entityType: "job_order",
    entityId: input.jobOrderId,
    details: {
      job_number: current.job_number,
      actual_amount_from: current.actual_amount,
      actual_amount_to: actualAmount,
    },
  });

  return { ok: true };
}
