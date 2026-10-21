import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FinancialPill } from "@/components/money";
import { requireRole } from "@/lib/auth";
import { billingLabel, categoryLabel, CATEGORY_STYLES } from "@/lib/invoice-vocabulary";
import { formatNaira } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { JobOrderPanel } from "./job-order-panel";
import { PaymentForm } from "./payment-form";
import { ReprintReceiptButton } from "./reprint-receipt-button";

// Session-reading page: renders at request time (blocking, see layout).
export const instant = false;

interface CostLine {
  description: string;
  amount: number;
  itemType: "labor" | "part";
}

interface InvoiceDetail {
  id: string;
  complaint: string;
  cost_breakdown: CostLine[] | null;
  total_amount: string;
  created_at: string;
  job_order_id: string | null;
  billing_type: string;
  category: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    address: string | null;
  } | null;
  vehicle: {
    id: string;
    license_plate: string;
    make: string;
    model: string;
    year: number;
  } | null;
  creator: { id: string; full_name: string } | null;
}

interface PaymentDetail {
  id: string;
  amount: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  receiver: { full_name: string } | null;
  /** The receipt auto-issued when this payment was recorded (D1). */
  receipts: {
    id: string;
    receipt_number: string;
    is_duplicate: boolean | null;
  }[];
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  transfer: "Transfer",
  card: "Card",
  other: "Other",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin", "manager", "reception"]);

  const supabase = await createClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      `
      id, complaint, cost_breakdown, total_amount, created_at, job_order_id,
      billing_type, category,
      customer:customer_id ( id, name, phone, email, address ),
      vehicle:vehicle_id ( id, license_plate, make, model, year ),
      creator:created_by ( id, full_name )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (invoiceError) throw new Error(invoiceError.message);
  if (!invoice) notFound();

  const row = invoice as unknown as InvoiceDetail;

  const [paymentRes, jobRes] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id, amount, payment_method, reference_number, notes, created_at, receiver:received_by ( full_name ), receipts ( id, receipt_number, is_duplicate )",
      )
      .eq("invoice_id", row.id)
      .order("created_at", { ascending: true }),
    row.job_order_id
      ? supabase
          .from("job_orders")
          .select("id, job_number, execution_status")
          .eq("id", row.job_order_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (paymentRes.error) throw new Error(paymentRes.error.message);
  if (jobRes.error) throw new Error(jobRes.error.message);

  const payments = (paymentRes.data ?? []) as unknown as PaymentDetail[];
  const jobOrder = jobRes.data as {
    id: string;
    job_number: string;
    execution_status: string;
  } | null;

  const lines = Array.isArray(row.cost_breakdown)
    ? row.cost_breakdown.filter((line) => line && typeof line === "object")
    : [];
  const laborTotal = lines
    .filter((line) => line.itemType === "labor")
    .reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const partsTotal = lines
    .filter((line) => line.itemType === "part")
    .reduce((sum, line) => sum + Number(line.amount || 0), 0);

  const total = Number(row.total_amount);
  const paid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const balance = Math.round((total - paid) * 100) / 100;
  const status =
    paid + 0.004 >= total ? "paid" : paid > 0 ? "part_paid" : "unpaid";

  const invoiceCode = `INV-${row.id.slice(0, 8).toUpperCase()}`;
  const raisedOn = new Date(row.created_at).toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          All invoices
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-title font-semibold">
              Invoice{" "}
              <span className="font-mono text-lg">{invoiceCode}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Raised {raisedOn}
              {row.creator ? ` by ${row.creator.full_name}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span
                className={`inline-flex h-6 items-center rounded-4xl border px-2.5 ${CATEGORY_STYLES[row.category as keyof typeof CATEGORY_STYLES] ?? "border-border bg-muted/50 text-foreground"}`}
              >
                {categoryLabel(row.category)}
              </span>
              <span>{billingLabel(row.billing_type)}</span>
            </div>
          </div>
          <FinancialPill status={status} className="h-6 px-2.5 text-sm" />
        </div>
      </div>

      {/* Totals on the page ground, no card. */}
      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        <div className="bg-card px-4 py-3">
          <div className="text-xs text-muted-foreground">Invoice total</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatNaira(total)}
          </div>
        </div>
        <div className="bg-card px-4 py-3">
          <div className="text-xs text-muted-foreground">Paid to date</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatNaira(paid)}
          </div>
        </div>
        <div className="bg-card px-4 py-3">
          <div className="text-xs text-muted-foreground">Balance</div>
          <div
            className={`text-lg font-semibold tabular-nums ${
              balance > 0 ? "text-negative" : "text-positive"
            }`}
          >
            {formatNaira(balance)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer &amp; vehicle</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Customer</div>
                <div className="font-medium">{row.customer?.name ?? "—"}</div>
                <div className="text-sm text-muted-foreground">
                  {[row.customer?.phone, row.customer?.email]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {row.customer?.address && (
                  <div className="text-sm text-muted-foreground">
                    {row.customer.address}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Vehicle</div>
                <div className="font-mono text-sm font-medium">
                  {row.vehicle?.license_plate ?? "—"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {[row.vehicle?.make, row.vehicle?.model]
                    .filter(Boolean)
                    .join(" ")}
                  {row.vehicle?.year ? ` · ${row.vehicle.year}` : ""}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Complaint / work</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{row.complaint}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cost breakdown</CardTitle>
              <CardDescription>
                Labour and parts as entered on the invoice
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No breakdown lines were entered; only the total was billed.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="hidden grid-cols-[7rem_minmax(0,1fr)_9rem] gap-3 border-b border-rule bg-muted/50 px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid">
                    <span>Type</span>
                    <span>Description</span>
                    <span className="text-right">Amount</span>
                  </div>
                  <div className="divide-y divide-rule">
                    {lines.map((line, index) => (
                      <div
                        key={`${line.description}-${index}`}
                        className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[7rem_minmax(0,1fr)_9rem] sm:items-center sm:gap-3"
                      >
                        <span
                          className={`text-xs ${
                            line.itemType === "labor"
                              ? "text-brand"
                              : "text-muted-foreground"
                          }`}
                        >
                          {line.itemType === "part" ? "Part" : "Labor"}
                        </span>
                        <span>{line.description || "—"}</span>
                        <span className="tabular-nums sm:text-right">
                          {formatNaira(Number(line.amount || 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-3 border-t border-rule bg-muted/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Labor{" "}
                        <b className="font-medium text-foreground tabular-nums">
                          {formatNaira(laborTotal)}
                        </b>
                      </span>
                      <span>
                        Parts{" "}
                        <b className="font-medium text-foreground tabular-nums">
                          {formatNaira(partsTotal)}
                        </b>
                      </span>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        Invoice total
                      </div>
                      <div className="text-lg font-semibold tabular-nums">
                        {formatNaira(total)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <JobOrderPanel
            invoiceId={row.id}
            total={total}
            paid={paid}
            jobOrder={jobOrder}
          />

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
              <CardDescription>
                {formatNaira(paid)} received of {formatNaira(total)} — balance{" "}
                {formatNaira(balance)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {payments.length > 0 && (
                <ul className="divide-y divide-rule overflow-hidden rounded-lg border border-border text-sm">
                  {payments.map((payment) => {
                    // Every payment carries exactly one original receipt plus
                    // any reprints (D1, D4). The original is the one to link;
                    // reprints are reachable from the receipt sheet itself.
                    const receipts = payment.receipts ?? [];
                    const original =
                      receipts.find((r) => !r.is_duplicate) ?? receipts[0];
                    return (
                      <li
                        key={payment.id}
                        className="flex items-start justify-between gap-3 px-3 py-2.5"
                      >
                        <div>
                          <div className="font-medium tabular-nums">
                            {formatNaira(Number(payment.amount))}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {METHOD_LABEL[payment.payment_method] ??
                              payment.payment_method}
                            {payment.reference_number
                              ? ` · Ref ${payment.reference_number}`
                              : ""}
                          </div>
                          {payment.notes && (
                            <div className="text-xs text-muted-foreground">
                              {payment.notes}
                            </div>
                          )}
                          {original && (
                            <div className="pt-1 text-xs">
                              <Link
                                href={`/receipts/${original.id}`}
                                className="font-mono font-medium text-brand underline underline-offset-2"
                              >
                                {original.receipt_number}
                              </Link>
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 space-y-1 text-right text-xs text-muted-foreground">
                          <div>
                            {new Date(payment.created_at).toLocaleDateString(
                              "en-NG",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              },
                            )}
                          </div>
                          {payment.receiver && (
                            <div>{payment.receiver.full_name}</div>
                          )}
                          {original && (
                            <ReprintReceiptButton receiptId={original.id} />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <PaymentForm invoiceId={row.id} balance={balance} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
