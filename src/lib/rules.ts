/**
 * Pure data rules: no database, no clock. Everything here is covered by tests.
 */
import {
  NO_REPORT_LINE,
  PERSON_SLUGS,
  type PersonSlug,
  type StatusLabel,
} from "./constants";
import { addDays, daysBetween, isDateString, weekDays, weekStartOf } from "./dates";

// ---------------------------------------------------------------- decisions --

export type DecisionLike = {
  status: "open" | "answered";
  raisedOn: string;
  answeredOn: string | null;
};

/** Days a decision has been waiting, counted up to `asOf`. Never negative. */
export function decisionAgeDays(raisedOn: string, asOf: string): number {
  return Math.max(0, daysBetween(raisedOn, asOf));
}

/** Was the decision raised and still unanswered at the end of `asOf`? */
export function isOpenAsOf(decision: DecisionLike, asOf: string): boolean {
  if (decision.raisedOn > asOf) return false;
  if (decision.status === "open") return true;
  return decision.answeredOn !== null && decision.answeredOn > asOf;
}

/** Answered on or before `asOf`, within the 14 days up to it. */
export function isRecentlyAnswered(decision: DecisionLike, asOf: string): boolean {
  if (decision.status !== "answered" || decision.answeredOn === null) return false;
  return decision.answeredOn <= asOf && decision.answeredOn >= addDays(asOf, -14);
}

/** "Raised today", "1 day open", "6 days open". */
export function describeAge(days: number): string {
  if (days <= 0) return "Raised today";
  return days === 1 ? "1 day open" : `${days} days open`;
}

// -------------------------------------------------------------- week choice --

/**
 * Reads the ?week= search param. Any real date is moved to the Saturday that
 * starts its week. Anything else gives undefined so the caller can fall back.
 */
export function parseWeekParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !isDateString(raw)) return undefined;
  return weekStartOf(raw);
}

// ------------------------------------------------------------ plain language --

const CODE_FILE_EXTENSIONS =
  "ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|html|py|rb|go|rs|java|sql|yml|yaml|toml|env|sh|lock";
const FILE_NAME = new RegExp(`\\b[\\w-]+\\.(?:${CODE_FILE_EXTENSIONS})\\b`, "i");
const PATH_LIKE = /(?:\b[\w-]+\/[\w-]+\/[\w.-]+|\bsrc\/|\bnode_modules\b|[A-Za-z]:\\)/;

/**
 * Finds things the CEO should not have to read: file names, folder paths, code
 * in backticks. Returns what it found (empty when the text is plain language).
 */
export function findCodeTerms(text: string): string[] {
  const found = new Set<string>();
  const fileName = FILE_NAME.exec(text);
  if (fileName) found.add(fileName[0]);
  const path = PATH_LIKE.exec(text);
  if (path) found.add(path[0]);
  if (text.includes("`")) found.add("`code`");
  return [...found];
}

// ------------------------------------------------------------------ by person --

export type ByPerson = Record<PersonSlug, string>;

/** Fills a missing or blank person line with "No report this week". */
export function fillByPerson(partial: Partial<Record<PersonSlug, string | undefined>>): ByPerson {
  const result = {} as ByPerson;
  for (const slug of PERSON_SLUGS) {
    const line = partial[slug]?.trim();
    result[slug] = line ? line : NO_REPORT_LINE;
  }
  return result;
}

// --------------------------------------------------------------- week numbers --

export type DatedReport = { personSlug: PersonSlug; reportDate: string };

/** Number of different days each person filed a report. */
export function countReportDays(reports: DatedReport[]): Record<PersonSlug, number> {
  const days = {} as Record<PersonSlug, Set<string>>;
  for (const slug of PERSON_SLUGS) days[slug] = new Set();
  for (const r of reports) days[r.personSlug].add(r.reportDate);
  const counts = {} as Record<PersonSlug, number>;
  for (const slug of PERSON_SLUGS) counts[slug] = days[slug].size;
  return counts;
}

/** The newest report of each person (by report date). Missing people are absent. */
export function latestPerPerson<T extends DatedReport>(reports: T[]): Partial<Record<PersonSlug, T>> {
  const latest: Partial<Record<PersonSlug, T>> = {};
  for (const report of reports) {
    const current = latest[report.personSlug];
    if (!current || report.reportDate > current.reportDate) latest[report.personSlug] = report;
  }
  return latest;
}

/** Which of the week's days each person filed a report. */
export function reportedDays(
  reports: DatedReport[],
  personSlug: PersonSlug,
): Set<string> {
  return new Set(reports.filter((r) => r.personSlug === personSlug).map((r) => r.reportDate));
}

export type ProgressReport = DatedReport & { done: string[]; blockers: string[] };

/** "Week in progress": what has been done so far and what is blocked right now. */
export function summariseProgress(reports: ProgressReport[]): {
  reportCount: number;
  peopleCount: number;
  doneSoFar: string[];
  openBlockers: { personSlug: PersonSlug; text: string }[];
} {
  const ordered = [...reports].sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  const seen = new Set<string>();
  const doneSoFar: string[] = [];
  for (const report of ordered) {
    for (const item of report.done) {
      const key = item.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        doneSoFar.push(item);
      }
    }
  }
  const latest = latestPerPerson(reports);
  const openBlockers: { personSlug: PersonSlug; text: string }[] = [];
  for (const slug of PERSON_SLUGS) {
    for (const text of latest[slug]?.blockers ?? []) openBlockers.push({ personSlug: slug, text });
  }
  return {
    reportCount: reports.length,
    peopleCount: new Set(reports.map((r) => r.personSlug)).size,
    doneSoFar,
    openBlockers,
  };
}

// --------------------------------------------------- "what we worked on" view --

export type WorkFilter = {
  /** One day of the week, or undefined for the whole week. */
  day?: string;
  person?: PersonSlug;
  blockersOnly: boolean;
  /** Words to look for across every week. When set, the week and day choices no longer apply. */
  query?: string;
};

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 80;

/** Reads ?q=. Spaces are tidied; anything shorter than two characters means "no search". */
export function parseQueryParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const tidy = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX);
  return tidy.length >= SEARCH_MIN ? tidy : undefined;
}

export type WorkView = "cards" | "list";

/** Reads ?view=. Cards are the default. */
export function parseViewParam(value: string | string[] | undefined): WorkView {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "list" ? "list" : "cards";
}

/** Reads ?day=. Only a real day inside the shown week counts; anything else means "whole week". */
export function parseDayParam(value: string | string[] | undefined, weekStart: string): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !isDateString(raw)) return undefined;
  return weekDays(weekStart).includes(raw) ? raw : undefined;
}

/** Reads ?person=. Unknown names mean "everyone". */
export function parsePersonParam(value: string | string[] | undefined): PersonSlug | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return PERSON_SLUGS.find((slug) => slug === raw);
}

/** Reads ?blockers=1. */
export function parseFlagParam(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "1";
}

export type FilterableReport = DatedReport & { blockers: string[] };

/** Applies the day, person and "has blockers" choices. Keeps the incoming order. */
export function filterReports<T extends FilterableReport>(reports: T[], filter: WorkFilter): T[] {
  return reports.filter(
    (r) =>
      (filter.day === undefined || r.reportDate === filter.day) &&
      (filter.person === undefined || r.personSlug === filter.person) &&
      (!filter.blockersOnly || r.blockers.length > 0),
  );
}

/** Groups reports under their day, newest day first. Keeps the order inside a day. */
export function groupByDay<T extends { reportDate: string }>(reports: T[]): { date: string; reports: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const report of reports) {
    const list = groups.get(report.reportDate);
    if (list) list.push(report);
    else groups.set(report.reportDate, [report]);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, list]) => ({ date, reports: list }));
}

export type DayCount = { date: string; byPerson: Record<PersonSlug, number>; total: number };

/** How many reports each person filed on each of the given days (for the day chart and day picker). */
export function dayCounts(reports: DatedReport[], days: string[]): DayCount[] {
  return days.map((date) => {
    const byPerson = Object.fromEntries(PERSON_SLUGS.map((slug) => [slug, 0])) as Record<PersonSlug, number>;
    for (const r of reports) if (r.reportDate === date) byPerson[r.personSlug] += 1;
    return { date, byPerson, total: PERSON_SLUGS.reduce((sum, slug) => sum + byPerson[slug], 0) };
  });
}

/** The address of the page for a week and a set of choices. Defaults are left out so links stay short. */
export function workHref(options: {
  week: string;
  currentWeek: string;
  day?: string;
  person?: PersonSlug;
  blockersOnly?: boolean;
  query?: string;
  view?: WorkView;
  /** Where on the page to land. */
  anchor?: string;
}): string {
  const query = new URLSearchParams();
  // A search covers every week, so it carries no week or day.
  if (options.query) {
    query.set("q", options.query);
  } else {
    if (options.week !== options.currentWeek) query.set("week", options.week);
    if (options.day) query.set("day", options.day);
  }
  if (options.person) query.set("person", options.person);
  if (options.blockersOnly) query.set("blockers", "1");
  if (options.view === "list") query.set("view", "list");
  const text = query.toString();
  return `/${text ? `?${text}` : ""}${options.anchor ? `#${options.anchor}` : ""}`;
}

// --------------------------------------------------------- projects and blockers --

export const NO_PROJECT = "No project";

export type ProjectTotal = { name: string; reports: number; people: PersonSlug[]; tagged: boolean };

/** How many reports each project got, biggest first. Reports with no project come last. Names match ignoring case. */
export function projectTotals<T extends DatedReport & { project: string | null }>(reports: T[]): ProjectTotal[] {
  const byKey = new Map<string, { name: string; reports: number; people: Set<PersonSlug> }>();
  let untagged = 0;
  const untaggedPeople = new Set<PersonSlug>();
  for (const report of reports) {
    const name = report.project?.trim();
    if (!name) {
      untagged += 1;
      untaggedPeople.add(report.personSlug);
      continue;
    }
    const key = name.toLowerCase();
    const entry = byKey.get(key) ?? { name, reports: 0, people: new Set<PersonSlug>() };
    entry.reports += 1;
    entry.people.add(report.personSlug);
    byKey.set(key, entry);
  }
  const tagged = [...byKey.values()]
    .map((e) => ({ name: e.name, reports: e.reports, people: PERSON_SLUGS.filter((s) => e.people.has(s)), tagged: true }))
    .sort((a, b) => b.reports - a.reports || a.name.localeCompare(b.name));
  if (untagged > 0) {
    tagged.push({
      name: NO_PROJECT,
      reports: untagged,
      people: PERSON_SLUGS.filter((s) => untaggedPeople.has(s)),
      tagged: false,
    });
  }
  return tagged;
}

export type StuckBlocker = { personSlug: PersonSlug; text: string; days: number; since: string };

function normaliseLine(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Blockers that keep coming back. A blocker counts when it is in the person's
 * newest report (so it is still open) and the same words appeared on at least
 * `minDays` different days. Pass the last couple of weeks of reports.
 */
export function stuckBlockers<T extends FilterableReport>(reports: T[], minDays = 3): StuckBlocker[] {
  const result: StuckBlocker[] = [];
  const latest = latestPerPerson(reports);
  for (const slug of PERSON_SLUGS) {
    const newest = latest[slug];
    if (!newest) continue;
    const mine = reports.filter((r) => r.personSlug === slug);
    const seen = new Set<string>();
    for (const blocker of newest.blockers) {
      const key = normaliseLine(blocker);
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      const dates = mine.filter((r) => r.blockers.some((b) => normaliseLine(b) === key)).map((r) => r.reportDate);
      const days = new Set(dates).size;
      if (days >= minDays) result.push({ personSlug: slug, text: blocker, days, since: [...dates].sort()[0] });
    }
  }
  return result.sort((a, b) => b.days - a.days);
}

// ------------------------------------------------------------------- status --

const STATUS_RANK: Record<StatusLabel, number> = { green: 0, yellow: 1, red: 2 };

/** For sorting or picking the worse of two statuses. */
export function worseStatus(a: StatusLabel, b: StatusLabel): StatusLabel {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}
