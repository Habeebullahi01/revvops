/**
 * Server-action result contract (PHASE3_PLAN.md §C2).
 *
 * Expected, user-recoverable problems — missing fields, a bad enum, a
 * duplicate plate, an over-payment, a stale row, too little paid — come back
 * as `{ ok: false, error }`. Only genuinely unexpected faults throw, so a
 * validation message never surfaces as a production error boundary
 * (React #441) and the caller can render it next to the form.
 *
 * Auth failures continue to use `requireRole`, which redirects; they are not
 * part of this contract.
 */

export type ActionFailure = { ok: false; error: string };
export type ActionSuccess<T> = { ok: true; data: T };
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

/** For actions whose success carries no payload. */
export type ActionStatus = { ok: true } | ActionFailure;

/**
 * Turn a caught value into a failure without leaking a stack or a raw
 * Postgrest object. `fallback` is used for non-Error values.
 */
export function actionFailure(
  caught: unknown,
  fallback = "Something went wrong.",
): ActionFailure {
  if (typeof caught === "string") return { ok: false, error: caught };
  if (caught instanceof Error) return { ok: false, error: caught.message };
  return { ok: false, error: fallback };
}
