"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reprintReceipt } from "@/app/actions/receipt-actions";

/**
 * Issue a duplicate of a receipt.
 *
 * A receipt is append-only (0015), so "reprinting" never edits the original:
 * it creates a new row flagged `is_duplicate` that points back at it. The new
 * receipt opens its own print sheet.
 */
export function ReprintReceiptButton({ receiptId }: { receiptId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reprint = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await reprintReceipt({ receiptId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      // A reprint exists to be handed over on paper, so open the sheet.
      window.open(`/receipts/${result.data.id}`, "_blank", "noopener");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not reprint.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={reprint}
        disabled={busy}
      >
        <PrinterIcon className="size-3.5" />
        {busy ? "Reprinting…" : "Reprint"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
