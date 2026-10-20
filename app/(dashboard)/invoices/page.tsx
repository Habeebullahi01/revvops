import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { FinancialPill, Money } from "@/components/money";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "cn";

// Session-reading page: renders at request time (blocking, see layout).
export const instant = false;

interface InvoiceRow {
  id: string;
  total_amount: string;
  complaint: string;
  created_at: string;
  job_order_id: string | null;
  customers: { name: string } | null;
  vehicles: { license_plate: string; make: string; model: string } | null;
}

interface PaymentRow {
  invoice_id: string;
  amount: string;
}

const code = (id: string) => `INV-${id.slice(0, 8).toUpperCase()}`;

const raisedOn = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export default async function InvoicesPage() {
  await requireRole(["admin", "manager", "reception"]);

  const supabase = await createClient();

  const [invoiceRes, paymentRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, total_amount, complaint, created_at, job_order_id, customers(name), vehicles(license_plate, make, model)",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("payments")
      .select("invoice_id, amount")
      .not("invoice_id", "is", null),
  ]);

  const invoices = (invoiceRes.data ?? []) as unknown as InvoiceRow[];
  const payments = (paymentRes.data ?? []) as unknown as PaymentRow[];

  const paidByInvoice = new Map<string, number>();
  for (const row of payments) {
    paidByInvoice.set(
      row.invoice_id,
      (paidByInvoice.get(row.invoice_id) ?? 0) + Number(row.amount),
    );
  }

  return (
    <div className="space-y-4">
      {/* Title row on the page ground: one primary action at the right. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-title font-semibold">Invoices</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every invoice raised at the front desk, newest first. Open one to
            record a payment or raise its job order.
          </p>
        </div>
        <Link href="/invoices/new" className={buttonVariants()}>
          New invoice
        </Link>
      </div>

      {invoiceRes.error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          Could not load invoices: {invoiceRes.error.message}
        </p>
      )}

      {!invoiceRes.error && invoices.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm font-medium">No invoices yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Raise the first one — customer, vehicle, complaint and the cost
            breakdown.
          </p>
          <Link
            href="/invoices/new"
            className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
          >
            New invoice
          </Link>
        </div>
      )}

      {invoices.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Invoice</th>
                <th className="py-2 pr-4 font-medium">Customer</th>
                <th className="py-2 pr-4 font-medium">Vehicle</th>
                <th className="py-2 pr-4 text-right font-medium">Total</th>
                <th className="py-2 pr-4 text-right font-medium">Paid</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((row) => {
                const total = Number(row.total_amount);
                const paid = paidByInvoice.get(row.id) ?? 0;
                const status =
                  paid + 0.004 >= total
                    ? "paid"
                    : paid > 0
                      ? "part_paid"
                      : "unpaid";

                return (
                  <tr
                    key={row.id}
                    className="relative border-t border-rule transition-colors hover:bg-muted/40"
                  >
                    <td className="py-3 pr-4 align-top">
                      <Link
                        href={`/invoices/${row.id}`}
                        className="font-mono text-xs font-medium after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {code(row.id)}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {raisedOn(row.created_at)}
                      </div>
                    </td>
                    <td className="py-3 pr-4 align-top">
                      <span className="font-medium">
                        {row.customers?.name ?? "—"}
                      </span>
                      <div className="truncate text-xs text-muted-foreground">
                        {row.complaint}
                      </div>
                    </td>
                    <td className="py-3 pr-4 align-top">
                      <span className="font-mono text-xs">
                        {row.vehicles?.license_plate ?? "—"}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {[row.vehicles?.make, row.vehicles?.model]
                          .filter(Boolean)
                          .join(" ")}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right align-top">
                      <Money value={total} />
                    </td>
                    <td className="py-3 pr-4 text-right align-top">
                      <Money
                        value={paid}
                        className={
                          paid > 0 ? "text-foreground" : "text-muted-foreground"
                        }
                      />
                    </td>
                    <td className="py-3 align-top">
                      <FinancialPill status={status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="pt-3 text-xs text-muted-foreground">
            {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
            {invoiceRes.data && invoiceRes.data.length === 200
              ? " (showing the latest 200)"
              : ""}
          </p>
        </div>
      )}
    </div>
  );
}
