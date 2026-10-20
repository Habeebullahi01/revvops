import Link from "next/link";
import { DirectorySearch } from "@/components/directory-search";
import { requireRole } from "@/lib/auth";
import { likePattern, sanitizeQuery } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

// Session-reading page: renders at request time (blocking, see layout).
export const instant = false;

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  created_at: string;
  vehicles: { id: string; license_plate: string }[] | null;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRole(["admin", "manager", "reception"]);

  const { q } = await searchParams;
  const query = sanitizeQuery(q);

  const supabase = await createClient();

  let request = supabase
    .from("customers")
    .select(
      "id, name, phone, email, address, created_at, vehicles(id, license_plate)",
    )
    .order("name", { ascending: true })
    .limit(100);

  if (query) {
    request = request.or(
      `name.ilike.${likePattern(query)},phone.ilike.${likePattern(query)}`,
    );
  }

  const { data, error } = await request;
  const rows = (data ?? []) as unknown as CustomerRow[];

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h1 className="text-title font-semibold">Customers</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every account at the front desk. Open one to correct its details or
          jump to a vehicle.
        </p>
      </div>

      <DirectorySearch
        path="/customers"
        placeholder="Search by name or phone number"
        defaultValue={query}
        hint="Matches part of a name or a phone number; press Enter to search."
      />

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          Could not load customers: {error.message}
        </p>
      )}

      {!error && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm font-medium">
            {query ? `Nothing matches ${query}` : "No customers yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {query
              ? "Try part of the surname, or the phone number without spaces."
              : "Customers are created from the invoice form when a new vehicle rolls in."}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Customer</th>
                <th className="py-2 pr-4 font-medium">Phone</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Vehicles</th>
                <th className="py-2 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const vehicles = row.vehicles ?? [];
                return (
                  <tr
                    key={row.id}
                    className="relative border-t border-rule transition-colors hover:bg-muted/40"
                  >
                    <td className="py-3 pr-4 align-top">
                      <Link
                        href={`/customers/${row.id}`}
                        className="font-medium after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {row.name}
                      </Link>
                      {row.address && (
                        <div className="text-xs text-muted-foreground">
                          {row.address}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4 align-top tabular-nums">
                      {row.phone}
                    </td>
                    <td className="py-3 pr-4 align-top text-muted-foreground">
                      {row.email ?? "—"}
                    </td>
                    <td className="py-3 pr-4 align-top">
                      {vehicles.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-x-2 gap-y-1">
                          {vehicles.slice(0, 2).map((vehicle) => (
                            <span
                              key={vehicle.id}
                              className="font-mono text-xs"
                            >
                              {vehicle.license_plate}
                            </span>
                          ))}
                          {vehicles.length > 2 && (
                            <span className="text-xs text-muted-foreground">
                              +{vehicles.length - 2}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-3 align-top text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleDateString("en-NG", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="pt-3 text-xs text-muted-foreground">
            {rows.length} customer{rows.length === 1 ? "" : "s"}
            {query ? ` matching ${query}` : ""}
            {rows.length === 100 ? " (first 100 shown)" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
