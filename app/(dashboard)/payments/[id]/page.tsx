import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatNaira } from "@/lib/money";
import { buttonVariants } from "@/components/ui/button";
import { PrintButton } from "@/app/(dashboard)/receipts/print-button";

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin", "manager", "reception"]);

  const { id } = await params;
  const supabase = await createClient();

  const { data: payment, error } = await supabase
    .from("payments")
    .select(
      "id, amount, payment_method, reference_number, notes, created_at, received_by, job_order_id, invoice_id, receipts(id, receipt_number, printed_by, created_at)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !payment) {
    notFound();
  }

  const receipt =
    Array.isArray((payment as any).receipts) && (payment as any).receipts.length > 0
      ? (payment as any).receipts[0]
      : null;

  let customerName: string | null = null;
  let receiverName: string | null = null;

  if ((payment as any).invoice_id) {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("customer_id, customers(name)")
      .eq("id", (payment as any).invoice_id)
      .maybeSingle();
    if (invoice) {
      customerName = (invoice as any).customers?.name || null;
    }
  }

  if ((payment as any).received_by) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", (payment as any).received_by)
      .maybeSingle();
    if (profile) {
      receiverName = (profile as any).full_name || null;
    }
  }

  const date = new Date((payment as any).created_at).toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <h1 className="text-title font-semibold">Payment</h1>
          <p className="text-sm text-muted-foreground">Payment ID: {(payment as any).id}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/payments" className={buttonVariants({ variant: "outline" })}>
            Back to Payments
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-rule bg-card p-6 space-y-4 max-w-2xl">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Amount</p>
            <p className="text-lg font-semibold tabular-nums">{formatNaira((payment as any).amount)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Payment Method</p>
            <p className="capitalize">{(payment as any).payment_method}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Date & Time</p>
            <p>{date}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Reference Number</p>
            <p>{(payment as any).reference_number || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Paid By (Customer)</p>
            <p>{customerName || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Received By</p>
            <p>{receiverName || (payment as any).received_by || "—"}</p>
          </div>
          {receipt && (
            <div>
              <p className="text-muted-foreground">Receipt Number</p>
              <p className="font-mono">{receipt.receipt_number}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">Job Order</p>
            <p>
              {(payment as any).job_order_id ? (
                <Link href={`/job-orders/${(payment as any).job_order_id}`} className="underline text-primary">
                  View Job Order
                </Link>
              ) : (
                "—"
              )}
            </p>
          </div>
          {(payment as any).invoice_id && (
            <div>
              <p className="text-muted-foreground">Invoice</p>
              <p>
                <Link href={`/invoices/${(payment as any).invoice_id}`} className="underline text-primary">
                  View Invoice
                </Link>
              </p>
            </div>
          )}
        </div>
        {(payment as any).notes && (
          <div>
            <p className="text-muted-foreground text-sm">Notes</p>
            <p className="text-sm whitespace-pre-wrap">{(payment as any).notes}</p>
          </div>
        )}
        {receipt && (
          <div className="pt-4 border-t border-rule flex items-center gap-2">
            <Link href={`/receipts/${receipt.id}`} className={buttonVariants({ size: "sm" })}>
              View & Print Receipt
            </Link>
          </div>
        )}
        {!receipt && (
          <div className="pt-4 border-t border-rule">
            <p className="text-xs text-muted-foreground">No receipt generated for this payment.</p>
          </div>
        )}
      </div>
    </div>
  );
}
