"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  actionFailure,
  type ActionResult,
} from "@/lib/action-result";

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

export interface CreateVehicleInput {
  customerId: string;
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
export async function updateCustomer(
  input: UpdateCustomerInput,
): Promise<ActionResult<{ id: string; name: string }>> {
  const { profile } = await requireRole(["admin", "manager", "reception"]);

  if (!input.id) return { ok: false, error: "Customer is required" };
  const name = clean(input.name);
  const phone = clean(input.phone);
  if (!name) return { ok: false, error: "Name is required" };
  if (!phone) return { ok: false, error: "Phone is required" };

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

  return { ok: true, data: { id: data.id, name: data.name } };
}

/** Inline edit on the vehicle detail page — officers only (§4). */
export async function updateVehicle(
  input: UpdateVehicleInput,
): Promise<ActionResult<{ id: string; license_plate: string }>> {
  const { profile } = await requireRole(["admin", "manager", "reception"]);

  if (!input.id) return { ok: false, error: "Vehicle is required" };
  const licensePlate = clean(input.licensePlate).toUpperCase();
  const make = clean(input.make);
  const model = clean(input.model);
  if (!licensePlate) return { ok: false, error: "Plate number is required" };
  if (!make) return { ok: false, error: "Make is required" };
  if (!model) return { ok: false, error: "Model is required" };

  let year: number | null;
  let odometer: number | null;
  try {
    year = parseYear(input.year);
    odometer = parseIntOrThrow(input.odometer, "Odometer", 0);
  } catch (caught) {
    return actionFailure(caught, "Invalid vehicle details");
  }

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

  if (error) {
    // 23505 = unique_violation: the plate already exists on another vehicle.
    if (error.code === "23505") {
      return {
        ok: false,
        error: `Plate ${licensePlate} is already registered to another vehicle.`,
      };
    }
    throw new Error(error.message);
  }

  revalidatePath(`/vehicles/${input.id}`);
  revalidatePath("/vehicles");

  await logAudit({
    userId: profile.id,
    action: "vehicle.updated",
    entityType: "vehicle",
    entityId: data.id,
    details: { license_plate: licensePlate },
  });

  return { ok: true, data: { id: data.id, license_plate: data.license_plate } };
}

/**
 * Add a vehicle to an existing customer — the customer is fixed by the page
 * that opens the dialog, so a plate cannot be re-homed by accident.
 * Officers only (§4); plates are unique across the workshop (0001).
 */
export async function createVehicleForCustomer(
  input: CreateVehicleInput,
): Promise<ActionResult<{ id: string; license_plate: string }>> {
  const { profile } = await requireRole(["admin", "manager", "reception"]);

  if (!input.customerId) return { ok: false, error: "Customer is required" };
  const licensePlate = clean(input.licensePlate).toUpperCase();
  const make = clean(input.make);
  const model = clean(input.model);
  if (!licensePlate)
    return { ok: false, error: "Plate number is required" };
  if (!make) return { ok: false, error: "Make is required" };
  if (!model) return { ok: false, error: "Model is required" };

  let year: number | null;
  let odometer: number | null;
  try {
    year = parseYear(input.year);
    odometer = parseIntOrThrow(input.odometer, "Odometer", 0);
  } catch (caught) {
    return actionFailure(caught, "Invalid vehicle details");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      customer_id: input.customerId,
      license_plate: licensePlate,
      make,
      model,
      year,
      color: clean(input.color) || null,
      vin: clean(input.vin) || null,
      odometer,
    })
    .select("id, license_plate")
    .single();

  if (error) {
    // 23505 = unique_violation: the plate already exists somewhere else.
    if (error.code === "23505") {
      return {
        ok: false,
        error: `Plate ${licensePlate} is already registered to another vehicle.`,
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/customers/${input.customerId}`);
  revalidatePath("/customers");
  revalidatePath("/vehicles");

  await logAudit({
    userId: profile.id,
    action: "vehicle.created",
    entityType: "vehicle",
    entityId: data.id,
    details: { license_plate: licensePlate, customer_id: input.customerId },
  });

  return { ok: true, data };
}
