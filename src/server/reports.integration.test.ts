/**
 * Tests of the service layer against a real Postgres database.
 *
 * They run only when TEST_DATABASE_URL is set, and they wipe every table in that
 * database first, so it must be a throwaway database. They refuse to run if it
 * is the same as DATABASE_URL.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { addDays, todayInTehran, weekStartOf } from "@/lib/dates";
import { ValidationError, fieldErrorsOf } from "@/lib/schemas";

const testUrl = process.env.TEST_DATABASE_URL;
const unsafe = testUrl !== undefined && testUrl === process.env.DATABASE_URL;

describe.skipIf(!testUrl || unsafe)("service layer (needs TEST_DATABASE_URL)", () => {
  const web = { actor: "mahan", source: "web" } as const;

  // Loaded after DATABASE_URL points at the test database.
  let reports: typeof import("./reports");
  let db: ReturnType<typeof import("./db").getDb>;
  let tables: typeof import("./db/schema");
  let closeDb: () => Promise<void>;

  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl;
    const dbModule = await import("./db");
    tables = await import("./db/schema");
    reports = await import("./reports");
    const { runMigrations } = await import("./migrate");
    db = dbModule.getDb();
    closeDb = dbModule.closeDb;
    await runMigrations();
  });

  afterAll(async () => {
    await closeDb?.();
  });

  beforeEach(async () => {
    await db.execute(
      sql.raw("TRUNCATE audit_log, api_tokens, decisions, weekly_reports, daily_reports, people RESTART IDENTITY CASCADE"),
    );
    await db.insert(tables.people).values([
      { slug: "khashayar", name: "Khashayar", active: true },
      { slug: "mahan", name: "Mahan", active: true },
      { slug: "hossein", name: "Hossein", active: true },
    ]);
  });

  const report = (overrides: Record<string, unknown> = {}) => ({
    person: "mahan" as const,
    reportDate: "2026-11-10",
    title: "Reporting screens",
    summary: "Built the first version.",
    done: ["First version built"],
    blockers: [],
    next: ["Review with finance"],
    ...overrides,
  });

  describe("daily reports", () => {
    it("replaces the day's report when the same person saves the same date again", async () => {
      const first = await reports.saveDailyReport(report(), web);
      expect(first.replaced).toBe(false);

      const second = await reports.saveDailyReport(
        report({ title: "Reporting screens (afternoon)", done: ["First version built", "Numbers checked"] }),
        web,
      );
      expect(second.replaced).toBe(true);
      expect(second.report.id).toBe(first.report.id);

      const rows = await db.select().from(tables.dailyReports);
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Reporting screens (afternoon)");
      expect(rows[0].done).toEqual(["First version built", "Numbers checked"]);
      expect(rows[0].updatedAt.getTime()).toBeGreaterThanOrEqual(rows[0].createdAt.getTime());
    });

    it("keeps different people, and different dates, as separate reports", async () => {
      await reports.saveDailyReport(report(), web);
      await reports.saveDailyReport(report({ person: "hossein" }), { actor: "hossein", source: "web" });
      await reports.saveDailyReport(report({ reportDate: "2026-11-11" }), web);
      expect(await db.select().from(tables.dailyReports)).toHaveLength(3);
    });

    it("loads a saved report back by person and date", async () => {
      await reports.saveDailyReport(report(), web);
      const found = await reports.getDailyReport("mahan", "2026-11-10");
      expect(found?.title).toBe("Reporting screens");
      expect(found?.personName).toBe("Mahan");
      expect(await reports.getDailyReport("mahan", "2026-11-09")).toBeNull();
      expect(await reports.getDailyReport("hossein", "2026-11-10")).toBeNull();
    });

    it("lists a week's reports, Saturday to Friday, and nothing outside it", async () => {
      for (const date of ["2026-11-06", "2026-11-07", "2026-11-12", "2026-11-13", "2026-11-14"]) {
        await reports.saveDailyReport(report({ reportDate: date }), web);
      }
      const week = await reports.listDailyReportsForWeek("2026-11-07");
      expect(week.map((r) => r.reportDate)).toEqual(["2026-11-13", "2026-11-12", "2026-11-07"]);
    });

    it("refuses a day that has not happened yet", async () => {
      const tomorrow = addDays(todayInTehran(), 1);
      const error = await reports.saveDailyReport(report({ reportDate: tomorrow }), web).catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect(fieldErrorsOf(error)?.reportDate?.[0]).toContain("not happened yet");
      expect(await db.select().from(tables.dailyReports)).toHaveLength(0);
    });

    it("refuses bad input with field messages and writes nothing", async () => {
      const error = await reports.saveDailyReport(report({ title: "", person: "nobody" }), web).catch((e) => e);
      expect(error).toBeInstanceOf(ZodError);
      const fields = fieldErrorsOf(error);
      expect(fields?.title).toBeDefined();
      expect(fields?.person).toBeDefined();
      expect(await db.select().from(tables.auditLog)).toHaveLength(0);
    });

    it("refuses a person who is switched off", async () => {
      await db.update(tables.people).set({ active: false }).where(eq(tables.people.slug, "mahan"));
      const error = await reports.saveDailyReport(report(), web).catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect(fieldErrorsOf(error)?.person?.[0]).toContain("switched off");
    });
  });

  describe("audit log", () => {
    it("records who, through which door, what and when for every write", async () => {
      await reports.saveDailyReport(report(), web);
      await reports.saveDailyReport(report({ title: "Updated" }), web);
      const decision = await reports.raiseDecision(
        { person: "hossein", title: "Buy a second test server", description: "Releases are queuing." },
        { actor: "hossein", source: "web" },
      );
      await reports.answerDecision(
        { person: "khashayar", decisionId: decision.id, answer: "Approved." },
        { actor: "khashayar", source: "mcp" },
      );

      const log = await reports.listAuditLog();
      expect(log.map((l) => l.action).sort()).toEqual(
        ["daily_report.created", "daily_report.replaced", "decision.answered", "decision.raised"].sort(),
      );
      const answered = log.find((l) => l.action === "decision.answered");
      expect(answered).toMatchObject({ actor: "khashayar", source: "mcp", entity: "decision" });
      expect(answered?.summary).toContain("Khashayar answered a decision");
      expect(answered?.createdAt).toBeInstanceOf(Date);
      expect(log.find((l) => l.action === "daily_report.created")).toMatchObject({ actor: "mahan", source: "web" });
    });

    it("rolls the audit row back together with a failed write", async () => {
      await reports
        .answerDecision(
          { person: "mahan", decisionId: "6f1c1f3e-8d7a-4a53-9c3b-0f4b2f6d9a10", answer: "Yes" },
          web,
        )
        .catch(() => undefined);
      expect(await db.select().from(tables.auditLog)).toHaveLength(0);
    });
  });

  describe("decisions", () => {
    it("raises a decision dated today by the chosen person", async () => {
      const decision = await reports.raiseDecision(
        { person: "hossein", title: "Pick a launch date", description: "Two options." },
        { actor: "hossein", source: "web" },
      );
      expect(decision).toMatchObject({ status: "open", raisedBy: "hossein", raisedOn: todayInTehran(), answer: null });
    });

    it("marks a decision answered once, and refuses a second answer", async () => {
      const decision = await reports.raiseDecision(
        { person: "hossein", title: "Pick a launch date", description: "Two options." },
        web,
      );
      const answered = await reports.answerDecision({ person: "khashayar", decisionId: decision.id, answer: "Next week." }, web);
      expect(answered).toMatchObject({ status: "answered", answer: "Next week.", answeredOn: todayInTehran() });

      const error = await reports
        .answerDecision({ person: "mahan", decisionId: decision.id, answer: "Actually, later." }, web)
        .catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect(fieldErrorsOf(error)?.answer?.[0]).toContain("already answered");
      const [row] = await db.select().from(tables.decisions);
      expect(row.answer).toBe("Next week.");
    });

    it("shows decisions as they stood in a past week", async () => {
      const today = todayInTehran();
      const make = async (title: string) =>
        reports.raiseDecision({ person: "mahan", title, description: "Details" }, web);
      const old = await make("Raised long ago, still open");
      const answeredLater = await make("Answered after the week ended");
      const answeredInWeek = await make("Answered during the week");
      await reports.answerDecision({ person: "mahan", decisionId: answeredLater.id, answer: "Yes" }, web);
      await reports.answerDecision({ person: "mahan", decisionId: answeredInWeek.id, answer: "No" }, web);

      const week = weekStartOf(addDays(today, -21));
      const setDates = (id: string, raisedOn: string, answeredOn: string | null) =>
        db.update(tables.decisions).set({ raisedOn, answeredOn }).where(eq(tables.decisions.id, id));
      await setDates(old.id, addDays(week, -3), null);
      await setDates(answeredLater.id, addDays(week, 1), addDays(week, 10));
      await setDates(answeredInWeek.id, addDays(week, 1), addDays(week, 3));

      const view = await reports.listDecisionsForWeek(week, today);
      expect(view.asOf).toBe(addDays(week, 6));
      expect(view.open.map((d) => d.title)).toEqual(["Raised long ago, still open", "Answered after the week ended"]);
      expect(view.recentlyAnswered.map((d) => d.title)).toEqual(["Answered during the week"]);

      // Today's view: only the one nobody has answered.
      const now = await reports.listDecisionsForWeek(weekStartOf(today), today);
      expect(now.open.map((d) => d.title)).toEqual(["Raised long ago, still open"]);
    });
  });

  describe("weekly reports", () => {
    const weekly = (overrides: Record<string, unknown> = {}) => ({
      person: "khashayar" as const,
      weekStart: "2026-11-07",
      oneLine: "Reporting screens are ready for review.",
      results: ["Screens built", "Numbers match finance"],
      byPerson: { khashayar: "Led the review", mahan: "Built the screens", hossein: "" },
      notFinished: ["Launch date"],
      label: "yellow" as const,
      done: false,
      ...overrides,
    });

    it("works out the numbers from real reports instead of trusting the writer", async () => {
      for (const date of ["2026-11-07", "2026-11-08", "2026-11-09"]) {
        await reports.saveDailyReport(report({ reportDate: date }), web);
      }
      await reports.saveDailyReport(report({ person: "hossein", reportDate: "2026-11-08" }), web);

      const { report: saved, replaced } = await reports.saveWeeklyReport(weekly(), web);
      expect(replaced).toBe(false);
      expect(saved.numbers.daysWithReport).toEqual({ khashayar: 0, mahan: 3, hossein: 1 });
      expect(saved.byPerson.hossein).toBe("No report this week");
      expect(saved.dueAt.toISOString()).toBe("2026-11-12T20:29:00.000Z");
    });

    it("replaces the earlier summary for the same week", async () => {
      await reports.saveWeeklyReport(weekly(), web);
      const { report: second, replaced } = await reports.saveWeeklyReport(
        weekly({ oneLine: "Reporting screens launched.", label: "green", done: true }),
        web,
      );
      expect(replaced).toBe(true);
      const rows = await db.select().from(tables.weeklyReports);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ oneLine: "Reporting screens launched.", label: "green", done: true });
      expect(second.id).toBe(rows[0].id);
    });

    it("loads a saved week back, and lists weeks newest first", async () => {
      await reports.saveWeeklyReport(weekly({ weekStart: "2026-10-31" }), web);
      await reports.saveWeeklyReport(weekly(), web);
      expect((await reports.getWeeklyReport("2026-11-07"))?.results).toEqual(["Screens built", "Numbers match finance"]);
      expect(await reports.getWeeklyReport("2026-10-24")).toBeNull();
      expect((await reports.listWeeklyReports()).map((w) => w.weekStart)).toEqual(["2026-11-07", "2026-10-31"]);
      expect((await reports.listWeeklyReports({ before: "2026-11-07" })).map((w) => w.weekStart)).toEqual(["2026-10-31"]);
    });

    it("refuses a week that has not started and a day that is not a Saturday", async () => {
      const future = addDays(weekStartOf(todayInTehran()), 7);
      const early = await reports.saveWeeklyReport(weekly({ weekStart: future }), web).catch((e) => e);
      expect(fieldErrorsOf(early)?.weekStart?.[0]).toContain("not started");
      const wrongDay = await reports.saveWeeklyReport(weekly({ weekStart: "2026-11-08" }), web).catch((e) => e);
      expect(fieldErrorsOf(wrongDay)?.weekStart?.[0]).toContain("Saturday");
    });

    it("lists every week with data plus the current week for the picker", async () => {
      await reports.saveDailyReport(report({ reportDate: "2026-11-10" }), web);
      await reports.saveWeeklyReport(weekly({ weekStart: "2026-10-24" }), web);
      const options = await reports.listWeekOptions("2026-11-14");
      expect(options).toEqual(["2026-11-14", "2026-11-07", "2026-10-24"]);
    });
  });

  describe("last updated", () => {
    it("is empty on a new database and moves forward with each write", async () => {
      expect(await reports.getLastUpdated()).toBeNull();
      await reports.saveDailyReport(report(), web);
      const first = await reports.getLastUpdated();
      expect(first).toBeInstanceOf(Date);
      await new Promise((r) => setTimeout(r, 15));
      await reports.raiseDecision({ person: "mahan", title: "Something", description: "Details" }, web);
      const second = await reports.getLastUpdated();
      expect(second!.getTime()).toBeGreaterThan(first!.getTime());
    });
  });

  describe("api tokens", () => {
    it("shows the token once and stores only its SHA-256 hash", async () => {
      const { token, info } = await reports.createApiToken(
        { owner: "team", name: "Assistant", scopes: ["reports:read"] },
        { actor: "admin", source: "web" },
      );
      expect(token).toMatch(/^tr_[A-Za-z0-9_-]{43}$/);
      expect(info.prefix).toBe(token.slice(0, 9));

      const [row] = await db.select().from(tables.apiTokens);
      expect(row.hash).toBe(reports.hashToken(token));
      expect(row.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toContain(token);
      expect(JSON.stringify(await reports.listApiTokens())).not.toContain(row.hash);
      const audit = JSON.stringify(await db.select().from(tables.auditLog));
      expect(audit).not.toContain(token);
      expect(audit).not.toContain(row.hash);
    });

    it("recognises a live token, notes its use, and stops recognising it once revoked", async () => {
      const { token, info } = await reports.createApiToken(
        { owner: "mahan", name: "Mahan's assistant", scopes: ["reports:read", "reports:write"] },
        { actor: "admin", source: "web" },
      );
      expect(await reports.authenticateApiToken("tr_wrong")).toBeNull();
      expect(await reports.authenticateApiToken(token)).toEqual({
        id: info.id,
        owner: "mahan",
        scopes: ["reports:read", "reports:write"],
      });
      const [used] = await db.select().from(tables.apiTokens);
      expect(used.lastUsedAt).toBeInstanceOf(Date);

      await reports.revokeApiToken(info.id, { actor: "admin", source: "web" });
      expect(await reports.authenticateApiToken(token)).toBeNull();
      const [revoked] = await reports.listApiTokens();
      expect(revoked.revokedAt).toBeInstanceOf(Date);

      const again = await reports.revokeApiToken(info.id, { actor: "admin", source: "web" }).catch((e) => e);
      expect(again).toBeInstanceOf(ValidationError);
    });

    it("needs at least one permission", async () => {
      const error = await reports
        .createApiToken({ owner: "team", name: "Nothing", scopes: [] }, { actor: "admin", source: "web" })
        .catch((e) => e);
      expect(fieldErrorsOf(error)?.scopes).toBeDefined();
    });
  });

  describe("people", () => {
    it("renames and switches people on and off", async () => {
      const updated = await reports.updatePerson(
        { slug: "hossein", name: "Hossein K.", active: false },
        { actor: "admin", source: "web" },
      );
      expect(updated).toMatchObject({ slug: "hossein", name: "Hossein K.", active: false });
      expect((await reports.listPeople()).map((p) => p.slug)).toEqual(["khashayar", "mahan", "hossein"]);
      expect((await reports.listPeople({ activeOnly: true })).map((p) => p.slug)).toEqual(["khashayar", "mahan"]);
    });
  });
});

// If the two URLs match, fail loudly instead of quietly skipping or wiping real data.
describe.runIf(unsafe)("service layer safety", () => {
  it("refuses to run against DATABASE_URL", () => {
    expect.fail("TEST_DATABASE_URL is the same as DATABASE_URL. Point it at a throwaway database.");
  });
});
