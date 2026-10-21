/**
 * Invoice vocabulary: how an invoice is billed, and what it is for.
 *
 * Both used to live in scattered maps — `BILLING_LABEL` was copy-pasted into
 * three files, and the values were named after the schema rather than the
 * business ("cng_installment" described a payment plan as if only CNG could
 * have one). This module is the single source, the way `status-pill.tsx` holds
 * the execution-status vocabulary.
 *
 * The column lives on `invoices` (migration 0015); a job order references it.
 */

export const BILLING_TYPES = ["upfront", "instalmental", "post_service"] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

export const BILLING_LABELS: Record<BillingType, string> = {
  upfront: "Upfront",
  instalmental: "Instalmental",
  post_service: "Post-service",
};

/** Longer form for a select, where there is room to explain the choice. */
export const BILLING_OPTIONS: { value: BillingType; label: string }[] = [
  { value: "upfront", label: "Upfront — paid before work starts" },
  { value: "instalmental", label: "Instalmental — paid in instalments" },
  { value: "post_service", label: "Post-service — settled after the work" },
];

export const billingLabel = (value: string | null | undefined) =>
  value && value in BILLING_LABELS
    ? BILLING_LABELS[value as BillingType]
    : (value ?? "—");

export const INVOICE_CATEGORIES = ["sales", "maintenance", "cng"] as const;
export type InvoiceCategory = (typeof INVOICE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<InvoiceCategory, string> = {
  sales: "Sales",
  maintenance: "Maintenance",
  cng: "CNG",
};

export const CATEGORY_OPTIONS: { value: InvoiceCategory; label: string }[] = [
  { value: "maintenance", label: "Maintenance — servicing and repairs" },
  { value: "cng", label: "CNG — conversion and gas work" },
  { value: "sales", label: "Sales — items sold" },
];

export const categoryLabel = (value: string | null | undefined) =>
  value && value in CATEGORY_LABELS
    ? CATEGORY_LABELS[value as InvoiceCategory]
    : (value ?? "—");

/**
 * Category colours. Deliberately muted, semantic and few: a category is a
 * reporting dimension, not a status, so it should read as a quiet label
 * rather than compete with the execution/financial pills.
 */
export const CATEGORY_STYLES: Record<InvoiceCategory, string> = {
  sales: "border-border bg-muted/50 text-foreground",
  maintenance: "border-border bg-muted/50 text-foreground",
  cng: "border-brand/30 bg-brand/10 text-brand",
};
