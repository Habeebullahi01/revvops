"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Prints the job card. The card itself is already on this page, hidden on
 * screen and revealed by `@media print` (see the `job-card` block in
 * `globals.css`), so this is a bare `window.print()` — no navigation to a
 * separate sheet route.
 */
export function PrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
      <PrinterIcon className="size-3.5" />
      Print job card
    </Button>
  );
}
