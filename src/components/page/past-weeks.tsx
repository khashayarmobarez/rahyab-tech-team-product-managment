import Link from "next/link";
import { PERSON_SLUGS, type PersonSlug } from "@/lib/constants";
import { formatWeekLabel } from "@/lib/dates";
import type { WeeklyReport } from "@/server/reports";
import { MarkedList, SectionHeading } from "./lists";
import { NeutralChip, StatusChip } from "./status-chip";

/** Section 4: earlier weeks as a compact list. Each one opens in place. */
export function PastWeeks({
  weeks,
  names,
  currentWeek,
}: {
  weeks: WeeklyReport[];
  names: Record<PersonSlug, string>;
  currentWeek: string;
}) {
  return (
    <section id="past-weeks" aria-labelledby="past-weeks-title" className="grid gap-4">
      <SectionHeading id="past-weeks-title">Past weeks</SectionHeading>
      {weeks.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-5 text-muted-foreground">
          No earlier weekly summaries yet.
        </p>
      ) : (
        <ul className="grid gap-2">
          {weeks.map((week) => (
            <li key={week.id}>
              <details className="group rounded-2xl border bg-card shadow-sm">
                <summary className="grid cursor-pointer list-none gap-x-4 gap-y-2 rounded-2xl p-4 sm:grid-cols-[15rem_auto_1fr_auto] sm:items-center [&::-webkit-details-marker]:hidden">
                  <span className="font-semibold">{formatWeekLabel(week.weekStart)}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusChip label={week.label} />
                    {week.done ? null : <NeutralChip>Draft</NeutralChip>}
                  </span>
                  <span>{week.oneLine}</span>
                  <span aria-hidden className="hidden text-muted-foreground transition-transform group-open:rotate-180 sm:block">
                    ▾
                  </span>
                </summary>
                <div className="grid gap-5 border-t p-5 lg:grid-cols-2">
                  <div className="grid content-start gap-2">
                    <h3 className="font-semibold">Results</h3>
                    <MarkedList items={week.results} marker="check" />
                  </div>
                  <div className="grid content-start gap-4">
                    <div className="grid gap-2">
                      <h3 className="font-semibold">Not finished</h3>
                      {week.notFinished.length > 0 ? (
                        <MarkedList items={week.notFinished} marker="open" />
                      ) : (
                        <p className="text-muted-foreground">Nothing. Everything planned was done.</p>
                      )}
                    </div>
                    {week.waitingDecisions.length > 0 ? (
                      <div className="grid gap-2">
                        <h3 className="font-semibold">Was waiting for a decision</h3>
                        <MarkedList items={week.waitingDecisions} />
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-2 lg:col-span-2">
                    <h3 className="font-semibold">By person</h3>
                    <dl className="grid gap-2 sm:grid-cols-3">
                      {PERSON_SLUGS.map((slug) => (
                        <div key={slug} className="rounded-lg bg-muted px-3 py-2">
                          <dt className="font-medium">
                            {names[slug]}{" "}
                            <span className="font-normal text-muted-foreground">
                              ({week.numbers.daysWithReport[slug]} days)
                            </span>
                          </dt>
                          <dd>{week.byPerson[slug]}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <p className="text-muted-foreground lg:col-span-2">
                    {week.numbers.decisionsRaised} decisions raised · {week.numbers.decisionsOpen} still open ·{" "}
                    <Link
                      href={week.weekStart === currentWeek ? "/#this-week" : `/?week=${week.weekStart}#this-week`}
                      className="font-medium text-primary underline underline-offset-4"
                    >
                      Show this week at the top
                    </Link>
                  </p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
