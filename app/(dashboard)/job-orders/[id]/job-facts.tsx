"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateJobOrder } from "@/app/actions/job-order-actions";
import { formatNaira } from "@/lib/money";

const selectCls =
  "h-8 w-full appearance-none rounded-lg border border-input bg-transparent ps-2.5 pe-8 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 md:text-sm";

const BILLING_LABEL: Record<string, string> = {
  cng_installment: "CNG instalment",
  post_service: "Post-service",
  upfront: "Upfront",
};

const BILLING_TYPES = [
  { value: "post_service", label: "Post service — settle after the work" },
  { value: "upfront", label: "Upfront — paid before work starts" },
  { value: "cng_installment", label: "CNG installment — conversion plan" },
] as const;

export interface JobFacts {
  jobOrderId: string;
  jobNumber: string;
  complaint: string;
  billingType: string;
  dateIn: string;
  expectedDateOut: string;
  actualDateOut: string;
  actualAmount: string;
  notes: string;
  createdByName: string | null;
  createdAt: string;
}

const shortDate = (value: string) =>
  value
    ? new Date(value).toLocaleDateString("en-NG", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

/**
 * The facts card, with the officer correction dialog. Eight fields is too
 * much for the inline-edit idiom used on customer/vehicle cards, so this one
 * edits in a disclosure inside the card — still no separate /edit route.
 */
export function JobFactsCard({ facts }: { facts: JobFacts }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(facts);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const startEditing = () => {
    setDraft(facts);
    setError("");
    setSaved("");
    setEditing(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved("");
    try {
      await updateJobOrder({
        jobOrderId: facts.jobOrderId,
        complaint: draft.complaint,
        billingType: draft.billingType as
          | "cng_installment"
          | "post_service"
          | "upfront",
        dateIn: draft.dateIn,
        expectedDateOut: draft.expectedDateOut || null,
        actualDateOut: draft.actualDateOut || null,
        actualAmount: draft.actualAmount || null,
        notes: draft.notes || null,
      });
      setSaved("Job details saved.");
      setEditing(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save.",
      );
    } finally {
      setSaving(false);
    }
  };

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Billing type", value: BILLING_LABEL[facts.billingType] ?? facts.billingType },
    { label: "Date in", value: shortDate(facts.dateIn) },
    { label: "Expected date out", value: shortDate(facts.expectedDateOut) },
    { label: "Actual date out", value: shortDate(facts.actualDateOut) },
    {
      label: "Actual amount",
      value: facts.actualAmount ? (
        <span className="tabular-nums">
          {formatNaira(Number(facts.actualAmount))}
        </span>
      ) : (
        <span className="text-muted-foreground">Not settled yet</span>
      ),
    },
    { label: "Raised by", value: facts.createdByName ?? "—" },
    { label: "Raised on", value: shortDate(facts.createdAt) },
    { label: "Notes", value: facts.notes || <span className="text-muted-foreground">None</span> },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job facts</CardTitle>
        <CardDescription>
          What the customer reported and when the vehicle came and went.
        </CardDescription>
        {!editing && (
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startEditing}
            >
              <PencilIcon className="size-3.5" />
              Edit details
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Complaint / work</div>
          <p className="text-sm whitespace-pre-wrap">{facts.complaint}</p>
        </div>

        {!editing && (
          <div className="divide-y divide-rule border-t border-rule">
            {rows.map((row) => (
              <div
                key={row.label}
                className="grid gap-1 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-baseline sm:gap-4"
              >
                <div className="text-xs text-muted-foreground">
                  {row.label}
                </div>
                <div className="text-sm break-words">{row.value}</div>
              </div>
            ))}
          </div>
        )}

        {editing && (
          <form
            onSubmit={save}
            noValidate
            className="space-y-3 border-t border-rule pt-4"
          >
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                Complaint{" "}
                <span aria-hidden className="text-destructive">
                  *
                </span>
              </span>
              <Textarea
                rows={3}
                value={draft.complaint}
                onChange={(event) =>
                  setDraft({ ...draft, complaint: event.target.value })
                }
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Billing type</span>
              <span className="relative block">
                <select
                  aria-label="Billing type"
                  className={selectCls}
                  value={draft.billingType}
                  onChange={(event) =>
                    setDraft({ ...draft, billingType: event.target.value })
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
                  value={draft.dateIn}
                  onChange={(event) =>
                    setDraft({ ...draft, dateIn: event.target.value })
                  }
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Expected date out</span>
                <Input
                  type="date"
                  value={draft.expectedDateOut}
                  onChange={(event) =>
                    setDraft({ ...draft, expectedDateOut: event.target.value })
                  }
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Actual date out</span>
                <Input
                  type="date"
                  value={draft.actualDateOut}
                  onChange={(event) =>
                    setDraft({ ...draft, actualDateOut: event.target.value })
                  }
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">
                  Actual amount (₦)
                </span>
                <Input
                  inputMode="decimal"
                  placeholder="What the job really cost"
                  value={draft.actualAmount}
                  onChange={(event) =>
                    setDraft({ ...draft, actualAmount: event.target.value })
                  }
                />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Notes</span>
              <Textarea
                rows={2}
                value={draft.notes}
                onChange={(event) =>
                  setDraft({ ...draft, notes: event.target.value })
                }
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

            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving…" : "Save details"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {!editing && (saved || error) && (
          <p
            role={error ? "alert" : "status"}
            className={`rounded-lg border px-3 py-2 text-sm ${
              error
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-positive/30 bg-positive/10 text-positive"
            }`}
          >
            {error || saved}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
