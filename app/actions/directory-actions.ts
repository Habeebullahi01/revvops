"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface UpdateCustomerInput {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface UpdateVehicleInput {
  id: string;
  licensePlate: string;
  make: string;
  model: string;
  year?: string;
  color?: string;
  vin?: string;
  odometer?: string;
}

const clean = (value: string | undefined) => value?.trim() || "";

function parseYear(raw: string | undefined): number | null {
  const value = clean(raw);
  if (!value) return null;
  const year = Number.parseInt(value, 10);
  const max = new Date().getFullYear() + 1;
  if (!Number.isFinite(year) || year < 1900 || year > max) {
    throw new Error(`Year must be between 1900 and ${max}`);
  }
  return year;
}

function parseIntOrThrow(
  raw: string | undefined,
  label: string,
  min: number,
): number | null {
  const value = clean(raw);
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(`${label} is not a valid number`);
  }
  return parsed;
}

/** Inline edit on the customer detail page — officers only (§4). */
export async function updateCustomer(input: UpdateCustomerInput) {
  const { profile } = await requireRole(["admin", "manager", "reception"]);

  if (!input.id) throw new Error("Customer is required");
  const name = clean(input.name);
  const phone = clean(input.phone);
  if (!name) throw new Error("Name is required");
  if (!phone) throw new Error("Phone is required");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .update({
      name,
      phone,
      email: clean(input.email) || null,
      address: clean(input.address) || null,
      notes: clean(input.notes) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .select("id, name")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath(`/customers/${input.id}`);
  revalidatePath("/customers");

  await logAudit({
    userId: profile.id,
    action: "customer.updated",
    entityType: "customer",
    entityId: data.id,
    details: { name },
  });

  return data;
}

/** Inline edit on the vehicle detail page — officers only (§4). */
export async function updateVehicle(input: UpdateVehicleInput) {
  const { profile } = await requireRole(["admin", "manager", "reception"]);

  if (!input.id) throw new Error("Vehicle is required");
  const licensePlate = clean(input.licensePlate);
  const make = clean(input.make);
  const model = clean(input.model);
  if (!licensePlate) throw new Error("Plate number is required");
  if (!make) throw new Error("Make is required");
  if (!model) throw new Error("Model is required");

  const year = parseYear(input.year);
  const odometer = parseIntOrThrow(input.odometer, "Odometer", 0);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vehicles")
    .update({
      license_plate: licensePlate,
      make,
      model,
      year,
      color: clean(input.color) || null,
      vin: clean(input.vin) || null,
      odometer,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .select("id, license_plate")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath(`/vehicles/${input.id}`);
  revalidatePath("/vehicles");

  await logAudit({
    userId: profile.id,
    action: "vehicle.updated",
    entityType: "vehicle",
    entityId: data.id,
    details: { license_plate: licensePlate },
  });

  return data;
}
