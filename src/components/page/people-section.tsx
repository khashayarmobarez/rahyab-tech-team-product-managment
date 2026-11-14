import { CheckIcon, MinusIcon, TriangleAlertIcon } from "lucide-react";
import { NO_REPORT_LINE } from "@/lib/constants";
import { formatDay, formatWeekday, isFriday, weekDays } from "@/lib/dates";
import { latestPerPerson, reportedDays } from "@/lib/rules";
import { cn } from "@/lib/utils";
import type { DailyReport, Person, WeeklyReport } from "@/server/reports";
import { MarkedList, SectionHeading } from "./lists";

type Props = {
  weekStart: string;
  today: string;
  people: Person[];
  dailyReports: DailyReport[];
  weekly: WeeklyReport | null;
};

/** Section 2: three columns (stacked on phones), one per person. */
export function PeopleSection({ weekStart, today, people, dailyReports, weekly }: Props) {
  const latest = latestPerPerson(dailyReports);
  // Show everyone who is switched on, plus anyone switched off who still has reports that week.
  const visible = people.filter((p) => p.active || latest[p.slug] !== undefined);
  const days = weekDays(weekStart);

  return (
    <section id="by-person" aria-labelledby="by-person-title" className="grid gap-4">
      <SectionHeading id="by-person-title">By person</SectionHeading>
      <div className="grid gap-4 lg:grid-cols-3">
        {visible.map((person) => (
          <PersonCard
            key={person.slug}
            person={person}
            latest={latest[person.slug]}
            days={days}
            filedOn={reportedDays(dailyReports, person.slug)}
            today={today}
            weeklyLine={weekly?.byPerson[person.slug]}
          />
        ))}
      </div>
    </section>
  );
}

function PersonCard({
  person,
  latest,
  days,
  filedOn,
  today,
  weeklyLine,
}: {
  person: Person;
  latest: DailyReport | undefined;
  days: string[];
  filedOn: Set<string>;
  today: string;
  weeklyLine: string | undefined;
}) {
  const filedCount = filedOn.size;
  return (
    <article className="grid content-start gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xl font-semibold">{person.name}</h3>
        <p className="text-muted-foreground">
          {filedCount === 0 ? "No days" : `${filedCount} ${filedCount === 1 ? "day" : "days"}`} reported
        </p>
      </div>

      <WeekStrip name={person.name} days={days} filedOn={filedOn} today={today} />

      {weeklyLine && weeklyLine !== NO_REPORT_LINE ? (
        <p className="rounded-lg bg-muted px-3 py-2">
          <span className="font-medium">In the weekly summary: </span>
          {weeklyLine}
        </p>
      ) : null}

      {latest ? (
        <div className="grid gap-3">
          <p className="text-muted-foreground">Latest report · {formatDay(latest.reportDate)}</p>
          <div className="grid gap-1">
            <p className="text-lg leading-snug font-semibold">{latest.title}</p>
            <p className="whitespace-pre-line">{latest.summary}</p>
          </div>
          <ReportList title="Done" items={latest.done} marker="check" />
          <ReportList title="Blockers" items={latest.blockers} marker="open" icon="alert" />
          <ReportList title="Next" items={latest.next} marker="dot" />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-muted-foreground">{NO_REPORT_LINE}</p>
      )}
    </article>
  );
}

function ReportList({
  title,
  items,
  marker,
  icon,
}: {
  title: string;
  items: string[];
  marker: "dot" | "check" | "open";
  icon?: "alert";
}) {
  if (items.length === 0) return null;
  return (
    <div className="grid gap-1.5">
      <h4 className="flex items-center gap-1.5 font-semibold">
        {icon === "alert" ? <TriangleAlertIcon aria-hidden className="size-4" /> : null}
        {title}
      </h4>
      <MarkedList items={items} marker={marker} />
    </div>
  );
}

/** Saturday to Friday. A filled box with a tick means a report that day. Friday is the day off. */
function WeekStrip({
  name,
  days,
  filedOn,
  today,
}: {
  name: string;
  days: string[];
  filedOn: Set<string>;
  today: string;
}) {
  return (
    <ul aria-label={`Days ${name} reported this week`} className="grid grid-cols-7 gap-1">
      {days.map((date) => {
        const filed = filedOn.has(date);
        const off = isFriday(date);
        const isToday = date === today;
        const future = date > today;
        const description = `${formatDay(date)}${off ? ", day off" : ""}${isToday ? ", today" : ""}: ${
          filed ? "report filed" : future ? "not yet" : "no report"
        }`;
        return (
          <li key={date} className="grid justify-items-center gap-1" title={description}>
            <span className={cn("text-sm", off || future ? "text-muted-foreground" : "font-medium")} aria-hidden>
              {formatWeekday(date)}
            </span>
            <span
              aria-hidden
              className={cn(
                "grid size-8 place-items-center rounded-md border",
                filed ? "border-primary bg-primary text-primary-foreground" : "border-dashed border-input text-muted-foreground",
                off && !filed && "bg-muted",
                future && !filed && "opacity-60",
                isToday && "ring-2 ring-ring ring-offset-2 ring-offset-card",
              )}
            >
              {filed ? <CheckIcon className="size-4" /> : <MinusIcon className="size-4" />}
            </span>
            <span className="sr-only">{description}</span>
          </li>
        );
      })}
    </ul>
  );
}
