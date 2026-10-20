"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, UserRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { assignJobOrder } from "@/app/actions/job-order-actions";

const selectCls =
  "h-8 w-full appearance-none rounded-lg border border-input bg-transparent ps-2.5 pe-8 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 md:text-sm";

interface Technician {
  id: string;
  full_name: string;
}

/**
 * Reassign the technician. The roster is fetched lazily on first interaction
 * (same pattern as the invoice's job-order panel), so opening a job order
 * costs no extra query.
 */
export function AssignmentControl({
  jobOrderId,
  technicianId,
  technicianName,
}: {
  jobOrderId: string;
  technicianId: string | null;
  technicianName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState(technicianId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const startEditing = () => {
    setError("");
    setNotice("");
    setValue(technicianId ?? "");
    setOpen(true);
    if (technicians.length === 0) {
      setLoading(true);
      fetch("/api/technicians")
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
        .then((rows: Technician[]) => setTechnicians(rows))
        .catch(() => setTechnicians([]))
        .finally(() => setLoading(false));
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await assignJobOrder({
        jobOrderId,
        technicianId: value || null,
      });
      setNotice(
        value ? "Technician assigned." : "Job order is now unassigned.",
      );
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not assign.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRoundIcon className="size-4 text-brand" />
          Assigned technician
        </CardTitle>
        <CardDescription>
          Only the assigned technician can post work logs against this job.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!open && (
          <>
            <div className="text-sm font-medium">
              {technicianName ?? (
                <span className="text-muted-foreground">Unassigned</span>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startEditing}
            >
              {technicianId ? "Reassign" : "Assign technician"}
            </Button>
          </>
        )}

        {open && (
          <form onSubmit={save} className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Technician</span>
              <span className="relative block">
                <select
                  aria-label="Technician"
                  className={selectCls}
                  value={value}
                  disabled={saving || loading}
                  onChange={(event) => setValue(event.target.value)}
                >
                  <option value="">
                    {loading ? "Loading technicians…" : "Unassigned — assign later"}
                  </option>
                  {technicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technician.full_name}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={saving || loading}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
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
