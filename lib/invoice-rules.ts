/**
 * Invoice → job-order rules (BUSINESS_RULES.md §3, todo.md Phase 1).
 *
 * Lives outside "use server" files because those may only export async
 * functions, and the guard has to be readable from client components too.
 */

/** Fraction of the invoice that must be paid before a job order is raised. */
export const JOB_ORDER_PAID_RATIO = 0.5;

/** The 50% floor, evaluated with a 0.4-kobo float tolerance. */
export function hasEnoughPaidToRaiseJobOrder(paid: number, total: number) {
  return paid + 0.004 >= total * JOB_ORDER_PAID_RATIO;
}

/** Derived, never stored on an invoice: total vs payments. */
export function deriveFinancialStatus(
  paid: number,
  total: number,
): "unpaid" | "part_paid" | "paid" {
  if (paid + 0.004 >= total) return "paid";
  return paid > 0 ? "part_paid" : "unpaid";
}
