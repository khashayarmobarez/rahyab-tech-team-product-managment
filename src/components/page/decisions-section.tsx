import { ClockIcon } from "lucide-react";
import { PERSON_SLUGS, type PersonSlug } from "@/lib/constants";
import { formatDayWithYear } from "@/lib/dates";
import { decisionAgeDays, describeAge } from "@/lib/rules";
import type { Decision } from "@/server/reports";
import { AnswerButton } from "./answer-button";
import { SectionHeading } from "./lists";

type Props = {
  open: Decision[];
  recentlyAnswered: Decision[];
  /** The day the lists are drawn for: today, or the end of a past week. */
  asOf: string;
  names: Record<PersonSlug, string>;
};

function whoIs(slug: string, names: Record<PersonSlug, string>): string {
  return (PERSON_SLUGS as readonly string[]).includes(slug) ? names[slug as PersonSlug] : "The team";
}

/** Section 3: open decisions (oldest first, with their age), and the answered ones collapsed. */
export function DecisionsSection({ open, recentlyAnswered, asOf, names }: Props) {
  return (
    <section id="decisions" aria-labelledby="decisions-title" className="grid gap-4">
      <SectionHeading id="decisions-title">
        Needs a decision{open.length > 0 ? <span className="text-muted-foreground"> ({open.length})</span> : null}
      </SectionHeading>

      {open.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-5 text-muted-foreground">
          Nothing is waiting for a decision.
        </p>
      ) : (
        <ul className="grid gap-3">
          {open.map((decision) => (
            <li key={decision.id} className="grid gap-3 rounded-2xl border bg-card p-5 shadow-sm sm:grid-cols-[1fr_auto] sm:items-start sm:gap-6">
              <div className="grid gap-2">
                <h3 className="text-lg leading-snug font-semibold">{decision.title}</h3>
                <p className="whitespace-pre-line">{decision.description}</p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                  <span>
                    Raised by {whoIs(decision.raisedBy, names)} on {formatDayWithYear(decision.raisedOn)}
                  </span>
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <ClockIcon aria-hidden className="size-4" />
                    {describeAge(decisionAgeDays(decision.raisedOn, asOf))}
                  </span>
                </p>
                {decision.status === "answered" && decision.answeredOn ? (
                  <p className="rounded-lg bg-muted px-3 py-2">
                    <span className="font-medium">Answered later, on {formatDayWithYear(decision.answeredOn)}: </span>
                    {decision.answer}
                  </p>
                ) : null}
              </div>
              {decision.status === "open" ? (
                <AnswerButton decision={{ id: decision.id, title: decision.title, description: decision.description }} />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {recentlyAnswered.length > 0 ? (
        <details className="group rounded-2xl border bg-card shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-5 font-semibold [&::-webkit-details-marker]:hidden">
            <span>Recently answered ({recentlyAnswered.length})</span>
            <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <ul className="grid gap-4 border-t p-5">
            {recentlyAnswered.map((decision) => (
              <li key={decision.id} className="grid gap-1">
                <h3 className="font-semibold">{decision.title}</h3>
                <p>
                  <span className="font-medium">Answer: </span>
                  {decision.answer}
                </p>
                <p className="text-muted-foreground">
                  Raised by {whoIs(decision.raisedBy, names)} on {formatDayWithYear(decision.raisedOn)} · answered on{" "}
                  {decision.answeredOn ? formatDayWithYear(decision.answeredOn) : "an unknown day"}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
