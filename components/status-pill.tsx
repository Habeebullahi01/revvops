import { cn } from "cn";

/**
 * Execution status (0008 vocabulary) — the work's own state, independent of
 * money. Officers, technicians (via job logs) and the front desk all read the
 * same words, so the labels live here once.
 */
const EXECUTION_PILL: Record<string, string> = {
  pending: "bg-status-pending/15 text-status-pending",
  in_progress: "bg-status-in-progress/15 text-status-in-progress",
  waiting_parts: "bg-status-waiting-parts/15 text-status-waiting-parts",
  completed: "bg-status-completed/15 text-status-completed",
  cancelled: "bg-status-cancelled/15 text-status-cancelled",
};

const EXECUTION_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  waiting_parts: "Waiting parts",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Every execution status, in workflow order (job_orders CHECK, 0008). */
export const EXECUTION_STATUSES = [
  "pending",
  "in_progress",
  "waiting_parts",
  "completed",
  "cancelled",
] as const;

export type ExecutionStatusValue = (typeof EXECUTION_STATUSES)[number];

export function executionStatusLabel(status: string): string {
  return EXECUTION_LABEL[status] ?? status;
}

/**
 * The statuses an officer may move a job to from the current one. Officers
 * are not bound by the technician transition map (that map only governs what
 * a job log may drive), but a cancelled job is terminal.
 */
export function officerStatusOptions(current: string): ExecutionStatusValue[] {
  if (current === "cancelled") return [];
  return EXECUTION_STATUSES.filter((status) => status !== current);
}

/** Execution-status pill: colour + label for the two vocabularies in §3. */
export function StatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-4xl px-2 text-xs font-medium whitespace-nowrap",
        EXECUTION_PILL[status] ?? EXECUTION_PILL.pending,
        className,
      )}
    >
      {executionStatusLabel(status)}
    </span>
  );
}

/** A status dot for dense rows (tables, timelines). */
export function StatusDot({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone =
    EXECUTION_PILL[status]?.split(" ")[1] ?? "text-status-pending";
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full bg-current", tone, className)}
    />
  );
}
