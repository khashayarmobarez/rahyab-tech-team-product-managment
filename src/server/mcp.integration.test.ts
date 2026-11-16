/**
 * Tests the MCP endpoint end to end with the real MCP client from the SDK, calling
 * the route handler directly (no network), against a real Postgres database.
 * Runs only when TEST_DATABASE_URL is set; see reports.integration.test.ts.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, todayInTehran, weekStartOf } from "@/lib/dates";
import type { TokenScope } from "@/lib/constants";

const testUrl = process.env.TEST_DATABASE_URL;
const unsafe = testUrl !== undefined && testUrl === process.env.DATABASE_URL;
const URL_ = "http://localhost/api/mcp";

describe.skipIf(!testUrl || unsafe)("MCP endpoint (needs TEST_DATABASE_URL)", () => {
  let route: typeof import("../app/api/mcp/route");
  let reports: typeof import("./reports");
  let tables: typeof import("./db/schema");
  let db: ReturnType<typeof import("./db").getDb>;
  let closeDb: () => Promise<void>;
  const open: Client[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl;
    const dbModule = await import("./db");
    tables = await import("./db/schema");
    reports = await import("./reports");
    route = await import("../app/api/mcp/route");
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

  afterEach(async () => {
    await Promise.all(open.splice(0).map((c) => c.close().catch(() => undefined)));
  });

  const admin = { actor: "admin", source: "web" } as const;
  const everything: TokenScope[] = ["reports:read", "reports:write", "decisions:write", "decisions:answer", "weekly:write"];

  async function tokenFor(owner: string, scopes: TokenScope[]): Promise<string> {
    const { token } = await reports.createApiToken({ owner: owner as "team", name: `${owner} test`, scopes }, admin);
    return token;
  }

  /** A real MCP client whose requests go straight to the route handler. */
  async function connect(token: string): Promise<Client> {
    const routeFetch: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      if (request.method === "POST") return route.POST(request);
      if (request.method === "DELETE") return route.DELETE();
      return route.GET();
    };
    const client = new Client({ name: "test-agent", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(URL_), {
        fetch: routeFetch,
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    open.push(client);
    return client;
  }

  async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
    try {
      const result = (await client.callTool({ name, arguments: args })) as {
        isError?: boolean;
        content: { type: string; text: string }[];
      };
      const text = result.content.map((c) => c.text).join("\n");
      // Tool results are JSON of many shapes; the tests below read them loosely on purpose.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      return { isError: result.isError === true, text, json };
    } catch (error) {
      // Input that fails the tool's own schema is refused by the SDK before our code runs.
      return { isError: true, text: String((error as Error).message), json: undefined };
    }
  }

  const toolNames = async (client: Client) => (await client.listTools()).tools.map((t) => t.name).sort();

  describe("authentication", () => {
    const post = (headers: Record<string, string>) =>
      route.POST(
        new Request(URL_, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        }),
      );

    it("refuses a request with no token", async () => {
      const response = await post({});
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("Bearer");
    });

    it("refuses an unknown token and a revoked token", async () => {
      expect((await post({ authorization: "Bearer tr_nope" })).status).toBe(401);
      const token = await tokenFor("team", ["reports:read"]);
      const [info] = await reports.listApiTokens();
      await reports.revokeApiToken(info.id, admin);
      expect((await post({ authorization: `Bearer ${token}` })).status).toBe(401);
    });

    it("does not accept GET or DELETE", async () => {
      expect(route.GET().status).toBe(405);
      expect(route.DELETE().status).toBe(405);
    });

    it("records when a token was last used", async () => {
      const token = await tokenFor("team", ["reports:read"]);
      await (await connect(token)).listTools();
      const [row] = await db.select().from(tables.apiTokens);
      expect(row.lastUsedAt).toBeInstanceOf(Date);
    });
  });

  describe("what each token can see", () => {
    it("shows a read-only token only the reading tools", async () => {
      const client = await connect(await tokenFor("team", ["reports:read"]));
      expect(await toolNames(client)).toEqual(
        ["get_daily_reports", "get_decisions", "get_week_overview", "get_weekly_reports", "whoami"].sort(),
      );
      // No prompt for this token, so the server does not offer prompts at all.
      expect(client.getServerCapabilities()?.prompts).toBeUndefined();
    });

    it("shows a token with every permission every tool, and the weekly prompt", async () => {
      const client = await connect(await tokenFor("team", everything));
      expect(await toolNames(client)).toEqual(
        [
          "answer_decision",
          "get_daily_reports",
          "get_decisions",
          "get_week_overview",
          "get_weekly_reports",
          "raise_decision",
          "save_daily_report",
          "save_weekly_report",
          "whoami",
        ].sort(),
      );
      expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual(["draft_weekly_summary"]);
    });

    it("keeps answer_decision away from a token that can only raise decisions", async () => {
      const client = await connect(await tokenFor("mahan", ["reports:read", "decisions:write"]));
      const names = await toolNames(client);
      expect(names).toContain("raise_decision");
      expect(names).not.toContain("answer_decision");
    });

    it("explains itself to an agent", async () => {
      const client = await connect(await tokenFor("mahan", ["reports:read", "reports:write"]));
      expect(client.getInstructions()).toContain("Saturday to Thursday");
      const { json } = await call(client, "whoami");
      expect(json.tokenOwner).toBe("mahan");
      expect(json.today).toBe(todayInTehran());
      expect(json.currentWeek.start).toBe(weekStartOf(todayInTehran()));
      expect(json.team.map((p: { person: string }) => p.person)).toEqual(["khashayar", "mahan", "hossein"]);
      expect(json.weeklySummaryRules).toContain("Never invent results");
    });
  });

  describe("daily reports", () => {
    const report = { reportDate: "2026-11-10", title: "Reporting screens", summary: "Built the first version.", done: ["First version"], blockers: [], next: ["Review"] };

    it("saves for the token's owner, replaces on a second save, and records it as an agent write", async () => {
      const client = await connect(await tokenFor("mahan", everything));
      const first = await call(client, "save_daily_report", report);
      expect(first.json).toMatchObject({ saved: true, replacedEarlierReport: false, report: { person: "mahan", date: "2026-11-10" } });
      const second = await call(client, "save_daily_report", { ...report, title: "Reporting screens, afternoon" });
      expect(second.json.replacedEarlierReport).toBe(true);

      const rows = await db.select().from(tables.dailyReports);
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Reporting screens, afternoon");

      const log = (await reports.listAuditLog()).filter((l) => l.entity === "daily_report");
      expect(log.map((l) => [l.action, l.actor, l.source])).toEqual([
        ["daily_report.replaced", "mahan", "mcp"],
        ["daily_report.created", "mahan", "mcp"],
      ]);
    });

    it("takes an optional project name and returns it with the report", async () => {
      const client = await connect(await tokenFor("mahan", everything));
      const tagged = await call(client, "save_daily_report", { ...report, project: "Online payments" });
      expect(tagged.json.report.project).toBe("Online payments");
      const plain = await call(client, "save_daily_report", { ...report, reportDate: "2026-11-09" });
      expect(plain.json.report.project).toBeNull();
      const { json } = await call(client, "get_daily_reports", { from: "2026-11-09", to: "2026-11-10" });
      expect(json.reports.map((r: { project: string | null }) => r.project)).toEqual(["Online payments", null]);
    });

    it("defaults the date to today", async () => {
      const client = await connect(await tokenFor("mahan", everything));
      const { json } = await call(client, "save_daily_report", { title: "Today", summary: "Worked.", done: [], blockers: [], next: [] });
      expect(json.report.date).toBe(todayInTehran());
    });

    it("stops a person's token from writing as someone else", async () => {
      const client = await connect(await tokenFor("mahan", everything));
      const result = await call(client, "save_daily_report", { ...report, person: "hossein" });
      expect(result.isError).toBe(true);
      expect(result.text).toContain("belongs to mahan");
      expect(await db.select().from(tables.dailyReports)).toHaveLength(0);
    });

    it("makes a team token say who it writes for", async () => {
      const client = await connect(await tokenFor("team", everything));
      const missing = await call(client, "save_daily_report", report);
      expect(missing.isError).toBe(true);
      expect(missing.text).toContain("required");
      const done = await call(client, "save_daily_report", { ...report, person: "hossein" });
      expect(done.json.report.person).toBe("hossein");
      const entry = (await reports.listAuditLog()).find((l) => l.entity === "daily_report");
      expect(entry).toMatchObject({ actor: "team", source: "mcp" });
    });

    it("reports bad input in words the agent can act on", async () => {
      const client = await connect(await tokenFor("mahan", everything));
      const future = await call(client, "save_daily_report", { ...report, reportDate: addDays(todayInTehran(), 2) });
      expect(future.isError).toBe(true);
      expect(future.text).toContain("not happened yet");
      const empty = await call(client, "save_daily_report", { ...report, title: "   " });
      expect(empty.isError).toBe(true);
      expect(empty.text.toLowerCase()).toContain("title");
      expect(await db.select().from(tables.dailyReports)).toHaveLength(0);
    });

    it("lets a read-only token read but not write", async () => {
      await reports.saveDailyReport({ person: "mahan", ...report }, admin);
      const client = await connect(await tokenFor("team", ["reports:read"]));
      const read = await call(client, "get_daily_reports", { from: "2026-11-01", to: "2026-11-30" });
      expect(read.json.count).toBe(1);
      expect(read.json.reports[0]).toMatchObject({ person: "mahan", title: "Reporting screens" });
      const write = await call(client, "save_daily_report", report);
      expect(write.isError).toBe(true); // the tool does not exist for this token
      expect(await db.select().from(tables.dailyReports)).toHaveLength(1);
    });

    it("limits the range an agent can pull", async () => {
      const client = await connect(await tokenFor("team", ["reports:read"]));
      const result = await call(client, "get_daily_reports", { from: "2025-01-01", to: "2026-11-01" });
      expect(result.isError).toBe(true);
      expect(result.text).toContain("92 days");
    });
  });

  describe("decisions", () => {
    it("raises and answers decisions only with the right permissions", async () => {
      const raiser = await connect(await tokenFor("hossein", ["reports:read", "decisions:write"]));
      const raised = await call(raiser, "raise_decision", { title: "Buy a second test server", description: "Releases are queuing." });
      expect(raised.json).toMatchObject({ raised: true, decision: { status: "open", raisedBy: "hossein" } });
      const id = raised.json.decision.id;

      expect((await call(raiser, "answer_decision", { decisionId: id, answer: "Yes" })).isError).toBe(true);
      expect((await reports.listDecisions({ status: "open" }))[0].status).toBe("open");

      const answerer = await connect(await tokenFor("khashayar", ["reports:read", "decisions:answer"]));
      const answered = await call(answerer, "answer_decision", { decisionId: id, answer: "Approved by the CEO." });
      expect(answered.json).toMatchObject({ answered: true, decision: { status: "answered", answer: "Approved by the CEO." } });

      const again = await call(answerer, "answer_decision", { decisionId: id, answer: "Changed my mind" });
      expect(again.isError).toBe(true);
      expect(again.text).toContain("already answered");
    });

    it("lists open decisions oldest first with how long they have waited", async () => {
      const first = await reports.raiseDecision({ person: "mahan", title: "Older", description: "d" }, admin);
      await reports.raiseDecision({ person: "mahan", title: "Newer", description: "d" }, admin);
      await db.update(tables.decisions).set({ raisedOn: addDays(todayInTehran(), -5) }).where(eq(tables.decisions.id, first.id));
      const client = await connect(await tokenFor("team", ["reports:read"]));
      const { json } = await call(client, "get_decisions");
      expect(json.decisions.map((d: { title: string }) => d.title)).toEqual(["Older", "Newer"]);
      expect(json.decisions[0].daysOpen).toBe(5);
    });
  });

  describe("weekly summaries", () => {
    const week = "2026-11-07";
    const summary = {
      weekStart: week,
      oneLine: "Reporting screens are ready for review.",
      results: ["Screens built", "Numbers match finance"],
      byPerson: { mahan: "Built the screens" },
      notFinished: ["Launch date"],
      label: "yellow",
    };

    it("always saves a draft, even if the agent asks for final", async () => {
      const client = await connect(await tokenFor("mahan", everything));
      const { json } = await call(client, "save_weekly_report", { ...summary, done: true });
      expect(json).toMatchObject({ saved: true, asDraft: true });
      expect(json.weeklySummary.final).toBe(false);
      expect(json.weeklySummary.byPerson.hossein).toBe("No report this week");
      const [row] = await db.select().from(tables.weeklyReports);
      expect(row.done).toBe(false);
    });

    it("cannot change a summary a person has marked final", async () => {
      await reports.saveWeeklyReport({ person: "khashayar", ...summary, byPerson: { khashayar: "", mahan: "", hossein: "" }, label: "green", done: true } as never, admin);
      const client = await connect(await tokenFor("mahan", everything));
      const result = await call(client, "save_weekly_report", { ...summary, oneLine: "An agent's rewrite." });
      expect(result.isError).toBe(true);
      expect(result.text).toContain("already marked final");
      const [row] = await db.select().from(tables.weeklyReports);
      expect(row.done).toBe(true);
      expect(row.oneLine).toBe("Reporting screens are ready for review.");
    });

    it("applies the plain-language rule to agents too", async () => {
      const client = await connect(await tokenFor("mahan", everything));
      const result = await call(client, "save_weekly_report", { ...summary, results: ["Rewrote billing.ts"] });
      expect(result.isError).toBe(true);
      expect(result.text).toContain("plain business words");
      expect(await db.select().from(tables.weeklyReports)).toHaveLength(0);
    });

    it("gives the weekly prompt the rules and the steps", async () => {
      const client = await connect(await tokenFor("mahan", everything));
      const prompt = await client.getPrompt({ name: "draft_weekly_summary", arguments: { week } });
      const text = prompt.messages.map((m) => (m.content as { text: string }).text).join("\n");
      expect(text).toContain("get_week_overview");
      expect(text).toContain("Never invent results");
      expect(text).toContain("save_weekly_report");
      expect(text).toContain(week);
    });
  });

  describe("week overview", () => {
    it("brings the week together in one answer", async () => {
      await reports.saveDailyReport(
        { person: "mahan", reportDate: "2026-11-09", title: "Screens", summary: "Built.", done: ["Screens"], blockers: ["Waiting for access"], next: [] },
        admin,
      );
      await reports.saveWeeklyReport(
        { person: "khashayar", weekStart: "2026-11-07", oneLine: "A good week.", results: ["Screens built"], byPerson: { khashayar: "", mahan: "", hossein: "" }, notFinished: [], label: "green", done: true } as never,
        admin,
      );
      const client = await connect(await tokenFor("team", ["reports:read"]));
      const { json } = await call(client, "get_week_overview", { week: "2026-11-11" });
      expect(json.week).toMatchObject({ start: "2026-11-07", end: "2026-11-12", isCurrentWeek: false });
      expect(json.weeklySummary).toMatchObject({ oneLine: "A good week.", final: true, status: "green" });
      expect(json.daysWithAReport.mahan).toEqual(["2026-11-09"]);
      expect(json.dailyReports).toHaveLength(1);
      expect(json.builtFromDailyReports.openBlockers).toEqual([{ personSlug: "mahan", text: "Waiting for access" }]);
    });

    it("defaults to the current week and rejects a bad date clearly", async () => {
      const client = await connect(await tokenFor("team", ["reports:read"]));
      const current = await call(client, "get_week_overview");
      expect(current.json.week.isCurrentWeek).toBe(true);
      const bad = await call(client, "get_week_overview", { week: "yesterday" });
      expect(bad.isError).toBe(true);
      expect(bad.text).toContain("real date");
    });
  });
});
