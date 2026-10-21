"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
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
export async function createInvoice(input: CreateInvoiceInput) {
  // Officer-only: technicians have zero financial access (BUSINESS_RULES.md §5).
  const { profile } = await requireRole(["admin", "manager", "reception"]);

  const complaint = input.complaint.trim();
  if (!complaint) throw new Error("Complaint / work description is required");
  if (!input.customerId) throw new Error("Customer is required");
  if (!input.vehicleId) throw new Error("Vehicle is required");

  const lines = input.costBreakdown.filter(
    (line) => line.description.trim() && line.amount > 0,
  );
  if (lines.length === 0) throw new Error("Add at least one cost line");
  if (input.totalAmount <= 0) throw new Error("Total amount must be greater than 0");
  if (!BILLING_TYPES.includes(input.billingType)) {
    throw new Error("Unsupported billing type");
  }
  if (!INVOICE_CATEGORIES.includes(input.category)) {
    throw new Error("Unsupported invoice category");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      customer_id: input.customerId,
      vehicle_id: input.vehicleId,
      complaint,
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

  return data;
}
