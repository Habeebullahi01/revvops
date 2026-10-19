import { requireRole } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Session-reading page: renders at request time (blocking, see layout).
export const instant = false;

export default async function DashboardPage() {
  await requireRole(["admin", "manager"]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Financial dashboard</CardTitle>
          <CardDescription>Arrives in Phase 3 (PRD §11)</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Revenue cards, outstanding balances, overdue accounts, and monthly
          reports will appear here. RLS already guarantees technicians and
          reception never reach this route.
        </CardContent>
      </Card>
    </div>
  );
}
