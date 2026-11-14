"use client";

import { useCallback, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import type { FieldErrors } from "@/lib/schemas";

/**
 * Runs a server action from a form and handles the answer:
 *  - success: a toast, then `onSuccess` (the action has already refreshed the page),
 *  - failure: messages under the fields, and focus moves to the first field with a problem.
 *
 * Fields mark themselves with data-fields="name other.name": the error keys that
 * belong to them. Focus goes to the first one in page order that has an error.
 */
export function useServerForm<Data = undefined>(options: {
  action: (formData: FormData) => Promise<ActionResult<Data>>;
  /** Called after a successful save, with whatever data the action returned. */
  onSuccess: (data: Data | undefined) => void;
}) {
  const { action, onSuccess } = options;
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      let result: ActionResult<Data>;
      try {
        result = await action(data);
      } catch {
        result = {
          ok: false,
          fieldErrors: {},
          formError: "Could not reach the server. Check your connection and try again.",
        };
      }
      if (result.ok) {
        setErrors({});
        setFormError(undefined);
        toast.success(result.message);
        onSuccess(result.data);
        return;
      }
      setErrors(result.fieldErrors);
      const general = [result.formError, ...(result.fieldErrors._form ?? [])].filter(Boolean).join(" ");
      setFormError(general || undefined);
      // Wait for React to paint the messages, then move focus.
      requestAnimationFrame(() => focusFirstInvalid(form, result.fieldErrors));
    });
  }

  /** Typing in a field clears that field's messages, so a fixed field stops showing its old error. */
  function onInput(event: FormEvent<HTMLFormElement>) {
    const name = (event.target as HTMLInputElement).name;
    if (!name) return;
    setErrors((current) => {
      const stale = Object.keys(current).filter((key) => key === name || key.startsWith(`${name}.`));
      if (stale.length === 0) return current;
      const next = { ...current };
      for (const key of stale) delete next[key];
      return next;
    });
  }

  /** For forms that fill themselves in (loading a saved report): old messages no longer apply. */
  const resetErrors = useCallback(() => {
    setErrors({});
    setFormError(undefined);
  }, []);

  return { formRef, onSubmit, onInput, resetErrors, pending, errors, formError };
}

function focusFirstInvalid(form: HTMLFormElement, errors: FieldErrors): void {
  const keys = new Set(Object.keys(errors).filter((key) => key !== "_form"));
  if (keys.size === 0) return;
  for (const element of form.querySelectorAll<HTMLElement>("[data-fields]")) {
    const owned = (element.dataset.fields ?? "").split(" ");
    if (owned.some((key) => keys.has(key))) {
      element.focus();
      element.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
  }
}
