import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "../print-button";
import { ReceiptSheet, type ReceiptData } from "./receipt-sheet";

// Session-reading page: renders at request time (blocking, see layout).
export const instant = false;

interface ReceiptRow {
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

interface PaymentRow {
  id: string;
  amount: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  receiver: { full_name: string } | null;
}

interface InvoiceRow {
  id: string;
  total_amount: string;
  complaint: string;
  created_at: string;
  customer: {
    name: string;
    phone: string;
    email: string | null;
    address: string | null;
  } | null;
  vehicle: {
    license_plate: string;
    make: string | null;
    model: string | null;
    year: number | null;
  } | null;
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin", "manager", "reception"]);

  const supabase = await createClient();

  const { data: receiptData, error: receiptError } = await supabase
    .from("receipts")
    .select(
      "id, receipt_number, payment_id, invoice_id, job_order_id, amount, is_duplicate, original_receipt_id, printed_by, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (receiptError) throw new Error(receiptError.message);
  if (!receiptData) notFound();

  const receipt = receiptData as unknown as ReceiptRow;

  // A receipt hangs off an invoice (invoice-first) or a job order (old path).
  // Resolve whichever parent exists so the sheet always names its source.
  const [paymentRes, invoiceRes, originalRes, jobRes] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id, amount, payment_method, reference_number, notes, receiver:received_by ( full_name )",
      )
      .eq("id", receipt.payment_id)
      .maybeSingle(),
    receipt.invoice_id
      ? supabase
          .from("invoices")
          .select(
            "id, total_amount, complaint, created_at, customer:customer_id ( name, phone, email, address ), vehicle:vehicle_id ( license_plate, make, model, year )",
          )
          .eq("id", receipt.invoice_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    receipt.original_receipt_id
      ? supabase
          .from("receipts")
          .select("id, receipt_number")
          .eq("id", receipt.original_receipt_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    receipt.job_order_id
      ? supabase
          .from("job_orders")
          .select("id, job_number")
          .eq("id", receipt.job_order_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (paymentRes.error) throw new Error(paymentRes.error.message);
  if (invoiceRes.error) throw new Error(invoiceRes.error.message);
  if (originalRes.error) throw new Error(originalRes.error.message);
  if (jobRes.error) throw new Error(jobRes.error.message);

  const payment = paymentRes.data as unknown as PaymentRow | null;
  const invoice = invoiceRes.data as unknown as InvoiceRow | null;
  const original = originalRes.data as { receipt_number: string } | null;
  const job = jobRes.data as { job_number: string } | null;

  // What the invoice looks like right now, so the receipt can show the
  // balance as of the moment it was printed. An unlinked receipt (old
  // job-order path) has no invoice to report against; fall back to itself.
  let paidToDate = Number(receipt.amount);
  let balance = 0;
  if (invoice) {
    const { data: payments, error: paymentsError } = await supabase
      .from("payments")
      .select("amount")
      .eq("invoice_id", invoice.id);
    if (paymentsError) throw new Error(paymentsError.message);
    paidToDate = (payments ?? []).reduce(
      (sum, row) => sum + Number(row.amount),
      0,
    );
    balance = Math.round((Number(invoice.total_amount) - paidToDate) * 100) / 100;
  }

  const sheet: ReceiptData = {
    receipt_number: receipt.receipt_number,
    is_duplicate: receipt.is_duplicate,
    original_receipt_number: original?.receipt_number ?? null,
    created_at: receipt.created_at,
    amount: receipt.amount,
    payment_method: payment?.payment_method ?? "—",
    reference_number: payment?.reference_number ?? null,
    notes: payment?.notes ?? null,
    issued_by: payment?.receiver?.full_name ?? null,
    workshop_name:
      process.env.NEXT_PUBLIC_WORKSHOP_NAME || "Workshop Management System",
    invoice: {
      id: invoice?.id ?? "",
      code: invoice ? `INV-${invoice.id.slice(0, 8).toUpperCase()}` : "—",
      total_amount: invoice?.total_amount ?? receipt.amount,
      complaint: invoice?.complaint ?? "",
      created_at: invoice?.created_at ?? receipt.created_at,
      paid_to_date: paidToDate,
      balance,
    },
    customer: invoice?.customer ?? null,
    vehicle: invoice?.vehicle ?? null,
    job_order_number: job?.job_number ?? null,
  };

  return (
    <>
      {/* Everything on screen is hidden on paper; the sheet is the artefact. */}
      <div className="space-y-4 print:hidden">
        <Link
          href={invoice ? `/invoices/${invoice.id}` : "/invoices"}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          {invoice ? "Back to the invoice" : "All invoices"}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-title font-semibold">
              Receipt{" "}
              <span className="font-mono text-lg">{receipt.receipt_number}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {receipt.is_duplicate
                ? `A duplicate reprint of ${original?.receipt_number ?? "an original"}.`
                : "Issued automatically when the payment was recorded."}
            </p>
          </div>
          <PrintButton>Print receipt</PrintButton>
        </div>

        <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-8">
          <p className="text-center text-sm text-muted-foreground">
            The receipt renders as an A4 sheet in print preview.
          </p>
        </div>
      </div>

      {/*
       * The sheet itself. Hidden on screen (the summary above stands in for
       * it), revealed by `@media print` — same idiom as the job card, so
       * printing costs one button and no navigation.
       */}
      <div className="hidden print:block">
        <ReceiptSheet receipt={sheet} />
      </div>
    </>
  );
}
