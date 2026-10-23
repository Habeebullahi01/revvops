import { formatNaira, NAIRA } from "@/lib/money";

/**
 * The payment receipt — a sheet of A4 the customer is handed.
 *
 * Unlike the job card (which is deliberately moneyless because it sits in a
 * windscreen), a receipt is a financial document: it states what was paid,
 * how, against which invoice, and what is still outstanding.
 *
 * A reprint is a separate row flagged `is_duplicate` and is marked as such on
 * paper — a duplicate must never pass for an original (owner decision D4).
 *
 * Presentational only: all data is resolved by the page.
 */

export interface ReceiptData {
  receipt_number: string;
  is_duplicate: boolean | null;
  original_receipt_number: string | null;
  created_at: string;
  amount: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  issued_by: string | null;
  workshop_name: string;
  invoice: {
    id: string;
    code: string;
    total_amount: string;
    complaint: string | null;
    created_at: string;
    paid_to_date: number;
    balance: number;
  };
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
  job_order_number: string | null;
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  transfer: "Bank transfer",
  card: "Card",
  other: "Other",
};

const longDate = (value: string) =>
  new Date(value).toLocaleString("en-NG", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function ReceiptSheet({ receipt }: { receipt: ReceiptData }) {
  const { invoice, customer, vehicle } = receipt;
  const vehicleLine =
    [vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || "—";

  return (
    <article
      aria-label={`Receipt ${receipt.receipt_number}`}
      className="receipt-sheet mx-auto max-w-[210mm] bg-card p-8 print:p-0"
    >
      <header className="flex items-start justify-between gap-6 border-b-2 border-foreground/80 pb-4">
        <div>
          <h1 className="text-title font-semibold">{receipt.workshop_name}</h1>
          <p className="text-sm text-muted-foreground">
            Payment receipt
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Receipt no.
          </div>
          <div className="font-mono text-lg font-semibold">
            {receipt.receipt_number}
          </div>
          <div className="text-xs text-muted-foreground">
            {longDate(receipt.created_at)}
          </div>
        </div>
      </header>

      {receipt.is_duplicate && (
        <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium">
          DUPLICATE — reprint of {receipt.original_receipt_number ?? "an original receipt"}.
          Not a first issue.
        </p>
      )}

      <section className="grid gap-6 border-b border-rule py-5 sm:grid-cols-2">
        <div className="space-y-1">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Received from
          </h2>
          <p className="font-medium">{customer?.name ?? "—"}</p>
          <p className="text-sm tabular-nums">{customer?.phone ?? "—"}</p>
          {customer?.email && (
            <p className="text-sm text-muted-foreground">{customer.email}</p>
          )}
          {customer?.address && (
            <p className="text-sm text-muted-foreground">{customer.address}</p>
          )}
        </div>

        <div className="space-y-1">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Vehicle
          </h2>
          <p className="font-mono font-medium">{vehicle?.license_plate ?? "—"}</p>
          <p className="text-sm">
            {vehicleLine}
            {vehicle?.year ? ` · ${vehicle.year}` : ""}
          </p>
          {receipt.job_order_number && (
            <p className="text-sm text-muted-foreground">
              Job order{" "}
              <span className="font-mono">{receipt.job_order_number}</span>
            </p>
          )}
        </div>
      </section>

      <section className="border-b border-rule py-5">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Against invoice
        </h2>
        <p className="font-mono text-sm font-medium">{invoice.code}</p>
        <p className="text-sm text-muted-foreground">
          Raised {new Date(invoice.created_at).toLocaleDateString("en-NG", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </p>
        <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
          {invoice.complaint || "Not recorded"}
        </p>
      </section>

      {/* The one table that matters: what was paid, and where it left the invoice. */}
      <section className="py-5">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-rule">
            <tr>
              <td className="py-2 text-muted-foreground">Amount received</td>
              <td className="py-2 text-right text-lg font-semibold tabular-nums">
                {formatNaira(Number(receipt.amount))}
              </td>
            </tr>
            <tr>
              <td className="py-2 text-muted-foreground">Method</td>
              <td className="py-2 text-right">
                {METHOD_LABEL[receipt.payment_method] ?? receipt.payment_method}
              </td>
            </tr>
            {receipt.reference_number && (
              <tr>
                <td className="py-2 text-muted-foreground">
                  Reference / teller
                </td>
                <td className="py-2 text-right font-mono text-xs">
                  {receipt.reference_number}
                </td>
              </tr>
            )}
            <tr>
              <td className="py-2 text-muted-foreground">Invoice total</td>
              <td className="py-2 text-right tabular-nums">
                {formatNaira(Number(invoice.total_amount))}
              </td>
            </tr>
            <tr>
              <td className="py-2 text-muted-foreground">Paid to date</td>
              <td className="py-2 text-right tabular-nums">
                {formatNaira(invoice.paid_to_date)}
              </td>
            </tr>
            <tr>
              <td className="py-2 font-medium">Balance outstanding</td>
              <td
                className={`py-2 text-right font-semibold tabular-nums ${
                  invoice.balance > 0 ? "text-negative" : "text-positive"
                }`}
              >
                {formatNaira(invoice.balance)}
              </td>
            </tr>
          </tbody>
        </table>

        {receipt.notes && (
          <p className="mt-3 text-sm text-muted-foreground">
            Note: {receipt.notes}
          </p>
        )}
      </section>

      <footer className="flex items-end justify-between gap-6 border-t border-rule pt-4">
        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p>
            Received by:{" "}
            <span className="font-medium text-foreground">
              {receipt.issued_by ?? "—"}
            </span>
          </p>
          <p>
            All amounts are in Nigerian Naira ({NAIRA}). Keep this receipt for
            your records.
          </p>
        </div>
        <div className="w-40 shrink-0 border-t border-foreground/40 pt-1 text-center text-xs text-muted-foreground">
          Signature / stamp
        </div>
      </footer>
    </article>
  );
}
