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

export default async function JobOrdersPage() {
  await requireRole(["admin", "manager", "reception"]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Job Orders</h1>
      <Card>
        <CardHeader>
          <CardTitle>Job order list</CardTitle>
          <CardDescription>Arrives in Phase 1 (PRD §11)</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Search, filters, and the create-job-order flow (sequential
          JO-YYYY-NNNN numbering) will live here. Technicians are redirected
          away from this route — they only ever see their assigned jobs.
        </CardContent>
      </Card>
    </div>
  );
}
