import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ReceiptTextIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FinancialPill } from "@/components/money";
import { StatusPill } from "@/components/status-pill";
import { requireRole } from "@/lib/auth";
import { formatNaira } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AssignmentControl } from "./assignment-control";
import { JobFactsCard } from "./job-facts";
import { JobTimeline, type TimelineEntry } from "./job-timeline";
import { PrintButton } from "./print-button";
import { StatusControl } from "./status-control";

// Session-reading page: renders at request time (blocking, see layout).
export const instant = false;

interface JobDetail {
  id: string;
  job_number: string;
  execution_status: string;
  financial_status: string;
  billing_type: string;
  complaint: string;
  date_in: string;
  expected_date_out: string | null;
  actual_date_out: string | null;
  estimated_amount: string | null;
  actual_amount: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  assigned_technician_id: string | null;
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  } | null;
  vehicle: {
    id: string;
    license_plate: string;
    make: string | null;
    model: string | null;
    year: number | null;
  } | null;
}

interface InvoiceSummary {
  id: string;
  total_amount: string;
  created_at: string;
}

const shortDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-NG", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

export default async function JobOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin", "manager", "reception"]);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_orders")
    .select(
      `
      id, job_number, execution_status, financial_status, billing_type, complaint,
      date_in, expected_date_out, actual_date_out, estimated_amount, actual_amount,
      notes, created_at, created_by, assigned_technician_id,
      customer:customer_id ( id, name, phone, email ),
      vehicle:vehicle_id ( id, license_plate, make, model, year )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) notFound();

  const job = data as unknown as JobDetail;

  // Everything below is read-only context: the timeline, the invoice this job
  // came from, and the names behind the ids. Money keeps moving on the
  // invoice — this page only reports it.
  const [logsRes, invoiceRes, profilesRes] = await Promise.all([
    supabase
      .from("job_logs")
      .select("id, execution_status, notes, created_at, technician_id")
      .eq("job_order_id", job.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("id, total_amount, created_at")
      .eq("job_order_id", job.id)
      .maybeSingle(),
    supabase.from("profiles").select("id, full_name"),
  ]);

  if (logsRes.error) throw new Error(logsRes.error.message);
  if (invoiceRes.error) throw new Error(invoiceRes.error.message);
  if (profilesRes.error) throw new Error(profilesRes.error.message);

  // Officer status changes live in `audit_logs`, which reception may not read
  // (RLS: admin/manager only — suite R07). Read them with the service role
  // for the same reason logAudit() writes them with it: a status that moved
  // must appear on the timeline of the page where it moved, whoever is
  // looking.
  const { data: auditRows } = await createServiceClient()
    .from("audit_logs")
    .select("id, details, created_at, user_id")
    .eq("entity_id", job.id)
    .eq("action", "job_order.execution_status_changed")
    .order("created_at", { ascending: false });

  const names = new Map(
    (profilesRes.data ?? []).map((row) => [row.id as string, row.full_name as string]),
  );

  const invoice = invoiceRes.data as unknown as InvoiceSummary | null;

  const paymentsRes = invoice
    ? await supabase
        .from("payments")
        .select("amount")
        .eq("invoice_id", invoice.id)
    : { data: [], error: null };

  if (paymentsRes.error) throw new Error(paymentsRes.error.message);

  const invoiceTotal = invoice ? Number(invoice.total_amount) : null;
  const paid = (paymentsRes.data ?? []).reduce(
    (sum, row) => sum + Number(row.amount),
    0,
  );
  const balance = invoiceTotal === null ? null : invoiceTotal - paid;

  const logs = (logsRes.data ?? []) as unknown as {
    id: string;
    execution_status: string;
    notes: string | null;
    created_at: string;
    technician_id: string;
  }[];

  const officerChanges = (auditRows ?? []) as unknown as {
    id: string;
    details: { from?: string; to?: string; job_number?: string } | null;
    created_at: string;
    user_id: string;
  }[];

  // The timeline is the job logs, the officer status changes, and the moment
  // the job was raised — the one execution-status move that has no record of
  // its own.
  const timeline: TimelineEntry[] = [
    {
      id: `raised-${job.id}`,
      source: "officer" as const,
      status: "pending",
      notes: "Job order raised from the invoice.",
      actorName: job.created_by ? (names.get(job.created_by) ?? null) : null,
      at: job.created_at,
    },
    ...logs.map((log) => ({
      id: log.id,
      source: "log" as const,
      status: log.execution_status,
      notes: log.notes,
      actorName: names.get(log.technician_id) ?? null,
      at: log.created_at,
    })),
    ...officerChanges
      .filter((entry) => entry.details?.to)
      .map((entry) => ({
        id: entry.id,
        source: "officer" as const,
        status: entry.details!.to as string,
        notes: entry.details?.from
          ? `Officer moved it from ${entry.details.from.replace(/_/g, " ")}.`
          : "Officer set the status.",
        actorName: names.get(entry.user_id) ?? null,
        at: entry.created_at,
      })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  const assignedName = job.assigned_technician_id
    ? (names.get(job.assigned_technician_id) ?? null)
    : null;
  const estimate =
    job.actual_amount ?? job.estimated_amount ?? null;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Link
          href="/job-orders"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground print:hidden"
        >
          <ArrowLeftIcon className="size-3.5" />
          All job orders
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-title font-semibold">
              Job{" "}
              <span className="font-mono text-lg">{job.job_number}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {job.customer?.name ?? "—"} ·{" "}
              <span className="font-mono">
                {job.vehicle?.license_plate ?? "—"}
              </span>
              {job.vehicle?.make || job.vehicle?.model
                ? ` · ${[job.vehicle?.make, job.vehicle?.model].filter(Boolean).join(" ")}`
                : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <StatusPill status={job.execution_status} />
              <FinancialPill status={job.financial_status} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 print:hidden">
            {job.customer && (
              <Link
                href={`/customers/${job.customer.id}`}
                className="text-sm font-medium text-brand underline underline-offset-2"
              >
                Customer
              </Link>
            )}
            {job.vehicle && (
              <Link
                href={`/vehicles/${job.vehicle.id}`}
                className="text-sm font-medium text-brand underline underline-offset-2"
              >
                Vehicle
              </Link>
            )}
            <PrintButton jobOrderId={job.id} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <JobFactsCard
            facts={{
              jobOrderId: job.id,
              jobNumber: job.job_number,
              complaint: job.complaint,
              billingType: job.billing_type,
              dateIn: job.date_in,
              expectedDateOut: job.expected_date_out ?? "",
              actualDateOut: job.actual_date_out ?? "",
              actualAmount: job.actual_amount ? `${Number(job.actual_amount)}` : "",
              notes: job.notes ?? "",
              createdByName: job.created_by
                ? (names.get(job.created_by) ?? null)
                : null,
              createdAt: job.created_at,
            }}
          />

          {/*
           * The timeline is staff-only. The paper artefact is the job card
           * (`/job-orders/[id]/card`), which deliberately carries no timeline;
           * printing this page must not smuggle one out on paper.
           */}
          <div className="print:hidden">
            <JobTimeline entries={timeline} />
          </div>
        </div>

        <div className="space-y-4 print:hidden">
          <StatusControl
            jobOrderId={job.id}
            status={job.execution_status}
          />

          <AssignmentControl
            jobOrderId={job.id}
            technicianId={job.assigned_technician_id}
            technicianName={assignedName}
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ReceiptTextIcon className="size-4 text-brand" />
                Money
              </CardTitle>
              <CardDescription>
                The invoice this job came from. Money is recorded there, never
                here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {invoice && invoiceTotal !== null ? (
                <>
                  <div className="divide-y divide-rule text-sm">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-muted-foreground">
                        Invoice total
                      </span>
                      <span className="tabular-nums">
                        {formatNaira(invoiceTotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-muted-foreground">Paid to date</span>
                      <span className="tabular-nums">{formatNaira(paid)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-muted-foreground">Balance</span>
                      <span
                        className={`font-medium tabular-nums ${
                          (balance ?? 0) > 0 ? "text-negative" : "text-positive"
                        }`}
                      >
                        {formatNaira(balance ?? 0)}
                      </span>
                    </div>
                    {job.actual_amount && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-muted-foreground">
                          Settled on this job
                        </span>
                        <span className="tabular-nums">
                          {formatNaira(Number(job.actual_amount))}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Raised {shortDate(invoice.created_at)} · Job estimate{" "}
                    {estimate === null ? "—" : formatNaira(Number(estimate))}
                  </p>
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="inline-block text-sm font-medium text-brand underline underline-offset-2"
                  >
                    Open the invoice
                  </Link>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No invoice is linked to this job order, so there is nothing to
                  report. Job estimate:{" "}
                  {estimate === null ? "—" : formatNaira(Number(estimate))}.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
