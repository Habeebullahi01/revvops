"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { recordPayment } from "@/app/actions/payment-actions";
import { NAIRA, formatNaira } from "@/lib/money";

const METHODS: { value: "cash" | "transfer" | "card" | "other"; label: string }[] =
  [
    { value: "cash", label: "Cash" },
    { value: "transfer", label: "Transfer" },
    { value: "card", label: "Card" },
    { value: "other", label: "Other" },
  ];

const selectCls =
  "h-8 w-full appearance-none rounded-lg border border-input bg-transparent ps-2.5 pe-8 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 md:text-sm";

/**
 * Record a payment against THIS invoice. Works before a job order exists —
 * payments.invoice_id alone is a legal target (0013).
 */
export function PaymentForm({
  invoiceId,
  balance,
}: {
  invoiceId: string;
  balance: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>(
    "cash",
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const settled = balance <= 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Math.round((Number.parseFloat(amount) || 0) * 100) / 100;
    if (value <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    if (value > balance) {
      setError(`Amount is above the balance of ${formatNaira(balance)}.`);
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      await recordPayment({
        invoiceId,
        amount: value,
        paymentMethod: method,
        referenceNumber: reference,
        notes,
      });
      setAmount("");
      setReference("");
      setNotes("");
      setNotice(`Payment of ${formatNaira(value)} recorded.`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not record payment.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (settled) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
        Nothing outstanding — this invoice is fully paid.
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor="pay-amount">
          Amount{" "}
          <span aria-hidden className="text-destructive">
            *
          </span>
        </Label>
        <button
          type="button"
          className="text-xs font-medium text-brand underline underline-offset-2"
          onClick={() => setAmount(balance.toFixed(2))}
        >
          Full balance ({formatNaira(balance)})
        </button>
      </div>

      <span className="relative block">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-muted-foreground"
        >
          {NAIRA}
        </span>
        <Input
          id="pay-amount"
          type="number"
          inputMode="decimal"
          min={0}
          max={balance}
          step="0.01"
          placeholder="0.00"
          className="ps-6"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </span>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          Payment method{" "}
          <span aria-hidden className="text-destructive">
            *
          </span>
        </span>
        <span className="relative block">
          <select
            aria-label="Payment method"
            className={selectCls}
            value={method}
            onChange={(e) =>
              setMethod(e.target.value as (typeof METHODS)[number]["value"])
            }
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        </span>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Reference / teller number</span>
        <Input
          placeholder="Optional"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Notes</span>
        <Textarea
          rows={2}
          placeholder="Optional — payer name, bank, etc."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive"
        >
          {notice}
        </p>
      )}

      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "Recording…" : "Record payment"}
      </Button>
    </form>
  );
}
