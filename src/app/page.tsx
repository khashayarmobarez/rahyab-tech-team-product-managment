import { Suspense } from "react";
import { DialogsProvider } from "@/components/forms/dialogs-provider";
import { AgentSection } from "@/components/page/agent-section";
import { DecisionsSection } from "@/components/page/decisions-section";
import { PageSkeleton } from "@/components/page/page-skeleton";
import { PastWeeks } from "@/components/page/past-weeks";
import { PeopleSection } from "@/components/page/people-section";
import { SetupNotice } from "@/components/page/setup-notice";
import { SiteFooter } from "@/components/page/site-footer";
import { SiteHeader } from "@/components/page/site-header";
import { WeekHero } from "@/components/page/week-hero";
import { PERSON_SLUGS, type PersonSlug } from "@/lib/constants";
import { databaseProblem } from "@/lib/db-errors";
import { formatWeekRange, todayInTehran, weekStartOf } from "@/lib/dates";
import { parseWeekParam } from "@/lib/rules";
import { requireSiteSession } from "@/server/auth";
import { siteOrigin } from "@/server/origin";
import {
  getLastUpdated,
  getWeeklyReport,
  listDailyReportsForWeek,
  listDecisionsForWeek,
  listPeople,
  listWeekOptions,
  listWeeklyReports,
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

  let data;
  try {
    data = await Promise.all([
      listPeople(),
      listDailyReportsForWeek(weekStart),
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
  const [people, dailyReports, weekly, decisionView, pastWeeks, weekOptions, lastUpdated] = data;
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
    <DialogsProvider people={activePeople} names={names} today={today} currentWeek={currentWeek} weekOptions={weeks}>
      <div id="top" />
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 py-6 sm:py-8">
        <WeekHero
          weekStart={weekStart}
          currentWeek={currentWeek}
          weekly={weekly}
          dailyReports={dailyReports}
          names={names}
          weekChoices={weekChoices}
        />
        <PeopleSection weekStart={weekStart} today={today} people={people} dailyReports={dailyReports} weekly={weekly} />
        <DecisionsSection
          open={decisionView.open}
          recentlyAnswered={decisionView.recentlyAnswered}
          asOf={decisionView.asOf}
          names={names}
        />
        <PastWeeks weeks={pastWeeks} names={names} currentWeek={currentWeek} />
        <AgentSection origin={origin} />
      </main>
      <SiteFooter lastUpdated={lastUpdated} />
    </DialogsProvider>
  );
}
