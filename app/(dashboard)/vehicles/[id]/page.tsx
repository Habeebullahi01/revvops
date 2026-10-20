import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, UserIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "cn";
import { VehicleEditor } from "./vehicle-editor";

// Session-reading page: renders at request time (blocking, see layout).
export const instant = false;

interface VehicleDetail {
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
  customers: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  } | null;
}

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin", "manager", "reception"]);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vehicles")
    .select(
      "id, license_plate, make, model, year, color, vin, odometer, created_at, updated_at, customers(id, name, phone, email)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) notFound();

  const vehicle = data as unknown as VehicleDetail;
  const owner = vehicle.customers;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Link
          href="/vehicles"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          All vehicles
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-title font-semibold">
              <span className="font-mono text-lg">{vehicle.license_plate}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {[vehicle.make, vehicle.model].filter(Boolean).join(" ")}
              {vehicle.year ? ` · ${vehicle.year}` : ""}
              {vehicle.color ? ` · ${vehicle.color}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* Small owner card: brief facts, one hop to the customer. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="size-4 text-brand" />
              Owner
            </CardTitle>
            <CardDescription>The account behind this vehicle</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {owner ? (
              <>
                <div>
                  <div className="text-sm font-medium">{owner.name}</div>
                  <div className="text-sm tabular-nums text-muted-foreground">
                    {owner.phone}
                  </div>
                  {owner.email && (
                    <div className="text-sm break-words text-muted-foreground">
                      {owner.email}
                    </div>
                  )}
                </div>
                <Link
                  href={`/customers/${owner.id}`}
                  className={cn(buttonVariants({ variant: "outline" }), "w-full")}
                >
                  Open customer
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No customer attached to this vehicle.
              </p>
            )}
          </CardContent>
        </Card>

        <VehicleEditor vehicle={vehicle} />
      </div>
    </div>
  );
}
