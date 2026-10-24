import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatNaira } from "@/lib/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthPicker } from "@/components/month-picker";
import { PrintButton } from "./print-button";

export const instant = false;

const LAGOS_OFFSET = "+01:00";
const DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const lagosDay = (value: string | Date) => DAY_FMT.format(new Date(value));
const pad = (n: number) => String(n).padStart(2, "0");
const currentMonth = () => lagosDay(new Date()).slice(0, 7);
const previousMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
};
const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
};
function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString("en-NG", {
    month: "long",
    year: "numeric",
  });
}
function monthOptions(selected: string): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  let month = currentMonth();
  for (let i = 0; i < 12; i++) {
    options.push({ value: month, label: monthLabel(month) });
    month = previousMonth(month);
  }
  if (!options.some((o) => o.value === selected)) {
    options.push({ value: selected, label: monthLabel(selected) });
  }
  return options;
}

const BILLING_LABELS: Record<string, string> = {
  upfront: "Upfront",
  instalmental: "Instalmental",
  post_service: "Post-service",
};
const CATEGORY_LABELS: Record<string, string> = {
  sales: "Sales",
  maintenance: "Maintenance",
  cng: "CNG",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireRole(["admin", "manager"]);

  const requested = (await searchParams).month ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : currentMonth();
  const label = monthLabel(month);

  const monthStart = `${month}-01T00:00:00${LAGOS_OFFSET}`;
  const nextMonthStart = `${nextMonth(month)}-01T00:00:00${LAGOS_OFFSET}`;

  const supabase = await createClient();

  const [invoicesRes, paymentsRes, jobsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, total_amount, billing_type, category, job_order_id")
      .gte("created_at", monthStart)
      .lt("created_at", nextMonthStart),
    supabase
      .from("payments")
      .select("amount, invoice_id, job_order_id")
      .gte("created_at", monthStart)
      .lt("created_at", nextMonthStart),
    supabase
      .from("job_orders")
      .select("id, execution_status, assigned_technician_id, profiles:assigned_technician_id(full_name)")
      .gte("created_at", monthStart)
      .lt("created_at", nextMonthStart),
  ]);

  const invoices = invoicesRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const jobs = jobsRes.data ?? [];

  const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
  const totalCollected = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalOutstanding = Math.max(0, totalInvoiced - totalCollected);

  const byBilling = new Map<string, { count: number; amount: number }>();
  for (const inv of invoices) {
    const key = inv.billing_type || "unknown";
    const cur = byBilling.get(key) ?? { count: 0, amount: 0 };
    byBilling.set(key, { count: cur.count + 1, amount: cur.amount + Number(inv.total_amount) });
  }

  const byCategory = new Map<string, { count: number; amount: number }>();
  for (const inv of invoices) {
    const key = inv.category || "unknown";
    const cur = byCategory.get(key) ?? { count: 0, amount: 0 };
    byCategory.set(key, { count: cur.count + 1, amount: cur.amount + Number(inv.total_amount) });
  }

  const byTech = new Map<string, { name: string; completed: number; total: number }>();
  for (const job of jobs) {
    const techId = job.assigned_technician_id;
    if (!techId) continue;
    const name = (Array.isArray(job.profiles) ? job.profiles[0]?.full_name : (job.profiles as any)?.full_name) || "—";
    const cur = byTech.get(techId) ?? { name, completed: 0, total: 0 };
    byTech.set(techId, { ...cur, total: cur.total + 1, completed: cur.completed + (job.execution_status === "completed" ? 1 : 0) });
  }

  const options = monthOptions(month);

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white; }
          header, nav, aside, [data-sidebar], .no-print { display: none !important; }
          main { padding: 0 !important; }
          .print-sheet { max-width: 100%; }
        }
      `}</style>

      <div className="flex flex-wrap items-start justify-between gap-3 no-print">
        <div className="space-y-1.5">
          <h1 className="text-title font-semibold">Reports</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {label} — print/PDF via your browser. No overdue section.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker value={month} options={options} path="/reports" />
          <PrintButton />
        </div>
      </div>

      <div className="print-sheet space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Monthly report — {label}</h2>
          <p className="text-sm text-muted-foreground">CNG Workshop WMS</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardDescription>Job orders</CardDescription>
              <CardTitle className="text-xl tabular-nums">{jobs.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Revenue (invoiced)</CardDescription>
              <CardTitle className="text-xl tabular-nums">{formatNaira(totalInvoiced)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Collected</CardDescription>
              <CardTitle className="text-xl tabular-nums">{formatNaira(totalCollected)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Outstanding</CardDescription>
              <CardTitle className="text-xl tabular-nums">{formatNaira(totalOutstanding)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Revenue by billing type</CardTitle>
              <CardDescription>Invoices created this month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Billing</th>
                      <th className="pb-2 pr-4 font-medium">Count</th>
                      <th className="pb-2 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(byBilling.entries()).map(([key, v]) => (
                      <tr key={key} className="border-t border-rule">
                        <td className="py-2 pr-4">{BILLING_LABELS[key] ?? key}</td>
                        <td className="py-2 pr-4 tabular-nums">{v.count}</td>
                        <td className="py-2 text-right tabular-nums">{formatNaira(v.amount)}</td>
                      </tr>
                    ))}
                    {byBilling.size === 0 && (
                      <tr>
                        <td colSpan={3} className="py-2 text-sm text-muted-foreground">No invoices</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Revenue by category</CardTitle>
              <CardDescription>Invoices created this month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Category</th>
                      <th className="pb-2 pr-4 font-medium">Count</th>
                      <th className="pb-2 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(byCategory.entries()).map(([key, v]) => (
                      <tr key={key} className="border-t border-rule">
                        <td className="py-2 pr-4">{CATEGORY_LABELS[key] ?? key}</td>
                        <td className="py-2 pr-4 tabular-nums">{v.count}</td>
                        <td className="py-2 text-right tabular-nums">{formatNaira(v.amount)}</td>
                      </tr>
                    ))}
                    {byCategory.size === 0 && (
                      <tr>
                        <td colSpan={3} className="py-2 text-sm text-muted-foreground">No invoices</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Technician productivity</CardTitle>
            <CardDescription>Jobs created this month by assigned technician</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Technician</th>
                    <th className="pb-2 pr-4 font-medium">Jobs</th>
                    <th className="pb-2 font-medium">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(byTech.entries()).map(([id, v]) => (
                    <tr key={id} className="border-t border-rule">
                      <td className="py-2 pr-4">{v.name}</td>
                      <td className="py-2 pr-4 tabular-nums">{v.total}</td>
                      <td className="py-2 tabular-nums">{v.completed}</td>
                    </tr>
                  ))}
                  {byTech.size === 0 && (
                    <tr>
                      <td colSpan={3} className="py-2 text-sm text-muted-foreground">No assigned jobs</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
