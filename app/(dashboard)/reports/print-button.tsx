"use client";

import { buttonVariants } from "@/components/ui/button";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className={buttonVariants({ size: "sm" })}
    >
      Print / Save as PDF
    </button>
  );
}
