"use client";

import { useState } from "react";
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
import { createVehicleForCustomer } from "@/app/actions/directory-actions";

export interface CreatedVehicle {
  id: string;
  license_plate: string;
}

const thisYear = () => String(new Date().getFullYear());

/**
 * Add one vehicle to an existing customer. The customer is fixed by the
 * caller, so this dialog never asks who the owner is.
 *
 * Sized like the customer dialog: capped to the viewport with its own
 * scrolling body, so it never runs off a phone screen.
 */
export function NewVehicleDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  onCreated?: (vehicle: CreatedVehicle) => void | Promise<void>;
}) {
  const [plate, setPlate] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(thisYear);
  const [color, setColor] = useState("");
  const [vin, setVin] = useState("");
  const [odometer, setOdometer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setPlate("");
    setMake("");
    setModel("");
    setYear(thisYear());
    setColor("");
    setVin("");
    setOdometer("");
    setError("");
  };

  const changeOpen = (next: boolean) => {
    // Every open starts blank, whichever way the last one closed.
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!plate.trim() || !make.trim() || !model.trim()) {
      setError("Plate, make and model are required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const created = await createVehicleForCustomer({
        customerId,
        licensePlate: plate,
        make,
        model,
        year,
        color,
        vin,
        odometer,
      });
      await onCreated?.(created);
      changeOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not add the vehicle.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-rule px-4 pt-4 pr-10 pb-3">
          <DialogTitle>Add vehicle</DialogTitle>
          <DialogDescription>
            Goes onto {customerName}&apos;s account. Plate, make and model are
            required; the rest can wait.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-4 py-4">
          <form id="new-vehicle-form" onSubmit={submit} noValidate className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-vehicle-plate">
                  Plate number{" "}
                  <span aria-hidden className="text-destructive">
                    *
                  </span>
                </Label>
                <Input
                  id="new-vehicle-plate"
                  autoFocus
                  autoCapitalize="characters"
                  placeholder="ABC-123KT"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-vehicle-year">Year</Label>
                <Input
                  id="new-vehicle-year"
                  type="number"
                  inputMode="numeric"
                  min={1900}
                  max={new Date().getFullYear() + 1}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-vehicle-make">
                  Make{" "}
                  <span aria-hidden className="text-destructive">
                    *
                  </span>
                </Label>
                <Input
                  id="new-vehicle-make"
                  placeholder="Toyota"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-vehicle-model">
                  Model{" "}
                  <span aria-hidden className="text-destructive">
                    *
                  </span>
                </Label>
                <Input
                  id="new-vehicle-model"
                  placeholder="Corolla"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-vehicle-color">Colour</Label>
                <Input
                  id="new-vehicle-color"
                  placeholder="Optional"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-vehicle-odometer">Odometer (km)</Label>
                <Input
                  id="new-vehicle-odometer"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="Optional"
                  value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="new-vehicle-vin">VIN</Label>
                <Input
                  id="new-vehicle-vin"
                  placeholder="Optional — chassis number"
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                />
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
          </form>
        </div>

        <DialogFooter className="mx-0 mb-0">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => changeOpen(false)}
          >
            Cancel
          </Button>
          <Button type="submit" form="new-vehicle-form" disabled={saving}>
            {saving ? "Adding…" : "Add vehicle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
