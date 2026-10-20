"use client";

import { Fragment, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { logExecutionStatus, type ExecutionStatus } from "@/app/actions/job-actions";

interface JobOrder {
  id: string;
  job_number: string;
  customer_id: string;
  vehicle_id: string;
  execution_status: string;
  complaint: string;
  assigned_technician_id: string | null;
  date_in: string;
  expected_date_out: string | null;
  actual_date_out: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface Vehicle {
  id: string;
  license_plate: string;
  make: string;
  model: string;
  year: number;
  customer_id: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

/** Pure fetch helpers: no setState, so the mount effect stays legal. */
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("request failed");
  return (await res.json()) as T;
}

/** Transitions the job-log trigger in 0008 actually accepts. */
const NEXT_STATUSES: Record<string, ExecutionStatus[]> = {
  pending: ["in_progress", "waiting_parts", "completed"],
  in_progress: ["waiting_parts", "completed"],
  waiting_parts: ["in_progress", "completed"],
  completed: [],
  cancelled: [],
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  waiting_parts: "Waiting parts",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-status-pending/15 text-status-pending",
  in_progress: "bg-status-in-progress/15 text-status-in-progress",
  waiting_parts: "bg-status-waiting-parts/15 text-status-waiting-parts",
  completed: "bg-status-completed/15 text-status-completed",
  cancelled: "bg-status-cancelled/15 text-status-cancelled",
};

export default function TechnicianVehicleLensPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<JobOrder[]>([]);
  const [searchPlate, setSearchPlate] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"ok" | "error">("error");

  // inline execution-status editor
  const [editingId, setEditingId] = useState("");
  const [nextStatus, setNextStatus] = useState<ExecutionStatus | "">("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let stale = false;
    Promise.all([
      fetchJson<Vehicle[]>("/api/vehicles"),
      fetchJson<Customer[]>("/api/customers"),
    ])
      .then(([vehicleRows, customerRows]) => {
        if (stale) return;
        setVehicles(vehicleRows);
        setCustomers(customerRows);
      })
      .catch(() => {
        if (stale) return;
        setMessage("Could not load the vehicle directory.");
        setMessageTone("error");
      });
    return () => {
      stale = true;
    };
  }, []);

  const loadJobs = async (vehicleId: string) => {
    try {
      const rows = await fetchJson<JobOrder[]>(`/api/jobs?vehicle_id=${vehicleId}`);
      setJobs(rows);
      return rows;
    } catch {
      setJobs([]);
      return [];
    }
  };

  const handleSearch = async () => {
    const plate = searchPlate.trim().toLowerCase();
    if (!plate) return;

    setLoading(true);
    setMessage("");
    setEditingId("");

    try {
      const vehicle = vehicles.find((v) => v.license_plate.toLowerCase() === plate);
      if (!vehicle) {
        setMessage("No vehicle with that license plate.");
        setMessageTone("error");
        setSelectedVehicle(null);
        setSelectedCustomer(null);
        setJobs([]);
        return;
      }

      setSelectedVehicle(vehicle);
      setSelectedCustomer(customers.find((c) => c.id === vehicle.customer_id) ?? null);
      const rows = await loadJobs(vehicle.id);
      setMessage(
        rows.length > 0
          ? `${rows.length} job order${rows.length > 1 ? "s" : ""} on this vehicle.`
          : "No job orders on this vehicle yet.",
      );
      setMessageTone("ok");
    } catch {
      setMessage("Search failed. Try again.");
      setMessageTone("error");
    } finally {
      setLoading(false);
    }
  };

  const openEditor = (job: JobOrder) => {
    setEditingId(job.id);
    setNextStatus(NEXT_STATUSES[job.execution_status]?.[0] ?? "");
    setNote("");
    setSaveError("");
  };

  const saveStatus = async () => {
    if (!editingId || !nextStatus) return;
    setSaving(true);
    setSaveError("");
    try {
      await logExecutionStatus({
        jobOrderId: editingId,
        executionStatus: nextStatus,
        notes: note,
      });
      setEditingId("");
      if (selectedVehicle) await loadJobs(selectedVehicle.id);
      setMessage("Execution status updated through a job log.");
      setMessageTone("ok");
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not update the status.",
      );
    } finally {
      setSaving(false);
    }
  };

  const selectCls =
    "h-8 w-full appearance-none rounded-lg border border-input bg-transparent ps-2.5 pe-8 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h1 className="text-title font-semibold">Vehicle lens</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Look up a vehicle by plate to see its owner and every job order
          attached to it. Execution status only — money lives on the job order
          screens you cannot reach.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Find a vehicle</CardTitle>
          <CardDescription>
            Search by license plate, exact match.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor="plate-search" className="sr-only">
                License plate
              </Label>
              <Input
                id="plate-search"
                placeholder="ABC-123"
                value={searchPlate}
                onChange={(e) => setSearchPlate(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSearch();
                }}
              />
            </div>
            <Button
              onClick={() => void handleSearch()}
              disabled={loading || !searchPlate.trim()}
            >
              {loading ? "Searching…" : "Search"}
            </Button>
          </div>

          {message && (
            <p
              role="status"
              className={
                messageTone === "ok"
                  ? "text-sm text-positive"
                  : "text-sm text-destructive"
              }
            >
              {message}
            </p>
          )}

          {selectedVehicle && (
            <div className="grid gap-4 rounded-lg border border-border bg-muted/40 p-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  License plate
                </p>
                <p className="font-mono">{selectedVehicle.license_plate}</p>
              </div>
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Vehicle
                </p>
                <p>
                  {selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.year})
                </p>
              </div>
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Owner
                </p>
                <p>{selectedCustomer ? selectedCustomer.name : "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Phone
                </p>
                <p>{selectedCustomer ? selectedCustomer.phone : "—"}</p>
              </div>
            </div>
          )}

          {jobs.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rule bg-muted/50 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <th className="px-3 py-2">Job #</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Complaint</th>
                    <th className="px-3 py-2">Date in</th>
                    <th className="px-3 py-2">Expected out</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const options = NEXT_STATUSES[job.execution_status] ?? [];
                    return (
                      <Fragment key={job.id}>
                        <tr className="border-t border-rule align-top">
                          <td className="px-3 py-2 font-mono text-xs">
                            {job.job_number}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              className={
                                STATUS_CLASS[job.execution_status] ??
                                "bg-status-pending/15 text-status-pending"
                              }
                            >
                              {STATUS_LABEL[job.execution_status] ??
                                job.execution_status.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="max-w-xs truncate px-3 py-2">
                            {job.complaint}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {job.date_in}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {job.expected_date_out ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {options.length > 0 ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditor(job)}
                              >
                                Update status
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Closed
                              </span>
                            )}
                          </td>
                        </tr>

                        {editingId === job.id && (
                          <tr className="border-t border-rule bg-muted/40">
                            <td colSpan={6} className="px-3 py-3">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                <div className="sm:w-52">
                                  <Label
                                    htmlFor={`status-${job.id}`}
                                    className="mb-1 block text-xs text-muted-foreground"
                                  >
                                    New execution status
                                  </Label>
                                  <span className="relative block">
                                    <select
                                      id={`status-${job.id}`}
                                      className={selectCls}
                                      value={nextStatus}
                                      onChange={(e) =>
                                        setNextStatus(
                                          e.target.value as ExecutionStatus,
                                        )
                                      }
                                    >
                                      {options.map((option) => (
                                        <option key={option} value={option}>
                                          {STATUS_LABEL[option]}
                                        </option>
                                      ))}
                                    </select>
                                  </span>
                                </div>

                                <div className="min-w-0 flex-1">
                                  <Label
                                    htmlFor={`note-${job.id}`}
                                    className="mb-1 block text-xs text-muted-foreground"
                                  >
                                    Note (optional)
                                  </Label>
                                  <Input
                                    id={`note-${job.id}`}
                                    placeholder="What was done, what is blocked"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                  />
                                </div>

                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    disabled={saving || !nextStatus}
                                    onClick={() => void saveStatus()}
                                  >
                                    {saving ? "Saving…" : "Post job log"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={saving}
                                    onClick={() => setEditingId("")}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>

                              {saveError && (
                                <p
                                  role="alert"
                                  className="mt-2 text-xs text-destructive"
                                >
                                  {saveError}
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {selectedVehicle && jobs.length === 0 && !loading && messageTone === "ok" && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No job orders for this vehicle.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
