import { formatNaira } from "@/lib/money";
import { cn } from "cn";

/** A naira figure in tabular figures so columns line up. */
export function Money({
  value,
  className,
}: {
  value: number | string | null | undefined;
  className?: string;
}) {
  const amount =
    typeof value === "string" ? Number.parseFloat(value) || 0 : (value ?? 0);
  return <span className={cn("tabular-nums", className)}>{formatNaira(amount)}</span>;
}

const PILL: Record<string, string> = {
  unpaid: "bg-status-unpaid/15 text-status-unpaid",
  part_paid: "bg-status-part-paid/15 text-status-part-paid",
  paid: "bg-status-paid/15 text-status-paid",
};

const LABEL: Record<string, string> = {
  unpaid: "Unpaid",
  part_paid: "Part paid",
  paid: "Paid",
};

/** Derived from invoice total vs payments — never stored on the invoice. */
export function FinancialPill({
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
        PILL[status] ?? PILL.unpaid,
        className,
      )}
    >
      {LABEL[status] ?? LABEL.unpaid}
    </span>
  );
}
