import type { FieldErrors } from "./schemas";

/** What every server action returns to its form. */
export type ActionResult<Data = undefined> =
  | { ok: true; message: string; data?: Data }
  | { ok: false; fieldErrors: FieldErrors; formError?: string };

export function failure(fieldErrors: FieldErrors, formError?: string): ActionResult<never> {
  return { ok: false, fieldErrors, formError };
}
