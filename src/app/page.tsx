import { Suspense } from "react";
import { DialogsProvider } from "@/components/forms/dialogs-provider";
import { AgentSection } from "@/components/page/agent-section";
import { AttentionBanner } from "@/components/page/attention-banner";
import { DecisionsSection } from "@/components/page/decisions-section";
import { PageSkeleton } from "@/components/page/page-skeleton";
import { PastWeeks } from "@/components/page/past-weeks";
import { GlanceSection } from "@/components/page/glance-section";
import { SetupNotice } from "@/components/page/setup-notice";
import { SiteFooter } from "@/components/page/site-footer";
import { SiteHeader } from "@/components/page/site-header";
import { WeekHero } from "@/components/page/week-hero";
import { WorkSection } from "@/components/page/work-section";
import { PERSON_SLUGS, type PersonSlug } from "@/lib/constants";
import { databaseProblem } from "@/lib/db-errors";
import { addDays, formatWeekRange, todayInTehran, weekStartOf } from "@/lib/dates";
import {
  parseDayParam,
  parseFlagParam,
  parsePersonParam,
  parseQueryParam,
  parseViewParam,
  parseWeekParam,
  stuckBlockers,
  type WorkFilter,
} from "@/lib/rules";
import { getRole, requireSiteSession } from "@/server/auth";
import { siteOrigin } from "@/server/origin";
import {
  SEARCH_LIMIT,
  getLastUpdated,
  getWeeklyReport,
  listDailyReports,
  listDailyReportsForWeek,
  listDecisionsForWeek,
  listPeople,
  listReviews,
  listWeekOptions,
  listWeeklyReports,
  searchDailyReports,
} from "@/server/reports";

/**
 * The shell and the loading skeleton are sent at once. Everything that depends
 * on the visitor or the database streams in behind the Suspense boundary.
 */
export default function Page(props: PageProps<"/">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TeamReports searchParams={props.searchParams} />
    </Suspense>
  );
}

async function TeamReports({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  await requireSiteSession();
  const params = await searchParams;

  const today = todayInTehran();
  const currentWeek = weekStartOf(today);
  const requested = parseWeekParam(params.week) ?? currentWeek;
  // A week that has not started yet has nothing to show, so fall back to this week.
  const weekStart = requested > currentWeek ? currentWeek : requested;

  // The CEO's choices in "What we worked on": a day of the shown week, a person, only blockers.
  const filter: WorkFilter = {
    day: parseDayParam(params.day, weekStart),
    person: parsePersonParam(params.person),
    blockersOnly: parseFlagParam(params.blockers),
    // A search looks through every week, so it replaces the week and day choices.
    query: parseQueryParam(params.q),
  };
  const view = parseViewParam(params.view);
  const role = await getRole();

  let data;
  try {
    data = await Promise.all([
      listPeople(),
      listDailyReportsForWeek(weekStart),
      // The last four weeks feed the projects chart and the "blocked for days" alert.
      listDailyReports({ from: addDays(today, -27), to: today, limit: 200 }),
      filter.query ? searchDailyReports(filter.query) : Promise.resolve(null),
      getWeeklyReport(weekStart),
      listDecisionsForWeek(weekStart, today),
      listWeeklyReports({ before: currentWeek, limit: 26 }),
      listWeekOptions(today),
      getLastUpdated(),
    ]);
  } catch (error) {
    // A database that is down or not set up gets a plain explanation; real bugs still surface.
    const problem = databaseProblem(error);
    if (!problem) throw error;
    console.error(`Database problem (${problem}):`, error);
    return <SetupNotice problem={problem} />;
  }
  const [people, dailyReports, recentReports, searchResults, weekly, decisionView, pastWeeks, weekOptions, lastUpdated] = data;
  const workReports = searchResults ?? dailyReports;
  const reviewDates = workReports.map((r) => r.reportDate).sort();
  const reviews =
    reviewDates.length > 0 ? await listReviews(reviewDates[0], reviewDates[reviewDates.length - 1]) : [];
  const isCurrentWeek = weekStart === currentWeek;
  // Only blockers that are still in someone's newest report, repeated on 3 or more days.
  const stuck = stuckBlockers(recentReports.filter((r) => r.reportDate >= addDays(today, -13)));
  const projects = [...new Set(recentReports.flatMap((r) => (r.project ? [r.project] : [])))].sort((a, b) =>
    a.localeCompare(b),
  );
  const origin = await siteOrigin();

  if (people.length === 0) {
    return (
      <main className="mx-auto grid min-h-dvh w-full max-w-xl content-center gap-3 px-4">
        <h1 className="text-2xl font-semibold">Team Reports is not set up yet</h1>
        <p className="text-muted-foreground">
          The database has no people in it. Whoever runs this site needs to run <code>npm run seed</code> (or the
          database migration) once.
        </p>
      </main>
    );
  }

  const names = Object.fromEntries(PERSON_SLUGS.map((slug) => [slug, people.find((p) => p.slug === slug)?.name ?? slug])) as Record<
    PersonSlug,
    string
  >;
  const activePeople = people.filter((p) => p.active).map((p) => ({ slug: p.slug, name: p.name }));

  // The picker lists every week with data, this week, and the week being viewed.
  const weeks = [...new Set([...weekOptions, weekStart])].sort().reverse();
  const weekChoices = weeks.map((value) => ({
    value,
    label: `${formatWeekRange(value)}${value === currentWeek ? " (this week)" : ""}`,
  }));

  return (
    <DialogsProvider
      people={activePeople}
      names={names}
      today={today}
      currentWeek={currentWeek}
      weekOptions={weeks}
      role={role}
      projects={projects}
    >
      <div id="top" />
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 py-6 sm:py-8">
        {isCurrentWeek ? (
          <AttentionBanner stuck={stuck} openDecisions={decisionView.open} asOf={decisionView.asOf} names={names} />
        ) : null}
        <WeekHero
          weekStart={weekStart}
          currentWeek={currentWeek}
          weekly={weekly}
          dailyReports={dailyReports}
          names={names}
          weekChoices={weekChoices}
        />
        <GlanceSection
          weekStart={weekStart}
          currentWeek={currentWeek}
          today={today}
          people={people}
          names={names}
          dailyReports={dailyReports}
          pastWeeks={pastWeeks}
          openDecisions={decisionView.open}
          asOf={decisionView.asOf}
          selectedDay={filter.day}
          recentReports={recentReports}
        />
        <WorkSection
          weekStart={weekStart}
          currentWeek={currentWeek}
          today={today}
          people={people}
          dailyReports={workReports}
          reviews={reviews}
          filter={filter}
          view={view}
          role={role}
          searchCapped={searchResults !== null && searchResults.length >= SEARCH_LIMIT}
        />
        <div className="grid gap-10 print:hidden">
          <DecisionsSection
            open={decisionView.open}
            recentlyAnswered={decisionView.recentlyAnswered}
            asOf={decisionView.asOf}
            names={names}
          />
          <PastWeeks weeks={pastWeeks} names={names} currentWeek={currentWeek} />
          <AgentSection origin={origin} />
        </div>
      </main>
      <div className="print:hidden">
        <SiteFooter lastUpdated={lastUpdated} />
      </div>
    </DialogsProvider>
  );
}
