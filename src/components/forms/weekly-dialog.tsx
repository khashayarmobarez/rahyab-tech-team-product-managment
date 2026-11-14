"use client";

import { useEffect, useRef, useState } from "react";
import { InfoIcon, ListChecksIcon } from "lucide-react";
import { loadWeeklyReportAction, saveWeeklyReportAction, type LoadedWeeklyReport } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  NO_REPORT_LINE,
  PERSON_SLUGS,
  STATUS_COPY,
  STATUS_LABELS,
  type PersonSlug,
  type StatusLabel,
} from "@/lib/constants";
import { formatWeekRange } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Field, FieldError, FormError, ListField, NativeSelect, PersonField, fieldProps } from "./fields";
import type { PersonOption } from "./types";
import { useIdentity } from "./use-identity";
import { useServerForm } from "./use-server-form";

export function WeeklyDialog({
  open,
  onOpenChange,
  people,
  currentWeek,
  weekOptions,
  names,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: PersonOption[];
  currentWeek: string;
  weekOptions: string[];
  /** Display names for the by-person fields, including people who are switched off. */
  names: Record<PersonSlug, string>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <WeeklyForm
          people={people}
          currentWeek={currentWeek}
          weekOptions={weekOptions}
          names={names}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

const ID = "weekly";
type Existing = Extract<LoadedWeeklyReport, { found: true }>;
type ByPerson = Record<PersonSlug, string>;
const EMPTY_BY_PERSON: ByPerson = { khashayar: "", mahan: "", hossein: "" };

function WeeklyForm({
  people,
  currentWeek,
  weekOptions,
  names,
  onClose,
}: {
  people: PersonOption[];
  currentWeek: string;
  weekOptions: string[];
  names: Record<PersonSlug, string>;
  onClose: () => void;
}) {
  const [person, choosePerson] = useIdentity(people);
  const [weekStart, setWeekStart] = useState(currentWeek);
  const [oneLine, setOneLine] = useState("");
  const [results, setResults] = useState<string[]>([""]);
  const [byPerson, setByPerson] = useState<ByPerson>(EMPTY_BY_PERSON);
  const [notFinished, setNotFinished] = useState<string[]>([""]);
  const [label, setLabel] = useState<StatusLabel | "">("");
  const [isFinal, setIsFinal] = useState(false);
  const [editingWeek, setEditingWeek] = useState<string | null>(null);
  const editingRef = useRef<string | null>(null);
  const lastRequest = useRef(0);

  const { formRef, onSubmit, onInput, resetErrors, pending, errors, formError } = useServerForm({
    action: saveWeeklyReportAction,
    onSuccess: onClose,
  });

  // Prefill from the week's existing summary, if there is one.
  useEffect(() => {
    const request = ++lastRequest.current;

    function fill(existing: Existing) {
      setOneLine(existing.oneLine);
      setResults(existing.results.length > 0 ? existing.results : [""]);
      // "No report this week" is the default for an empty line: show those as empty.
      const line = (slug: PersonSlug) => (existing.byPerson[slug] === NO_REPORT_LINE ? "" : existing.byPerson[slug]);
      setByPerson({ khashayar: line("khashayar"), mahan: line("mahan"), hossein: line("hossein") });
      setNotFinished(existing.notFinished.length > 0 ? existing.notFinished : [""]);
      setLabel(existing.label);
      setIsFinal(existing.done);
    }
    function clear() {
      setOneLine("");
      setResults([""]);
      setByPerson(EMPTY_BY_PERSON);
      setNotFinished([""]);
      setLabel("");
      setIsFinal(false);
    }

    loadWeeklyReportAction(weekStart).then((result) => {
      if (request !== lastRequest.current) return;
      if (result.found) {
        fill(result);
        resetErrors();
        editingRef.current = weekStart;
        setEditingWeek(weekStart);
      } else {
        if (editingRef.current !== null) {
          clear();
          resetErrors();
        }
        editingRef.current = null;
        setEditingWeek(null);
      }
    });
  }, [weekStart, resetErrors]);

  const editing = editingWeek === weekStart;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Write the weekly summary</DialogTitle>
        <DialogDescription>
          The CEO reads this first. Saving again for the same week replaces the earlier version.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
        <form ref={formRef} onSubmit={onSubmit} onInput={onInput} noValidate className="order-2 grid gap-5 md:order-1">
          <FormError message={formError} />
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <PersonField idPrefix={ID} people={people} value={person} onChange={choosePerson} errors={errors} />
            <Field id={`${ID}-week`} label="Week" hint="Saturday to Thursday." errors={errors.weekStart}>
              <NativeSelect
                {...fieldProps(`${ID}-week`, "weekStart", errors.weekStart, true)}
                value={weekStart}
                onChange={(event) => setWeekStart(event.target.value)}
              >
                {weekOptions.map((week) => (
                  <option key={week} value={week}>
                    {formatWeekRange(week)}
                    {week === currentWeek ? " (this week)" : ""}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          {editing ? (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-primary/40 bg-accent p-3 text-base text-accent-foreground"
            >
              <InfoIcon aria-hidden className="mt-1 size-4 shrink-0" />
              <span>
                <strong>This week already has a summary.</strong> It is filled in below. Saving replaces it.
              </span>
            </div>
          ) : null}

          <Field
            id={`${ID}-one-line`}
            label="One-line result"
            hint="The whole week in one sentence."
            errors={errors.oneLine}
          >
            <Input
              {...fieldProps(`${ID}-one-line`, "oneLine", errors.oneLine, true)}
              value={oneLine}
              onChange={(event) => setOneLine(event.target.value)}
            />
          </Field>

          <ListField
            idPrefix={ID}
            name="results"
            label="Results"
            hint="What was finished and checked, 1 to 5 items."
            values={results}
            onChange={setResults}
            errors={errors}
            addLabel="Add a result"
          />

          <fieldset className="grid gap-3">
            <legend className="mb-1.5 text-base font-medium">By person</legend>
            <p className="text-sm text-muted-foreground">One line each. Leave empty for “No report this week”.</p>
            {PERSON_SLUGS.map((slug) => {
              const key = `byPerson.${slug}`;
              return (
                <Field key={slug} id={`${ID}-by-${slug}`} label={names[slug]} errors={errors[key]}>
                  <Input
                    {...fieldProps(`${ID}-by-${slug}`, key, errors[key])}
                    value={byPerson[slug]}
                    onChange={(event) => setByPerson({ ...byPerson, [slug]: event.target.value })}
                  />
                </Field>
              );
            })}
          </fieldset>

          <ListField
            idPrefix={ID}
            name="notFinished"
            label="Not finished"
            hint="Work that is not done yet. Leave empty if everything is done."
            values={notFinished}
            onChange={setNotFinished}
            errors={errors}
            addLabel="Add an item"
          />

          <fieldset className="grid gap-2" aria-describedby={errors.label ? `${ID}-label-error` : undefined}>
            <legend className="mb-1.5 text-base font-medium">Status</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {STATUS_LABELS.map((value, index) => (
                <StatusOption
                  key={value}
                  value={value}
                  checked={label === value}
                  invalid={Boolean(errors.label)}
                  isFirst={index === 0}
                  onSelect={() => setLabel(value)}
                />
              ))}
            </div>
            <FieldError id={`${ID}-label-error`} errors={errors.label} />
          </fieldset>

          <label className="flex items-start gap-3 rounded-lg border bg-card p-3 text-base">
            <input
              type="checkbox"
              name="done"
              checked={isFinal}
              onChange={(event) => setIsFinal(event.target.checked)}
              className="mt-1 size-5 shrink-0 accent-primary"
            />
            <span>
              <span className="block font-medium">This summary is final</span>
              <span className="block text-sm text-muted-foreground">
                Leave it unticked while you are still writing it. It shows as a draft.
              </span>
            </span>
          </label>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Replace summary" : "Save summary"}
            </Button>
          </DialogFooter>
        </form>

        <aside
          aria-labelledby={`${ID}-rules-title`}
          className="order-1 h-fit rounded-lg border bg-muted p-4 md:order-2 md:sticky md:top-0"
        >
          <h3 id={`${ID}-rules-title`} className="mb-2 flex items-center gap-2 font-semibold">
            <ListChecksIcon aria-hidden className="size-4" />
            Rules for this summary
          </h3>
          <ul className="grid list-disc gap-2 pl-5 text-sm">
            <li>
              <strong>Write for the CEO.</strong> Plain business language, short sentences.
            </li>
            <li>
              <strong>No file names or code terms.</strong> Say what changed for customers or the business, not how.
            </li>
            <li>
              <strong>Never invent results.</strong> Only list what is finished and checked. Unsure? It belongs under
              “Not finished”.
            </li>
            <li>
              <strong>Choose the status honestly:</strong>
              <ul className="mt-1 grid gap-1 pl-1">
                {STATUS_LABELS.map((value) => (
                  <li key={value} className="list-none">
                    <span className="font-medium">{STATUS_COPY[value].name}:</span> {STATUS_COPY[value].meaning}.
                  </li>
                ))}
              </ul>
            </li>
          </ul>
        </aside>
      </div>
    </>
  );
}

const DOT: Record<StatusLabel, string> = {
  green: "bg-status-green-dot",
  yellow: "bg-status-yellow-dot",
  red: "bg-status-red-dot",
};

function StatusOption({
  value,
  checked,
  invalid,
  isFirst,
  onSelect,
}: {
  value: StatusLabel;
  checked: boolean;
  invalid: boolean;
  isFirst: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded-lg border bg-card p-3 text-base has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
        checked ? "border-primary bg-accent" : "border-input",
        invalid && !checked && "border-destructive",
      )}
    >
      <input
        type="radio"
        name="label"
        value={value}
        checked={checked}
        onChange={onSelect}
        data-fields={isFirst ? "label" : undefined}
        className="mt-1 size-4 shrink-0 accent-primary"
      />
      <span>
        <span className="flex items-center gap-2 font-medium">
          <span aria-hidden className={cn("size-3 shrink-0 rounded-full", DOT[value])} />
          {STATUS_COPY[value].name}
        </span>
        <span className="block text-sm text-muted-foreground">{STATUS_COPY[value].meaning}</span>
      </span>
    </label>
  );
}
