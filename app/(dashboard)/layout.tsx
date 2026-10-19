import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { type Role } from "@/lib/types";
import { AppShell, type ShellLink } from "@/components/app-shell";

interface NavItem extends ShellLink {
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
  const links = NAV.filter((item) => item.roles.includes(profile.role)).map(
    ({ href, label }) => ({ href, label }),
  );
  const workshopName =
    process.env.NEXT_PUBLIC_WORKSHOP_NAME || "Workshop Management System";

  return (
    <AppShell
      workshopName={workshopName}
      email={email}
      fullName={profile.full_name}
      role={profile.role}
      heading={NAV_HEADING[profile.role]}
      links={links}
    >
      {children}
    </AppShell>
  );
}
