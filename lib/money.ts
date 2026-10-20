/**
 * Money formatting — the workshop bills in naira (₦) only.
 *
 * One helper so every figure in the app reads the same way: thousands
 * separators, two decimals, currency sign always present.
 *   17500 → "₦17,500.00"
 */

const NAIRA_FMT = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** The sign itself, for labels and column headers. */
export const NAIRA = "₦";

/** Format an amount as naira. Anything non-numeric renders as ₦0.00. */
export function formatNaira(value: number | null | undefined): string {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return NAIRA_FMT.format(amount);
}
