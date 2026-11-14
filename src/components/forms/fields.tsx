"use client";

import { useEffect, useRef, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDownIcon, CircleAlertIcon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FieldErrors } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import type { PersonOption } from "./types";

// ------------------------------------------------------------------ errors --

export function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors || errors.length === 0) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm font-medium text-destructive">
      <CircleAlertIcon aria-hidden className="mt-[0.2rem] size-4 shrink-0" />
      <span>{errors.join(" ")}</span>
    </p>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm font-medium text-destructive"
    >
      <CircleAlertIcon aria-hidden className="mt-[0.2rem] size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/**
 * The attributes every input needs so its error is announced, styled, and
 * reachable by the "focus the first problem" step.
 */
export function fieldProps(id: string, name: string, errors?: string[], hasHint = false) {
  const describedBy = [hasHint ? `${id}-hint` : null, errors?.length ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return {
    id,
    name,
    "aria-invalid": errors?.length ? (true as const) : undefined,
    "aria-describedby": describedBy || undefined,
    "data-fields": name,
  };
}

export function Field({
  id,
  label,
  hint,
  errors,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  errors?: string[];
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {children}
      <FieldError id={`${id}-error`} errors={errors} />
    </div>
  );
}

// ------------------------------------------------------------------ select --

export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(
          "h-10 w-full min-w-0 appearance-none rounded-lg border border-input bg-card py-1 pr-10 pl-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
          className,
        )}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

/** "Who are you?" The same choice is remembered for every form on this device. */
export function PersonField({
  idPrefix,
  people,
  value,
  onChange,
  errors,
  label = "Who are you?",
}: {
  idPrefix: string;
  people: PersonOption[];
  value: string;
  onChange: (slug: string) => void;
  errors?: FieldErrors;
  label?: string;
}) {
  const id = `${idPrefix}-person`;
  const fieldErrors = errors?.person;
  return (
    <Field id={id} label={label} hint="We remember your choice on this device." errors={fieldErrors}>
      <NativeSelect
        {...fieldProps(id, "person", fieldErrors, true)}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose your name…</option>
        {people.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.name}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

// -------------------------------------------------------------- list field --

/**
 * A list of text lines with "Add a line" and a remove button on each row.
 * Press Enter in a row to start the next one. Blank rows are ignored when saving.
 *
 * Errors from the server count only the non-blank lines ("done.1" is the second
 * line that has text), so we map them back to the rows on screen.
 */
export function ListField({
  idPrefix,
  name,
  label,
  hint,
  values,
  onChange,
  errors,
  addLabel = "Add a line",
  placeholder,
}: {
  idPrefix: string;
  name: string;
  label: string;
  hint?: ReactNode;
  values: string[];
  onChange: (values: string[]) => void;
  errors?: FieldErrors;
  addLabel?: string;
  placeholder?: string;
}) {
  const rows = values.length > 0 ? values : [""];
  const inputs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focusAfterRender = useRef<number | null>(null);
  const groupId = `${idPrefix}-${name}`;

  useEffect(() => {
    if (focusAfterRender.current !== null) {
      inputs.current[focusAfterRender.current]?.focus();
      focusAfterRender.current = null;
    }
  });

  // Position of each row among the non-blank rows, or -1 for a blank row.
  let seen = 0;
  const textPosition = rows.map((row) => (row.trim() === "" ? -1 : seen++));

  const listErrors = errors?.[name];

  function update(index: number, value: string) {
    onChange(rows.map((row, i) => (i === index ? value : row)));
  }
  function insertAfter(index: number) {
    const next = [...rows];
    next.splice(index + 1, 0, "");
    focusAfterRender.current = index + 1;
    onChange(next);
  }
  function remove(index: number) {
    const next = rows.filter((_, i) => i !== index);
    focusAfterRender.current = Math.max(0, index - 1);
    onChange(next.length > 0 ? next : [""]);
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      insertAfter(index);
    }
  }

  return (
    <fieldset className="grid gap-1.5" aria-describedby={`${groupId}-hint ${groupId}-error`}>
      <legend className="mb-1.5 text-base font-medium">{label}</legend>
      {hint ? (
        <p id={`${groupId}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : (
        <span id={`${groupId}-hint`} hidden />
      )}
      <div className="grid gap-2">
        {rows.map((row, index) => {
          const position = textPosition[index];
          const rowErrors = position >= 0 ? errors?.[`${name}.${position}`] : undefined;
          const showListError = index === 0 && listErrors && listErrors.length > 0;
          const owned = [index === 0 ? name : null, position >= 0 ? `${name}.${position}` : null]
            .filter(Boolean)
            .join(" ");
          const rowId = `${groupId}-${index}`;
          const invalid = (rowErrors && rowErrors.length > 0) || showListError;
          return (
            <div key={index} className="grid gap-1">
              <div className="flex items-start gap-2">
                <Textarea
                  ref={(el) => {
                    inputs.current[index] = el;
                  }}
                  id={rowId}
                  name={name}
                  rows={1}
                  value={row}
                  placeholder={placeholder}
                  aria-label={`${label}, line ${index + 1}`}
                  aria-invalid={invalid ? true : undefined}
                  aria-describedby={rowErrors?.length ? `${rowId}-error` : undefined}
                  data-fields={owned || undefined}
                  className="min-h-10 resize-none py-2"
                  onChange={(event) => update(index, event.target.value)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${label.toLowerCase()} line ${index + 1}`}
                  disabled={rows.length === 1 && row === ""}
                  onClick={() => remove(index)}
                >
                  <XIcon aria-hidden />
                </Button>
              </div>
              <FieldError id={`${rowId}-error`} errors={rowErrors} />
            </div>
          );
        })}
      </div>
      <FieldError id={`${groupId}-error`} errors={listErrors} />
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => insertAfter(rows.length - 1)}>
          <PlusIcon aria-hidden data-icon="inline-start" />
          {addLabel}
        </Button>
      </div>
    </fieldset>
  );
}
