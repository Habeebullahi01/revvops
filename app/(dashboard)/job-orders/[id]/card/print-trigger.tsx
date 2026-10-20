"use client";

import { useEffect } from "react";
import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Opens the browser's print dialog as soon as the card is on screen — the
 * card route exists to be printed, and a staff member who navigated here
 * should not have to hunt for the button. The button stays as the retry path
 * (and the only path if the browser blocks the automatic dialog).
 */
export function PrintTrigger() {
  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <Button type="button" onClick={() => window.print()}>
      <PrinterIcon className="size-3.5" />
      Print this card
    </Button>
  );
}
