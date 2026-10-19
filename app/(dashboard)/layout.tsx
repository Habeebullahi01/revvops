import type { ReactNode } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ROLE_LANDING, type Role } from "@/lib/types";
import { signOutAction } from "@/app/actions/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  roles: Role[];
}

// The layout reads the session on every request (requireUser) — this route
// tree renders at request time instead of being prerendered into the shell.
export const instant = false;

/** Role-filtered navigation. Only routes that exist today — grows per phase. */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["admin", "manager"] },
  {
    href: "/job-orders",
    label: "Job Orders",
    roles: ["admin", "manager", "reception"],
  },
  { href: "/technician", label: "My Jobs", roles: ["technician"] },
];

const NAV_HEADING: Record<Role, string> = {
  admin: "Management",
  manager: "Management",
  reception: "Front Desk",
  technician: "Workshop",
};

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { email, profile } = await requireUser();
  const links = NAV.filter((item) => item.roles.includes(profile.role));
  const workshopName =
    process.env.NEXT_PUBLIC_WORKSHOP_NAME || "Workshop Management System";

  return (
    <div className="flex min-h-screen w-full">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-background">
        <div className="border-b px-4 py-4">
          <p className="truncate text-sm font-semibold" title={workshopName}>
            {workshopName}
          </p>
          <p className="text-xs text-muted-foreground">WMS</p>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {NAV_HEADING[profile.role]}
          </p>
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t p-3">
          <p className="truncate px-2 text-sm font-medium" title={email}>
            {profile.full_name}
          </p>
          <div className="flex items-center justify-between gap-2 px-2 pt-1">
            <Badge variant="secondary" className="capitalize">
              {profile.role}
            </Badge>
            <form action={signOutAction}>
              <Button variant="ghost" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
          <Link
            href={ROLE_LANDING[profile.role]}
            className="sr-only focus:not-sr-only"
          >
            Skip to main content
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto p-6">{children}</main>
    </div>
  );
}
