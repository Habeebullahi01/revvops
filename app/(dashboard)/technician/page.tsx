import { requireRole } from "@/lib/auth";

// Session-reading page: renders at request time (blocking, see layout).
export const instant = false;

export default async function TechnicianJobsPage() {
  await requireRole(["technician"]);

  // Sheet screen pattern "list": title row on the page ground, not a card.
  return (
    <div className="space-y-1.5">
      <h1 className="text-title font-semibold">My Jobs</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Job cards with status updates, offline sync, and vehicle service
        history arrive in Phase 2 (PRD §11). This page reads only from the
        job_orders_tech_view — no financial columns ever reach this device.
      </p>
    </div>
  );
}
