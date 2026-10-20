"use client";

import Link from "next/link";
import { PrinterIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

/**
 * Opens the dedicated card route. The job card is a separate sheet — no
 * money, no timeline, a QR to this page — so it is not this page printed, and
 * following a link is what keeps the two layouts independent.
 */
export function PrintButton({ jobOrderId }: { jobOrderId: string }) {
  return (
    <Link
      href={`/job-orders/${jobOrderId}/card`}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
    >
      <PrinterIcon className="size-3.5" />
      Print job card
    </Link>
  );
}
