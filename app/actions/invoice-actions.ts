"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/action-result";
import {
  BILLING_TYPES,
  INVOICE_CATEGORIES,
  type BillingType,
  type InvoiceCategory,
} from "@/lib/invoice-vocabulary";

export interface CreateInvoiceInput {
  customerId: string;
  vehicleId: string;
  complaint: string;
  costBreakdown: {
    description: string;
    amount: number;
    itemType: "labor" | "part";
  }[];
  totalAmount: number;
  /**
   * How this invoice will be settled and what it is for. Both live on the
   * invoice since 0015 — the job order, once raised, only references them.
   */
  billingType: BillingType;
  category: InvoiceCategory;
}

/**
 * Invoice-first flow: this writes the invoice and nothing else. It never
 * touches job_orders — the job order is a separate, explicit action.
 * `created_by` comes from the session, not the client.
 */
export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<ActionResult<{ id: string }>> {
  // Officer-only: technicians have zero financial access (BUSINESS_RULES.md §5).
  const { profile } = await requireRole(["admin", "manager", "reception"]);

  const complaint = input.complaint.trim();
  // Optional since 0016: a healthy vehicle in for a fitment has no complaint.
  // Stored as NULL rather than an empty string so "not recorded" is one value,
  // not two.
  if (!input.customerId) return { ok: false, error: "Customer is required" };
  if (!input.vehicleId) return { ok: false, error: "Vehicle is required" };

  const lines = input.costBreakdown.filter(
    (line) => line.description.trim() && line.amount > 0,
  );
  if (lines.length === 0)
    return { ok: false, error: "Add at least one cost line" };
  if (input.totalAmount <= 0)
    return { ok: false, error: "Total amount must be greater than 0" };
  if (!BILLING_TYPES.includes(input.billingType)) {
    return { ok: false, error: "Unsupported billing type" };
  }
  if (!INVOICE_CATEGORIES.includes(input.category)) {
    return { ok: false, error: "Unsupported invoice category" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      customer_id: input.customerId,
      vehicle_id: input.vehicleId,
      complaint: complaint || null,
      cost_breakdown: lines,
      total_amount: input.totalAmount,
      billing_type: input.billingType,
      category: input.category,
      created_by: profile.id,
      job_order_id: null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/invoices");

  await logAudit({
    userId: profile.id,
    action: "invoice.created",
    entityType: "invoice",
    entityId: data.id,
    details: {
      customer_id: input.customerId,
      total_amount: input.totalAmount,
      billing_type: input.billingType,
      category: input.category,
    },
  });

  return { ok: true, data: { id: data.id } };
}
