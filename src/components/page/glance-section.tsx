import Link from "next/link";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { PERSON_SLUGS, STATUS_COPY, type PersonSlug, type StatusLabel } from "@/lib/constants";
import { formatDay, formatWeekday, weekDays } from "@/lib/dates";
import { dayCounts, decisionAgeDays, describeAge, projectTotals, workHref } from "@/lib/rules";
import { cn } from "@/lib/utils";
import type { DailyReport, Decision, Person, WeeklyReport } from "@/server/reports";
import { SERIES_BG } from "./series";
import { StatusDot } from "./status-chip";

type Props = {
  weekStart: string;
  currentWeek: string;
  today: string;
  people: Person[];
  names: Record<PersonSlug, string>;
  dailyReports: DailyReport[];
  /** Earlier weeks that have a weekly summary, newest first. */
  pastWeeks: WeeklyReport[];
  openDecisions: Decision[];
  asOf: string;
  selectedDay?: string;
  /** The last four weeks of daily reports, for the projects chart. */
  recentReports: DailyReport[];
};

/** Three small charts of the same size: this week's days, the last weeks, and decisions waiting. */
export function GlanceSection(props: Props) {
  return (
    <section id="glance" aria-labelledby="glance-title">
      {/* The charts can be folded away, so the page stays short for someone who only wants the topics. */}
      <details open className="group/glance grid gap-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <h2 id="glance-title" className="text-2xl font-semibold tracking-tight">
            At a glance
          </h2>
          <span className="flex items-center gap-1.5 text-muted-foreground print:hidden">
            <span className="group-open/glance:hidden">Show charts</span>
            <span className="hidden group-open/glance:inline">Hide charts</span>
            <ChevronDownIcon aria-hidden className="size-5 transition-transform group-open/glance:rotate-180" />
          </span>
        </summary>
        <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
          <DaysChart {...props} />
          <WeeksChart {...props} />
          <ProjectsChart {...props} />
          <DecisionsChart {...props} />
        </div>
      </details>
    </section>
  );
}

function ChartCard({
  title,
  subtitle,
  legend,
  children,
}: {
  title: string;
  subtitle: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="grid h-96 grid-rows-[auto_1fr_auto] gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <header>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-muted-foreground">{subtitle}</p>
      </header>
      <div className="min-h-0">{children}</div>
      {legend ? <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">{legend}</div> : null}
    </article>
  );
}

function PeopleLegend({ people }: { people: Person[] }) {
  return (
    <>
      {people.map((person) => (
        <span key={person.slug} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-3 rounded-full", SERIES_BG[person.slug])} />
          {person.name}
        </span>
      ))}
    </>
  );
}

// ------------------------------------------------------------ stacked columns --

type Segment = { slug: PersonSlug; count: number };
type Column = {
  key: string;
  href?: string;
  /** Spoken description of the whole column. */
  label: string;
  top: string;
  bottom?: React.ReactNode;
  segments: Segment[];
  selected?: boolean;
  dimmed?: boolean;
};

const PLOT_HEIGHT = "h-32";

/** Columns that grow from one baseline, one segment per person, with a 2px gap in the card colour. */
function StackedColumns({ columns, max, ticks }: { columns: Column[]; max: number; ticks: number[] }) {
  return (
    <div className="relative h-full">
      <div className={cn("absolute inset-x-0 top-0 ps-7", PLOT_HEIGHT)} aria-hidden>
        {ticks.map((tick) => (
          <div
            key={tick}
            className={cn("absolute inset-x-0 ps-7", tick === 0 ? "border-t border-input" : "border-t")}
            style={{ bottom: `${(tick / max) * 100}%` }}
          >
            <span className="absolute start-0 -translate-y-1/2 text-end text-sm leading-none text-muted-foreground" style={{ width: "1.25rem" }}>
              {tick}
            </span>
          </div>
        ))}
      </div>
      <ul className="relative grid ps-7" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((column) => {
          const body = (
            <>
              <span className={cn("flex w-full flex-col-reverse items-center", PLOT_HEIGHT)} aria-hidden>
                {column.segments
                  .filter((s) => s.count > 0)
                  .map((segment, index) => (
                    <span
                      key={segment.slug}
                      className={cn(
                        "block w-full max-w-6 rounded-t-[4px] rounded-b-none",
                        SERIES_BG[segment.slug],
                        index > 0 && "border-t-2 border-card",
                      )}
                      style={{ height: `${(segment.count / max) * 100}%` }}
                    />
                  ))}
              </span>
              <span
                aria-hidden
                className={cn(
                  "grid justify-items-center gap-1 pt-1 text-sm leading-tight",
                  column.selected ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                <span className={cn(column.selected && "underline underline-offset-4")}>{column.top}</span>
                {column.bottom}
              </span>
              <span className="sr-only">{column.label}</span>
            </>
          );
          return (
            <li key={column.key} className={cn(column.dimmed && "opacity-60")} title={column.label}>
              {column.href ? (
                <Link
                  href={column.href}
                  scroll={false}
                  aria-current={column.selected ? "true" : undefined}
                  className="grid rounded-md hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none"
                >
                  {body}
                </Link>
              ) : (
                <div className="grid">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 0, then three equal steps up to a round top. */
function niceScale(max: number): { max: number; ticks: number[] } {
  const step = Math.max(1, Math.ceil(max / 3));
  return { max: step * 3, ticks: [0, step, step * 2, step * 3] };
}

// ------------------------------------------------------------------- charts --

function DaysChart({ weekStart, currentWeek, today, people, names, dailyReports, selectedDay }: Props) {
  const visible = people.filter((p) => p.active || dailyReports.some((r) => r.personSlug === p.slug));
  const counts = dayCounts(dailyReports, weekDays(weekStart));
  const scale = niceScale(Math.max(visible.length, ...counts.map((c) => c.total)));
  const columns: Column[] = counts.map((count) => {
    const future = count.date > today;
    const who = PERSON_SLUGS.filter((slug) => count.byPerson[slug] > 0).map((slug) => names[slug]);
    return {
      key: count.date,
      href: future
        ? undefined
        : workHref({ week: weekStart, currentWeek, day: count.date, anchor: "work" }),
      label: `${formatDay(count.date)}: ${future ? "not yet" : who.length === 0 ? "no reports" : who.join(", ")}`,
      top: formatWeekday(count.date),
      segments: PERSON_SLUGS.map((slug) => ({ slug, count: count.byPerson[slug] })),
      selected: selectedDay === count.date,
      dimmed: future,
    };
  });
  return (
    <ChartCard title="Reports each day" subtitle="Who reported, day by day. Pick a day to see its topics." legend={<PeopleLegend people={visible} />}>
      <StackedColumns columns={columns} max={scale.max} ticks={scale.ticks} />
    </ChartCard>
  );
}

function WeeksChart({ currentWeek, people, names, pastWeeks }: Props) {
  // Oldest to newest, so time runs left to right.
  const weeks = pastWeeks.slice(0, 8).reverse();
  const visible = people.filter((p) => p.active || weeks.some((w) => w.numbers.daysWithReport[p.slug] > 0));
  const scale = niceScale(
    Math.max(6, ...weeks.map((w) => PERSON_SLUGS.reduce((sum, slug) => sum + w.numbers.daysWithReport[slug], 0))),
  );
  const columns: Column[] = weeks.map((week) => {
    const [, month, day] = week.weekStart.split("-");
    const monthName = formatDay(week.weekStart).split(" ")[2];
    return {
      key: week.weekStart,
      href: workHref({ week: week.weekStart, currentWeek, anchor: "this-week" }),
      label: `Week of ${formatDay(week.weekStart)}, ${STATUS_COPY[week.label].name}: ${PERSON_SLUGS.map(
        (slug) => `${names[slug]} ${week.numbers.daysWithReport[slug]} days`,
      ).join(", ")}`,
      top: `${Number(day)} ${monthName ?? month}`,
      bottom: <StatusDot label={week.label} />,
      segments: PERSON_SLUGS.map((slug) => ({ slug, count: week.numbers.daysWithReport[slug] })),
    };
  });
  return (
    <ChartCard
      title="Days reported, last weeks"
      subtitle="Each column is a week. The dot is how the week ended."
      legend={
        <>
          <PeopleLegend people={visible} />
          {(["green", "yellow", "red"] as StatusLabel[]).map((label) => (
            <span key={label} className="flex items-center gap-1.5">
              <StatusDot label={label} />
              {STATUS_COPY[label].name}
            </span>
          ))}
        </>
      }
    >
      {columns.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-muted-foreground">No finished weeks with a summary yet.</p>
      ) : (
        <StackedColumns columns={columns} max={scale.max} ticks={scale.ticks} />
      )}
    </ChartCard>
  );
}

const MAX_DECISION_ROWS = 4;

function DecisionsChart({ openDecisions, asOf }: Props) {
  const rows = openDecisions.slice(0, MAX_DECISION_ROWS);
  const ages = rows.map((d) => decisionAgeDays(d.raisedOn, asOf));
  const longest = Math.max(7, ...ages);
  return (
    <ChartCard
      title="Waiting for a decision"
      subtitle="How many days each question has been open."
      legend={
        openDecisions.length > MAX_DECISION_ROWS ? (
          <Link href="#decisions" className="font-medium text-primary underline underline-offset-4">
            and {openDecisions.length - MAX_DECISION_ROWS} more below
          </Link>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-muted-foreground">
          <CheckIcon aria-hidden className="size-4" />
          Nothing is waiting for a decision.
        </p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((decision, index) => (
            <li key={decision.id} className="grid gap-1" title={`${decision.title}: ${describeAge(ages[index])}`}>
              <span className="truncate font-medium">{decision.title}</span>
              <span className="flex items-center gap-2">
                <span className="h-2.5 flex-1 rounded-full bg-muted" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(4, (ages[index] / longest) * 100)}%` }}
                  />
                </span>
                <span className="w-24 shrink-0 text-end text-muted-foreground">{describeAge(ages[index])}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

const MAX_PROJECT_ROWS = 6;

function ProjectsChart({ recentReports }: Props) {
  const totals = projectTotals(recentReports);
  const anyTagged = totals.some((t) => t.tagged);
  const rows = totals.slice(0, MAX_PROJECT_ROWS);
  const longest = Math.max(1, ...rows.map((t) => t.reports));
  return (
    <ChartCard
      title="Where the work went"
      subtitle="Reports per project over the last four weeks. One report is one person's day."
      legend={
        totals.length > MAX_PROJECT_ROWS ? <span>and {totals.length - MAX_PROJECT_ROWS} more projects</span> : undefined
      }
    >
      {!anyTagged ? (
        <p className="rounded-lg border border-dashed p-4 text-muted-foreground">
          No project names yet. Add a project to a report and it shows up here.
        </p>
      ) : (
        <ul className="grid gap-2.5">
          {rows.map((total) => (
            <li
              key={total.name}
              className="grid gap-1"
              title={`${total.name}: ${total.reports} ${total.reports === 1 ? "report" : "reports"}`}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className={cn("truncate font-medium", !total.tagged && "text-muted-foreground")}>{total.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {total.reports} {total.reports === 1 ? "report" : "reports"}
                </span>
              </span>
              <span className="h-2.5 rounded-full bg-muted" aria-hidden>
                <span
                  className={cn("block h-full rounded-full", total.tagged ? "bg-primary" : "bg-muted-foreground/50")}
                  style={{ width: `${Math.max(4, (total.reports / longest) * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
