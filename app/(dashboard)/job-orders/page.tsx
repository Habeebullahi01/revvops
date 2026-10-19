import { requireRole } from "@/lib/auth";

// Session-reading page: renders at request time (blocking, see layout).
export const instant = false;

export default async function JobOrdersPage() {
  await requireRole(["admin", "manager", "reception"]);

  // Sheet screen pattern "list": title row on the page ground, not a card.
  return (
    <div className="space-y-1.5">
      <h1 className="text-title font-semibold">Job Orders</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Search, filters, and the create-job-order flow (sequential
        JO-YYYY-NNNN numbering) arrive in Phase 1 (PRD §11). Technicians are
        redirected away from this route — they only ever see their assigned
        jobs.
      </p>
    </div>
  );
}
