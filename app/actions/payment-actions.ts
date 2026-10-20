"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

const PAYMENT_METHODS = ["cash", "transfer", "card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
}

/**
 * Record a payment against an invoice (invoice-first: the job order may not
 * exist yet — payments.job_order_id is nullable since 0013).
 *
 * financial_status is NOT written here: the set_financial_status_from_payments
 * trigger (0010) infers it from invoice total vs payments on the linked job
 * order, and the invoice's own state is derived on read.
 */
export async function recordPayment(input: RecordPaymentInput) {
  const { profile } = await requireRole(["admin", "manager", "reception"]);

  if (!input.invoiceId) throw new Error("Invoice is required");
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) {
    throw new Error("Unsupported payment method");
  }
  const amount = Math.round(input.amount * 100) / 100;
  if (!(amount > 0)) throw new Error("Amount must be greater than 0");

  const supabase = await createClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, total_amount, job_order_id")
    .eq("id", input.invoiceId)
    .maybeSingle();

  if (invoiceError) throw new Error(invoiceError.message);
  if (!invoice) throw new Error("Invoice not found");

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("amount")
    .eq("invoice_id", input.invoiceId);

  if (paymentsError) throw new Error(paymentsError.message);

  const alreadyPaid = (payments ?? []).reduce(
    (sum, row) => sum + Number(row.amount),
    0,
  );
  const balance =
    Math.round((Number(invoice.total_amount) - alreadyPaid) * 100) / 100;
  if (amount > balance) {
    throw new Error(
      `Amount is above the balance of ₦${balance.toLocaleString("en-NG", {
        minimumFractionDigits: 2,
      })}`,
    );
  }

  const { data, error } = await supabase
    .from("payments")
    .insert({
      invoice_id: input.invoiceId,
      job_order_id: invoice.job_order_id,
      amount,
      payment_method: input.paymentMethod,
      reference_number: input.referenceNumber?.trim() || null,
      notes: input.notes?.trim() || null,
      received_by: profile.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath(`/invoices/${input.invoiceId}`);
  revalidatePath("/invoices");

  await logAudit({
    userId: profile.id,
    action: "payment.recorded",
    entityType: "payment",
    entityId: data.id,
    details: { invoice_id: input.invoiceId, amount, method: input.paymentMethod },
  });

  return data;
}
