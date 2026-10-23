"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createInvoice } from "@/app/actions/invoice-actions";
import {
  BILLING_OPTIONS,
  CATEGORY_OPTIONS,
  type BillingType,
  type InvoiceCategory,
} from "@/lib/invoice-vocabulary";
import { NAIRA, formatNaira } from "@/lib/money";
import {
  NewCustomerDialog,
  type CreatedCustomer,
} from "@/components/new-customer-dialog";
import { NewVehicleDialog } from "@/components/new-vehicle-dialog";

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
}

interface Vehicle {
  id: string;
  license_plate: string;
  make: string;
  model: string;
  year: number;
  customer_id: string;
}

interface CostLine {
  id: string;
  description: string;
  amount: string;
  itemType: "labor" | "part";
}

const selectCls =
  "h-8 w-full appearance-none rounded-lg border border-input bg-transparent ps-2.5 pe-8 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 md:text-sm";

let seq = 0;
const nextId = () => `l${(seq += 1)}`;

const blankLine = (): CostLine => ({
  id: nextId(),
  description: "",
  amount: "",
  itemType: "labor",
});

/** Pure fetch: no state, so the mount effect only sets state in a .then(). */
const fetchDirectory = async () => {
  const [cRes, vRes] = await Promise.all([
    fetch("/api/customers"),
    fetch("/api/vehicles"),
  ]);
  if (!cRes.ok || !vRes.ok) throw new Error("directory unavailable");
  return {
    customers: (await cRes.json()) as Customer[],
    vehicles: (await vRes.json()) as Vehicle[],
  };
};

export function InvoiceForm() {
  const router = useRouter();

  // Directory (customers + vehicles), loaded once and refreshed after a create.
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [directoryError, setDirectoryError] = useState("");

  const loadDirectory = async () => {
    try {
      const data = await fetchDirectory();
      setCustomers(data.customers);
      setVehicles(data.vehicles);
      setDirectoryError("");
    } catch {
      setDirectoryError("Could not load customers and vehicles. Refresh the page.");
    }
  };

  useEffect(() => {
    let stale = false;
    fetchDirectory()
      .then((data) => {
        if (stale) return;
        setCustomers(data.customers);
        setVehicles(data.vehicles);
      })
      .catch(() => {
        if (stale) return;
        setDirectoryError("Could not load customers and vehicles. Refresh the page.");
      });
    return () => {
      stale = true;
    };
  }, []);

  // ---- customer combobox ----
  const [query, setQuery] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const vehicleRef = useRef<HTMLSelectElement>(null);

  // ---- invoice fields ----
  const [vehicleId, setVehicleId] = useState("");
  const [complaint, setComplaint] = useState("");
  const [billingType, setBillingType] = useState<BillingType>("upfront");
  const [category, setCategory] = useState<InvoiceCategory>("maintenance");
  const [lines, setLines] = useState<CostLine[]>([blankLine()]);
  const [total, setTotal] = useState("");
  const [totalTouched, setTotalTouched] = useState(false);

  // ---- feedback ----
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  // ---- new-customer dialog (re-seeded on every open) ----
  const [dialog, setDialog] = useState({
    open: false,
    seed: 0,
    defaultName: "",
  });

  // ---- add-vehicle dialog for the customer already selected ----
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const customerVehicles = useMemo(
    () => vehicles.filter((v) => v.customer_id === customerId),
    [vehicles, customerId],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? customers.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.phone ?? "").includes(q) ||
            (c.email ?? "").toLowerCase().includes(q),
        )
      : customers;
    return pool.slice(0, 50);
  }, [customers, query]);

  const lineTotal = useMemo(
    () =>
      lines.reduce(
        (sum, line) => sum + (Number.parseFloat(line.amount) || 0),
        0,
      ),
    [lines],
  );
  const laborTotal = useMemo(
    () =>
      lines.reduce(
        (sum, line) =>
          line.itemType === "labor"
            ? sum + (Number.parseFloat(line.amount) || 0)
            : sum,
        0,
      ),
    [lines],
  );
  const partsTotal = useMemo(() => lineTotal - laborTotal, [lineTotal, laborTotal]);

  const totalValue = totalTouched ? Number.parseFloat(total) || 0 : lineTotal;
  const totalDiffers = totalTouched && Math.abs(totalValue - lineTotal) > 0.004;
  const billableLines = lines.filter(
    (line) => line.description.trim() && (Number.parseFloat(line.amount) || 0) > 0,
  );

  // Close the suggestion list when clicking outside the combobox.
  useEffect(() => {
    if (!listOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setListOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [listOpen]);

  const pickCustomer = (customer: Customer) => {
    setCustomerId(customer.id);
    setQuery(customer.name);
    setVehicleId("");
    setListOpen(false);
    setActiveIdx(0);
    setNotice("");
    setFormError("");
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setListOpen(true);
      setActiveIdx((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      if (listOpen && matches[activeIdx]) {
        event.preventDefault();
        pickCustomer(matches[activeIdx]);
      }
    } else if (event.key === "Escape") {
      setListOpen(false);
    }
  };

  // ---- cost line editors ----
  const updateLine = (id: string, patch: Partial<CostLine>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const addLine = () => setLines((prev) => [...prev, blankLine()]);

  const removeLine = (id: string) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));

  // ---- new-customer dialog ----
  const openModal = () =>
    setDialog((d) => ({
      open: true,
      seed: d.seed + 1,
      defaultName: query.trim(),
    }));

  const onModalOpenChange = (open: boolean) => {
    setDialog((d) => ({ ...d, open }));
    if (!open) setTimeout(() => searchRef.current?.focus(), 50);
  };

  /** The dialog hands back the ids; we refresh the directory and select them. */
  const onCustomerCreated = async (created: CreatedCustomer) => {
    await loadDirectory();
    setCustomerId(created.customer.id);
    setQuery(created.customer.name);
    setVehicleId(created.vehicleId);
    setNotice(
      `${created.customer.name} created with ${created.vehicleCount} vehicle${
        created.vehicleCount > 1 ? "s" : ""
      }.`,
    );
    setFormError("");
    setTimeout(() => vehicleRef.current?.focus(), 60);
  };

  // ---- invoice submit ----
  // "Work requested" is optional since 0016: a healthy vehicle in for a
  // fitment has nothing to report, so a blank field must not block the form.
  const submitReady =
    Boolean(customerId) &&
    Boolean(vehicleId) &&
    billableLines.length > 0 &&
    totalValue > 0 &&
    !submitting;

  const submitInvoice = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!submitReady) return;

    setSubmitting(true);
    setFormError("");
    try {
      const result = await createInvoice({
        customerId,
        vehicleId,
        complaint: complaint.trim(),
        billingType,
        category,
        costBreakdown: billableLines.map((line) => ({
          description: line.description.trim(),
          amount: Math.round((Number.parseFloat(line.amount) || 0) * 100) / 100,
          itemType: line.itemType,
        })),
        totalAmount: Math.round(totalValue * 100) / 100,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      // The detail page is where payments and the job order happen.
      router.push(`/invoices/${result.data.id}`);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not create the invoice.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setCustomerId("");
    setVehicleId("");
    setQuery("");
    setComplaint("");
    setLines([blankLine()]);
    setTotal("");
    setTotalTouched(false);
    setListOpen(false);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submitInvoice} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Invoice details</CardTitle>
            <CardDescription>
              Customer, vehicle, work requested and a cost breakdown. Nothing here
              creates a job order.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {directoryError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {directoryError}
              </p>
            )}

            {/* ── Customer ─────────────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="invoice-customer">
                  Customer{" "}
                  <span aria-hidden className="text-destructive">
                    *
                  </span>
                </Label>
                <span className="text-xs text-muted-foreground">
                  Type to search, or create a new one
                </span>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row" ref={wrapRef}>
                <div className="relative flex-1">
                  <Input
                    id="invoice-customer"
                    ref={searchRef}
                    role="combobox"
                    aria-expanded={listOpen}
                    aria-controls="invoice-customer-list"
                    aria-autocomplete="list"
                    autoComplete="off"
                    placeholder="Search by name, phone or email"
                    value={query}
                    onFocus={() => setListOpen(true)}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActiveIdx(0);
                      setListOpen(true);
                      if (customerId) {
                        setCustomerId("");
                        setVehicleId("");
                      }
                    }}
                    onKeyDown={onSearchKeyDown}
                    className="pr-8"
                  />
                  <SearchIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />

                  {listOpen && (
                    <ul
                      id="invoice-customer-list"
                      role="listbox"
                      aria-label="Customers"
                      className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
                    >
                      {matches.length === 0 ? (
                        <li className="px-2 py-2 text-sm text-muted-foreground">
                          No match. Use New customer to add them.
                        </li>
                      ) : (
                        matches.map((customer, index) => (
                          <li
                            key={customer.id}
                            role="option"
                            aria-selected={index === activeIdx}
                            onMouseEnter={() => setActiveIdx(index)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              pickCustomer(customer);
                            }}
                            className={cn(
                              "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm",
                              index === activeIdx && "bg-accent",
                              customer.id === customerId && "font-medium",
                            )}
                          >
                            <span className="truncate">{customer.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {customer.phone}
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={openModal}
                  className="shrink-0"
                >
                  <PlusIcon className="size-4" />
                  New customer
                </Button>
              </div>

              {selectedCustomer && (
                <p className="flex items-center gap-1.5 text-xs text-positive">
                  <CheckIcon className="size-3.5" />
                  {selectedCustomer.name} selected
                </p>
              )}
            </div>

            {/* ── Vehicle ──────────────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="invoice-vehicle">
                  Vehicle{" "}
                  <span aria-hidden className="text-destructive">
                    *
                  </span>
                </Label>
                {customerId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setVehicleDialogOpen(true)}
                  >
                    <PlusIcon className="size-4" />
                    Add vehicle
                  </Button>
                )}
              </div>
              <div className="relative">
                <select
                  id="invoice-vehicle"
                  ref={vehicleRef}
                  className={selectCls}
                  value={vehicleId}
                  disabled={!customerId || customerVehicles.length === 0}
                  onChange={(e) => setVehicleId(e.target.value)}
                >
                  <option value="">
                    {customerId ? "Select a vehicle" : "Select a customer first"}
                  </option>
                  {customerVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.license_plate} - {v.make} {v.model} ({v.year})
                    </option>
                  ))}
                  {customerId && customerVehicles.length === 0 && (
                    <option value="" disabled>
                      This customer has no vehicles yet
                    </option>
                  )}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              {customerId && customerVehicles.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No vehicle on this account yet — use Add vehicle above.
                </p>
              )}
            </div>

            {/* ── Work requested ───────────────────────────────────── */}
            <div className="space-y-2">
              <Label htmlFor="invoice-complaint">Work requested</Label>
              <Textarea
                id="invoice-complaint"
                rows={3}
                placeholder="What the customer asked for — a fault to fix, or a fitment. Optional."
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
              />
            </div>

            {/* ── Billing + category ───────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invoice-billing">Billing type</Label>
                <select
                  id="invoice-billing"
                  className={selectCls}
                  value={billingType}
                  onChange={(e) => setBillingType(e.target.value as BillingType)}
                >
                  {BILLING_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice-category">Category</Label>
                <select
                  id="invoice-category"
                  className={selectCls}
                  value={category}
                  onChange={(e) => setCategory(e.target.value as InvoiceCategory)}
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── Cost breakdown ───────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>
                  Cost breakdown{" "}
                  <span aria-hidden className="text-destructive">
                    *
                  </span>
                </Label>
                <span className="text-xs text-muted-foreground">
                  Labour and parts, one row each
                </span>
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                <div className="hidden grid-cols-[8rem_minmax(0,1fr)_9rem_2rem] gap-3 border-b border-rule bg-muted/50 px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid">
                  <span>Type</span>
                  <span>Description</span>
                  <span className="text-right">Amount</span>
                  <span className="sr-only">Actions</span>
                </div>

                <div className="divide-y divide-rule">
                  {lines.map((line) => (
                    <div
                      key={line.id}
                      className="grid gap-2 px-3 py-3 sm:grid-cols-[8rem_minmax(0,1fr)_9rem_2rem] sm:items-center sm:gap-3"
                    >
                      <label className="flex flex-col gap-1 sm:gap-0">
                        <span className="text-xs font-medium text-muted-foreground sm:hidden">
                          Type
                        </span>
                        <span className="relative">
                          <select
                            aria-label="Line type"
                            className={selectCls}
                            value={line.itemType}
                            onChange={(e) =>
                              updateLine(line.id, {
                                itemType: e.target.value as "labor" | "part",
                              })
                            }
                          >
                            <option value="labor">Labor</option>
                            <option value="part">Part</option>
                          </select>
                          <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        </span>
                      </label>

                      <label className="flex flex-col gap-1 sm:gap-0">
                        <span className="text-xs font-medium text-muted-foreground sm:hidden">
                          Description
                        </span>
                        <Input
                          placeholder="Cylinder kit, labour, fittings"
                          value={line.description}
                          onChange={(e) =>
                            updateLine(line.id, { description: e.target.value })
                          }
                        />
                      </label>

                      <label className="flex flex-col gap-1 sm:gap-0">
                        <span className="text-xs font-medium text-muted-foreground sm:hidden">
                          Amount
                        </span>
                        <span className="relative block">
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-muted-foreground"
                          >
                            {NAIRA}
                          </span>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            placeholder="0.00"
                            aria-label="Line amount"
                            className="ps-6 sm:text-right"
                            value={line.amount}
                            onChange={(e) =>
                              updateLine(line.id, { amount: e.target.value })
                            }
                          />
                        </span>
                      </label>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove cost line"
                          disabled={lines.length <= 1}
                          onClick={() => removeLine(line.id)}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* The add action reads as the next row, not a header chip. */}
                  <div className="px-3 py-2.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addLine}
                      className="w-full sm:w-auto"
                    >
                      <PlusIcon className="size-4" />
                      Add line
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-rule bg-muted/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Labor{" "}
                      <b className="font-medium text-foreground tabular-nums">
                        {formatNaira(laborTotal)}
                      </b>
                    </span>
                    <span>
                      Parts{" "}
                      <b className="font-medium text-foreground tabular-nums">
                        {formatNaira(partsTotal)}
                      </b>
                    </span>
                    <span>
                      {billableLines.length} of {lines.length} lines counted
                    </span>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Breakdown total
                    </div>
                    <div className="text-lg font-semibold tabular-nums">
                      {formatNaira(lineTotal)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="invoice-total">
                    Total amount{" "}
                    <span aria-hidden className="text-destructive">
                      *
                    </span>
                  </Label>
                  <span className="relative block">
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-muted-foreground"
                    >
                      {NAIRA}
                    </span>
                    <Input
                      id="invoice-total"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      className="ps-6"
                      value={totalTouched ? total : lineTotal ? String(lineTotal) : ""}
                      onChange={(e) => {
                        setTotal(e.target.value);
                        setTotalTouched(true);
                      }}
                    />
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {totalDiffers ? (
                      <>
                        Differs from the breakdown by{" "}
                        <b className="font-medium text-foreground tabular-nums">
                          {formatNaira(Math.abs(totalValue - lineTotal))}
                        </b>
                        .{" "}
                        <button
                          type="button"
                          className="font-medium text-brand underline underline-offset-2"
                          onClick={() => {
                            setTotal("");
                            setTotalTouched(false);
                          }}
                        >
                          Use breakdown total
                        </button>
                      </>
                    ) : (
                      "Set from the lines above; edit it only when the invoice rounds differently."
                    )}
                  </p>
                </div>
              </div>
            </div>

            {formError && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </p>
            )}
            {notice && (
              <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                {notice}
              </p>
            )}
          </CardContent>

          <CardFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => {
                resetForm();
                setFormError("");
                setNotice("");
              }}
            >
              Clear
            </Button>
            <Button type="submit" disabled={!submitReady}>
              {submitting ? "Creating…" : "Create invoice"}
            </Button>
          </CardFooter>
        </Card>
      </form>

      {/* ---- New customer + vehicles (shared dialog) ---- */}
      <NewCustomerDialog
        key={dialog.seed}
        open={dialog.open}
        defaultName={dialog.defaultName}
        onOpenChange={onModalOpenChange}
        onCreated={onCustomerCreated}
      />

      {/* ---- Add a vehicle to the customer already chosen above ---- */}
      {customerId && (
        <NewVehicleDialog
          open={vehicleDialogOpen}
          onOpenChange={setVehicleDialogOpen}
          customerId={customerId}
          customerName={selectedCustomer?.name ?? "this customer"}
          onCreated={async (vehicle) => {
            await loadDirectory();
            setVehicleId(vehicle.id);
          }}
        />
      )}
    </div>
  );
}
