import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

export const instant = false;

const shortDateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-NG", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function buildHref(filters: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.set(k, v);
  }
  const q = params.toString();
  return q ? `/audit?${q}` : "/audit";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string;
    entity_type?: string;
    actor?: string;
    from?: string;
    to?: string;
  }>;
}) {
  await requireRole(["admin", "manager"]);

  const sp = await searchParams;
  const action = sp.action?.trim() || "";
  const entity_type = sp.entity_type?.trim() || "";
  const actor = sp.actor?.trim() || "";
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : "";
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : "";

  const supabase = await createClient();

  let request = supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, details, created_at, user_id")
    .order("created_at", { ascending: false })
    .limit(200);

  if (action) request = request.ilike("action", `%${action}%`);
  if (entity_type) request = request.ilike("entity_type", `%${entity_type}%`);
  if (from) request = request.gte("created_at", `${from}T00:00:00`);
  if (to) request = request.lte("created_at", `${to}T23:59:59.999`);

  const { data: logs, error } = await request;
  const rows = logs ?? [];

  // Fetch actor names for the rows we have
  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
  let profilesMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      if (p.full_name) profilesMap.set(p.id, p.full_name);
    }
  }

  const filtered = Boolean(action || entity_type || actor || from || to);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-title font-semibold">Audit log</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Read-only history of system actions. Immutable — no edits or deletions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by action, entity type, or date range</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="action">Action</Label>
              <Input id="action" name="action" defaultValue={action} placeholder="invoice.created" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entity_type">Entity type</Label>
              <Input id="entity_type" name="entity_type" defaultValue={entity_type} placeholder="invoice" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="actor">Actor</Label>
              <Input id="actor" name="actor" defaultValue={actor} placeholder="name (post-filter)" disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={from} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={to} />
            </div>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-5">
              <Button type="submit">Apply</Button>
              {filtered && (
                <Link
                  href="/audit"
                  className={buttonVariants({ variant: "outline" })}
                >
                  Clear
                </Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Could not load audit logs: {error.message}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Log entries</CardTitle>
          <CardDescription>Newest first · up to 200 results</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">No audit entries match.</p>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">When</th>
                    <th className="pb-2 pr-4 font-medium">Actor</th>
                    <th className="pb-2 pr-4 font-medium">Action</th>
                    <th className="pb-2 pr-4 font-medium">Entity</th>
                    <th className="pb-2 pr-4 font-medium">Entity ID</th>
                    <th className="pb-2 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-rule align-top">
                      <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                        {shortDateTime(row.created_at)}
                      </td>
                      <td className="py-2 pr-4">
                        {profilesMap.get(row.user_id) ?? "—"}
                      </td>
                      <td className="py-2 pr-4 font-medium">
                        {row.action}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {row.entity_type}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                        {row.entity_id ? row.entity_id.slice(0, 8) : "—"}
                      </td>
                      <td className="py-2 max-w-[320px]">
                        {row.details ? (
                          <pre className="overflow-x-auto rounded bg-muted/40 px-2 py-1 text-xs">
                            {JSON.stringify(row.details, null, 2)}
                          </pre>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
