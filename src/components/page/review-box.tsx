"use client";

import { useState, useTransition } from "react";
import { CheckIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { toast } from "sonner";
import { reviewReportAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PersonSlug, Role } from "@/lib/constants";
import { formatTehranDateTime } from "@/lib/dates";
import { NOTE_MAX } from "@/lib/schemas";

type Props = {
  role: Role;
  personSlug: PersonSlug;
  reportDate: string;
  /** ISO times, because this crosses from the server to the browser. */
  seenAt: string | null;
  note: string | null;
  noteAt: string | null;
  reportUpdatedAt: string;
};

/**
 * Under a report: what the CEO did with it. The CEO can mark it seen and leave a
 * note; the team only reads that. A report changed after it was seen says so.
 */
export function ReviewBox({ role, personSlug, reportDate, seenAt, note, noteAt, reportUpdatedAt }: Props) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(note ?? "");
  const changedSinceSeen = seenAt !== null && new Date(reportUpdatedAt) > new Date(seenAt);

  function send(fields: Record<string, string>) {
    const data = new FormData();
    data.set("person", personSlug);
    data.set("reportDate", reportDate);
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    startTransition(async () => {
      try {
        const result = await reviewReportAction(data);
        if (result.ok) toast.success(result.message);
        else toast.error([result.formError, ...Object.values(result.fieldErrors).flat()].filter(Boolean).join(" ") || "Could not save.");
      } catch {
        toast.error("Could not reach the server. Check your connection and try again.");
      }
    });
  }

  if (role !== "ceo") {
    if (!seenAt && !note) return null;
    return (
      <div className="grid gap-2 rounded-lg bg-muted p-3">
        {seenAt ? (
          <p className="flex items-start gap-2">
            <EyeIcon aria-hidden className="mt-1 size-4 shrink-0" />
            <span>
              Seen by the CEO on {formatTehranDateTime(new Date(seenAt))}.
              {changedSinceSeen ? " The report was updated after that." : ""}
            </span>
          </p>
        ) : null}
        {note ? (
          <p>
            <span className="font-semibold">CEO note{noteAt ? ` (${formatTehranDateTime(new Date(noteAt))})` : ""}: </span>
            <span className="whitespace-pre-line">{note}</span>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/50 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button type="button" variant={seenAt ? "outline" : "default"} disabled={pending} onClick={() => send({ seen: seenAt ? "0" : "1" })}>
          {seenAt ? <EyeOffIcon aria-hidden data-icon="inline-start" /> : <CheckIcon aria-hidden data-icon="inline-start" />}
          {seenAt ? "Mark as not seen" : "Mark as seen"}
        </Button>
        <p className="text-muted-foreground">
          {seenAt ? `Seen on ${formatTehranDateTime(new Date(seenAt))}` : "Not seen yet"}
          {changedSinceSeen ? ". Updated since." : ""}
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`note-${personSlug}-${reportDate}`}>Your note for the team</Label>
        <Textarea
          id={`note-${personSlug}-${reportDate}`}
          rows={2}
          maxLength={NOTE_MAX}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="A question or a comment. The team sees it under this report."
        />
        <div className="flex justify-end">
          <Button type="button" variant="outline" disabled={pending || draft.trim() === (note ?? "")} onClick={() => send({ note: draft })}>
            Save note
          </Button>
        </div>
      </div>
    </div>
  );
}
