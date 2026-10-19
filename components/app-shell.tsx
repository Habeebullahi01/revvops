"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { signOutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

export interface ShellLink {
  href: string;
  label: string;
}

interface AppShellProps {
  workshopName: string;
  email: string;
  fullName: string;
  role: string;
  /** Role section label, e.g. "Front Desk" — shown on the phone topbar. */
  heading: string;
  /** Already role-filtered by the server layout. */
  links: ShellLink[];
  children: ReactNode;
}

/**
 * framed-sheet shell (sheet §4): the sidebar and 48px topbar share one tinted
 * ground with no rule between them (the L-frame); the page is a white sheet
 * inset 8px from the window's right and bottom edges, 16px radius on the free
 * corners, 1px edge, no shadow. On a phone the frame disappears — topbar with
 * menu button + section title, drawer navigation, sheet becomes the screen.
 */
export function AppShell({
  workshopName,
  email,
  fullName,
  role,
  heading,
  links,
  children,
}: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const navList = (
    <nav className="space-y-1">
      <p className="px-2 pt-4 pb-1 text-xs font-medium text-muted-foreground">
        {heading}
      </p>
      {links.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
            className={cn(
              "block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
              active && "bg-accent font-medium text-accent-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const account = (
    <div className="flex items-center gap-2">
      <span
        className="hidden max-w-40 truncate text-sm text-muted-foreground lg:inline"
        title={email}
      >
        {fullName}
      </span>
      <Badge variant="secondary" className="capitalize">
        {role}
      </Badge>
      <form action={signOutAction}>
        <Button variant="ghost" size="sm" type="submit">
          Sign out
        </Button>
      </form>
    </div>
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Link
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to main content
      </Link>

      {/* L-frame: sidebar, same tint as the topbar, no rule between them */}
      <aside
        className="hidden shrink-0 flex-col md:flex"
        style={{ width: "var(--sidebar-width)" }}
      >
        <div className="flex h-12 items-center gap-2 px-4">
          <p
            className="truncate text-sm font-semibold"
            title={workshopName}
          >
            {workshopName}
          </p>
          <span className="text-xs text-muted-foreground">WMS</span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">{navList}</div>
      </aside>

      {/* right of the frame: 48px topbar on the chrome, then the sheet */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 px-3 md:px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </Button>
          {/* phone: section title here. desktop: reserved for the global
              job search, which arrives with the Phase 1 job list. */}
          <p className="truncate text-sm font-medium md:hidden">{heading}</p>
          <div className="ml-auto">{account}</div>
        </header>

        {/* the sheet: butts against sidebar + topbar, inset 8px right/bottom */}
        <div className="min-h-0 flex-1 md:pr-[var(--sheet-inset)] md:pb-[var(--sheet-inset)]">
          <main
            id="main"
            className="h-full overflow-y-auto border bg-card md:rounded-tr-[var(--radius-sheet)] md:rounded-br-[var(--radius-sheet)]"
          >
            <div className="p-4 md:p-6">{children}</div>
          </main>
        </div>
      </div>

      {/* phone: the frame disappears, navigation lives in a drawer */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-64 gap-0 bg-background p-3">
          <SheetHeader className="flex h-12 items-center gap-2 p-0 pl-1">
            <SheetTitle
              className="truncate text-sm font-semibold"
              title={workshopName}
            >
              {workshopName}
            </SheetTitle>
            <span className="text-xs text-muted-foreground">WMS</span>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto pr-1">{navList}</div>
          <div className="border-t pt-3">{account}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
