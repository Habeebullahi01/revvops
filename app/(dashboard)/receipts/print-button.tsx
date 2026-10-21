"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Prints the artefact already on the page. The receipt sheet is hidden on
 * screen and revealed by `@media print` (see `globals.css`), so this is a
 * bare `window.print()` — no navigation to a separate sheet route.
 */
export function PrintButton({
  children = "Print",
}: {
  children?: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => window.print()}
    >
      <PrinterIcon className="size-3.5" />
      {children}
    </Button>
  );
}
