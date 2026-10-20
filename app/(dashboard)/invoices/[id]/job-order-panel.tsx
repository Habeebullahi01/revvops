"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, ClipboardPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createJobOrderFromInvoice } from "@/app/actions/job-order-actions";
import { JOB_ORDER_PAID_RATIO } from "@/lib/invoice-rules";
import { formatNaira } from "@/lib/money";

interface JobOrderSummary {
  id: string;
  job_number: string;
  execution_status: string;
}

const BILLING_TYPES: { value: "cng_installment" | "post_service" | "upfront"; label: string }[] =
  [
    { value: "post_service", label: "Post service — settle after the work" },
    { value: "upfront", label: "Upfront — paid before work starts" },
    { value: "cng_installment", label: "CNG installment — conversion plan" },
  ];

const selectCls =
  "h-8 w-full appearance-none rounded-lg border border-input bg-transparent ps-2.5 pe-8 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 md:text-sm";

const today = () => new Date().toISOString().slice(0, 10);

interface Technician {
  id: string;
  full_name: string;
}

/**
 * The one explicit bridge from invoice to job order (invoice-first flow).
 * Disabled until at least 50% of the invoice is paid — enforced here and in
 * createJobOrderFromInvoice.
 */
export function JobOrderPanel({
  invoiceId,
  total,
  paid,
  jobOrder,
}: {
  invoiceId: string;
  total: number;
  paid: number;
  jobOrder: JobOrderSummary | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [billingType, setBillingType] = useState<
    (typeof BILLING_TYPES)[number]["value"]
  >("post_service");
  const [dateIn, setDateIn] = useState(today);
  const [dateOut, setDateOut] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [notes, setNotes] = useState("");
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const required = total * JOB_ORDER_PAID_RATIO;
  const eligible = paid + 0.004 >= required;

  const openForm = () => {
    setOpen(true);
    setError("");
    // Lazily loaded so the panel needs no effect: assignment is optional.
    fetch("/api/technicians")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((rows: Technician[]) => setTechnicians(rows))
      .catch(() => setTechnicians([]));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const jobOrder = await createJobOrderFromInvoice({
        invoiceId,
        billingType,
        dateIn,
        expectedDateOut: dateOut || undefined,
        assignedTechnicianId: technicianId || undefined,
        notes,
      });
      setNotice(`${jobOrder.job_number} created.`);
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not raise the job order.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (jobOrder) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardPlusIcon className="size-4 text-brand" />
            Job order raised
          </CardTitle>
          <CardDescription>
            This invoice already has a job order; execution runs there while
            money keeps being recorded here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <span className="font-mono text-sm font-medium">
              {jobOrder.job_number}
            </span>
            <Link
              href={`/job-orders/${jobOrder.id}`}
              className="text-sm font-medium text-brand underline underline-offset-2"
            >
              Open job order
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            Status:{" "}
            <span className="font-medium text-foreground">
              {jobOrder.execution_status.replace(/_/g, " ")}
            </span>
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!open) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Job order</CardTitle>
          <CardDescription>
            An invoice never creates a job order on its own — raise it here
            once the money is in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {eligible ? (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
              {formatNaira(paid)} of {formatNaira(total)} paid — at or above the
              50% floor, so a job order can be raised now.
            </p>
          ) : (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
              <p className="font-medium">
                At least 50% of the invoice must be paid first.
              </p>
              <p className="mt-1 text-muted-foreground">
                Record {formatNaira(required - paid)} more ({formatNaira(paid)}{" "}
                paid of the {formatNaira(required)} required) to unlock this
                button.
              </p>
            </div>
          )}

          <Button
            type="button"
            className="w-full"
            disabled={!eligible}
            onClick={openForm}
          >
            Create job order
          </Button>

          {!eligible && (
            <p className="text-xs text-muted-foreground">
              The payment form is in the Payments card below.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create job order</CardTitle>
        <CardDescription>
          Customer, vehicle and complaint come from the invoice — the number is
          assigned automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              Billing type{" "}
              <span aria-hidden className="text-destructive">
                *
              </span>
            </span>
            <span className="relative block">
              <select
                aria-label="Billing type"
                className={selectCls}
                value={billingType}
                onChange={(e) =>
                  setBillingType(
                    e.target.value as (typeof BILLING_TYPES)[number]["value"],
                  )
                }
              >
                {BILLING_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                Date in{" "}
                <span aria-hidden className="text-destructive">
                  *
                </span>
              </span>
              <Input
                type="date"
                value={dateIn}
                onChange={(e) => setDateIn(e.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Expected date out</span>
              <Input
                type="date"
                value={dateOut}
                onChange={(e) => setDateOut(e.target.value)}
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Assigned technician</span>
            <span className="relative block">
              <select
                aria-label="Assigned technician"
                className={selectCls}
                value={technicianId}
                onChange={(e) => setTechnicianId(e.target.value)}
              >
                <option value="">Unassigned — assign later</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.full_name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Notes</span>
            <Textarea
              rows={2}
              placeholder="Optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive"
            >
              {notice}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Raising…" : "Raise job order"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
