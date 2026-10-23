"use client";

import { useRouter } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";

/**
 * Tiny month switcher for month-scoped pages.
 *
 * It is a native select so it stays small and keyboard-friendly; changing it
 * replaces the route with `?month=YYYY-MM`, which makes the server component
 * re-query. No data is fetched until a month is chosen.
 */
export function MonthPicker({
  value,
  options,
  path = "/dashboard",
}: {
  value: string;
  options: { value: string; label: string }[];
  path?: string;
}) {
  const router = useRouter();

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Month</span>
      <select
        value={value}
        onChange={(event) => {
          const month = event.target.value;
          router.replace(month ? `${path}?month=${month}` : path);
        }}
        className="h-8 cursor-pointer appearance-none rounded-lg border border-input bg-transparent py-1 pr-7 pl-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground"
      />
    </label>
  );
}
