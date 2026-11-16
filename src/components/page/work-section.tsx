import Link from "next/link";
import { AlertTriangleIcon, CheckIcon, ChevronDownIcon, EyeIcon, MessageSquareIcon } from "lucide-react";
import type { PersonSlug, Role } from "@/lib/constants";
import { formatDay, formatDayWithYear, formatWeekday, isFriday, weekDays } from "@/lib/dates";
import { dayCounts, filterReports, groupByDay, workHref, type WorkFilter, type WorkView } from "@/lib/rules";
import { cn } from "@/lib/utils";
import type { DailyReport, Person, ReportReview } from "@/server/reports";
import { DetailDialog } from "./detail-dialog";
import { MarkedList, SectionHeading } from "./lists";
import { ReviewBox } from "./review-box";
import { SERIES_BG } from "./series";
import { PrintButton, SearchBox } from "./work-tools";

type Props = {
  weekStart: string;
  currentWeek: string;
  today: string;
  people: Person[];
  /** The shown week's reports, or the search results when `filter.query` is set. */
  dailyReports: DailyReport[];
  reviews: ReportReview[];
  filter: WorkFilter;
  view: WorkView;
  role: Role;
  /** True when the search hit its cap, so there may be more than shown. */
  searchCapped: boolean;
};

/** A week with this many topics or fewer shows every day open; a busier one opens only the newest day, and the other days show their topic names on one line. */
const OPEN_ALL_UP_TO = 8;

/**
 * What each person worked on, as topics. Boxes are small and the same size, days
 * fold up, and a list view packs them tighter still, so a busy week stays short.
 * The CEO picks a day (or the whole week), a person and "only blockers", or
 * searches every week. Details open in a dialog.
 */
export function WorkSection({
  weekStart,
  currentWeek,
  today,
  people,
  dailyReports,
  reviews,
  filter,
  view,
  role,
  searchCapped,
}: Props) {
  const searching = filter.query !== undefined;
  const days = weekDays(weekStart);
  const visiblePeople = people.filter((p) => p.active || dailyReports.some((r) => r.personSlug === p.slug));
  const reviewOf = new Map(reviews.map((r) => [`${r.personSlug}|${r.reportDate}`, r]));

  const href = (change: Partial<WorkFilter> & { view?: WorkView }) => {
    const next = { ...filter, ...change };
    return workHref({
      week: weekStart,
      currentWeek,
      day: next.day,
      person: next.person,
      blockersOnly: next.blockersOnly,
      query: next.query,
      view: change.view ?? view,
      anchor: "work",
    });
  };
  const clearHref = workHref({ week: weekStart, currentWeek, view, anchor: "work" });

  // The search ignores the day; otherwise it is the same filters.
  const effective: WorkFilter = searching ? { ...filter, day: undefined } : filter;
  const shown = filterReports(dailyReports, effective);
  const groups = groupByDay(shown);
  const counts = dayCounts(filterReports(dailyReports, { ...effective, day: undefined }), days);
  const filtered = searching || filter.day !== undefined || filter.person !== undefined || filter.blockersOnly;
  const forChips = filterReports(dailyReports, { ...effective, person: undefined });
  const notSeen = role === "ceo" ? shown.filter((r) => !reviewOf.get(`${r.personSlug}|${r.reportDate}`)?.seenAt).length : 0;
  const openAll = shown.length <= OPEN_ALL_UP_TO;

  return (
    <section id="work" aria-labelledby="work-title" className="grid gap-4">
      <SectionHeading
        id="work-title"
        aside={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 print:hidden">
            <p className="text-muted-foreground" aria-live="polite">
              {shown.length === dailyReports.length
                ? `${shown.length} ${shown.length === 1 ? "topic" : "topics"}`
                : `Showing ${shown.length} of ${dailyReports.length} topics`}
              {role === "ceo" && shown.length > 0 ? ` · ${notSeen} not seen yet` : ""}
            </p>
            <PrintButton />
          </div>
        }
      >
        {searching ? "Search results" : "What we worked on"}
      </SectionHeading>

      <div className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchBox key={filter.query ?? ""} query={filter.query} />
          <div className="flex items-center gap-1 rounded-full border p-1" role="group" aria-label="How topics are shown">
            <ViewLink href={href({ view: "cards" })} selected={view === "cards"}>
              Cards
            </ViewLink>
            <ViewLink href={href({ view: "list" })} selected={view === "list"}>
              List
            </ViewLink>
          </div>
        </div>

        {searching ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {shown.length === 0 ? "No topics" : `${shown.length} ${shown.length === 1 ? "topic" : "topics"}`} found for{" "}
              <strong>“{filter.query}”</strong> in every week
              {searchCapped ? ". Only the newest are shown; try more specific words" : ""}.
            </span>
            <Link href={clearHref} scroll={false} className="font-medium text-primary underline underline-offset-4">
              Clear search
            </Link>
          </p>
        ) : (
          <nav aria-label="Pick a day" className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            <DayLink href={href({ day: undefined })} selected={filter.day === undefined}>
              <span className="font-semibold">Whole week</span>
            </DayLink>
            {counts.map((count) => {
              const future = count.date > today;
              const off = isFriday(count.date);
              const label = `${formatDay(count.date)}${off ? ", day off" : ""}: ${
                future ? "not yet" : count.total === 0 ? "no topics" : `${count.total} ${count.total === 1 ? "topic" : "topics"}`
              }`;
              const face = (
                <>
                  <span className="font-semibold">{formatWeekday(count.date)}</span>
                  <span className="text-lg leading-none font-semibold">{count.date.slice(8).replace(/^0/, "")}</span>
                  <DayDots byPerson={count.byPerson} people={visiblePeople} />
                </>
              );
              return future ? (
                <span
                  key={count.date}
                  className="grid min-h-20 content-center justify-items-center gap-1 rounded-xl border border-dashed p-2 text-muted-foreground opacity-60"
                  title={label}
                >
                  {face}
                  <span className="sr-only">{label}</span>
                </span>
              ) : (
                <DayLink
                  key={count.date}
                  href={href({ day: count.date })}
                  selected={filter.day === count.date}
                  label={label}
                  muted={off && count.total === 0}
                >
                  {face}
                </DayLink>
              );
            })}
          </nav>
        )}

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
          <FilterLink href={href({ person: undefined })} selected={filter.person === undefined}>
            Everyone <span className="text-muted-foreground">{forChips.length}</span>
          </FilterLink>
          {visiblePeople.map((person) => (
            <FilterLink key={person.slug} href={href({ person: person.slug })} selected={filter.person === person.slug}>
              <span aria-hidden className={cn("size-2.5 rounded-full", SERIES_BG[person.slug])} />
              {person.name}{" "}
              <span className="text-muted-foreground">{forChips.filter((r) => r.personSlug === person.slug).length}</span>
            </FilterLink>
          ))}
          <span aria-hidden className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <FilterLink href={href({ blockersOnly: !filter.blockersOnly })} selected={filter.blockersOnly}>
            <AlertTriangleIcon aria-hidden className="size-4" />
            Only with blockers
          </FilterLink>
          {filtered && !searching ? (
            <Link href={clearHref} scroll={false} className="ms-auto rounded-md px-2 py-1.5 font-medium text-primary underline underline-offset-4">
              Clear choices
            </Link>
          ) : null}
        </div>
      </div>

      {dailyReports.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-5 text-muted-foreground print:hidden">
          {searching ? "Nothing found. Try other words." : "No daily reports for this week yet."}
        </p>
      ) : groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-5 text-muted-foreground print:hidden">
          Nothing matches these choices.{" "}
          <Link href={clearHref} scroll={false} className="font-medium text-primary underline underline-offset-4">
            Show everything
          </Link>
        </p>
      ) : (
        <div className="grid gap-3 print:hidden">
          {groups.map((group, index) => {
            const blockers = group.reports.filter((r) => r.blockers.length > 0).length;
            return (
              <details
                key={`${group.date}-${filter.person ?? ""}-${filter.blockersOnly ? "b" : ""}-${view}`}
                open={openAll || index === 0}
                className="group/day rounded-2xl border bg-card shadow-sm"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-3 focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                  <ChevronDownIcon aria-hidden className="size-5 text-muted-foreground transition-transform group-open/day:rotate-180" />
                  <h3 className="text-lg font-semibold">{formatDay(group.date)}</h3>
                  <span className="text-muted-foreground">
                    {group.reports.length} {group.reports.length === 1 ? "topic" : "topics"}
                    {group.date === today ? " · today" : ""}
                  </span>
                  {blockers > 0 ? (
                    <span className="flex items-center gap-1.5 font-medium">
                      <AlertTriangleIcon aria-hidden className="size-4" />
                      {blockers} with {blockers === 1 ? "a blocker" : "blockers"}
                    </span>
                  ) : null}
                  {/* A folded day still names its topics, so the CEO can scan the week without opening anything. */}
                  <span className="order-last min-w-0 basis-full truncate text-muted-foreground group-open/day:hidden sm:order-none sm:basis-0 sm:flex-1">
                    {group.reports.map((r) => r.title).join(" · ")}
                  </span>
                  <span aria-hidden className="ms-auto flex items-center gap-1">
                    {visiblePeople.map((p) =>
                      group.reports.some((r) => r.personSlug === p.slug) ? (
                        <span key={p.slug} className={cn("size-2.5 rounded-full", SERIES_BG[p.slug])} />
                      ) : null,
                    )}
                  </span>
                </summary>
                <ul
                  className={cn(
                    "border-t p-3",
                    view === "list" ? "grid gap-2" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
                  )}
                >
                  {group.reports.map((report) => {
                    const review = reviewOf.get(`${report.personSlug}|${report.reportDate}`);
                    return (
                      <li key={report.id}>
                        <Topic report={report} review={review} role={role} view={view} showDate={searching} />
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </div>
      )}

      <PrintReport groups={groups} weekStart={weekStart} searching={searching} />
    </section>
  );
}

// ---------------------------------------------------------------------- topic --

/** One topic as a small card or a one-line row. Both open the same details. */
function Topic({
  report,
  review,
  role,
  view,
  showDate,
}: {
  report: DailyReport;
  review: ReportReview | undefined;
  role: Role;
  view: WorkView;
  showDate: boolean;
}) {
  const blockers = report.blockers.length;
  const seen = Boolean(review?.seenAt);
  const hasNote = Boolean(review?.note);
  const meta = (
    <>
      {seen ? (
        <span className="flex items-center gap-1" title="Seen by the CEO">
          <EyeIcon aria-hidden className="size-4" />
          <span className="sr-only">Seen by the CEO</span>
        </span>
      ) : null}
      {hasNote ? (
        <span className="flex items-center gap-1" title="The CEO left a note">
          <MessageSquareIcon aria-hidden className="size-4" />
          <span className="sr-only">The CEO left a note</span>
        </span>
      ) : null}
    </>
  );
  const counts = (
    <>
      <span className="flex items-center gap-1.5">
        <CheckIcon aria-hidden className="size-4" />
        {report.done.length} done
      </span>
      {blockers > 0 ? (
        <span className="flex items-center gap-1.5 font-semibold text-foreground">
          <AlertTriangleIcon aria-hidden className="size-4" />
          {blockers} {blockers === 1 ? "blocker" : "blockers"}
        </span>
      ) : null}
    </>
  );
  const who = `${report.personName}${report.project ? ` · ${report.project}` : ""}${showDate ? ` · ${formatDay(report.reportDate)}` : ""}`;

  return (
    <DetailDialog
      ariaLabel={`${report.title}. ${report.personName}, ${formatDay(report.reportDate)}. Open details`}
      triggerClassName={cn(
        "w-full rounded-xl border bg-card text-start transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none",
        view === "list"
          ? "grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2 sm:grid-cols-[11rem_1fr_auto]"
          : "grid h-36 grid-rows-[auto_1fr_auto] gap-1 p-3",
      )}
      title={report.title}
      subtitle={`${report.personName}${report.project ? ` · ${report.project}` : ""} · ${formatDayWithYear(report.reportDate)}`}
      trigger={
        view === "list" ? (
          <>
            <span className="order-2 col-span-2 flex min-w-0 items-center gap-2 text-muted-foreground sm:order-none sm:col-span-1">
              <span aria-hidden className={cn("size-3 shrink-0 rounded-full", SERIES_BG[report.personSlug])} />
              <span className="truncate">{who}</span>
            </span>
            <span className="min-w-0 truncate text-lg font-semibold" title={report.title}>
              {report.title}
            </span>
            <span className="flex items-center gap-3 text-muted-foreground">
              {meta}
              {counts}
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-2 text-muted-foreground">
              <span aria-hidden className={cn("size-3 shrink-0 rounded-full", SERIES_BG[report.personSlug])} />
              <span className="min-w-0 flex-1 truncate">{who}</span>
              {meta}
            </span>
            <span className="line-clamp-2 text-xl leading-snug font-semibold text-balance" title={report.title}>
              {report.title}
            </span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-muted-foreground">{counts}</span>
          </>
        )
      }
    >
      <TopicDetails report={report} review={review} role={role} />
    </DetailDialog>
  );
}

function TopicDetails({ report, review, role }: { report: DailyReport; review: ReportReview | undefined; role: Role }) {
  return (
    <div className="grid gap-5">
      <p className="whitespace-pre-line">{report.summary}</p>
      <ReportList title="Done" items={report.done} marker="check" />
      <ReportList title="Blockers" items={report.blockers} marker="open" icon />
      <ReportList title="Next" items={report.next} marker="dot" />
      <ReviewBox
        role={role}
        personSlug={report.personSlug}
        reportDate={report.reportDate}
        seenAt={review?.seenAt?.toISOString() ?? null}
        note={review?.note ?? null}
        noteAt={review?.noteAt?.toISOString() ?? null}
        reportUpdatedAt={report.updatedAt.toISOString()}
      />
    </div>
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
  icon?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="grid gap-1.5">
      <h4 className="flex items-center gap-1.5 font-semibold">
        {icon ? <AlertTriangleIcon aria-hidden className="size-4" /> : null}
        {title}
      </h4>
      <MarkedList items={items} marker={marker} />
    </div>
  );
}

// ---------------------------------------------------------------------- print --

/** Only shown when printing: every report in full, so the page can be saved as a PDF for a meeting. */
function PrintReport({
  groups,
  weekStart,
  searching,
}: {
  groups: { date: string; reports: DailyReport[] }[];
  weekStart: string;
  searching: boolean;
}) {
  if (groups.length === 0) return null;
  return (
    <div className="hidden print:grid print:gap-4">
      <h3 className="text-xl font-semibold">
        {searching ? "Reports found by the search" : `Daily reports, week of ${formatDayWithYear(weekStart)}`}
      </h3>
      {groups.map((group) => (
        <div key={group.date} className="grid gap-3 break-inside-avoid-page">
          <h4 className="border-b pb-1 text-lg font-semibold">{formatDay(group.date)}</h4>
          {group.reports.map((report) => (
            <article key={report.id} className="grid gap-2 break-inside-avoid">
              <h5 className="text-lg font-semibold">
                {report.title} <span className="font-normal text-muted-foreground">· {report.personName}{report.project ? ` · ${report.project}` : ""}</span>
              </h5>
              <p className="whitespace-pre-line">{report.summary}</p>
              <ReportList title="Done" items={report.done} marker="check" />
              <ReportList title="Blockers" items={report.blockers} marker="open" icon />
              <ReportList title="Next" items={report.next} marker="dot" />
            </article>
          ))}
        </div>
      ))}
    </div>
  );
}

// -------------------------------------------------------------------- pieces --

/** A small dot per person who reported that day, in their chart colour. */
function DayDots({ byPerson, people }: { byPerson: Record<PersonSlug, number>; people: Person[] }) {
  return (
    <span aria-hidden className="flex h-2.5 items-center gap-1">
      {people.map((person) =>
        byPerson[person.slug] > 0 ? <span key={person.slug} className={cn("size-2.5 rounded-full", SERIES_BG[person.slug])} /> : null,
      )}
    </span>
  );
}

function DayLink({
  href,
  selected,
  label,
  muted,
  children,
}: {
  href: string;
  selected: boolean;
  label?: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      aria-label={label}
      title={label}
      className={cn(
        "grid min-h-20 content-center justify-items-center gap-1 rounded-xl border p-2 text-center transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none",
        selected
          ? "border-primary bg-primary text-primary-foreground [&_.text-muted-foreground]:text-primary-foreground"
          : "bg-card hover:bg-accent",
        muted && !selected && "text-muted-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function ViewLink({ href, selected, children }: { href: string; selected: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "rounded-full px-3.5 py-1 font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none",
        selected ? "bg-primary text-primary-foreground" : "hover:bg-accent",
      )}
    >
      {children}
    </Link>
  );
}

function FilterLink({ href, selected, children }: { href: string; selected: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 py-1.5 font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none",
        selected
          ? "border-primary bg-primary text-primary-foreground [&_.text-muted-foreground]:text-primary-foreground"
          : "bg-card hover:bg-accent",
      )}
    >
      {children}
    </Link>
  );
}
