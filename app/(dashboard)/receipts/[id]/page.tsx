import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ReceiptSheet } from "./receipt-sheet";
import { PrintButton } from "../print-button";

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin", "manager", "reception"]);

  const { id } = await params;
  const supabase = await createClient();

  const { data: receipt, error } = await supabase
    .from("receipts")
    .select(
      "id, receipt_number, payment_id, invoice_id, job_order_id, amount, is_duplicate, original_receipt_id, printed_by, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !receipt) {
    notFound();
  }

  const [{ data: payment }, { data: invoice }, { data: job }, { data: printedBy }] =
    await Promise.all([
      (receipt as any).payment_id
        ? supabase
            .from("payments")
            .select("id, amount, payment_method, reference_number, received_by, created_at")
            .eq("id", (receipt as any).payment_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      (receipt as any).invoice_id
        ? supabase
            .from("invoices")
            .select(
              "id, customer_id, vehicle_id, total_amount, billing_type, category, complaint, customers(name, phone), vehicles(license_plate, make, model)",
            )
            .eq("id", (receipt as any).invoice_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      (receipt as any).job_order_id
        ? supabase
            .from("job_orders")
            .select("id, job_number")
            .eq("id", (receipt as any).job_order_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      (receipt as any).printed_by
        ? supabase.from("profiles").select("full_name").eq("id", (receipt as any).printed_by).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1.5">
          <h1 className="text-title font-semibold">Receipt {receipt.receipt_number}</h1>
          <p className="text-sm text-muted-foreground">
            {(receipt as any).is_duplicate ? "Duplicate" : "Original"} receipt
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/payments/${(receipt as any).payment_id}`}
            className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3"
          >
            Back to Payment
          </Link>
          <PrintButton />
        </div>
      </div>

      <ReceiptSheet receipt={{
        receipt_number: receipt.receipt_number,
        is_duplicate: receipt.is_duplicate,
        original_receipt_number: (receipt as any).original_receipt_id ? null : null,
        created_at: receipt.created_at,
        amount: (receipt as any).amount,
        payment_method: (payment as any)?.payment_method ?? "—",
        reference_number: (payment as any)?.reference_number ?? null,
        notes: (payment as any)?.notes ?? null,
        issued_by: printedBy?.full_name ?? (payment as any)?.received_by ?? null,
        workshop_name: process.env.NEXT_PUBLIC_WORKSHOP_NAME || "Workshop Management System",
        invoice: {
          id: (invoice as any)?.id ?? "",
          code: (invoice as any) ? `INV-${(invoice as any).id.slice(0,8).toUpperCase()}` : "—",
          total_amount: (invoice as any)?.total_amount ?? (receipt as any).amount,
          complaint: (invoice as any)?.complaint ?? "",
          created_at: (invoice as any)?.created_at ?? receipt.created_at,
          paid_to_date: Number((payment as any)?.amount ?? (receipt as any).amount),
          balance: (invoice as any) ? Math.max(0, Number((invoice as any).total_amount || 0) - Number((payment as any)?.amount ?? (receipt as any).amount)) : 0,
        },
        customer: (invoice as any)?.customers ?? null,
        vehicle: (invoice as any)?.vehicles ?? null,
        job_order_number: (job as any)?.job_number ?? null,
      } as any} />
    </div>
  );
}
