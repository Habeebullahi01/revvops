import { StatusPill } from "@/components/status-pill";
import { billingLabel } from "@/lib/invoice-vocabulary";

/**
 * The workshop job card — the sheet that is printed and left inside the
 * vehicle while it is in the garage.
 *
 * Deliberately says nothing about money: a card taped to a windscreen is
 * readable by anyone walking past. It carries the owner's name and phone so
 * staff can reach them, the vehicle identification, what the customer
 * reported, and the itemised work — descriptions only, no prices.
 *
 * The cost lines are split by `itemType`: a part that is fitted is not a task,
 * so reading "Replace filter" under "Work to be done" would tell a technician
 * to perform it rather than fit it. Parts and labour get their own lists, in
 * that order — a technician wants to know what goes on the vehicle first.
 *
 * The timeline is omitted too. A technician's running commentary is not
 * something the customer should read off a card in their own car.
 *
 * This is a pure presentational component. It is rendered invisibly on the
 * job order detail page and revealed only by `@media print`, so printing the
 * job card costs no navigation. It must stay free of any interactivity: the
 * print path is the only thing that ever shows it.
 */

export interface CardCostLine {
  description: string;
  itemType?: "labor" | "part";
}

export interface JobCardData {
  id: string;
  job_number: string;
  execution_status: string;
  /** Read from the linked invoice (the column moved there in 0015). */
  billing_type: string | null;
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

const shortDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-NG", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

/**
 * One bulleted list of descriptions. Shared by the parts and labour sections so
 * the two cannot drift apart visually, and so the empty-state wording stays in
 * one place.
 */
function WorkItemList({
  title,
  hint,
  lines,
}: {
  title: string;
  hint: string;
  lines: CardCostLine[];
}) {
  if (lines.length === 0) return null;
  return (
    <section className="space-y-2 border-b border-rule py-4">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
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
      <p className="text-xs text-muted-foreground">{hint}</p>
    </section>
  );
}

export function JobCard({
  job,
  lines,
  jobUrl,
  qrSvg,
}: {
  job: JobCardData;
  lines: CardCostLine[];
  jobUrl: string;
  qrSvg: string;
}) {
  // A line with no recorded type stays under labour: that is what the card
  // always showed, and defaulting an unknown line to "part" would tell a
  // technician to fit something that may not exist.
  const parts = lines.filter((line) => line.itemType === "part");
  const labour = lines.filter((line) => line.itemType !== "part");

  return (
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
          <div className="font-mono text-lg font-semibold">{job.job_number}</div>
          <StatusPill status={job.execution_status} />
        </div>
      </header>

      <section className="grid gap-6 border-b border-rule py-4 sm:grid-cols-2">
        <div className="space-y-1">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Vehicle owner
          </h2>
          <p className="font-medium">{job.customer?.name ?? "—"}</p>
          <p className="text-sm tabular-nums">{job.customer?.phone ?? "—"}</p>
          {job.customer?.email && (
            <p className="text-sm text-muted-foreground">{job.customer.email}</p>
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
            {[job.vehicle?.make, job.vehicle?.model].filter(Boolean).join(" ") || "—"}
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
            {billingLabel(job.billing_type)}
          </p>
        </div>
      </section>

      <section className="space-y-2 border-b border-rule py-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Reported complaint
        </h2>
        <p className="text-sm whitespace-pre-wrap">{job.complaint}</p>
      </section>

      {lines.length === 0 ? (
        <section className="space-y-2 border-b border-rule py-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Work to be done
          </h2>
          <p className="text-sm text-muted-foreground">
            No itemised breakdown was recorded — see the job order for details.
          </p>
        </section>
      ) : (
        <>
          {/* Parts first: what goes onto the vehicle. */}
          <WorkItemList
            title="Parts"
            hint="Items fitted or replaced on this vehicle."
            lines={parts}
          />
          <WorkItemList
            title="Work to be done"
            hint="Labour carried out by the workshop."
            lines={labour}
          />
        </>
      )}

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
            Scan to open this job order — status, assignment and vehicle history.
          </p>
          <p className="font-mono text-xs break-all text-muted-foreground">
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
  );
}
