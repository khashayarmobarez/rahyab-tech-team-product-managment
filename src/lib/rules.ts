/**
 * Pure data rules: no database, no clock. Everything here is covered by tests.
 */
import {
  NO_REPORT_LINE,
  PERSON_SLUGS,
  type PersonSlug,
  type StatusLabel,
} from "./constants";
import { addDays, daysBetween, isDateString, weekStartOf } from "./dates";

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

// ------------------------------------------------------------------- status --

const STATUS_RANK: Record<StatusLabel, number> = { green: 0, yellow: 1, red: 2 };

/** For sorting or picking the worse of two statuses. */
export function worseStatus(a: StatusLabel, b: StatusLabel): StatusLabel {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}
