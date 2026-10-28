"use client";

import { Fragment, useEffect, useState } from "react";
import { Card, CardTitle, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { logExecutionStatus } from "@/app/actions/job-actions";
import { StatusPill } from "@/components/status-pill";
import { Button, buttonVariants } from "@/components/ui/button";
import { ExecutionStatusValue } from "@/components/status-pill";
import Link from "next/navigation";

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

interface JobOrder {
  id: string;
  job_number: string;
  execution_status: string;
  financial_status?: string | null;
  complaint: string | null;
  date_in: string;
  expected_date_out: string | null;
  actual_date_out: string | null;
  notes: string | null;
  created_at: string;
  vehicle_id: string;
}

/** Fetch all job orders (via tech-safe view) */
async function fetchTechnicianJobs(vehicleId: string = "") {
  const params = new URLSearchParams();
  if (vehicleId) params.append("vehicle_id", vehicleId);
  const res = await fetch("/api/jobs?" + params, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load jobs");
  return res.json();
}

/** Fetch all vehicles */
async function fetchVehicles() {
  const res = await fetch("/api/vehicles", {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load vehicles");
  return res.json();
}

/** Fetch all customers */
async function fetchCustomers() {
  const res = await fetch("/api/customers", {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load customers");
  return res.json();
}

export default function TechnicianVehicleLensPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<JobOrder[]>([]);
  const [searchPlate, setSearchPlate] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [jobSearch, setJobSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"ok" | "error">("error");
  const [editingId, setEditingId] = useState("");
  const [nextStatus, setNextStatus] = useState<ExecutionStatusValue>("pending");
  const [note, setNote] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let stale = false;
    Promise.all([fetchVehicles(), fetchCustomers()])
      .then(([vehicleRows, customerRows]) => {
        if (stale) return;
        setVehicles(vehicleRows);
        setCustomers(customerRows);
        fetchTechnicianJobs().then((j) => {
          if (!stale) setJobs(j);
        });
      })
      .catch(() => {
        setMessage("Could not load the vehicle directory.");
        setMessageTone("error");
      });
    return () => {
      stale = true;
    };
  }, []);

  useEffect(() => {
    let stale = false;
    return () => {
      stale = true;
    };
  }, []);

  const loadJobs = async (vehicleId: string) => {
    try {
      const rows = await fetchTechnicianJobs(vehicleId);
      setJobs(rows);
      return rows;
    } catch {
      setJobs([]);
      return [];
    }
  };

  const handleSearchPlate = async () => {
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
      setSelectedCustomer(
        customers.find((c) => c.id === vehicle.customer_id) ?? null,
      );
      const rows = await loadJobs(vehicle.id);
      setMessage(
        rows.length > 0
          ? `${rows.length} job order${jobs.length > 1 ? "s" : ""} on this vehicle.`
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

  const handleJobSearch = () => {
    const q = jobSearch.trim().toLowerCase();
    if (!q) {
      fetchTechnicianJobs().then((j) => setJobs(j));
      return;
    }
    const filtered = jobs.filter(
      (j) =>
        j.job_number.toLowerCase().includes(q) ||
        (j.vehicle_id &&
          vehicles.some((v) => v.id === j.vehicle_id) &&
          vehicles.find((v) => v.id === j.vehicle_id)?.license_plate
            .toLowerCase()
            .includes(q)) ||
        (selectedCustomer &&
          selectedCustomer.name.toLowerCase().includes(q)),
    );
    setJobs(filtered);
  };

  const NEXT_STATUSES: Record<string, string[]> = {
    pending: ["in_progress", "waiting_parts", "completed"],
    in_progress: ["waiting_parts", "completed"],
    waiting_parts: ["in_progress", "completed"],
    completed: [],
    cancelled: [],
  };

  const openEditor = (job: JobOrder) => {
    setEditingId(job.id);
    const nextStatusValue: ExecutionStatusValue = 
      (NEXT_STATUSES[job.execution_status]?.[0] ?? "pending") as ExecutionStatusValue;
    setNextStatus(nextStatusValue);
    setNote("");
    setSaveError("");
  };

  const saveStatus = async () => {
    if (!editingId || !nextStatus) return;
    try {
      // NOTE: logExecutionStatus validates at runtime; technicians can only move jobs through the technical status map (in_progress → waiting_parts → completed).
      const result = await logExecutionStatus({
        jobOrderId: editingId,
        executionStatus: nextStatus as "in_progress" | "waiting_parts" | "completed",
        notes: note,
      });
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setEditingId("");
      if (selectedVehicle) await loadJobs(selectedVehicle.id);
      else fetchTechnicianJobs().then((j) => setJobs(j));
      setMessage("Execution status updated through a job log.");
      setMessageTone("ok");
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not update the status.",
      );
    }
  };

  const jobSearchCls =
    "h-8 w-full appearance-none rounded-lg border border-input bg-transparent ps-2.5 pe-8 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h1 className="text-title font-semibold">
          Technician Dashboard
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          View job orders by vehicle, or search below. Execution status only &
ndash; financial data is not visible on this page (technician-safe view).
        </p>
      </div>

      {/* Job search/filter section */}
      <Card>
        <CardHeader>
          <CardTitle>Job Orders</CardTitle>
          <CardDescription>
            Showing all job orders (technician-safe: execution status only, no
            amounts or billing info). Search by job number, customer, or plate.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Input
              type="text"
              placeholder="Search job #, customer, plate"
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              className={jobSearchCls}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            • No search = all jobs • Search filters job #, customer name, or plate
          </div>
        </CardContent>
      </Card>

      {/* Job list - shows all jobs from tech-safe view */}
      {jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Job Orders ({jobs.length})</CardTitle>
          </CardHeader>
          <CardContent className="h-64 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Job #</th>
                  <th className="pb-2 pr-4 font-medium">Vehicle</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Payment</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const v = vehicles.find((v) => v.id === job.vehicle_id);
                  const license = v?.license_plate || "—";
                  const customerName =
                    customers.find((c) => c.id === v?.customer_id)?.name || "—";

                  return (
                    <tr key={job.id} className="border-t border-rule align-top">
                      <td className="py-2 pr-4 font-medium">
                          <a
                            href={`/job-orders/${job.id}`}
                            className="underline text-primary hover:underline-opacity-70"
                          >
                            {job.job_number}
                          </a>
                        </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {license}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusPill status={job.execution_status} />
                      </td>
                      <td className="py-2 pr-4">
                        {job.financial_status ? (
                          <span className="text-xs text-muted-foreground">
                            {job.financial_status === 'paid' ? 'Paid' : job.financial_status === 'part_paid' ? 'Part paid' : job.financial_status === 'unpaid' ? 'Unpaid' : job.financial_status}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditor(job)}
                          title="Update status"
                        >
                          ✎
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
