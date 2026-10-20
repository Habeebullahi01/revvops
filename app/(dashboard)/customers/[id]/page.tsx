import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CarIcon } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AddVehicleButton } from "./add-vehicle-button";
import { CustomerEditor } from "./customer-editor";

// Session-reading page: renders at request time (blocking, see layout).
export const instant = false;

interface CustomerDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vehicles:
    | {
        id: string;
        license_plate: string;
        make: string;
        model: string;
        year: number | null;
      }[]
    | null;
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin", "manager", "reception"]);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, name, phone, email, address, notes, created_at, updated_at, vehicles(id, license_plate, make, model, year)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) notFound();

  const customer = data as unknown as CustomerDetail;
  const vehicles = [...(customer.vehicles ?? [])].sort((a, b) =>
    a.license_plate.localeCompare(b.license_plate),
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Link
          href="/customers"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          All customers
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-title font-semibold">{customer.name}</h1>
            <p className="text-sm text-muted-foreground">
              {customer.phone}
              {customer.email ? ` · ${customer.email}` : ""}
            </p>
          </div>
          <span className="text-sm text-muted-foreground">
            {vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <CustomerEditor customer={customer} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CarIcon className="size-4 text-brand" />
              Vehicles
            </CardTitle>
            <CardDescription>
              Open a vehicle to edit it or see its job history.
            </CardDescription>
            <CardAction>
              <AddVehicleButton
                customerId={customer.id}
                customerName={customer.name}
              />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            {vehicles.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No vehicle on this account yet — add one with the button above.
              </p>
            )}

            {vehicles.map((vehicle) => (
              <Link
                key={vehicle.id}
                href={`/vehicles/${vehicle.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/40"
              >
                <span>
                  <span className="block font-mono text-sm font-medium">
                    {vehicle.license_plate}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {[vehicle.make, vehicle.model].filter(Boolean).join(" ")}
                    {vehicle.year ? ` · ${vehicle.year}` : ""}
                  </span>
                </span>
                <ArrowLeftIcon className="size-4 rotate-180 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
