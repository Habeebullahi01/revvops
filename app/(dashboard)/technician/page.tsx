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

export default async function TechnicianJobsPage() {
  await requireRole(["technician"]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">My Jobs</h1>
      <Card>
        <CardHeader>
          <CardTitle>Assigned jobs</CardTitle>
          <CardDescription>Arrives in Phase 2 (PRD §11)</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Job cards with status updates, offline sync, and vehicle service
          history will appear here. This page reads only from the
          job_orders_tech_view — no financial columns ever reach this device.
        </CardContent>
      </Card>
    </div>
  );
}
