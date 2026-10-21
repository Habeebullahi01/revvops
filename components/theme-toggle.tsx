"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Sidebar theme control. A single button that flips between light and dark —
 * no three-way "system" state, because the product is a workshop terminal and
 * the theme is a deliberate operator choice (see components/theme-provider.tsx).
 *
 * next-themes resolves the theme on the client, so the server cannot know it.
 * `useSyncExternalStore` is the right primitive for that split: it returns
 * `false` for the server snapshot and the live value after hydration, with no
 * mount-tracking effect and no hydration mismatch. The store never changes (the
 * read happens in the render), so subscribing is a no-op.
 */
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  // Before hydration the toggle paints in its light state on purpose: it is
  // both the default theme and what the server rendered.
  const isDark = hydrated && resolvedTheme === "dark";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {/* Both icons stay in the tree; only one occupies layout at a time.
          Swapping nodes instead would change the DOM shape on hydration. */}
      <Sun className={isDark ? "hidden" : "block"} />
      <Moon className={isDark ? "block" : "hidden"} />
    </Button>
  );
}
