import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatNaira } from "@/lib/money";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; method?: string }>;
}) {
  await requireRole(["admin", "manager", "reception"]);

  const { q, method } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const methodFilter =
    method && ["cash", "transfer", "card", "other"].includes(method) ? method : "";

  const supabase = await createClient();

  let request = supabase
    .from("payments")
    .select(
      "id, amount, payment_method, reference_number, notes, created_at, received_by, job_order_id, receipts(id, receipt_number)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (methodFilter) {
    request = request.eq("payment_method", methodFilter);
  }

  const { data, error } = await request;
  let rows = (data ?? []) as any[];

  if (query && rows.length > 0) {
    rows = rows.filter((r) => {
      if (r.receipts && Array.isArray(r.receipts)) {
        for (const rcpt of r.receipts) {
          if (rcpt.receipt_number?.toLowerCase().includes(query)) return true;
        }
      }
      if (r.reference_number?.toLowerCase().includes(query)) return true;
      return false;
    });
  }

  const total = rows.length;
  const totalAmount = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  const methods = [
    { value: "", label: "All methods" },
    { value: "cash", label: "Cash" },
    { value: "transfer", label: "Transfer" },
    { value: "card", label: "Card" },
    { value: "other", label: "Other" },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h1 className="text-title font-semibold">Payments</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Payment records with receipts. Search by receipt number or reference.
        </p>
      </div>

      <form action="/payments" method="get" className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="q" className="sr-only">
            Search
          </Label>
          <Input id="q" name="q" placeholder="Receipt # or reference" defaultValue={q} className="w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="method" className="sr-only">
            Method
          </Label>
          <select
            id="method"
            name="method"
            defaultValue={methodFilter}
            className="h-9 rounded-lg border border-input bg-background text-foreground px-2.5 text-sm [&>option]:bg-background [&>option]:text-foreground"
          >
            {methods.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonVariants({ size: "sm" })}>
          Apply
        </button>
        {(q || methodFilter) && (
          <Link href="/payments" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Clear
          </Link>
        )}
      </form>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Could not load payments: {error.message}
        </p>
      )}

      <div className="rounded-lg border border-rule bg-card">
        <div className="flex items-center justify-between border-b border-rule px-4 py-3">
          <div>
            <p className="text-sm font-medium">
              {total} payment{total === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-muted-foreground">{formatNaira(totalAmount)} collected</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2 pl-4 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium text-right">Amount</th>
                <th className="py-2 pr-4 font-medium">Method</th>
                <th className="py-2 pr-4 font-medium">Reference</th>
                <th className="py-2 pr-4 font-medium">Job Order</th>
                <th className="py-2 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    No payments found
                  </td>
                </tr>
              )}
              {rows.map((p) => {
                const date = new Date(p.created_at).toLocaleString("en-NG", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <tr key={p.id} className="border-t border-rule hover:bg-muted/40">
                    <td className="py-2 pl-4 pr-4 text-xs text-muted-foreground">{date}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatNaira(p.amount)}</td>
                    <td className="py-2 pr-4 capitalize">{p.payment_method}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{p.reference_number || "—"}</td>
                    <td className="py-2 pr-4">
                      {p.job_order_id ? (
                        <Link href={`/job-orders/${p.job_order_id}`} className="underline text-primary">
                          View
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <Link href={`/payments/${p.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
