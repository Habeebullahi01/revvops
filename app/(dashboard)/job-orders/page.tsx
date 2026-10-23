import Link from "next/link";
import { DirectorySearch } from "@/components/directory-search";
import { FinancialPill, Money } from "@/components/money";
import {
  EXECUTION_STATUSES,
  StatusPill,
  executionStatusLabel,
} from "@/components/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireRole } from "@/lib/auth";
import { billingLabel } from "@/lib/invoice-vocabulary";
import { likePattern, sanitizeQuery } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { cn } from "cn";

// Session-reading page: renders at request time (blocking, see layout).
export const instant = false;

const FINANCIAL_STATUSES = ["unpaid", "part_paid", "paid"] as const;

const FINANCIAL_LABEL: Record<string, string> = {
  unpaid: "Unpaid",
  part_paid: "Part paid",
  paid: "Paid",
};

/** Columns every job-order row needs: the job itself plus its joined names. */
const ROW_COLUMNS =
  "id, job_number, execution_status, financial_status, complaint, date_in, expected_date_out, actual_date_out, estimated_amount, actual_amount, customer_id, created_at, customers(name), vehicles(license_plate, make, model), assigned:profiles!job_orders_assigned_technician_id_fkey(full_name), invoices(billing_type, category)";

const shortDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-NG", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

interface JobRow {
  id: string;
  job_number: string;
  execution_status: string;
  financial_status: string;
  complaint: string;
  date_in: string;
  expected_date_out: string | null;
  actual_date_out: string | null;
  estimated_amount: string | null;
  actual_amount: string | null;
  customer_id: string;
  created_at: string;
  customers: { name: string } | null;
  vehicles: { license_plate: string; make: string; model: string } | null;
  assigned: { full_name: string } | null;
  /** How the invoice was billed. Moved off job_orders in 0015. */
  invoices: { billing_type: string; category: string } | null;
}

type Filters = Record<string, string | undefined>;

/** A filter chip: a plain link, so filtering needs no client JavaScript. */
function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-7 items-center rounded-4xl border px-3 text-xs font-medium transition-colors",
        active
          ? "border-transparent bg-foreground text-background"
          : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

/** Keep the other filters alive when one of them changes. */
function withParam(filters: Filters, key: string, value: string | null): string {
  const params = new URLSearchParams();
  for (const [name, current] of Object.entries(filters)) {
    if (current) params.set(name, current);
  }
  if (value) params.set(key, value);
  else params.delete(key);
  const query = params.toString();
  return query ? `/job-orders?${query}` : "/job-orders";
}

export default async function JobOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    payment?: string;
    from?: string;
    to?: string;
    technician?: string;
  }>;
}) {
  await requireRole(["admin", "manager", "reception"]);

  const { q, status, payment, from, to, technician } = await searchParams;
  const query = sanitizeQuery(q);
  const statusFilter = (EXECUTION_STATUSES as readonly string[]).includes(
    status ?? "",
  )
    ? (status as string)
    : "";
  const paymentFilter = (FINANCIAL_STATUSES as readonly string[]).includes(
    payment ?? "",
  )
    ? (payment as string)
    : "";
  const dateFrom = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : "";
  const dateTo = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : "";
  const technicianFilter = technician?.trim() || "";
  const filters: Filters = {
    q: query || undefined,
    status: statusFilter || undefined,
    payment: paymentFilter || undefined,
    from: dateFrom || undefined,
    to: dateTo || undefined,
    technician: technicianFilter || undefined,
  };

  const supabase = await createClient();

  const { data: technicians } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "technician")
    .eq("is_active", true)
    .order("full_name");

  // Status filters are plain column filters. The text search is either a
  // field match on the job itself, or a match through the joined customer /
  // vehicle tables — PostgREST cannot mix a dot-path and a top-level `or`,
  // so each dot path costs one extra id-only pass.
  let request = supabase
    .from("job_orders")
    .select(ROW_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (statusFilter) request = request.eq("execution_status", statusFilter);
  if (paymentFilter) request = request.eq("financial_status", paymentFilter);
  if (technicianFilter)
    request = request.eq("assigned_technician_id", technicianFilter);
  if (dateFrom) request = request.gte("date_in", dateFrom);
  if (dateTo) request = request.lte("date_in", dateTo);
  if (query) {
    request = request.or(
      `job_number.ilike.${likePattern(query)},complaint.ilike.${likePattern(query)}`,
    );
  }

  const { data, error } = await request;
  const directRows = (data ?? []) as unknown as JobRow[];

  let rows = directRows;
  if (query && !error) {
    const pattern = likePattern(query);
    const seen = new Set(directRows.map((row) => row.id));

    // `ilike(column, pattern)` is PostgREST's function filter: it is the one
    // form that reaches an embedded table without also selecting it (a
    // dot-path filter needs the embed listed in `select`), and it avoids the
    // row cap that a plain `select("id")` pass would hit on a busy table.
    const relatedIdPasses = await Promise.all([
      supabase.from("job_orders").select("id").ilike("customers.name", pattern),
      supabase.from("job_orders").select("id").ilike("vehicles.license_plate", pattern),
      supabase.from("job_orders").select("id").ilike("vehicles.make", pattern),
      supabase.from("job_orders").select("id").ilike("vehicles.model", pattern),
    ]);

    const relatedIds = relatedIdPasses
      .flatMap((pass) => (pass.data ?? []) as { id: string }[])
      .map((row) => row.id)
      .filter((id) => !seen.has(id));

    if (relatedIds.length > 0) {
      let relatedRequest = supabase
        .from("job_orders")
        .select(ROW_COLUMNS)
        .in("id", relatedIds.slice(0, 200));
      if (statusFilter) relatedRequest = relatedRequest.eq("execution_status", statusFilter);
      if (paymentFilter)
        relatedRequest = relatedRequest.eq("financial_status", paymentFilter);
      if (technicianFilter)
        relatedRequest = relatedRequest.eq("assigned_technician_id", technicianFilter);
      if (dateFrom) relatedRequest = relatedRequest.gte("date_in", dateFrom);
      if (dateTo) relatedRequest = relatedRequest.lte("date_in", dateTo);

      const relatedResult = await relatedRequest;
      const relatedRows = (relatedResult.data ?? []) as unknown as JobRow[];
      rows = [...directRows, ...relatedRows].sort((a, b) =>
        a.created_at < b.created_at ? 1 : -1,
      );
    }
  }

  const filtered = Boolean(
    query || statusFilter || paymentFilter || dateFrom || dateTo || technicianFilter,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-title font-semibold">Job Orders</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Work in the workshop, newest first. A job order is raised from a
            paid-up invoice — open one to assign it, move its status, or read
            the work timeline.
          </p>
        </div>
        <Link href="/invoices" className={buttonVariants()}>
          Raise job order
        </Link>
      </div>

      <DirectorySearch
        path="/job-orders"
        placeholder="Search by job number, customer, plate or complaint"
        defaultValue={query}
        hint="Matches a job number, the customer's name, a plate, or words in the complaint."
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterLink
          href={withParam(filters, "status", null)}
          active={!statusFilter}
        >
          All statuses
        </FilterLink>
        {EXECUTION_STATUSES.map((value) => (
          <FilterLink
            key={value}
            href={withParam(filters, "status", value)}
            active={statusFilter === value}
          >
            {executionStatusLabel(value)}
          </FilterLink>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterLink
          href={withParam(filters, "payment", null)}
          active={!paymentFilter}
        >
          Any payment
        </FilterLink>
        {FINANCIAL_STATUSES.map((value) => (
          <FilterLink
            key={value}
            href={withParam(filters, "payment", value)}
            active={paymentFilter === value}
          >
            {FINANCIAL_LABEL[value]}
          </FilterLink>
        ))}
      </div>

      <form
        action="/job-orders"
        method="get"
        className="grid gap-3 rounded-lg border border-rule bg-card p-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
      >
        <input type="hidden" name="q" value={query} />
        <input type="hidden" name="status" value={statusFilter} />
        <input type="hidden" name="payment" value={paymentFilter} />
        <div className="space-y-1.5">
          <Label htmlFor="from">Date in from</Label>
          <Input
            id="from"
            name="from"
            type="date"
            defaultValue={dateFrom}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">Date in to</Label>
          <Input id="to" name="to" type="date" defaultValue={dateTo} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="technician">Technician</Label>
          <select
            id="technician"
            name="technician"
            defaultValue={technicianFilter}
            className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Any technician</option>
            {(technicians ?? []).map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className={buttonVariants({ size: "sm" })}
          >
            Apply
          </button>
          {filtered && (
            <Link
              href="/job-orders"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Clear filters
            </Link>
          )}
        </div>
      </form>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          Could not load job orders: {error.message}
        </p>
      )}

      {!error && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm font-medium">
            {filtered ? "Nothing matches those filters" : "No job orders yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered
              ? "Clear the search and filters to see every job."
              : "Record a payment on an invoice, then raise its job order from the invoice page."}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Job</th>
                <th className="py-2 pr-4 font-medium">Customer</th>
                <th className="py-2 pr-4 font-medium">Vehicle</th>
                <th className="py-2 pr-4 font-medium">Technician</th>
                <th className="py-2 pr-4 font-medium">In / out</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 text-right font-medium">Amount</th>
                <th className="py-2 font-medium">Payment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const amount = row.actual_amount ?? row.estimated_amount;
                return (
                  <tr
                    key={row.id}
                    className="relative border-t border-rule transition-colors hover:bg-muted/40"
                  >
                    <td className="py-3 pr-4 align-top">
                      <Link
                        href={`/job-orders/${row.id}`}
                        className="font-mono text-xs font-medium after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {row.job_number}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {billingLabel(row.invoices?.billing_type)}
                      </div>
                    </td>
                    <td className="py-3 pr-4 align-top">
                      <span className="font-medium">
                        {row.customers?.name ?? "—"}
                      </span>
                      <div className="max-w-[16rem] truncate text-xs text-muted-foreground">
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
                    <td className="py-3 pr-4 align-top">
                      {row.assigned?.full_name ?? (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 align-top text-xs text-muted-foreground">
                      <div>{shortDate(row.date_in)}</div>
                      <div>{shortDate(row.expected_date_out)}</div>
                    </td>
                    <td className="py-3 pr-4 align-top">
                      <StatusPill status={row.execution_status} />
                    </td>
                    <td className="py-3 pr-4 text-right align-top">
                      {amount === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Money value={amount} />
                      )}
                    </td>
                    <td className="py-3 align-top">
                      <FinancialPill status={row.financial_status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="pt-3 text-xs text-muted-foreground">
            {rows.length} job order{rows.length === 1 ? "" : "s"}
            {query ? ` matching ${query}` : ""}
            {rows.length === 200 ? " (showing the latest 200)" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
