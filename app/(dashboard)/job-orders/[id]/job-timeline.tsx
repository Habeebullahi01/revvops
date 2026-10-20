import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusDot } from "@/components/status-pill";

export interface TimelineEntry {
  id: string;
  /** "log" — a technician posted it; "officer" — an officer set the status. */
  source: "log" | "officer";
  status: string;
  notes: string | null;
  actorName: string | null;
  at: string;
}

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  waiting_parts: "Waiting parts",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * One reverse-chronological list of everything that moved this job. Officer
 * changes and technician logs are visually distinguished because they are
 * different acts with different permissions (BUSINESS_RULES.md §3.1) — the
 * same words must not blur where a change came from.
 */
export function JobTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Work timeline</CardTitle>
        <CardDescription>
          Newest first — technician logs from the floor and status changes made
          by officers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing logged yet. The job order was raised, but no work has been
            recorded against it.
          </p>
        ) : (
          <ol className="space-y-4">
            {entries.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <div className="flex flex-col items-center pt-1.5">
                  <StatusDot status={entry.status} />
                  <span className="mt-1 w-px flex-1 bg-rule" />
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium">
                      {STATUS_LABEL[entry.status] ?? entry.status}
                    </span>
                    <span
                      className={`rounded-4xl px-1.5 py-0.5 text-[0.6875rem] font-medium ${
                        entry.source === "officer"
                          ? "bg-brand/15 text-brand"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {entry.source === "officer"
                        ? "officer"
                        : "technician log"}
                    </span>
                  </div>
                  {entry.notes && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {entry.notes}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {stamp(entry.at)}
                    {entry.actorName ? ` · ${entry.actorName}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
