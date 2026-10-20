import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { DirectorySearch } from "@/components/directory-search";
import { requireRole } from "@/lib/auth";
import { likePattern, sanitizeQuery } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

// Session-reading page: renders at request time (blocking, see layout).
export const instant = false;

interface VehicleRow {
  id: string;
  license_plate: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  vin: string | null;
  customers: { id: string; name: string; phone: string } | null;
}

/**
 * Search-first directory: no list sits waiting for interaction. Nothing
 * renders until a query arrives, then results are listed.
 */
export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRole(["admin", "manager", "reception"]);

  const { q } = await searchParams;
  const query = sanitizeQuery(q);

  let rows: VehicleRow[] = [];
  let searchError: string | null = null;

  if (query) {
    const supabase = await createClient();
    const pattern = likePattern(query);

    const [byVehicle, byOwner] = await Promise.all([
      supabase
        .from("vehicles")
        .select(
          "id, license_plate, make, model, year, color, vin, customers(id, name, phone)",
        )
        .or(
          `license_plate.ilike.${pattern},make.ilike.${pattern},model.ilike.${pattern},vin.ilike.${pattern}`,
        )
        .limit(50),
      supabase
        .from("vehicles")
        .select(
          "id, license_plate, make, model, year, color, vin, customers!inner(id, name, phone)",
        )
        .ilike("customers.name", pattern)
        .limit(50),
    ]);

    searchError = byVehicle.error?.message ?? byOwner.error?.message ?? null;

    const merged = new Map<string, VehicleRow>();
    for (const row of [...(byVehicle.data ?? []), ...(byOwner.data ?? [])]) {
      const vehicle = row as unknown as VehicleRow;
      merged.set(vehicle.id, vehicle);
    }
    rows = [...merged.values()].sort((a, b) =>
      a.license_plate.localeCompare(b.license_plate),
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h1 className="text-title font-semibold">Vehicles</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Find a vehicle first — by owner name, plate number, VIN, make or
          model. Results open the vehicle, and its owner sits one card away.
        </p>
      </div>

      <DirectorySearch
        path="/vehicles"
        placeholder="Owner name, plate, VIN, make or model"
        defaultValue={query}
        hint="Search runs when you press Enter. VIN search works already; the column is on vehicles since 0001."
      />

      {searchError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          Search failed: {searchError}
        </p>
      )}

      {!query && (
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
          <SearchIcon
            aria-hidden
            className="mx-auto mb-3 size-5 text-muted-foreground"
          />
          <p className="text-sm font-medium">Search to list vehicles</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
            Nothing is loaded until you ask for it. Try a plate like
            &quot;ABC&quot;, a chassis number fragment, or the owner&apos;s
            surname.
          </p>
        </div>
      )}

      {query && !searchError && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm font-medium">No vehicle matches {query}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Check the plate number, or search by the owner&apos;s name instead.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Plate</th>
                <th className="py-2 pr-4 font-medium">Vehicle</th>
                <th className="py-2 pr-4 font-medium">Owner</th>
                <th className="py-2 pr-4 font-medium">VIN</th>
                <th className="py-2 font-medium">Colour</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="relative border-t border-rule transition-colors hover:bg-muted/40"
                >
                  <td className="py-3 pr-4 align-top">
                    <Link
                      href={`/vehicles/${row.id}`}
                      className="font-mono text-sm font-medium after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {row.license_plate}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 align-top">
                    {[row.make, row.model].filter(Boolean).join(" ")}
                    {row.year && (
                      <div className="text-xs text-muted-foreground">
                        {row.year}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4 align-top">
                    {row.customers ? (
                      <span className="text-muted-foreground">
                        {row.customers.name}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3 pr-4 align-top font-mono text-xs text-muted-foreground">
                    {row.vin ?? "—"}
                  </td>
                  <td className="py-3 align-top text-muted-foreground">
                    {row.color ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="pt-3 text-xs text-muted-foreground">
            {rows.length} match{rows.length === 1 ? "" : "es"} for {query}
          </p>
        </div>
      )}
    </div>
  );
}
