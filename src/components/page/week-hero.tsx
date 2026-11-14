import Link from "next/link";
import { PERSON_SLUGS, STATUS_COPY, type PersonSlug } from "@/lib/constants";
import { formatDay, formatTehranDateTime, formatWeekLabel, weeklyDueAt } from "@/lib/dates";
import { summariseProgress } from "@/lib/rules";
import type { DailyReport, WeeklyReport } from "@/server/reports";
import { MarkedList, SectionHeading } from "./lists";
import { NeutralChip, StatusChip } from "./status-chip";
import { WeekPicker } from "./week-picker";

type Props = {
  weekStart: string;
  currentWeek: string;
  weekly: WeeklyReport | null;
  dailyReports: DailyReport[];
  names: Record<PersonSlug, string>;
  weekChoices: { value: string; label: string }[];
};

/** Section 1: the week's report, or "Week in progress" built from the daily reports. */
export function WeekHero({ weekStart, currentWeek, weekly, dailyReports, names, weekChoices }: Props) {
  const isCurrent = weekStart === currentWeek;
  return (
    <section id="this-week" aria-labelledby="this-week-title" className="grid gap-4">
      <SectionHeading
        id="this-week-title"
        aside={<WeekPicker selected={weekStart} currentWeek={currentWeek} options={weekChoices} />}
      >
        {isCurrent ? "This week" : "Week shown"}
      </SectionHeading>

      {!isCurrent ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted px-4 py-3">
          <span>You are looking at a past week. The three sections below follow it.</span>
          <Link href="/" className="font-medium text-primary underline underline-offset-4">
            Back to this week
          </Link>
        </p>
      ) : null}

      <article className="grid gap-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
        {weekly ? (
          <WeeklyView weekly={weekly} names={names} />
        ) : (
          <InProgressView weekStart={weekStart} isCurrent={isCurrent} dailyReports={dailyReports} names={names} />
        )}
      </article>
    </section>
  );
}

function WeeklyView({ weekly, names }: { weekly: WeeklyReport; names: Record<PersonSlug, string> }) {
  const { numbers } = weekly;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-lg font-semibold">{formatWeekLabel(weekly.weekStart)}</h3>
        <StatusChip label={weekly.label} />
        <span className="text-muted-foreground">{STATUS_COPY[weekly.label].meaning}</span>
        <NeutralChip>{weekly.done ? "Final" : "Draft"}</NeutralChip>
      </div>

      <p className="text-2xl leading-snug font-semibold text-balance sm:text-3xl">{weekly.oneLine}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          <h3 className="font-semibold">Results</h3>
          <MarkedList items={weekly.results} marker="check" />
        </div>
        <div className="grid content-start gap-5">
          <div className="grid gap-2">
            <h3 className="font-semibold">Not finished</h3>
            {weekly.notFinished.length > 0 ? (
              <MarkedList items={weekly.notFinished} marker="open" />
            ) : (
              <p className="text-muted-foreground">Nothing. Everything planned is done.</p>
            )}
          </div>
          {weekly.waitingDecisions.length > 0 ? (
            <div className="grid gap-2">
              <h3 className="font-semibold">Waiting for a decision</h3>
              <MarkedList items={weekly.waitingDecisions} />
            </div>
          ) : null}
        </div>
      </div>

      <dl className="grid gap-x-8 gap-y-2 border-t pt-4 text-muted-foreground sm:grid-cols-2">
        <div className="flex flex-wrap gap-x-2">
          <dt>Days with a report:</dt>
          <dd className="text-foreground">
            {PERSON_SLUGS.map((slug) => `${names[slug]} ${numbers.daysWithReport[slug]}`).join(" · ")}
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt>Decisions:</dt>
          <dd className="text-foreground">
            {numbers.decisionsRaised} raised · {numbers.decisionsOpen} still open
          </dd>
        </div>
      </dl>
    </>
  );
}

function InProgressView({
  weekStart,
  isCurrent,
  dailyReports,
  names,
}: {
  weekStart: string;
  isCurrent: boolean;
  dailyReports: DailyReport[];
  names: Record<PersonSlug, string>;
}) {
  const progress = summariseProgress(dailyReports);
  const due = formatTehranDateTime(weeklyDueAt(weekStart));
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-lg font-semibold">{formatWeekLabel(weekStart)}</h3>
        <NeutralChip>{isCurrent ? "In progress" : "No summary written"}</NeutralChip>
      </div>

      <div className="grid gap-1">
        <p className="text-2xl leading-snug font-semibold sm:text-3xl">
          {isCurrent ? "Week in progress" : "No weekly summary was written for this week"}
        </p>
        <p className="text-muted-foreground">
          {isCurrent
            ? `No weekly summary yet. It is due on Thursday, ${due}, Tehran time. What follows is built from the daily reports so far.`
            : "What follows is built from the daily reports of that week."}
        </p>
      </div>

      {progress.reportCount === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-muted-foreground">No daily reports for this week yet.</p>
      ) : (
        <>
          <p>
            <strong>{progress.reportCount}</strong> daily {progress.reportCount === 1 ? "report" : "reports"} from{" "}
            <strong>{progress.peopleCount}</strong> {progress.peopleCount === 1 ? "person" : "people"}. Latest on{" "}
            {formatDay(dailyReports[0].reportDate)}.
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid content-start gap-2">
              <h3 className="font-semibold">Done so far</h3>
              {progress.doneSoFar.length > 0 ? (
                <MarkedList items={progress.doneSoFar.slice(0, 8)} marker="check" />
              ) : (
                <p className="text-muted-foreground">Nothing listed as done yet.</p>
              )}
              {progress.doneSoFar.length > 8 ? (
                <p className="text-muted-foreground">and {progress.doneSoFar.length - 8} more in the daily reports.</p>
              ) : null}
            </div>
            <div className="grid content-start gap-2">
              <h3 className="font-semibold">Blockers right now</h3>
              {progress.openBlockers.length > 0 ? (
                <MarkedList items={progress.openBlockers.map((b) => `${names[b.personSlug]}: ${b.text}`)} marker="open" />
              ) : (
                <p className="text-muted-foreground">No blockers reported.</p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
