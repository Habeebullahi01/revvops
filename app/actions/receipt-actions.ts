"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

export interface ReceiptRow {
  id: string;
  receipt_number: string;
  payment_id: string;
  invoice_id: string | null;
  job_order_id: string | null;
  amount: string;
  is_duplicate: boolean | null;
  original_receipt_id: string | null;
  printed_by: string;
  created_at: string;
}

/**
 * Issue a duplicate (reprint) of an existing receipt.
 *
 * A receipt is evidence and is append-only (0015): nothing here edits the
 * original. A reprint is a NEW row that points back at the original and is
 * flagged `is_duplicate`, so the paper trail shows both the first issue and
 * every subsequent printing (owner decision D4). Reprints never chain — a
 * reprint of a reprint still points at the original.
 *
 * The invoice-first flow issues the original automatically inside
 * `recordPayment`; this action exists for the second and later copies.
 */
export async function reprintReceipt(input: {
  receiptId: string;
}): Promise<ActionResult<{ id: string; receipt_number: string }>> {
  const { profile } = await requireRole(["admin", "manager", "reception"]);

  if (!input.receiptId) return { ok: false, error: "Receipt is required" };

  const supabase = await createClient();

  const { data: original, error: readError } = await supabase
    .from("receipts")
    .select(
      "id, receipt_number, payment_id, invoice_id, job_order_id, amount, is_duplicate, original_receipt_id",
    )
    .eq("id", input.receiptId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);
  if (!original) return { ok: false, error: "Receipt not found" };

  // Always point at the ORIGINAL, never at another duplicate.
  const rootId = (original.original_receipt_id ??
    original.id) as string;

  const { data: number, error: numberError } = await supabase.rpc(
    "get_next_document_number",
    { p_document_type: "receipt" },
  );
  if (numberError) throw new Error(numberError.message);

  const { data, error } = await supabase
    .from("receipts")
    .insert({
      receipt_number: number,
      payment_id: original.payment_id,
      invoice_id: original.invoice_id,
      job_order_id: original.job_order_id,
      amount: original.amount,
      is_duplicate: true,
      original_receipt_id: rootId,
      printed_by: profile.id,
    })
    .select("id, receipt_number")
    .single();

  if (error) throw new Error(error.message);

  if (original.invoice_id) {
    revalidatePath(`/invoices/${original.invoice_id}`);
  }

  await logAudit({
    userId: profile.id,
    action: "receipt.reprinted",
    entityType: "receipt",
    entityId: data.id,
    details: {
      receipt_number: data.receipt_number,
      original_receipt_number: original.receipt_number,
      original_receipt_id: rootId,
      payment_id: original.payment_id,
    },
  });

  return { ok: true, data };
}
