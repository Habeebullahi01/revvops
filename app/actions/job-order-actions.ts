"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { JOB_ORDER_PAID_RATIO } from "@/lib/invoice-rules";

const BILLING_TYPES = [
  "cng_installment",
  "post_service",
  "upfront",
] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

export interface CreateJobOrderFromInvoiceInput {
  invoiceId: string;
  billingType: BillingType;
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
  if (!BILLING_TYPES.includes(input.billingType)) {
    throw new Error("Unsupported billing type");
  }
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
      billing_type: input.billingType,
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
