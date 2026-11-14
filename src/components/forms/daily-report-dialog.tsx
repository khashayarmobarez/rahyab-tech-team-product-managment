"use client";

import { useEffect, useRef, useState } from "react";
import { InfoIcon } from "lucide-react";
import { loadDailyReportAction, saveDailyReportAction, type LoadedDailyReport } from "@/app/actions";
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
import { Textarea } from "@/components/ui/textarea";
import { formatDay, isDateString } from "@/lib/dates";
import { Field, FormError, ListField, PersonField, fieldProps } from "./fields";
import type { PersonOption } from "./types";
import { useIdentity } from "./use-identity";
import { useServerForm } from "./use-server-form";

export function DailyReportDialog({
  open,
  onOpenChange,
  people,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: PersonOption[];
  today: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DailyReportForm people={people} today={today} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

const ID = "daily";
type Existing = Extract<LoadedDailyReport, { found: true }>;

function DailyReportForm({
  people,
  today,
  onClose,
}: {
  people: PersonOption[];
  today: string;
  onClose: () => void;
}) {
  const [person, choosePerson] = useIdentity(people);
  const [reportDate, setReportDate] = useState(today);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [done, setDone] = useState<string[]>([""]);
  const [blockers, setBlockers] = useState<string[]>([""]);
  const [next, setNext] = useState<string[]>([""]);
  /** Which person and date the form is currently showing a saved report for. */
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const editingKeyRef = useRef<string | null>(null);
  const lastRequest = useRef(0);

  const { formRef, onSubmit, onInput, resetErrors, pending, errors, formError } = useServerForm({
    action: saveDailyReportAction,
    onSuccess: onClose,
  });

  // When the person or the date changes, look for a report already saved for them.
  useEffect(() => {
    if (!person || !isDateString(reportDate)) return;
    const key = `${person}|${reportDate}`;
    const request = ++lastRequest.current;

    function fill(existing: Existing) {
      setTitle(existing.title);
      setSummary(existing.summary);
      setDone(existing.done.length > 0 ? existing.done : [""]);
      setBlockers(existing.blockers.length > 0 ? existing.blockers : [""]);
      setNext(existing.next.length > 0 ? existing.next : [""]);
    }
    function clear() {
      setTitle("");
      setSummary("");
      setDone([""]);
      setBlockers([""]);
      setNext([""]);
    }

    loadDailyReportAction(person, reportDate).then((result) => {
      if (request !== lastRequest.current) return; // a newer choice replaced this one
      if (result.found) {
        fill(result);
        resetErrors();
        editingKeyRef.current = key;
        setEditingKey(key);
      } else {
        // Leaving a saved report for a day with none: start from a clean form.
        if (editingKeyRef.current !== null) {
          clear();
          resetErrors();
        }
        editingKeyRef.current = null;
        setEditingKey(null);
      }
    });
  }, [person, reportDate, resetErrors]);

  const editing = editingKey !== null && editingKey === `${person}|${reportDate}`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add my report</DialogTitle>
        <DialogDescription>
          Saving again for the same person and day replaces that day&apos;s report, so you can keep it up to date.
        </DialogDescription>
      </DialogHeader>
      <form ref={formRef} onSubmit={onSubmit} onInput={onInput} noValidate className="grid gap-5">
        <FormError message={formError} />
        <div className="grid gap-5 sm:grid-cols-2">
          <PersonField idPrefix={ID} people={people} value={person} onChange={choosePerson} errors={errors} />
          <Field id={`${ID}-date`} label="Date" hint="Tehran time. Today unless you pick another day." errors={errors.reportDate}>
            <Input
              {...fieldProps(`${ID}-date`, "reportDate", errors.reportDate, true)}
              type="date"
              max={today}
              value={reportDate}
              onChange={(event) => setReportDate(event.target.value)}
            />
          </Field>
        </div>

        {editing ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-primary/40 bg-accent p-3 text-base text-accent-foreground"
          >
            <InfoIcon aria-hidden className="mt-1 size-4 shrink-0" />
            <span>
              <strong>
                {reportDate === today ? "You are editing today's report." : `You are editing the report for ${formatDay(reportDate)}.`}
              </strong>{" "}
              Saving replaces it.
            </span>
          </div>
        ) : null}

        <Field id={`${ID}-title`} label="Title" hint="What you worked on, in a few words." errors={errors.title}>
          <Input
            {...fieldProps(`${ID}-title`, "title", errors.title, true)}
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        <Field id={`${ID}-summary`} label="Summary" hint="Two or three sentences anyone on the team can follow." errors={errors.summary}>
          <Textarea
            {...fieldProps(`${ID}-summary`, "summary", errors.summary, true)}
            rows={4}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </Field>

        <ListField idPrefix={ID} name="done" label="Done" hint="What you finished." values={done} onChange={setDone} errors={errors} />
        <ListField
          idPrefix={ID}
          name="blockers"
          label="Blockers"
          hint="Anything stopping you. Leave empty if nothing."
          values={blockers}
          onChange={setBlockers}
          errors={errors}
        />
        <ListField idPrefix={ID} name="next" label="Next" hint="What you will do next." values={next} onChange={setNext} errors={errors} />

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : editing ? "Replace report" : "Save report"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
