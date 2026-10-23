import { requireRole } from "@/lib/auth";
import { InvoiceForm } from "./invoice-form";

// Session-reading page: renders at request time (blocking, see layout).
export const instant = false;

export default async function NewInvoicePage() {
  await requireRole(["admin", "manager", "reception"]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h1 className="text-title font-semibold">New invoice</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Invoice-first: raise the invoice (customer, vehicle, work requested, cost
          breakdown) before any money moves. An invoice never creates a job
          order on its own, and technician assignment is not part of an invoice.
        </p>
      </div>
      <InvoiceForm />
    </div>
  );
}
