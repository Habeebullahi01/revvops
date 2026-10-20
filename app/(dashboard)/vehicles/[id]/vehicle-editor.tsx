"use client";

import { InlineEditCard, type EditableField } from "@/components/inline-edit-card";
import { updateVehicle } from "@/app/actions/directory-actions";

const FIELDS: EditableField[] = [
  { key: "licensePlate", label: "Plate number", required: true },
  { key: "make", label: "Make", required: true, placeholder: "Toyota" },
  { key: "model", label: "Model", required: true, placeholder: "Sienna" },
  { key: "year", label: "Year", kind: "number", placeholder: "Optional" },
  { key: "color", label: "Colour", placeholder: "Optional" },
  { key: "vin", label: "VIN", placeholder: "Optional" },
  { key: "odometer", label: "Odometer (km)", kind: "number", placeholder: "Optional" },
];

export interface VehicleForEdit {
  id: string;
  license_plate: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  vin: string | null;
  odometer: number | null;
  created_at: string;
  updated_at: string;
}

/** Inline editor — no /edit route; Save calls the server action directly. */
export function VehicleEditor({ vehicle }: { vehicle: VehicleForEdit }) {
  const onSave = (draft: Record<string, string>) =>
    updateVehicle({
      id: vehicle.id,
      licensePlate: draft.licensePlate,
      make: draft.make,
      model: draft.model,
      year: draft.year,
      color: draft.color,
      vin: draft.vin,
      odometer: draft.odometer,
    });

  const stamp = (iso: string) =>
    new Date(iso).toLocaleDateString("en-NG", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <InlineEditCard
      title="Vehicle details"
      description="Edit in place — there is no separate edit page."
      fields={FIELDS}
      values={{
        licensePlate: vehicle.license_plate,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year ? String(vehicle.year) : "",
        color: vehicle.color ?? "",
        vin: vehicle.vin ?? "",
        odometer: vehicle.odometer !== null ? String(vehicle.odometer) : "",
      }}
      onSave={onSave}
      notice={`Added ${stamp(vehicle.created_at)}. Last updated ${stamp(vehicle.updated_at)}.`}
    />
  );
}
