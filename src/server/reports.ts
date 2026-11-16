/**
 * The one place that reads and writes data. The web app calls it from server
 * components and server actions; the MCP server will call the same functions.
 *
 * Every write:
 *   1. validates its input with the shared zod schemas,
 *   2. applies the business rules (no future dates, one open answer, ...),
 *   3. writes an audit_log row in the same transaction.
 *
 * Validation problems are thrown as ZodError or ValidationError. Use
 * `fieldErrorsOf` from "@/lib/schemas" to turn either into field messages.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, isNull, lt, lte, max, or, sql } from "drizzle-orm";
import {
  type AuditSource,
  type DecisionStatus,
  type PersonSlug,
  type StatusLabel,
  type TokenScope,
} from "@/lib/constants";
import {
  addDays,
  daysBetween,
  formatDayWithYear,
  isDateString,
  isWeekStart,
  todayInTehran,
  weekStartOf,
  weeklyDueAt,
} from "@/lib/dates";
import { countReportDays, isOpenAsOf, isRecentlyAnswered } from "@/lib/rules";
import {
  ValidationError,
  answerDecisionSchema,
  createTokenSchema,
  dailyReportInputSchema,
  raiseDecisionSchema,
  reviewReportSchema,
  updatePersonSchema,
  weeklyReportInputSchema,
  type AnswerDecisionInput,
  type CreateTokenInput,
  type DailyReportInput,
  type RaiseDecisionInput,
  type ReviewReportInput,
  type UpdatePersonInput,
  type WeeklyReportInput,
} from "@/lib/schemas";
import { getDb, type Database } from "./db";
import {
  apiTokens,
  auditLog,
  dailyReports,
  decisions,
  people,
  reportReviews,
  weeklyReports,
  type WeeklyNumbers,
} from "./db/schema";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

// ------------------------------------------------------------------ types --

/** Who is making a change, and through which door. */
export type Actor = { actor: string; source: AuditSource };

export type Person = { id: string; slug: PersonSlug; name: string; active: boolean };

export type DailyReport = {
  id: string;
  personSlug: PersonSlug;
  personName: string;
  reportDate: string;
  title: string;
  /** The project the day's work belongs to, or null. */
  project: string | null;
  summary: string;
  done: string[];
  blockers: string[];
  next: string[];
  updatedAt: Date;
};

/** What the CEO did with one person's report for one day. */
export type ReportReview = {
  personSlug: PersonSlug;
  reportDate: string;
  seenAt: Date | null;
  note: string | null;
  noteAt: Date | null;
};

export type WeeklyReport = {
  id: string;
  weekStart: string;
  oneLine: string;
  results: string[];
  byPerson: Record<PersonSlug, string>;
  waitingDecisions: string[];
  notFinished: string[];
  numbers: WeeklyNumbers;
  label: StatusLabel;
  dueAt: Date;
  done: boolean;
  updatedAt: Date;
};

export type Decision = {
  id: string;
  title: string;
  description: string;
  status: DecisionStatus;
  raisedOn: string;
  raisedBy: string;
  answeredOn: string | null;
  answer: string | null;
};

export type ApiTokenInfo = {
  id: string;
  owner: string;
  name: string;
  scopes: TokenScope[];
  prefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export type AuditEntry = {
  id: string;
  actor: string;
  source: AuditSource;
  action: string;
  entity: string;
  summary: string;
  createdAt: Date;
};

// ----------------------------------------------------------------- helpers --

async function writeAudit(
  tx: Tx,
  ctx: Actor,
  entry: {
    action: string;
    entity: string;
    entityId?: string;
    summary: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(auditLog).values({
    actor: ctx.actor,
    source: ctx.source,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
    details: entry.details ?? null,
  });
}

async function requireActivePerson(tx: Tx | Database, slug: PersonSlug, field = "person"): Promise<Person> {
  const [row] = await tx.select().from(people).where(eq(people.slug, slug)).limit(1);
  if (!row) throw new ValidationError({ [field]: ["That person is not set up yet. Ask an admin to add them."] });
  if (!row.active) throw new ValidationError({ [field]: [`${row.name} is switched off. Ask an admin to turn them on.`] });
  return row;
}

function toDecision(row: typeof decisions.$inferSelect): Decision {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    raisedOn: row.raisedOn,
    raisedBy: row.raisedBy,
    answeredOn: row.answeredOn,
    answer: row.answer,
  };
}

function toWeeklyReport(row: typeof weeklyReports.$inferSelect): WeeklyReport {
  return {
    id: row.id,
    weekStart: row.weekStart,
    oneLine: row.oneLine,
    results: row.results,
    byPerson: row.byPerson,
    waitingDecisions: row.waitingDecisions,
    notFinished: row.notFinished,
    numbers: row.numbers,
    label: row.label,
    dueAt: row.dueAt,
    done: row.done,
    updatedAt: row.updatedAt,
  };
}

function toDailyReport(row: typeof dailyReports.$inferSelect, person: Pick<Person, "slug" | "name">): DailyReport {
  return {
    id: row.id,
    personSlug: person.slug,
    personName: person.name,
    reportDate: row.reportDate,
    title: row.title,
    project: row.project,
    summary: row.summary,
    done: row.done,
    blockers: row.blockers,
    next: row.next,
    updatedAt: row.updatedAt,
  };
}

function toTokenInfo(row: typeof apiTokens.$inferSelect): ApiTokenInfo {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    scopes: row.scopes,
    prefix: row.prefix,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

// ------------------------------------------------------------------ people --

export async function listPeople(options: { activeOnly?: boolean } = {}): Promise<Person[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(people)
    .where(options.activeOnly ? eq(people.active, true) : undefined)
    .orderBy(asc(people.slug)); // enum order: khashayar, mahan, hossein
  return rows.map(({ id, slug, name, active }) => ({ id, slug, name, active }));
}

export async function updatePerson(input: UpdatePersonInput, ctx: Actor): Promise<Person> {
  const data = updatePersonSchema.parse(input);
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(people)
      .set({ name: data.name, active: data.active })
      .where(eq(people.slug, data.slug))
      .returning();
    if (!row) throw new ValidationError({ slug: ["That person is not set up yet. Run the seed first."] });
    await writeAudit(tx, ctx, {
      action: "person.updated",
      entity: "person",
      entityId: row.id,
      summary: `${row.name} was ${row.active ? "switched on" : "switched off"}`,
      details: { slug: row.slug, name: row.name, active: row.active },
    });
    return { id: row.id, slug: row.slug, name: row.name, active: row.active };
  });
}

// ----------------------------------------------------------- daily reports --

/**
 * Saves a person's report for a day. If one already exists for that person and
 * date it is replaced, because reports are refreshed through the day.
 */
export async function saveDailyReport(
  input: DailyReportInput,
  ctx: Actor,
): Promise<{ report: DailyReport; replaced: boolean }> {
  const data = dailyReportInputSchema.parse(input);
  if (data.reportDate > todayInTehran()) {
    throw new ValidationError({ reportDate: ["That day has not happened yet. Pick today or an earlier day."] });
  }

  return getDb().transaction(async (tx) => {
    const person = await requireActivePerson(tx, data.person);
    const [existing] = await tx
      .select({ id: dailyReports.id })
      .from(dailyReports)
      .where(and(eq(dailyReports.personId, person.id), eq(dailyReports.reportDate, data.reportDate)))
      .limit(1);

    const values = {
      title: data.title,
      project: data.project,
      summary: data.summary,
      done: data.done,
      blockers: data.blockers,
      next: data.next,
    };
    const [row] = await tx
      .insert(dailyReports)
      .values({ personId: person.id, reportDate: data.reportDate, ...values })
      .onConflictDoUpdate({
        target: [dailyReports.personId, dailyReports.reportDate],
        set: { ...values, updatedAt: new Date() },
      })
      .returning();

    const replaced = existing !== undefined;
    await writeAudit(tx, ctx, {
      action: replaced ? "daily_report.replaced" : "daily_report.created",
      entity: "daily_report",
      entityId: row.id,
      summary: `${person.name} ${replaced ? "updated" : "added"} the report for ${formatDayWithYear(data.reportDate)}`,
      details: { person: person.slug, reportDate: data.reportDate, title: data.title },
    });
    return { report: toDailyReport(row, person), replaced };
  });
}

export async function getDailyReport(personSlug: PersonSlug, reportDate: string): Promise<DailyReport | null> {
  const db = getDb();
  const [row] = await db
    .select({ report: dailyReports, slug: people.slug, name: people.name })
    .from(dailyReports)
    .innerJoin(people, eq(dailyReports.personId, people.id))
    .where(and(eq(people.slug, personSlug), eq(dailyReports.reportDate, reportDate)))
    .limit(1);
  return row ? toDailyReport(row.report, { slug: row.slug, name: row.name }) : null;
}

/** All reports of a week (Saturday to Friday), newest day first. */
export async function listDailyReportsForWeek(weekStart: string): Promise<DailyReport[]> {
  if (!isWeekStart(weekStart)) throw new ValidationError({ week: ["Pick a week that starts on a Saturday"] });
  const db = getDb();
  const rows = await db
    .select({ report: dailyReports, slug: people.slug, name: people.name })
    .from(dailyReports)
    .innerJoin(people, eq(dailyReports.personId, people.id))
    .where(and(gte(dailyReports.reportDate, weekStart), lte(dailyReports.reportDate, addDays(weekStart, 6))))
    .orderBy(desc(dailyReports.reportDate), asc(people.slug));
  return rows.map((row) => toDailyReport(row.report, { slug: row.slug, name: row.name }));
}

/**
 * Reports in a date range, newest day first. For agents and other tools that
 * want more than one week. The range is capped so one call stays small.
 */
export async function listDailyReports(options: {
  from: string;
  to: string;
  person?: PersonSlug;
  limit?: number;
}): Promise<DailyReport[]> {
  const { from, to, person, limit = 100 } = options;
  if (!isDateString(from) || !isDateString(to)) {
    throw new ValidationError({ from: ["Use real dates written like 2026-11-14."] });
  }
  if (to < from) throw new ValidationError({ to: ["The end date must not be before the start date."] });
  if (daysBetween(from, to) > 92) {
    throw new ValidationError({ to: ["Ask for at most about three months (92 days) at a time."] });
  }
  const rows = await getDb()
    .select({ report: dailyReports, slug: people.slug, name: people.name })
    .from(dailyReports)
    .innerJoin(people, eq(dailyReports.personId, people.id))
    .where(
      and(
        gte(dailyReports.reportDate, from),
        lte(dailyReports.reportDate, to),
        person ? eq(people.slug, person) : undefined,
      ),
    )
    .orderBy(desc(dailyReports.reportDate), asc(people.slug))
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows.map((row) => toDailyReport(row.report, { slug: row.slug, name: row.name }));
}

/** Escapes the characters that ILIKE treats as wildcards, so a search for "50%" means 50%. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export const SEARCH_LIMIT = 60;

/**
 * Looks for every word in the title, project, summary and the done, blocker and
 * next lines, across all weeks. Newest first, at most SEARCH_LIMIT.
 */
export async function searchDailyReports(query: string): Promise<DailyReport[]> {
  const words = query
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 6);
  if (words.length === 0) return [];
  const wordMatches = words.map((word) => {
    const pattern = likePattern(word);
    return or(
      ilike(dailyReports.title, pattern),
      ilike(dailyReports.summary, pattern),
      ilike(dailyReports.project, pattern),
      ilike(sql`array_to_string(${dailyReports.done}, ' ')`, pattern),
      ilike(sql`array_to_string(${dailyReports.blockers}, ' ')`, pattern),
      ilike(sql`array_to_string(${dailyReports.next}, ' ')`, pattern),
    );
  });
  const rows = await getDb()
    .select({ report: dailyReports, slug: people.slug, name: people.name })
    .from(dailyReports)
    .innerJoin(people, eq(dailyReports.personId, people.id))
    .where(and(...wordMatches))
    .orderBy(desc(dailyReports.reportDate), asc(people.slug))
    .limit(SEARCH_LIMIT);
  return rows.map((row) => toDailyReport(row.report, { slug: row.slug, name: row.name }));
}

// ----------------------------------------------------------------- reviews --

/** The CEO's marks and notes on reports between two days (inclusive). */
export async function listReviews(from: string, to: string): Promise<ReportReview[]> {
  if (!isDateString(from) || !isDateString(to)) return [];
  const rows = await getDb()
    .select({ review: reportReviews, slug: people.slug })
    .from(reportReviews)
    .innerJoin(people, eq(reportReviews.personId, people.id))
    .where(and(gte(reportReviews.reportDate, from), lte(reportReviews.reportDate, to)));
  return rows.map(({ review, slug }) => ({
    personSlug: slug,
    reportDate: review.reportDate,
    seenAt: review.seenAt,
    note: review.note,
    noteAt: review.noteAt,
  }));
}

/**
 * The CEO marks a report seen (or not seen) and/or leaves a note. Only the parts
 * that are sent change: an empty note clears it. The report has to exist.
 */
export async function saveReportReview(input: ReviewReportInput, ctx: Actor): Promise<ReportReview> {
  const data = reviewReportSchema.parse(input);
  return getDb().transaction(async (tx) => {
    const [person] = await tx.select().from(people).where(eq(people.slug, data.person)).limit(1);
    const [report] = person
      ? await tx
          .select({ id: dailyReports.id })
          .from(dailyReports)
          .where(and(eq(dailyReports.personId, person.id), eq(dailyReports.reportDate, data.reportDate)))
          .limit(1)
      : [];
    if (!person || !report) {
      throw new ValidationError({ _form: ["That report no longer exists."] });
    }

    const now = new Date();
    const changes: Partial<typeof reportReviews.$inferInsert> = {};
    if (data.seen !== undefined) changes.seenAt = data.seen ? now : null;
    if (data.note !== undefined) {
      changes.note = data.note === "" ? null : data.note;
      changes.noteAt = data.note === "" ? null : now;
    }
    const [row] = await tx
      .insert(reportReviews)
      .values({ personId: person.id, reportDate: data.reportDate, ...changes })
      .onConflictDoUpdate({
        target: [reportReviews.personId, reportReviews.reportDate],
        set: { ...changes, updatedAt: now },
      })
      .returning();

    const day = formatDayWithYear(data.reportDate);
    const summary =
      data.note !== undefined
        ? data.note === ""
          ? `The CEO removed a note from ${person.name}'s report for ${day}`
          : `The CEO left a note on ${person.name}'s report for ${day}`
        : data.seen
          ? `The CEO marked ${person.name}'s report for ${day} as seen`
          : `The CEO marked ${person.name}'s report for ${day} as not seen`;
    await writeAudit(tx, ctx, {
      action: "report_review.saved",
      entity: "daily_report",
      entityId: report.id,
      summary,
      details: { person: person.slug, reportDate: data.reportDate, seen: data.seen, noteChanged: data.note !== undefined },
    });
    return {
      personSlug: person.slug,
      reportDate: row.reportDate,
      seenAt: row.seenAt,
      note: row.note,
      noteAt: row.noteAt,
    };
  });
}

// --------------------------------------------------------------- decisions --

/** Decisions by status. Open ones come oldest first, answered ones newest first. */
export async function listDecisions(
  options: { status?: DecisionStatus | "all"; limit?: number } = {},
): Promise<Decision[]> {
  const { status = "open", limit = 50 } = options;
  const rows = await getDb()
    .select()
    .from(decisions)
    .where(status === "all" ? undefined : eq(decisions.status, status))
    .orderBy(status === "open" ? asc(decisions.raisedOn) : desc(decisions.raisedOn), asc(decisions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows.map(toDecision);
}

export async function raiseDecision(input: RaiseDecisionInput, ctx: Actor): Promise<Decision> {
  const data = raiseDecisionSchema.parse(input);
  return getDb().transaction(async (tx) => {
    const person = await requireActivePerson(tx, data.person);
    const [row] = await tx
      .insert(decisions)
      .values({
        title: data.title,
        description: data.description,
        status: "open",
        raisedOn: todayInTehran(),
        raisedBy: person.slug,
      })
      .returning();
    await writeAudit(tx, ctx, {
      action: "decision.raised",
      entity: "decision",
      entityId: row.id,
      summary: `${person.name} raised a decision: ${row.title}`,
      details: { raisedBy: person.slug },
    });
    return toDecision(row);
  });
}

export async function answerDecision(input: AnswerDecisionInput, ctx: Actor): Promise<Decision> {
  const data = answerDecisionSchema.parse(input);
  return getDb().transaction(async (tx) => {
    // The CEO is not one of the three people, so there is nobody to look up.
    const answeredBy =
      data.person === "ceo" ? { slug: "ceo", name: "The CEO" } : await requireActivePerson(tx, data.person);
    // The status check is part of the update, so two people answering at the
    // same moment cannot both succeed.
    const [row] = await tx
      .update(decisions)
      .set({ status: "answered", answer: data.answer, answeredOn: todayInTehran() })
      .where(and(eq(decisions.id, data.decisionId), eq(decisions.status, "open")))
      .returning();
    if (!row) {
      const [existing] = await tx.select({ id: decisions.id }).from(decisions).where(eq(decisions.id, data.decisionId));
      throw new ValidationError({
        answer: [
          existing
            ? "Someone already answered this decision. Close this window to see their answer."
            : "This decision no longer exists.",
        ],
      });
    }
    await writeAudit(tx, ctx, {
      action: "decision.answered",
      entity: "decision",
      entityId: row.id,
      summary: `${answeredBy.name} answered a decision: ${row.title}`,
      details: { answeredBy: answeredBy.slug },
    });
    return toDecision(row);
  });
}

/**
 * Decisions as they stood during a week. For the current week that means "open
 * right now". For a past week it means what was still open at the end of that
 * week, plus what was answered in the two weeks up to then.
 */
export async function listDecisionsForWeek(
  weekStart: string,
  today: string = todayInTehran(),
): Promise<{ asOf: string; open: Decision[]; recentlyAnswered: Decision[] }> {
  const windowEnd = addDays(weekStart, 6);
  const asOf = windowEnd < today ? windowEnd : today;
  const db = getDb();
  const rows = await db
    .select()
    .from(decisions)
    .where(lte(decisions.raisedOn, asOf))
    .orderBy(asc(decisions.raisedOn), asc(decisions.createdAt));
  const all = rows.map(toDecision);
  return {
    asOf,
    open: all.filter((d) => isOpenAsOf(d, asOf)),
    recentlyAnswered: all
      .filter((d) => isRecentlyAnswered(d, asOf))
      .sort((a, b) => (b.answeredOn ?? "").localeCompare(a.answeredOn ?? "")),
  };
}

// ---------------------------------------------------------- weekly reports --

export async function getWeeklyReport(weekStart: string): Promise<WeeklyReport | null> {
  const [row] = await getDb().select().from(weeklyReports).where(eq(weeklyReports.weekStart, weekStart)).limit(1);
  return row ? toWeeklyReport(row) : null;
}

/** Weekly reports from newest to oldest, optionally only those before a week. */
export async function listWeeklyReports(options: { before?: string; limit?: number } = {}): Promise<WeeklyReport[]> {
  const rows = await getDb()
    .select()
    .from(weeklyReports)
    .where(options.before ? lt(weeklyReports.weekStart, options.before) : undefined)
    .orderBy(desc(weeklyReports.weekStart))
    .limit(options.limit ?? 52);
  return rows.map(toWeeklyReport);
}

/**
 * Saves the weekly summary for a week, replacing the earlier version. The
 * numbers and the "waiting for a decision" list are worked out here from the
 * real reports and decisions, never typed in, so they cannot be invented.
 */
export async function saveWeeklyReport(
  input: WeeklyReportInput,
  ctx: Actor,
  options: {
    /**
     * For agents: the summary is always saved as a draft, and a summary a person
     * has marked final cannot be changed. Only people finalise or reopen a week.
     */
    draftOnly?: boolean;
  } = {},
): Promise<{ report: WeeklyReport; replaced: boolean }> {
  const parsed = weeklyReportInputSchema.parse(input);
  const data = options.draftOnly ? { ...parsed, done: false } : parsed;
  const today = todayInTehran();
  if (data.weekStart > weekStartOf(today)) {
    throw new ValidationError({ weekStart: ["That week has not started yet. Pick this week or an earlier one."] });
  }
  const windowEnd = addDays(data.weekStart, 6);
  const asOf = windowEnd < today ? windowEnd : today;

  return getDb().transaction(async (tx) => {
    const author = await requireActivePerson(tx, data.person);

    const reportRows = await tx
      .select({ slug: people.slug, reportDate: dailyReports.reportDate })
      .from(dailyReports)
      .innerJoin(people, eq(dailyReports.personId, people.id))
      .where(and(gte(dailyReports.reportDate, data.weekStart), lte(dailyReports.reportDate, windowEnd)));
    const decisionRows = (await tx.select().from(decisions).where(lte(decisions.raisedOn, asOf))).map(toDecision);
    const stillOpen = decisionRows.filter((d) => isOpenAsOf(d, asOf));

    const numbers: WeeklyNumbers = {
      daysWithReport: countReportDays(reportRows.map((r) => ({ personSlug: r.slug, reportDate: r.reportDate }))),
      decisionsRaised: decisionRows.filter((d) => d.raisedOn >= data.weekStart).length,
      decisionsOpen: stillOpen.length,
    };
    const values = {
      oneLine: data.oneLine,
      results: data.results,
      byPerson: data.byPerson,
      waitingDecisions: stillOpen.slice(0, 10).map((d) => d.title),
      notFinished: data.notFinished,
      numbers,
      label: data.label,
      dueAt: weeklyDueAt(data.weekStart),
      done: data.done,
    };

    const [existing] = await tx
      .select({ id: weeklyReports.id, done: weeklyReports.done })
      .from(weeklyReports)
      .where(eq(weeklyReports.weekStart, data.weekStart))
      .limit(1);
    if (options.draftOnly && existing?.done) {
      throw new ValidationError({
        weekStart: [
          "This week's summary is already marked final, so it cannot be changed from here. A person can reopen it on the website.",
        ],
      });
    }
    const [row] = await tx
      .insert(weeklyReports)
      .values({ weekStart: data.weekStart, ...values })
      .onConflictDoUpdate({
        target: weeklyReports.weekStart,
        set: { ...values, updatedAt: new Date() },
      })
      .returning();

    const replaced = existing !== undefined;
    await writeAudit(tx, ctx, {
      action: replaced ? "weekly_report.replaced" : "weekly_report.created",
      entity: "weekly_report",
      entityId: row.id,
      summary: `${author.name} ${replaced ? "updated" : "wrote"} the weekly summary for the week of ${formatDayWithYear(data.weekStart)}${data.done ? " (final)" : ""}`,
      details: { weekStart: data.weekStart, label: data.label, done: data.done },
    });
    return { report: toWeeklyReport(row), replaced };
  });
}

/** Weeks worth showing in a picker: every week with data, plus the current one. Newest first. */
export async function listWeekOptions(today: string = todayInTehran()): Promise<string[]> {
  const db = getDb();
  const [dailyDates, weeklyStarts] = await Promise.all([
    db.selectDistinct({ date: dailyReports.reportDate }).from(dailyReports),
    db.select({ weekStart: weeklyReports.weekStart }).from(weeklyReports),
  ]);
  const weeks = new Set<string>([weekStartOf(today)]);
  for (const { date } of dailyDates) weeks.add(weekStartOf(date));
  for (const { weekStart } of weeklyStarts) weeks.add(weekStart);
  return [...weeks].sort().reverse();
}

/** The most recent change to any report or decision. Null on an empty database. */
export async function getLastUpdated(): Promise<Date | null> {
  const db = getDb();
  const [daily, weekly, decision] = await Promise.all([
    db.select({ at: max(dailyReports.updatedAt) }).from(dailyReports),
    db.select({ at: max(weeklyReports.updatedAt) }).from(weeklyReports),
    db.select({ at: max(decisions.updatedAt) }).from(decisions),
  ]);
  const times = [daily[0]?.at, weekly[0]?.at, decision[0]?.at].filter((t): t is Date => t instanceof Date);
  return times.length > 0 ? new Date(Math.max(...times.map((t) => t.getTime()))) : null;
}

// --------------------------------------------------------------- api tokens --

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a token. The plain token is returned once, here, and never stored:
 * only its SHA-256 hash is saved.
 */
export async function createApiToken(
  input: CreateTokenInput,
  ctx: Actor,
): Promise<{ token: string; info: ApiTokenInfo }> {
  const data = createTokenSchema.parse(input);
  const token = `tr_${randomBytes(32).toString("base64url")}`;
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .insert(apiTokens)
      .values({
        owner: data.owner,
        name: data.name,
        scopes: data.scopes,
        hash: hashToken(token),
        prefix: token.slice(0, 9),
      })
      .returning();
    await writeAudit(tx, ctx, {
      action: "api_token.created",
      entity: "api_token",
      entityId: row.id,
      summary: `A token called "${row.name}" was created for ${row.owner}`,
      details: { owner: row.owner, scopes: row.scopes },
    });
    return { token, info: toTokenInfo(row) };
  });
}

export async function listApiTokens(): Promise<ApiTokenInfo[]> {
  const rows = await getDb().select().from(apiTokens).orderBy(desc(apiTokens.createdAt));
  return rows.map(toTokenInfo);
}

export async function revokeApiToken(id: string, ctx: Actor): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)))
      .returning();
    if (!row) throw new ValidationError({ _form: ["That token does not exist or is already revoked."] });
    await writeAudit(tx, ctx, {
      action: "api_token.revoked",
      entity: "api_token",
      entityId: row.id,
      summary: `The token "${row.name}" (${row.owner}) was revoked`,
    });
  });
}

/**
 * For the MCP server: finds the live token for a plain token string and notes
 * that it was used. Returns null for unknown or revoked tokens.
 */
export async function authenticateApiToken(
  token: string,
): Promise<{ id: string; owner: string; scopes: TokenScope[] } | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.hash, hashToken(token)), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (!row) return null;
  // Writing on every call would be wasteful; once a minute is plenty.
  const staleBefore = new Date(Date.now() - 60_000);
  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(apiTokens.id, row.id), or(isNull(apiTokens.lastUsedAt), lt(apiTokens.lastUsedAt, staleBefore))));
  return { id: row.id, owner: row.owner, scopes: row.scopes };
}

// ---------------------------------------------------------------- audit log --

export async function listAuditLog(limit = 40): Promise<AuditEntry[]> {
  const rows = await getDb().select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    actor: r.actor,
    source: r.source,
    action: r.action,
    entity: r.entity,
    summary: r.summary,
    createdAt: r.createdAt,
  }));
}
