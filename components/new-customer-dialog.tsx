"use client";

import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CreatedCustomer {
  customer: { id: string; name: string };
  vehicleId: string;
  vehicleCount: number;
}

interface ModalVehicle {
  id: string;
  license_plate: string;
  make: string;
  model: string;
  year: string;
}

let seq = 0;
const nextId = () => `v${(seq += 1)}`;

const blankVehicle = (): ModalVehicle => ({
  id: nextId(),
  license_plate: "",
  make: "",
  model: "",
  year: String(new Date().getFullYear()),
});

/**
 * Customer + one-or-more-vehicles creator, shared by the invoice form and the
 * customer directory. Controlled by the caller so the caller can re-seed it on
 * each open (pass a fresh `key`) and take the returned ids.
 *
 * The popup caps itself at the viewport height and scrolls its own body, so it
 * never runs off the screen at phone widths.
 */
export function NewCustomerDialog({
  open,
  onOpenChange,
  defaultName = "",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  onCreated: (result: CreatedCustomer) => void | Promise<void>;
}) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [vehicleRows, setVehicleRows] = useState<ModalVehicle[]>([blankVehicle()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const updateRow = (id: string, patch: Partial<ModalVehicle>) =>
    setVehicleRows((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const submit = async () => {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName || !trimmedPhone) {
      setError("Name and phone are required.");
      return;
    }

    const isComplete = (v: ModalVehicle) =>
      Boolean(v.license_plate.trim() && v.make.trim() && v.model.trim());
    const isPartial = (v: ModalVehicle) =>
      !isComplete(v) &&
      Boolean(v.license_plate.trim() || v.make.trim() || v.model.trim());

    if (vehicleRows.some(isPartial)) {
      setError("Finish the details on every vehicle row, or clear it.");
      return;
    }
    const filled = vehicleRows.filter(isComplete);
    if (filled.length === 0) {
      setError("Add at least one vehicle: plate, make and model.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const cRes = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          phone: trimmedPhone,
          email: email.trim() || null,
          address: address.trim() || null,
        }),
      });
      const cData = await cRes.json();
      if (!cRes.ok) throw new Error(cData.error || "Could not create the customer.");

      let firstVehicleId = "";
      for (const v of filled) {
        const vRes = await fetch("/api/vehicles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_id: cData.id,
            license_plate: v.license_plate.trim().toUpperCase(),
            make: v.make.trim(),
            model: v.model.trim(),
            year: Number(v.year) || new Date().getFullYear(),
          }),
        });
        const vData = await vRes.json();
        if (!vRes.ok) throw new Error(vData.error || "Could not save a vehicle.");
        if (!firstVehicleId) firstVehicleId = vData.id;
      }

      await onCreated({
        customer: { id: cData.id, name: trimmedName },
        vehicleId: firstVehicleId,
        vehicleCount: filled.length,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the customer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-rule px-4 pt-4 pr-10 pb-3">
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>
            Add the customer and at least one vehicle. Both land back in the
            form that opened this.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-customer-name">
                Name{" "}
                <span aria-hidden className="text-destructive">
                  *
                </span>
              </Label>
              <Input
                id="new-customer-name"
                autoFocus
                placeholder="Customer name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-customer-phone">
                Phone{" "}
                <span aria-hidden className="text-destructive">
                  *
                </span>
              </Label>
              <Input
                id="new-customer-phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-customer-email">Email</Label>
                <Input
                  id="new-customer-email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-customer-address">Address</Label>
                <Input
                  id="new-customer-address"
                  placeholder="Street, city"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2 border-t border-rule pt-4">
              <div className="flex items-center justify-between gap-2">
                <Label>
                  Vehicles{" "}
                  <span aria-hidden className="text-destructive">
                    *
                  </span>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVehicleRows((prev) => [...prev, blankVehicle()])}
                >
                  <PlusIcon className="size-4" />
                  Add vehicle
                </Button>
              </div>

              <div className="space-y-3">
                {vehicleRows.map((vehicle, index) => (
                  <div
                    key={vehicle.id}
                    className="space-y-3 rounded-lg border border-border bg-muted/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        Vehicle {index + 1}
                      </span>
                      {vehicleRows.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={"Remove vehicle " + (index + 1)}
                          onClick={() =>
                            setVehicleRows((prev) =>
                              prev.filter((v) => v.id !== vehicle.id),
                            )
                          }
                        >
                          <Trash2Icon />
                        </Button>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor={`plate-${vehicle.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          License plate
                        </Label>
                        <Input
                          id={`plate-${vehicle.id}`}
                          placeholder="ABC-123"
                          value={vehicle.license_plate}
                          onChange={(e) =>
                            updateRow(vehicle.id, {
                              license_plate: e.target.value.toUpperCase(),
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor={`year-${vehicle.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          Year
                        </Label>
                        <Input
                          id={`year-${vehicle.id}`}
                          type="number"
                          min={1900}
                          max={new Date().getFullYear() + 1}
                          value={vehicle.year}
                          onChange={(e) => updateRow(vehicle.id, { year: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor={`make-${vehicle.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          Make
                        </Label>
                        <Input
                          id={`make-${vehicle.id}`}
                          placeholder="Toyota"
                          value={vehicle.make}
                          onChange={(e) => updateRow(vehicle.id, { make: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor={`model-${vehicle.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          Model
                        </Label>
                        <Input
                          id={`model-${vehicle.id}`}
                          placeholder="Corolla"
                          value={vehicle.model}
                          onChange={(e) => updateRow(vehicle.id, { model: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => void submit()}>
            {saving ? "Creating…" : "Create customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
