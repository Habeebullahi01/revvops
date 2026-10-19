import { requireRole } from "@/lib/auth";

// Session-reading page: renders at request time (blocking, see layout).
export const instant = false;

export default async function DashboardPage() {
  await requireRole(["admin", "manager"]);

  // Sheet screen pattern "overview": title row on the page ground, not a card.
  return (
    <div className="space-y-1.5">
      <h1 className="text-title font-semibold">Dashboard</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Financial dashboard arrives in Phase 3 (PRD §11): revenue cards,
        outstanding balances, overdue accounts, and monthly reports. RLS
        already guarantees technicians and reception never reach this route.
      </p>
    </div>
  );
}
