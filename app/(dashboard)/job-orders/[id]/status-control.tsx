"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateJobOrderExecutionStatus } from "@/app/actions/job-order-actions";
import {
  EXECUTION_STATUSES,
  StatusPill,
  executionStatusLabel,
} from "@/components/status-pill";

const selectCls =
  "h-8 w-full appearance-none rounded-lg border border-input bg-transparent ps-2.5 pe-8 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 md:text-sm";

/**
 * Officer control for `execution_status`. Technicians never see this: they
 * move a job by posting a job log on the floor, and the audit trail keeps
 * the two sources distinguishable.
 */
export function StatusControl({
  jobOrderId,
  status,
}: {
  jobOrderId: string;
  status: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const cancelled = status === "cancelled";

  const save = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await updateJobOrderExecutionStatus({
        jobOrderId,
        // The select only offers the five vocabulary values.
        executionStatus: value as (typeof EXECUTION_STATUSES)[number],
      });
      if (!result.ok) {
        setError(result.error);
        setValue(status);
        return;
      }
      setNotice(`Status changed to ${executionStatusLabel(value)}.`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not change status.",
      );
      setValue(status);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution status</CardTitle>
        <CardDescription>
          Whether the work is done is decided here, by an officer. Technicians
          move this from the workshop floor, one job log at a time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <StatusPill status={status} />
          <span className="text-xs text-muted-foreground">
            current status
          </span>
        </div>

        {cancelled ? (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
            This job order was cancelled. Cancelling is final — raise a new job
            order if the work resumes.
          </p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Move to</span>
              <span className="relative block">
                <select
                  aria-label="Move to status"
                  className={selectCls}
                  value={value}
                  disabled={saving}
                  onChange={(event) => setValue(event.target.value)}
                >
                  {EXECUTION_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {executionStatusLabel(option)}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              </span>
            </label>

            <Button
              type="submit"
              size="sm"
              disabled={saving || value === status}
            >
              {saving ? "Saving…" : "Save status"}
            </Button>
          </form>
        )}

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
      </CardContent>
    </Card>
  );
}
