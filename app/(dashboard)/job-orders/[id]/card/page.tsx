import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { ArrowLeftIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "cn";
import { PrintTrigger } from "./print-trigger";

// Session-reading page: renders at request time (blocking, see layout).
export const instant = false;

interface CostLine {
  description: string;
  amount: number;
  itemType: "labor" | "part";
}

interface CardJob {
  id: string;
  job_number: string;
  execution_status: string;
  billing_type: string;
  complaint: string;
  date_in: string;
  expected_date_out: string | null;
  notes: string | null;
  customer: {
    name: string;
    phone: string;
    email: string | null;
  } | null;
  vehicle: {
    license_plate: string;
    make: string | null;
    model: string | null;
    year: number | null;
    vin: string | null;
    color: string | null;
  } | null;
}

const BILLING_LABEL: Record<string, string> = {
  cng_installment: "CNG instalment",
  post_service: "Post-service",
  upfront: "Upfront",
};

const shortDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-NG", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

/**
 * The workshop job card — the sheet that is printed and left inside the
 * vehicle while it is in the garage.
 *
 * Deliberately says nothing about money: a card taped to a windscreen is
 * readable by anyone walking past. It carries the owner's name and phone so
 * staff can reach them, the vehicle identification, what the customer
 * reported, and the work items — descriptions only, no prices.
 *
 * The timeline is omitted too. A technician's running commentary is not
 * something the customer should read off a card in their own car.
 */
export default async function JobCardPage({
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
      id, job_number, execution_status, billing_type, complaint, date_in,
      expected_date_out, notes,
      customer:customer_id ( name, phone, email ),
      vehicle:vehicle_id ( license_plate, make, model, year, vin, color )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) notFound();

  const job = data as unknown as CardJob;

  // The invoice supplies the work items. Its cost_breakdown is the only place
  // the line descriptions live, so the card reads it and shows the words
  // without the numbers.
  const { data: invoice } = await supabase
    .from("invoices")
    .select("cost_breakdown, complaint")
    .eq("job_order_id", job.id)
    .maybeSingle();

  const lines: CostLine[] = Array.isArray(invoice?.cost_breakdown)
    ? (invoice.cost_breakdown as CostLine[]).filter(
        (line) => line && typeof line === "object" && line.description,
      )
    : [];

  // A URL is only useful if it is absolute, so the QR must be built from the
  // request's own host — the app does not know its public origin at build time.
  const host = (await headers()).get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const jobUrl = `${proto}://${host}/job-orders/${job.id}`;
  const qrSvg = await QRCode.toString(jobUrl, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
  });

  return (
    <div className="space-y-4">
      {/* Screen-only chrome: the card prints alone. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/job-orders/${job.id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to the job order
        </Link>
        <PrintTrigger />
      </div>

      <article
        aria-label={`Job card ${job.job_number}`}
        className="job-card mx-auto max-w-[210mm] border border-border bg-card p-6 print:border-0 print:p-0"
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule pb-4">
          <div>
            <h1 className="text-title font-semibold">Workshop Job Card</h1>
            <p className="text-sm text-muted-foreground">
              Keep this card in the vehicle until collection.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-lg font-semibold">
              {job.job_number}
            </div>
            <StatusPill status={job.execution_status} />
          </div>
        </header>

        <section className="grid gap-6 border-b border-rule py-4 sm:grid-cols-2">
          <div className="space-y-1">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Vehicle owner
            </h2>
            <p className="font-medium">{job.customer?.name ?? "—"}</p>
            <p className="text-sm tabular-nums">
              {job.customer?.phone ?? "—"}
            </p>
            {job.customer?.email && (
              <p className="text-sm text-muted-foreground">
                {job.customer.email}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Vehicle
            </h2>
            <p className="font-mono font-medium">
              {job.vehicle?.license_plate ?? "—"}
            </p>
            <p className="text-sm">
              {[job.vehicle?.make, job.vehicle?.model]
                .filter(Boolean)
                .join(" ") || "—"}
              {job.vehicle?.year ? ` · ${job.vehicle.year}` : ""}
            </p>
            {job.vehicle?.color && (
              <p className="text-sm text-muted-foreground">
                Colour: {job.vehicle.color}
              </p>
            )}
            {job.vehicle?.vin && (
              <p className="text-sm text-muted-foreground">
                VIN: <span className="font-mono">{job.vehicle.vin}</span>
              </p>
            )}
          </div>
        </section>

        <section className="grid gap-4 border-b border-rule py-4 sm:grid-cols-3">
          <div>
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Date in
            </h2>
            <p className="text-sm">{shortDate(job.date_in)}</p>
          </div>
          <div>
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Expected out
            </h2>
            <p className="text-sm">{shortDate(job.expected_date_out)}</p>
          </div>
          <div>
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Billing
            </h2>
            <p className="text-sm">
              {BILLING_LABEL[job.billing_type] ?? job.billing_type}
            </p>
          </div>
        </section>

        <section className="space-y-2 border-b border-rule py-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Reported complaint
          </h2>
          <p className="text-sm whitespace-pre-wrap">{job.complaint}</p>
        </section>

        <section className="space-y-2 border-b border-rule py-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Work to be done
          </h2>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No itemised breakdown was recorded — see the job order for
              details.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {lines.map((line, index) => (
                <li key={`${line.description}-${index}`} className="flex gap-2">
                  <span aria-hidden className="text-muted-foreground">
                    •
                  </span>
                  <span>{line.description}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {job.notes && (
          <section className="space-y-2 border-b border-rule py-4">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Notes
            </h2>
            <p className="text-sm whitespace-pre-wrap">{job.notes}</p>
          </section>
        )}

        <footer className="flex items-end justify-between gap-4 pt-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Scan to open this job order — status, assignment and vehicle
              history.
            </p>
            <p className="font-mono text-xs text-muted-foreground break-all">
              {jobUrl}
            </p>
          </div>
          <div
            aria-hidden
            className="size-28 shrink-0 [&>svg]:size-full"
            // Generated locally from the job URL; the SVG is trusted markup.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        </footer>
      </article>
    </div>
  );
}
