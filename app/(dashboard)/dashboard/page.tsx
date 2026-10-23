import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatNaira } from "@/lib/money";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusPill } from "@/components/status-pill";
import { FinancialPill } from "@/components/money";
import { MonthPicker } from "@/components/month-picker";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { categoryLabel } from "@/lib/invoice-vocabulary";

// Session-reading page: renders at request time (blocking, see layout).
export const instant = false;

/** The workshop keeps Lagos time, and Lagos has no daylight saving. */
const LAGOS_OFFSET = "+01:00";
const DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `2026-10-23T08:00:00Z` -> `2026-10-23` in Lagos, whatever the server TZ. */
const lagosDay = (value: string | Date) => DAY_FMT.format(new Date(value));

const pad = (n: number) => String(n).padStart(2, "0");

const currentMonth = () => {
  const [year, month] = lagosDay(new Date()).split("-");
  return `${year}-${month}`;
};

/** The calendar month before `month` (YYYY-MM), crossing years correctly. */
function previousMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return m === 1 ? `${year - 1}-12` : `${year}-${pad(m - 1)}`;
}

/** First day of the following month, for an exclusive upper bound. */
function nextMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return m === 12 ? `${year + 1}-01` : `${year}-${pad(m + 1)}`;
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString("en-NG", {
    month: "long",
    year: "numeric",
  });
}

/** Current month plus the eleven before it, newest first. */
function monthOptions(selected: string): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  let month = currentMonth();
  for (let i = 0; i < 12; i++) {
    options.push({ value: month, label: monthLabel(month) });
    month = previousMonth(month);
  }
  if (!options.some((option) => option.value === selected)) {
    options.push({ value: selected, label: monthLabel(selected) });
  }
  return options;
}

/** Embedded relations arrive as an object or a one-element list. */
const customerName = (customers: unknown) => {
  if (Array.isArray(customers)) {
    return (customers[0] as { name?: string } | undefined)?.name ?? "—";
  }
  return (customers as { name?: string } | null)?.name ?? "—";
};

const shortDate = (value: string | null) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("en-NG", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireRole(["admin", "manager"]);

  const requested = (await searchParams).month ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requested)
    ? requested
    : currentMonth();
  const label = monthLabel(month);

  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();

  const today = lagosDay(new Date());
  const [tomorrowYear, tomorrowMonth, tomorrowDay] = lagosDay(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
  )
    .split("-")
    .map(Number);
  const tomorrow = `${tomorrowYear}-${pad(tomorrowMonth)}-${pad(tomorrowDay)}`;

  const monthStart = `${month}-01T00:00:00${LAGOS_OFFSET}`;
  const nextMonthStart = `${nextMonth(month)}-01T00:00:00${LAGOS_OFFSET}`;
  const todayStart = `${today}T00:00:00${LAGOS_OFFSET}`;
  const tomorrowStart = `${tomorrow}T00:00:00${LAGOS_OFFSET}`;

  const supabase = await createClient();

  const [
    paymentsTodayRes,
    invoicesRes,
    paymentsRes,
    jobsRes,
    recentRes,
  ] = await Promise.all([
    supabase
      .from("payments")
      .select("amount")
      .gte("created_at", todayStart)
      .lt("created_at", tomorrowStart),
    supabase
      .from("invoices")
      .select("id, total_amount, category")
      .gte("created_at", monthStart)
      .lt("created_at", nextMonthStart),
    supabase
      .from("payments")
      .select("amount, created_at")
      .gte("created_at", monthStart)
      .lt("created_at", nextMonthStart),
    supabase
      .from("job_orders")
      .select("id, execution_status, created_at")
      .gte("created_at", monthStart)
      .lt("created_at", nextMonthStart),
    supabase
      .from("job_orders")
      .select(
        "id, job_number, execution_status, financial_status, created_at, customers(name)",
      )
      .gte("created_at", monthStart)
      .lt("created_at", nextMonthStart)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const loadError = [
    paymentsTodayRes,
    invoicesRes,
    paymentsRes,
    jobsRes,
    recentRes,
  ].find((result) => result.error)?.error;

  const paymentsToday = paymentsTodayRes.data ?? [];
  const invoices = invoicesRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const jobs = jobsRes.data ?? [];
  const recent = recentRes.data ?? [];

  const revenueToday = paymentsToday.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );
  const invoicedThisMonth = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.total_amount),
    0,
  );
  const paidThisMonth = payments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );
  const outstandingThisMonth = Math.max(0, invoicedThisMonth - paidThisMonth);

  const jobsByStatus = new Map<string, number>();
  for (const job of jobs) {
    jobsByStatus.set(
      job.execution_status,
      (jobsByStatus.get(job.execution_status) ?? 0) + 1,
    );
  }

  const categoryCounts = new Map<string, number>();
  for (const invoice of invoices) {
    const category = invoice.category || "unknown";
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  // One bucket per calendar day. Payment timestamps are bucketed by the Lagos
  // date, matching the boundaries above.
  const dailyTotals = new Map<string, number>();
  for (let day = 1; day <= daysInMonth; day++) {
    dailyTotals.set(`${year}-${pad(monthNumber)}-${pad(day)}`, 0);
  }
  for (const payment of payments) {
    const day = lagosDay(payment.created_at as string);
    if (dailyTotals.has(day)) {
      dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + Number(payment.amount));
    }
  }
  const chartData = Array.from(dailyTotals.entries()).map(([date, value]) => ({
    date,
    day: Number(date.slice(8, 10)),
    value,
  }));
  const maxRevenue = Math.max(1, ...chartData.map((point) => point.value));
  const busiestDay = chartData.reduce(
    (best, point) => (point.value > best.value ? point : best),
    chartData[0],
  );

  const options = monthOptions(month);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-title font-semibold">Dashboard</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {label} at a glance — revenue, outstanding, jobs and activity.
          </p>
        </div>
        <MonthPicker value={month} options={options} />
      </div>

      {loadError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          Could not load the dashboard: {loadError.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Revenue today</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {formatNaira(revenueToday)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Invoiced — {label}</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {formatNaira(invoicedThisMonth)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Payments — {label}</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {formatNaira(paidThisMonth)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Outstanding — {label}</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {formatNaira(outstandingThisMonth)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue — {label}</CardTitle>
            <CardDescription>
              {paidThisMonth > 0
                ? `${formatNaira(paidThisMonth)} across ${payments.length} payment${
                    payments.length === 1 ? "" : "s"
                  }`
                : "Daily payment totals"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {paidThisMonth > 0 ? (
              <>
                <div className="flex h-40 items-end gap-[2px]">
                  {chartData.map((point) => (
                    <div
                      key={point.date}
                      className="group relative flex h-full flex-1 items-end"
                      title={`${shortDate(point.date)} — ${formatNaira(point.value)}`}
                    >
                      <div
                        className="w-full rounded-t-sm bg-brand/70 transition-colors group-hover:bg-brand"
                        style={{
                          height: `${Math.max(2, (point.value / maxRevenue) * 100)}%`,
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>1 {label.split(" ")[0]}</span>
                  <span>
                    Busiest: {shortDate(busiestDay.date)} ·{" "}
                    {formatNaira(busiestDay.value)}
                  </span>
                  <span>
                    {daysInMonth} {label.split(" ")[0]}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border">
                <p className="text-sm text-muted-foreground">
                  No payments recorded in {label}.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Jobs by status — {label}</CardTitle>
            <CardDescription>Execution status breakdown</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No job orders in {label}.
              </p>
            )}
            {jobs.length > 0 &&
              [
                ["pending", "Pending"],
                ["in_progress", "In progress"],
                ["waiting_parts", "Waiting parts"],
                ["completed", "Completed"],
                ["cancelled", "Cancelled"],
              ].map(([status, statusLabel]) => (
                <div
                  key={status}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm">{statusLabel}</span>
                  <span className="text-sm tabular-nums">
                    {jobsByStatus.get(status) ?? 0}
                  </span>
                </div>
              ))}
            <div className="border-t border-rule pt-3">
              <Link
                href="/job-orders"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                View job orders
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Invoices by category — {label}</CardTitle>
            <CardDescription>New invoices this month</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from(categoryCounts.entries()).map(([category, count]) => (
              <div
                key={category}
                className="flex items-center justify-between rounded-lg border border-rule px-3 py-2"
              >
                <span className="text-sm">{categoryLabel(category)}</span>
                <span className="text-sm tabular-nums">{count}</span>
              </div>
            ))}
            {categoryCounts.size === 0 && (
              <p className="text-sm text-muted-foreground">
                No invoices in {label}.
              </p>
            )}
            <div className="border-t border-rule pt-3">
              <Link
                href="/invoices"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                View invoices
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent job orders</CardTitle>
            <CardDescription>Newest first, this month</CardDescription>
            <div className="mt-2">
              <Link
                href="/job-orders"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No job orders in {label}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Job</th>
                      <th className="pb-2 pr-4 font-medium">Customer</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 pr-4 font-medium">Payment</th>
                      <th className="pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((job) => (
                      <tr key={job.id} className="relative border-t border-rule">
                        <td className="py-2 pr-4">
                          <Link
                            href={`/job-orders/${job.id}`}
                            className="font-mono text-xs after:absolute after:inset-0 after:content-['']"
                          >
                            {job.job_number}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">
                          {customerName(job.customers)}
                        </td>
                        <td className="py-2 pr-4">
                          <StatusPill status={job.execution_status} />
                        </td>
                        <td className="py-2 pr-4">
                          <FinancialPill status={job.financial_status} />
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {shortDate(lagosDay(job.created_at as string))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
